"""Workflow Runner - Executes workflow graphs in Windmill.

This script receives a workflow definition (nodes + edges) and executes
all tool nodes in topological order using temp_mode for preview results.

Uses Windmill's workflow-as-code feature (@wmill.task decorator) to get
proper progress tracking with running/completed status for each node.

Usage:
    Called from frontend via Windmill API when user clicks "Run Workflow"
"""

import logging
import re
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
    variables: list[dict[str, Any]] = Field(
        default_factory=list, description="Workflow variables"
    )


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


# Regex to match {{@variable_name}} references
VARIABLE_PATTERN = re.compile(r"\{\{@([a-zA-Z_][a-zA-Z0-9_]*)\}\}")


def resolve_variables(
    value: Any,  # noqa: ANN401
    var_map: dict[str, Any],
) -> Any:  # noqa: ANN401
    """Resolve {{@variable_name}} references in a value.

    If the entire value is a single variable reference, the resolved value
    preserves its original type (e.g., number stays number).
    If a variable is embedded in a larger string, the result is always a string.
    """
    if not isinstance(value, str):
        return value

    # Full match: entire value is one variable reference — preserve type
    match = VARIABLE_PATTERN.fullmatch(value)
    if match:
        var_name = match.group(1)
        if var_name not in var_map:
            raise ValueError(f"Unknown workflow variable: {var_name}")
        return var_map[var_name]

    # Embedded references: substitute within the string
    def _replace(m: re.Match) -> str:  # type: ignore[type-arg]
        var_name = m.group(1)
        if var_name not in var_map:
            raise ValueError(f"Unknown workflow variable: {var_name}")
        return str(var_map[var_name])

    if VARIABLE_PATTERN.search(value):
        return VARIABLE_PATTERN.sub(_replace, value)

    return value


def substitute_variables_in_config(
    config: dict[str, Any],
    var_map: dict[str, Any],
) -> dict[str, Any]:
    """Recursively substitute variable references in a node config dict."""
    resolved: dict[str, Any] = {}
    for key, value in config.items():
        if isinstance(value, dict):
            resolved[key] = substitute_variables_in_config(value, var_map)
        elif isinstance(value, list):
            resolved[key] = [
                substitute_variables_in_config(item, var_map)
                if isinstance(item, dict)
                else resolve_variables(item, var_map)
                for item in value
            ]
        else:
            resolved[key] = resolve_variables(value, var_map)
    return resolved


def coerce_inputs_from_schema(
    process_id: str,
    inputs: dict[str, Any],
) -> dict[str, Any]:
    """Coerce input values to match the tool's Pydantic schema types.

    When workflow variables resolve a single value for a field that expects
    a list (e.g. ``distances: List[float]`` receives ``100`` instead of
    ``[100]``), wrap the scalar in a list.
    """
    from goatlib.tools.registry import get_tool

    tool_def = get_tool(process_id)
    if not tool_def:
        return inputs

    try:
        params_class = tool_def.get_params_class()
        schema = params_class.model_json_schema()
    except Exception:
        return inputs

    properties = schema.get("properties", {})
    defs = schema.get("$defs", {})

    for key, value in inputs.items():
        if key not in properties or isinstance(value, (list, type(None))):
            continue

        prop = properties[key]
        if _schema_expects_array(prop, defs):
            inputs[key] = [value]

    return inputs


def _schema_expects_array(
    prop: dict[str, Any],
    defs: dict[str, Any],
) -> bool:
    """Check if a JSON schema property expects an array type."""
    # Direct {"type": "array"}
    if prop.get("type") == "array":
        return True

    # anyOf / oneOf (e.g. Optional[List[float]] → [{"type": "array", ...}, {"type": "null"}])
    for variant_key in ("anyOf", "oneOf"):
        variants = prop.get(variant_key)
        if variants:
            for variant in variants:
                if variant.get("type") == "array":
                    return True
                # Follow $ref
                ref = variant.get("$ref")
                if ref and ref.startswith("#/$defs/"):
                    ref_name = ref.split("/")[-1]
                    ref_schema = defs.get(ref_name, {})
                    if ref_schema.get("type") == "array":
                        return True

    return False


