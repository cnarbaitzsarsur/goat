"""Finalize Layer Tool - Persists temporary workflow results to permanent storage.

This tool is called when a user clicks "Save" on a workflow result.
It takes a temp layer (stored in /data/temporary/) and:
1. Ingests the data into DuckLake
2. Creates a layer record in PostgreSQL
3. Generates PMTiles for fast serving
4. Cleans up the temp files

This runs as a Windmill job like other tools.
"""

import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from goatlib.tools.base import BaseToolRunner
from goatlib.tools.schemas import ToolInputBase

logger = logging.getLogger(__name__)

# Temp data root
TEMP_DATA_ROOT = Path("/app/data/temporary")


class FinalizeLayerParams(ToolInputBase):
    """Parameters for the finalize layer tool."""

    workflow_id: str = Field(..., description="Workflow UUID")
    node_id: str = Field(..., description="Node ID within the workflow")
    project_id: str = Field(..., description="Project UUID to add the layer to")
    layer_name: str | None = Field(
        default=None,
        description="Optional name override for the layer",
    )
    delete_temp: bool = Field(
        default=False,
        description="Whether to delete temp files after finalization. "
        "Default False to keep files available for frontend preview. "
        "Cleanup happens at the start of the next workflow execution.",
    )
    properties: dict[str, Any] | None = Field(
        default=None,
        description="Layer style properties from the source tool. "
        "If None, properties are read from metadata.json or defaults are used.",
    )


class FinalizeLayerOutput(BaseModel):
    """Output from the finalize layer tool.

    Note: This doesn't extend ToolOutputBase because this tool doesn't create
    a layer in the normal way - it moves an existing temp layer to permanent storage.
    """

    layer_id: str = Field(..., description="New permanent layer UUID")
    layer_name: str = Field(..., description="Layer name")
    project_id: str = Field(..., description="Project the layer was added to")
    layer_project_id: int = Field(..., description="Layer-project association ID")
    feature_count: int = Field(default=0, description="Number of features")
    geometry_type: str | None = Field(default=None, description="Geometry type")


