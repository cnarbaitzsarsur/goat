"""Workflow Runner - Executes workflow graphs in Windmill.

This script receives a workflow definition (nodes + edges) and executes
all tool nodes in topological order using temp_mode for preview results.

Uses Windmill's workflow-as-code feature (@wmill.task decorator) to get
proper progress tracking with running/completed status for each node.

Usage:
    Called from frontend via Windmill API when user clicks "Run Workflow"
"""

import logging
from typing import Any

import wmill
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class WorkflowNode(BaseModel):
    """A node in the workflow graph."""

    id: str
    type: str  # "dataset", "tool", "export", "textAnnotation"
    data: dict[str, Any]


class WorkflowEdge(BaseModel):
    """An edge connecting two nodes."""

    id: str
    source: str
    target: str
    sourceHandle: str | None = None  # noqa: N815 - matches React Flow structure
    targetHandle: str | None = None  # noqa: N815 - matches React Flow structure


class WorkflowRunnerParams(BaseModel):
    """Parameters for workflow runner."""

    user_id: str = Field(..., description="User UUID")
    project_id: str = Field(..., description="Project UUID")
    workflow_id: str = Field(..., description="Workflow UUID for temp storage")
    folder_id: str = Field(..., description="Folder UUID for project")
    nodes: list[dict[str, Any]] = Field(..., description="Workflow nodes")
    edges: list[dict[str, Any]] = Field(..., description="Workflow edges")


class WorkflowResult(BaseModel):
    """Result from workflow execution."""

    status: str = "success"
    node_results: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
        description="Results keyed by node_id",
    )
    errors: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Any errors encountered",
    )