def _field_expects_layer_object(
    process_id: str | None,
    field_name: str,
) -> bool:
    """Check if a tool field expects an object with a ``layer_id`` property.

    Some tools (e.g. catchment_area) have complex input types like
    ``StartingPointsLayer`` that expect ``{"layer_id": "..."}`` rather than
    a plain layer_id string. When building workflow inputs from edges we need
    to wrap the layer_id accordingly.
    """
    if not process_id:
        return False
    # Simple heuristic: fields ending with _id are plain string layer refs
    if field_name.endswith("_id"):
        return False

    from goatlib.tools.registry import get_tool

    tool_def = get_tool(process_id)
    if not tool_def:
        return False

    try:
        params_class = tool_def.get_params_class()
        schema = params_class.model_json_schema()
    except Exception:
        return False

    properties = schema.get("properties", {})
    defs = schema.get("$defs", {})
    prop = properties.get(field_name)
    if not prop:
        return False

    # Check if any variant is an object type with a "layer_id" required field
    def _has_layer_id(obj_schema: dict) -> bool:  # noqa: ANN401
        if obj_schema.get("type") != "object":
            return False
        return "layer_id" in obj_schema.get("properties", {})

    # Direct object
    if _has_layer_id(prop):
        return True

    # anyOf / oneOf with $ref to object defs
    for variant_key in ("anyOf", "oneOf"):
        variants = prop.get(variant_key)
        if not variants:
            continue
        for variant in variants:
            if _has_layer_id(variant):
                return True
            ref = variant.get("$ref")
            if ref and ref.startswith("#/$defs/"):
                ref_name = ref.split("/")[-1]
                ref_schema = defs.get(ref_name, {})
                if _has_layer_id(ref_schema):
                    return True

    return False


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

    # Substitute workflow variables in config values
    if params.variables:
        var_map = {
            v["name"]: v.get("defaultValue")
            for v in params.variables
            if v.get("name")
        }
        if var_map:
            inputs = substitute_variables_in_config(inputs, var_map)

    # Coerce scalar values to lists where the tool schema expects arrays
    process_id = node_data.get("processId")
    if process_id:
        inputs = coerce_inputs_from_schema(process_id, inputs)

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
            # Get optional filter from dataset nodes
            source_type = source_node.get("data", {}).get("type")
            filter_config = None
            if source_type == "dataset":
                filter_config = source_node.get("data", {}).get("filter") or None

            # Check if the target field expects an object with a layer_id
            # property (e.g. StartingPointsLayer) rather than a plain string
            if _field_expects_layer_object(process_id, target_handle):
                layer_obj: dict[str, Any] = {"layer_id": layer_id}
                if filter_config:
                    layer_obj["layer_filter"] = filter_config
                inputs[target_handle] = layer_obj
            else:
                inputs[target_handle] = layer_id
                if filter_config:
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

    # For heatmap gravity/closest_average: build opportunities list from
    # numbered opportunity_layer_N_id inputs and per-opportunity config keys.
    if process_id in ("heatmap_gravity", "heatmap_closest_average"):
        opp_keys = sorted(
            k
            for k in list(inputs)
            if k.startswith("opportunity_layer_") and k.endswith("_id")
        )
        if opp_keys:
            opportunities: list[dict[str, Any]] = []
            for key in opp_keys:
                layer_id = inputs.pop(key)
                if not layer_id:
                    continue
                # Pop the corresponding filter
                filter_key = key.replace("_id", "_filter")
                layer_filter = inputs.pop(filter_key, None)

                # Extract the number (e.g. "1" from "opportunity_layer_1_id")
                opp_num = key.split("_")[2]
                # Collect per-opportunity config (opportunity_1_max_cost, etc.)
                prefix = f"opportunity_{opp_num}_"
                opp_config: dict[str, Any] = {}
                for cfg_key in list(inputs):
                    if cfg_key.startswith(prefix):
                        param_name = cfg_key[len(prefix):]
                        opp_config[param_name] = inputs.pop(cfg_key)

                opportunity: dict[str, Any] = {
                    "input_path": layer_id,
                    **opp_config,
                }
                if layer_filter:
                    opportunity["input_layer_filter"] = layer_filter
                opportunities.append(opportunity)

            if opportunities:
                inputs["opportunities"] = opportunities

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
    variables: list[dict] | None = None,
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
        variables=variables or [],
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
                    "delete_temp": False,  # Keep temp files for frontend preview
                }

                # Pass style properties from the source tool's result
                source_properties = source_result.get("properties")
                if source_properties:
                    finalize_inputs["properties"] = source_properties

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