class FinalizeLayerRunner(BaseToolRunner[FinalizeLayerParams]):
    """Tool runner for finalizing temporary layers."""

    tool_class: Literal["finalize_layer"] = "finalize_layer"
    output_geometry_type: str | None = None
    default_output_name: str = "Finalized Layer"

    def get_temp_base_path(self, user_id: str, workflow_id: str, node_id: str) -> Path:
        """Get the base path for a temp layer with prefixes."""
        user_id_clean = user_id.replace("-", "")
        workflow_id_clean = workflow_id.replace("-", "") if workflow_id else workflow_id
        # Use prefixed paths: user_{uuid}/w_{uuid}/n_{uuid}/
        return (
            TEMP_DATA_ROOT
            / f"user_{user_id_clean}"
            / f"w_{workflow_id_clean}"
            / f"n_{node_id}"
        )

    def process(self, params: FinalizeLayerParams) -> str:
        """Finalize a temporary layer to permanent storage.

        This method:
        1. Reads the temp parquet and metadata
        2. Ingests to DuckLake
        3. Creates PostgreSQL layer record
        4. Generates PMTiles
        5. Cleans up temp files

        Returns:
            New layer_id as string
        """
        if params.user_id is None:
            raise ValueError("user_id is required for finalize_layer")

        user_id = params.user_id
        workflow_id = params.workflow_id
        node_id = params.node_id

        base_path = self.get_temp_base_path(user_id, workflow_id, node_id)
        metadata_path = base_path / "metadata.json"

        # Find the latest parquet file (t_{uuid}.parquet)
        parquet_files = list(base_path.glob("t_*.parquet"))
        if not parquet_files:
            raise FileNotFoundError(
                f"Temp layer not found: workflow={workflow_id}, node={node_id}"
            )
        parquet_path = max(parquet_files, key=lambda p: p.stat().st_mtime)

        # Read metadata
        metadata: dict = {}
        if metadata_path.exists():
            try:
                metadata = json.loads(metadata_path.read_text())
            except Exception as e:
                logger.warning(f"Failed to read temp metadata: {e}")

        # Use override name or metadata name
        layer_name = params.layer_name or metadata.get("layer_name", "Workflow Result")

        # Generate new layer ID
        new_layer_id = str(uuid.uuid4())

        # Get DuckDB connection
        con = self.duckdb_con

        # Build table path
        table_name = self.get_layer_table_path(user_id, new_layer_id)
        user_schema = f"user_{user_id.replace('-', '')}"

        # Create schema if needed
        con.execute(f"CREATE SCHEMA IF NOT EXISTS lake.{user_schema}")

        # Detect geometry column
        cols = con.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
        ).fetchall()
        geom_col = None
        for col_name, col_type, *_ in cols:
            if "GEOMETRY" in col_type.upper():
                geom_col = col_name
                break

        # Create table with Hilbert ordering if spatial
        if geom_col:
            con.execute(f"""
                CREATE TABLE {table_name} AS
                SELECT * FROM read_parquet('{parquet_path}')
                ORDER BY ST_Hilbert({geom_col})
            """)
        else:
            con.execute(f"""
                CREATE TABLE {table_name} AS
                SELECT * FROM read_parquet('{parquet_path}')
            """)

        logger.info(f"Ingested temp layer to DuckLake: {table_name}")

        # Get table info
        count_result = con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
        feature_count = count_result[0] if count_result else 0

        geometry_type = metadata.get("geometry_type")
        bbox = metadata.get("bbox")
        extent_wkt = None
        if bbox and len(bbox) == 4:
            extent_wkt = (
                f"POLYGON(({bbox[0]} {bbox[1]}, {bbox[2]} {bbox[1]}, "
                f"{bbox[2]} {bbox[3]}, {bbox[0]} {bbox[3]}, "
                f"{bbox[0]} {bbox[1]}))"
            )

        # Generate PMTiles for the permanent layer
        if (
            geometry_type
            and self.settings is not None
            and self.settings.pmtiles_enabled
        ):
            try:
                from goatlib.io.pmtiles import PMTilesConfig, PMTilesGenerator

                generator = PMTilesGenerator(
                    tiles_data_dir=self.settings.tiles_data_dir,
                    config=PMTilesConfig(
                        enabled=True,
                        max_zoom=self.settings.pmtiles_max_zoom,
                    ),
                )
                generator.generate_from_table(
                    duckdb_con=con,
                    table_name=table_name,
                    user_id=user_id,
                    layer_id=new_layer_id,
                    geometry_column=geom_col or "geometry",
                )
                logger.info(f"Generated PMTiles for finalized layer: {new_layer_id}")
            except Exception as e:
                logger.warning(f"PMTiles generation failed (non-fatal): {e}")

        # Create PostgreSQL records using the async DB service
        # Note: This runs sync inside the tool, we use run_sync wrapper
        import asyncio

        async def create_db_records() -> None:
            from goatlib.tools.db import ToolDatabaseService

            pool = await self.get_postgres_pool()
            db_service = ToolDatabaseService(pool, schema="customer")

            # Get folder_id from project
            folder_id = await db_service.get_project_folder_id(params.project_id)
            if not folder_id:
                raise ValueError(
                    f"Could not find folder for project {params.project_id}"
                )

            # Determine layer type
            is_feature = bool(geometry_type)
            layer_type = "feature" if is_feature else "table"

            # Use style properties: params > metadata.json > default
            layer_style = params.properties or metadata.get("properties")

            # Create layer record
            layer_properties = await db_service.create_layer(
                layer_id=new_layer_id,
                user_id=user_id,
                folder_id=folder_id,
                name=layer_name,
                layer_type=layer_type,
                feature_layer_type="tool" if is_feature else None,
                geometry_type=geometry_type,
                extent_wkt=extent_wkt,
                feature_count=feature_count,
                size=parquet_path.stat().st_size,
                properties=layer_style,
                tool_type=metadata.get("process_id"),
                job_id=None,
            )

            # Add to project - pass the properties from create_layer
            layer_project_id = await db_service.add_to_project(
                layer_id=new_layer_id,
                project_id=params.project_id,
                name=layer_name,
                properties=layer_properties,
            )

            return layer_project_id

        # Run async code in sync context
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        layer_project_id = loop.run_until_complete(create_db_records())

        logger.info(
            f"Created layer record: {new_layer_id}, layer_project_id={layer_project_id}"
        )

        # Store output info for the run() method to use
        self._output_info = FinalizeLayerOutput(
            layer_id=new_layer_id,
            layer_name=layer_name,
            project_id=params.project_id,
            layer_project_id=layer_project_id,
            feature_count=feature_count,
            geometry_type=geometry_type,
        )

        # Delete temp files if requested
        if params.delete_temp:
            try:
                shutil.rmtree(base_path)
                logger.info(f"Deleted temp files: {base_path}")
            except Exception as e:
                logger.warning(f"Failed to delete temp files: {e}")

        return new_layer_id

    def run(self, params: FinalizeLayerParams) -> FinalizeLayerOutput:
        """Run the finalize layer tool.

        Override the base run() since this tool doesn't produce a layer output
        in the normal way - it moves an existing temp layer to permanent storage.
        """
        # Process the finalization
        self.process(params)

        # Return the output info
        return self._output_info


def main(
    user_id: str,
    workflow_id: str,
    node_id: str,
    project_id: str,
    folder_id: str,
    layer_name: str | None = None,
    export_node_id: str | None = None,  # Used by workflow_runner for status tracking
    properties: dict[str, Any] | None = None,
) -> dict:
    """Windmill entry point for finalize layer.

    Args:
        user_id: User UUID
        workflow_id: Workflow UUID
        node_id: Node ID within the workflow
        project_id: Project UUID to add the layer to
        folder_id: Folder UUID (required by ToolInputBase)
        layer_name: Optional name override for the layer
        properties: Optional layer style properties from the source tool

    Returns:
        Output dict with layer info
    """
    params = FinalizeLayerParams(
        user_id=user_id,
        workflow_id=workflow_id,
        node_id=node_id,
        project_id=project_id,
        folder_id=folder_id,
        layer_name=layer_name,
        properties=properties,
    )

    runner = FinalizeLayerRunner()
    runner.init_from_env()
    result = runner.run(params)
    return result.model_dump()