def topological_sort(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Sort nodes in execution order (dependencies first).

    Uses Kahn's algorithm for topological sorting.
    """
    # Build in-degree map
    in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}
    graph: dict[str, list[str]] = {n["id"]: [] for n in nodes}

    for edge in edges:
        source = edge["source"]
        target = edge["target"]
        if source in graph and target in in_degree:
            graph[source].append(target)
            in_degree[target] += 1

    # Start with nodes that have no dependencies
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    result: list[dict] = []

    while queue:
        node_id = queue.pop(0)
        node = next((n for n in nodes if n["id"] == node_id), None)
        if node:
            result.append(node)

            for neighbor in graph.get(node_id, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

    return result


def get_input_layer_id(
    source_node: dict,
    results: dict[str, dict],
) -> str | None:
    """Get the layer_id from a source node.

    For dataset nodes: use the configured layerId
    For tool nodes: use the temp_layer_id from previous result
    """
    node_type = source_node.get("data", {}).get("type")
    node_id = source_node["id"]

    if node_type == "dataset":
        # Dataset nodes have a configured layer_id
        return source_node.get("data", {}).get("layerId")

    elif node_type == "tool":
        # Tool nodes - get result from previous execution
        prev_result = results.get(node_id)
        if prev_result:
            # Temp mode returns temp_layer_id
            return prev_result.get("temp_layer_id") or prev_result.get("layer_id")

    return None


def build_tool_inputs(
    node: dict,
    edges: list[dict],
    all_nodes: list[dict],
    results: dict[str, dict],
    params: WorkflowRunnerParams,
) -> dict[str, Any]:
    """Build the input parameters for a tool node.

    Combines:
    - Node's configured parameters
    - Input layer IDs from connected nodes
    - Workflow context (user_id, project_id, temp_mode, etc.)
    """
    # Start with node's configured parameters
    node_data = node.get("data", {})
    inputs: dict[str, Any] = dict(node_data.get("config", {}))

    # Process incoming edges to get layer inputs
    for edge in edges:
        if edge["target"] != node["id"]:
            continue

        source_node = next(
            (n for n in all_nodes if n["id"] == edge["source"]),
            None,
        )
        if not source_node:
            continue

        # Determine target handle (input parameter name)
        target_handle = edge.get("targetHandle", "input_layer_id")

        # Get layer_id from source
        layer_id = get_input_layer_id(source_node, results)
        if layer_id:
            inputs[target_handle] = layer_id

            # For dataset nodes, also include filter if present
            source_type = source_node.get("data", {}).get("type")
            if source_type == "dataset":
                filter_config = source_node.get("data", {}).get("filter")
                if filter_config:
                    # Convert handle name: input_layer_id -> input_layer_filter
                    filter_key = target_handle.replace("_id", "_filter")
                    inputs[filter_key] = filter_config

    # For custom_sql: compact sparse numbered inputs so they start at 1.
    # E.g. if only input_layer_2_id is connected, remap it to input_layer_1_id
    # so the SQL alias "input_1" always refers to the first connected layer.
    process_id = node_data.get("processId")
    if process_id == "custom_sql":
        numbered_keys = sorted(
            k for k in list(inputs) if k.startswith("input_layer_") and k.endswith("_id")
        )
        for new_idx, key in enumerate(numbered_keys, start=1):
            new_key = f"input_layer_{new_idx}_id"
            if key != new_key:
                inputs[new_key] = inputs.pop(key)
                # Also remap the corresponding filter key
                old_filter = key.replace("_id", "_filter")
                new_filter = new_key.replace("_id", "_filter")
                if old_filter in inputs:
                    inputs[new_filter] = inputs.pop(old_filter)

    # Add workflow context
    inputs["user_id"] = params.user_id
    inputs["project_id"] = params.project_id
    inputs["folder_id"] = params.folder_id

    # Enable temp mode for workflow preview
    inputs["temp_mode"] = True
    inputs["workflow_id"] = params.workflow_id
    inputs["node_id"] = node["id"]

    # Set layer name from node label
    inputs["result_layer_name"] = node_data.get("label", "Workflow Result")

    return inputs


def run_tool_node(
    node_id: str,
    process_id: str,
    inputs: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    """Execute a single tool node and return job info.

    Args:
        node_id: The workflow node ID
        process_id: The tool/process ID (e.g., "buffer")
        inputs: Tool parameters including temp_mode context

    Returns:
        Tuple of (job_id, result_dict)
    """
    import time

    script_path = f"f/goat/tools/{process_id}"

    print(f"[{node_id}] Running {script_path}")
    print(f"[{node_id}] Input keys: {list(inputs.keys())}")

    # Record start time
    start_time = time.time()

    # Create async job - this sets parent_job automatically
    job_id = wmill.run_script_async(script_path, args=inputs)
    print(f"[{node_id}] Created job: {job_id}")

    try:
        # Poll for job completion
        while True:
            # Check if our parent job is being cancelled
            try:
                wmill.cancel_running()  # Raises if cancelled
            except Exception:
                # Parent cancelled - cancel the child job too
                print(f"[{node_id}] Parent cancelled, cancelling {job_id}")
                wmill.cancel_job(job_id)
                raise RuntimeError("Workflow cancelled")

            status = wmill.get_job_status(job_id)

            if status == "COMPLETED":
                result = wmill.get_result(job_id)
                elapsed = time.time() - start_time
                duration_ms = int(elapsed * 1000)

                # Check if the result contains an error (job failed)
                if isinstance(result, dict) and "error" in result:
                    error_info = result["error"]
                    error_msg = (
                        error_info.get("message", str(error_info))
                        if isinstance(error_info, dict)
                        else str(error_info)
                    )
                    print(f"[{node_id}] Failed in {elapsed:.1f}s: {error_msg}")
                    # Return error result with timing and job_id
                    return job_id, {
                        "node_id": node_id,
                        "process_id": process_id,
                        "job_id": job_id,
                        "error": error_info,
                        "duration_ms": duration_ms,
                    }

                print(f"[{node_id}] Completed in {elapsed:.1f}s")
                # Store duration and job_id in result
                result["duration_ms"] = duration_ms
                result["job_id"] = job_id
                break
            elif status in ("CANCELED", "CANCELLED_BY_TIMEOUT"):
                raise RuntimeError(f"Job {job_id} was cancelled")

            time.sleep(1)  # Poll every second

    except Exception as e:
        print(f"[{node_id}] Error: {e}")
        raise

    return job_id, {
        "node_id": node_id,
        "process_id": process_id,
        "job_id": job_id,
        **result,
    }


def cleanup_previous_results(params: WorkflowRunnerParams) -> None:
    """Clean up temp files from previous workflow run."""
    from goatlib.tools.cleanup_temp import cleanup_workflow_temp

    cleanup_workflow_temp(
        user_id=params.user_id,
        workflow_id=params.workflow_id,
    )


def main(
    user_id: str,
    project_id: str,
    workflow_id: str,
    folder_id: str,
    nodes: list[dict],
    edges: list[dict],
) -> dict:
    """Execute workflow: run all tool nodes in topological order.

    This is the Windmill entry point.

    Args:
        user_id: User UUID
        project_id: Project UUID
        workflow_id: Workflow UUID (used for temp storage path)
        folder_id: Folder UUID
        nodes: List of workflow nodes
        edges: List of workflow edges

    Returns:
        Execution results for each node
    """
    print(f"[workflow_runner] Starting workflow {workflow_id}")
    print(f"[workflow_runner] user_id={user_id}, project_id={project_id}")
    print(f"[workflow_runner] nodes={len(nodes)}, edges={len(edges)}")

    params = WorkflowRunnerParams(
        user_id=user_id,
        project_id=project_id,
        workflow_id=workflow_id,
        folder_id=folder_id,
        nodes=nodes,
        edges=edges,
    )

    # Clean up previous temp results for this workflow
    print("[workflow_runner] Cleaning up previous results...")
    cleanup_previous_results(params)
    print("[workflow_runner] Cleanup complete")

    # Sort nodes by dependency order
    print("[workflow_runner] Sorting nodes...")
    sorted_nodes = topological_sort(nodes, edges)
    print(f"[workflow_runner] Sorted {len(sorted_nodes)} nodes")

    # Track results per node and node→job mapping
    results: dict[str, dict] = {}
    node_jobs: dict[str, str] = {}  # node_id → child job_id
    errors: list[dict] = []

    # Execute each tool node
    # Child jobs have parent_job set automatically, so backend can query
    # Windmill for jobs with parent_job={this_job_id} to track progress
    for node in sorted_nodes:
        node_type = node.get("data", {}).get("type")

        # Skip non-tool nodes (datasets, results, exports)
        if node_type != "tool":
            continue

        node_id = node["id"]
        process_id = node.get("data", {}).get("processId")

        if not process_id:
            errors.append({"node_id": node_id, "error": "No processId"})
            continue

        print(f"[workflow_runner] Executing node {node_id} ({process_id})...")

        try:
            # Build inputs for this tool
            inputs = build_tool_inputs(node, edges, nodes, results, params)
            print(f"[workflow_runner] Inputs built for {node_id}")

            # Execute the tool - returns (job_id, result)
            job_id, result = run_tool_node(node_id, process_id, inputs)

            # Track the node→job mapping
            node_jobs[node_id] = job_id
            results[node_id] = result

            # Check if node failed (result contains error)
            if "error" in result:
                print(f"[workflow_runner] Node {node_id} failed: {result.get('error')}")
                errors.append(
                    {
                        "node_id": node_id,
                        "error": result.get("error"),
                    }
                )
                # Stop execution on error - downstream nodes depend on this
                break

            print(
                f"[workflow_runner] Node {node_id} completed: {result.get('temp_layer_id')}"
            )

        except Exception as e:
            print(f"[workflow_runner] Node {node_id} failed: {e}")
            logger.error(f"Node {node_id} failed: {e}")
            errors.append(
                {
                    "node_id": node_id,
                    "error": str(e),
                }
            )
            # Stop execution on error - downstream nodes depend on this
            break

    print(
        f"[workflow_runner] Tool nodes complete: {len(results)} results, {len(errors)} errors"
    )

    # Finalize export nodes (only if no errors from tool execution)
    if not errors:
        export_nodes = [
            n for n in sorted_nodes if n.get("data", {}).get("type") == "export"
        ]
        if export_nodes:
            print(f"[workflow_runner] Processing {len(export_nodes)} export node(s)...")

        for export_node in export_nodes:
            export_node_id = export_node["id"]
            export_data = export_node.get("data", {})
            dataset_name = export_data.get("datasetName", "").strip()

            if not dataset_name:
                print(
                    f"[workflow_runner] Export node {export_node_id}: no dataset name, skipping"
                )
                continue

            # Find the upstream node connected to this export node
            incoming_edge = next(
                (e for e in edges if e["target"] == export_node_id), None
            )
            if not incoming_edge:
                print(
                    f"[workflow_runner] Export node {export_node_id}: no incoming edge, skipping"
                )
                continue

            source_node_id = incoming_edge["source"]

            # Verify the source node has a temp result
            source_result = results.get(source_node_id)
            if not source_result or not source_result.get("temp_layer_id"):
                print(
                    f"[workflow_runner] Export node {export_node_id}: "
                    f"source {source_node_id} has no temp result, skipping"
                )
                continue

            print(
                f"[workflow_runner] Finalizing export node {export_node_id} "
                f"(source={source_node_id}, name={dataset_name})"
            )

            try:
                finalize_inputs = {
                    "user_id": params.user_id,
                    "workflow_id": params.workflow_id,
                    "node_id": source_node_id,  # Source node's temp dir
                    "export_node_id": export_node_id,  # For status tracking
                    "project_id": params.project_id,
                    "folder_id": params.folder_id,
                    "layer_name": dataset_name,
                }

                job_id, result = run_tool_node(
                    export_node_id, "finalize_layer", finalize_inputs
                )

                node_jobs[export_node_id] = job_id
                results[export_node_id] = result

                if "error" in result:
                    print(
                        f"[workflow_runner] Export node {export_node_id} failed: "
                        f"{result.get('error')}"
                    )
                    errors.append(
                        {
                            "node_id": export_node_id,
                            "error": result.get("error"),
                        }
                    )
                else:
                    print(
                        f"[workflow_runner] Export node {export_node_id} completed: "
                        f"layer_id={result.get('layer_id')}"
                    )

            except Exception as e:
                print(f"[workflow_runner] Export node {export_node_id} failed: {e}")
                logger.error(f"Export node {export_node_id} failed: {e}")
                errors.append(
                    {
                        "node_id": export_node_id,
                        "error": str(e),
                    }
                )

    print(
        f"[workflow_runner] Workflow complete: {len(results)} results, {len(errors)} errors"
    )

    result = WorkflowResult(
        status="success" if not errors else "partial",
        node_results=results,
        errors=errors,
    ).model_dump()

    # Add node_jobs mapping to result for final reference
    result["node_jobs"] = node_jobs

    # If there were errors, raise to mark job as failed in Windmill
    if errors:
        # Build error message from first error
        first_error = errors[0]
        error_info = first_error.get("error", {})
        if isinstance(error_info, dict):
            error_msg = error_info.get("message", str(error_info))
        else:
            error_msg = str(error_info)
        node_id = first_error.get("node_id", "unknown")
        raise RuntimeError(f"Node {node_id} failed: {error_msg}")

    return result
