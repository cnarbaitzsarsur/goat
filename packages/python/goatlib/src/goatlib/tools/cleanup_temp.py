"""Cleanup Temp Layers Tool - Removes temporary workflow results.

This tool is called before re-running a workflow to clean up previous results.
It deletes all temp files for a given workflow.

This runs as a Windmill job like other tools.
"""

import logging
import shutil
from pathlib import Path

from pydantic import BaseModel, Field

from goatlib.tools.schemas import ToolInputBase

logger = logging.getLogger(__name__)

# Temp data root
TEMP_DATA_ROOT = Path("/app/data/temporary")


class CleanupTempLayersParams(ToolInputBase):
    """Parameters for the cleanup temp layers tool."""

    workflow_id: str = Field(..., description="Workflow UUID to cleanup")
    node_ids: list[str] | None = Field(
        default=None,
        description="Optional specific node IDs to cleanup. If None, cleans all nodes.",
    )


class CleanupTempLayersOutput(BaseModel):
    """Output from the cleanup temp layers tool.

    Note: Does not inherit from ToolOutputBase as this doesn't create a layer.
    """

    status: str = Field(..., description="Status: 'cleaned' or 'not_found'")
    message: str = Field(..., description="Status message")
    nodes_cleaned: list[str] = Field(
        default_factory=list,
        description="List of node IDs that were cleaned",
    )


def cleanup_workflow_temp(
    user_id: str,
    workflow_id: str,
    node_ids: list[str] | None = None,
) -> CleanupTempLayersOutput:
    """Clean up temporary files for a workflow.

    This is a standalone function that can be called without a full tool runner.

    Args:
        user_id: User UUID
        workflow_id: Workflow UUID
        node_ids: Optional list of specific node IDs to cleanup

    Returns:
        CleanupTempLayersOutput with status info
    """
    user_id_clean = user_id.replace("-", "")
    workflow_id_clean = workflow_id.replace("-", "") if workflow_id else workflow_id
    # Use prefixed paths: user_{uuid}/w_{uuid}/
    workflow_path = TEMP_DATA_ROOT / f"user_{user_id_clean}" / f"w_{workflow_id_clean}"

    if not workflow_path.exists():
        return CleanupTempLayersOutput(
            status="not_found",
            message=f"No temp files found for workflow {workflow_id}",
            nodes_cleaned=[],
        )

    nodes_cleaned: list[str] = []

    if node_ids:
        # Clean specific nodes (with n_ prefix)
        for node_id in node_ids:
            node_path = workflow_path / f"n_{node_id}"
            if node_path.exists():
                try:
                    shutil.rmtree(node_path)
                    nodes_cleaned.append(node_id)
                    logger.info(f"Cleaned temp node: {node_path}")
                except Exception as e:
                    logger.warning(f"Failed to cleanup temp node {node_id}: {e}")
    else:
        # Clean entire workflow
        try:
            # List nodes before cleaning
            for item in workflow_path.iterdir():
                if item.is_dir():
                    nodes_cleaned.append(item.name)

            shutil.rmtree(workflow_path)
            logger.info(f"Cleaned temp workflow: {workflow_path}")
        except Exception as e:
            logger.error(f"Failed to cleanup temp workflow: {e}")
            return CleanupTempLayersOutput(
                status="error",
                message=f"Failed to cleanup: {str(e)}",
                nodes_cleaned=[],
            )

    return CleanupTempLayersOutput(
        status="cleaned",
        message=f"Deleted temp files for workflow {workflow_id}",
        nodes_cleaned=nodes_cleaned,
    )
