"""Workflow execution router.

Provides endpoints for executing workflows via Windmill.
"""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from processes.deps.auth import get_user_id
from processes.services.windmill_client import WindmillClient, WindmillError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflows", tags=["Workflows"])

# Windmill client
windmill_client = WindmillClient()

# Path to workflow runner script in Windmill
WORKFLOW_RUNNER_PATH = "f/goat/tools/workflow_runner"


class WorkflowExecuteRequest(BaseModel):
    """Request body for workflow execution."""

    project_id: str = Field(..., description="Project UUID")
    folder_id: str = Field(..., description="Folder UUID")
    nodes: list[dict[str, Any]] = Field(..., description="Workflow nodes")
    edges: list[dict[str, Any]] = Field(..., description="Workflow edges")


class WorkflowExecuteResponse(BaseModel):
    """Response from workflow execution."""

    job_id: str = Field(..., description="Windmill job ID")
    workflow_id: str = Field(..., description="Workflow UUID")
    status: str = Field(default="submitted", description="Job status")


class WorkflowFinalizeRequest(BaseModel):
    """Request to finalize a temp layer from workflow."""

    workflow_id: str = Field(..., description="Workflow UUID")
    node_id: str = Field(..., description="Node ID to finalize")
    project_id: str = Field(..., description="Project UUID to add layer to")
    layer_name: str | None = Field(
        default=None, description="Optional layer name override"
    )


class WorkflowFinalizeResponse(BaseModel):
    """Response from layer finalization."""

    job_id: str = Field(..., description="Windmill job ID for finalize job")


class WorkflowCleanupRequest(BaseModel):
    """Request to cleanup workflow temp files."""

    workflow_id: str = Field(..., description="Workflow UUID")
    node_ids: list[str] | None = Field(
        default=None,
        description="Specific node IDs to cleanup (all if None)",
    )


class WorkflowCleanupResponse(BaseModel):
    """Response from cleanup."""

    status: str = Field(..., description="Cleanup status")
    message: str = Field(..., description="Status message")


@router.post(
    "/{workflow_id}/execute",
    summary="Execute a workflow",
    status_code=status.HTTP_201_CREATED,
    response_model=WorkflowExecuteResponse,
)
async def execute_workflow(
    workflow_id: str,
    request: WorkflowExecuteRequest,
    user_id: UUID = Depends(get_user_id),
) -> WorkflowExecuteResponse:
    """Execute a workflow via Windmill.

    Submits the workflow to the workflow_runner script which executes
    all tool nodes in topological order with temp_mode enabled.

    Args:
        workflow_id: UUID of the workflow
        request: Workflow configuration (nodes, edges, project info)
        user_id: Authenticated user ID

    Returns:
        Job ID and status info
    """
    # Build job inputs
    job_inputs = {
        "user_id": str(user_id),
        "project_id": request.project_id,
        "workflow_id": workflow_id,
        "folder_id": request.folder_id,
        "nodes": request.nodes,
        "edges": request.edges,
    }

    try:
        job_id = await windmill_client.run_script_async(
            script_path=WORKFLOW_RUNNER_PATH,
            args=job_inputs,
        )

        logger.info(
            f"Workflow job {job_id} created for workflow {workflow_id} "
            f"by user {user_id}"
        )

        return WorkflowExecuteResponse(
            job_id=job_id,
            workflow_id=workflow_id,
            status="submitted",
        )

    except WindmillError as e:
        logger.error(f"Failed to submit workflow job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute workflow: {str(e)}",
        )


@router.post(
    "/{workflow_id}/finalize",
    summary="Finalize a workflow temp layer",
    status_code=status.HTTP_201_CREATED,
    response_model=WorkflowFinalizeResponse,
)
async def finalize_workflow_layer(
    workflow_id: str,
    request: WorkflowFinalizeRequest,
    user_id: UUID = Depends(get_user_id),
) -> WorkflowFinalizeResponse:
    """Finalize a temporary workflow layer to permanent storage.

    Called when user clicks "Save" on a workflow result.
    Submits a finalize_layer job to Windmill.

    Args:
        workflow_id: UUID of the workflow (must match request)
        request: Finalize parameters
        user_id: Authenticated user ID

    Returns:
        Job ID for the finalize job
    """
    if request.workflow_id != workflow_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="workflow_id in path must match request body",
        )

    # Build job inputs for finalize_layer tool
    job_inputs = {
        "user_id": str(user_id),
        "workflow_id": request.workflow_id,
        "node_id": request.node_id,
        "project_id": request.project_id,
        "layer_name": request.layer_name,
        "delete_temp": True,
    }

    try:
        job_id = await windmill_client.run_script_async(
            script_path="f/goat/tools/finalize_layer",
            args=job_inputs,
        )

        logger.info(
            f"Finalize job {job_id} created for workflow {workflow_id} "
            f"node {request.node_id}"
        )

        return WorkflowFinalizeResponse(job_id=job_id)

    except WindmillError as e:
        logger.error(f"Failed to submit finalize job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to finalize layer: {str(e)}",
        )


@router.delete(
    "/{workflow_id}/temp",
    summary="Cleanup workflow temp files",
    response_model=WorkflowCleanupResponse,
)
async def cleanup_workflow_temp(
    workflow_id: str,
    user_id: UUID = Depends(get_user_id),
    node_ids: list[str] | None = None,
) -> WorkflowCleanupResponse:
    """Cleanup temporary files for a workflow.

    Called before re-running a workflow to clear previous results.
    This runs synchronously (no Windmill job) since it's just file deletion.

    Args:
        workflow_id: UUID of the workflow
        user_id: Authenticated user ID
        node_ids: Optional specific node IDs to cleanup

    Returns:
        Cleanup status
    """
    from goatlib.tools.cleanup_temp import cleanup_workflow_temp as do_cleanup

    result = do_cleanup(
        user_id=str(user_id),
        workflow_id=workflow_id,
        node_ids=node_ids,
    )

    return WorkflowCleanupResponse(
        status=result.status,
        message=result.message,
    )
