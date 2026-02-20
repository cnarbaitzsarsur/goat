"""Zone Clustering tool for Windmill.

This tool creates spatial clusters.
For fast run it uses kmean clustering but do not garantee equal size
For equal size zone, it uses a genetic algorithm approach.
"""

import asyncio
import logging
import tempfile
import uuid as uuid_module
from pathlib import Path
from typing import Any, Self

from pydantic import ConfigDict, Field

from goatlib.analysis.geoanalysis.clustering_zones import ClusteringZones
from goatlib.analysis.schemas.clustering import ClusteringParams, WeightMethod, WeightMethod_LABELS
from goatlib.analysis.schemas.ui import (
    SECTION_INPUT,
    SECTION_OUTPUT,
    SECTION_RESULT,
    UISection,
    ui_field,
    ui_sections,
)
from goatlib.models.io import DatasetMetadata
from goatlib.tools.base import BaseToolRunner
from goatlib.tools.schemas import (
    ScenarioSelectorMixin,
    ToolInputBase,
    ToolOutputBase,
    get_default_layer_name,
)
from goatlib.tools.style import DEFAULT_POINT_STYLE, build_ordinal_color_map, hex_to_rgb

logger = logging.getLogger(__name__)


class ClusteringZonesToolParams(ScenarioSelectorMixin, ToolInputBase, ClusteringParams):
    """Parameters for balanced zones clustering tool.

    Inherits clustering options from ClusteringParams, adds layer context from ToolInputBase.
    input_path/output_path are not used (we use input_layer_id instead).
    """

    model_config = ConfigDict(
        json_schema_extra=ui_sections(
            SECTION_INPUT,
            UISection(
                id="configuration",
                order=2,
                icon="settings",
                depends_on={"input_layer_id": {"$ne": None}},
            ),
            SECTION_RESULT,
            UISection(
                id="scenario",
                order=8,
                icon="scenario",
                collapsible=True,
                collapsed=True,
                depends_on={"input_layer_id": {"$ne": None}},
            ),
            SECTION_OUTPUT,
        )
    )

    # Override file paths as optional - we use layer IDs instead
    input_path: str | None = Field(
        None,
        json_schema_extra=ui_field(section="input", hidden=True),
    )  # type: ignore[assignment]
    output_path: str | None = None  # type: ignore[assignment]

    # Layer ID for input
    input_layer_id: str = Field(
        ...,
        description="Layer containing points to cluster into balanced zones.",
        json_schema_extra=ui_field(
            section="input",
            field_order=1,
            widget="layer-selector",
            widget_options={"geometry_types": ["Point", "MultiPoint"]},
        ),
    )
    input_layer_filter: dict[str, Any] | None = Field(
        None,
        description="CQL2-JSON filter to apply to the input layer",
        json_schema_extra=ui_field(section="input", field_order=2, hidden=True),
    )

    nb_cluster: int = Field(
        ...,
        description="Number of clusters " "It should be an integer ",
        json_schema_extra=ui_field(
            section="input",
            field_order=2,
            widget="number-input",
            visible_when={"input_layer_id": {"$ne": None}},
        ),
    )

    weight_method: WeightMethod = Field(
        default=WeightMethod.count,
        description="Method to determine balance weight: count (each point = 1) or field (use a numeric column).",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=2,
            label_key="weight_method",
            enum_labels=WeightMethod_LABELS,
            visible_when={
                "$and": [
                    {"cluster_type": "equal_size"},
                    {"input_layer_id": {"$ne": None}},
                ]
            },
        ),
    )

    weight_field: str | None = Field(
        default=None,
        description="Numeric field to use as balance weight when weight_method is 'field'.",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=3,
            label_key="weight_field",
            widget="field-selector",
            widget_options={
                "source_layer": "input_layer_id",
                "field_types": ["number"],
            },
            visible_when={
                "$and": [
                    {"cluster_type": "equal_size"},
                    {"weight_method": "field"},
                    {"input_layer_id": {"$ne": None}},
                ]
            },
        ),
    )

    use_compactness: bool = Field(
        default=False,
        description="Enable compactness constraint to limit max distance between points in a zone.",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=4,
            label_key="use_compactness",
            widget="switch",
            visible_when={
                "$and": [
                    {"cluster_type": "equal_size"},
                    {"input_layer_id": {"$ne": None}},
                ]
            },
        ),
    )

    max_distance: int = Field(
        default=5000,
        ge=500,
        le=50000,
        description="Maximum distance in meters between points within the same zone.",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=5,
            label_key="max_distance",
            widget="slider",
            widget_options={"min": 500, "max": 50000, "step": 500},
            visible_when={
                "$and": [
                    {"cluster_type": "equal_size"},
                    {"use_compactness": True},
                    {"input_layer_id": {"$ne": None}},
                ]
            },
        ),
    )

    # =========================================================================
    # Result Layer Naming Section
    # =========================================================================
    result_layer_name: str | None = Field(
        default=get_default_layer_name("clustered_features", "en"),
        description="Name for the features with cluster assignments.",
        json_schema_extra=ui_field(
            section="result",
            field_order=1,
            label_key="result_layer_name",
            widget_options={
                "default_en": get_default_layer_name("clustered_features", "en"),
                "default_de": get_default_layer_name("clustered_features", "de"),
            },
        ),
    )
    summary_layer_name: str | None = Field(
        default=get_default_layer_name("cluster_summary", "en"),
        description="Name for the cluster summary layer.",
        json_schema_extra=ui_field(
            section="result",
            field_order=2,
            label_key="summary_layer_name",
            widget_options={
                "default_en": get_default_layer_name("cluster_summary", "en"),
                "default_de": get_default_layer_name("cluster_summary", "de"),
            },
        ),
    )


class ZonesClusteringToolRunner(BaseToolRunner[ClusteringZonesToolParams]):
    """zones clustering tool runner for Windmill."""

    tool_class = ClusteringZones
    output_geometry_type = "point"  # Original points with cluster_id attribute
    default_output_name = get_default_layer_name("clustered_features", "en")

    @classmethod
    def predict_output_schema(
        cls,
        input_schemas: dict[str, dict[str, str]],
        params: dict[str, Any],
    ) -> dict[str, str]:
        """Predict clustering zones output schema.

        Clustering outputs:
        - All input columns (preserves original points)
        - cluster_id: assigned cluster identifier
        - geometry: Point geometry (unchanged from input)
        """
        input_layer = input_schemas.get("input_layer_id", {})
        columns = dict(input_layer)

        # Add cluster_id column
        columns["cluster_id"] = "INTEGER"

        return columns

    # Name for the secondary summary layer
    default_summary_name = get_default_layer_name("cluster_summary", "en")

    def process(
        self: Self,
        params: ClusteringZonesToolParams,
        temp_dir: Path,
        **_kwargs,
    ) -> tuple[Path, DatasetMetadata]:
        """Run zones clustering analysis.

        Args:
            params: Tool parameters
            temp_dir: Temporary directory for outputs

        Returns:
            Tuple of (output_path, metadata) for the primary points layer.
            The summary result is stored in self._summary_result.
        """
        output_path = temp_dir / "clustering_result.parquet"

        # Export input layer to parquet
        input_layer_path = self.export_layer_to_parquet(
            layer_id=params.input_layer_id,
            user_id=params.user_id,
            cql_filter=params.input_layer_filter,
            scenario_id=params.scenario_id,
            project_id=params.project_id,
        )

        # Initialize the clustering tool with algorithm parameters
        tool = self.tool_class()
        # Convert tool params to analysis params
        analysis_params = ClusteringParams(
            **params.model_dump(
                exclude={
                    "output_path",
                    "input_path",
                    "user_id",
                    "folder_id",
                    "project_id",
                    "scenario_id",
                    "output_name",
                    "result_layer_name",
                    "summary_layer_name",
                    "triggered_by_email",
                    "input_layer_id",
                    "input_layer_filter",
                    "use_compactness",
                    "max_distance",
                }
            ),
            input_path=str(input_layer_path),
            output_path=str(output_path),
        )

        # Run the analysis — returns [points, summary]
        results = tool.run(analysis_params)

        # Store the summary result for the run() override
        self._summary_result = results[1] if len(results) > 1 else None

        result_path, metadata = results[0]
        return Path(result_path), metadata

    def run(self: Self, params: ClusteringZonesToolParams) -> dict[str, Any]:
        """Run clustering and create both points and summary layers.

        Overrides base run() to handle dual-output creation:
        - Primary: original points with cluster_id
        - Secondary: multipoint summary per cluster with characteristics

        Args:
            params: Tool parameters

        Returns:
            Dict with primary layer info and secondary_layers list
        """
        output_layer_id_points = str(uuid_module.uuid4())
        output_layer_id_summary = str(uuid_module.uuid4())

        output_name_points = (
            params.result_layer_name or params.output_name or self.default_output_name
        )
        output_name_summary = (
            params.summary_layer_name or self.default_summary_name
        )

        logger.info(
            "Starting clustering tool: %s (user=%s, points=%s, summary=%s)",
            self.__class__.__name__,
            params.user_id,
            output_layer_id_points,
            output_layer_id_summary,
        )

        # Initialize db_service
        asyncio.get_event_loop().run_until_complete(self._init_db_service())

        with tempfile.TemporaryDirectory(
            prefix=f"{self.__class__.__name__.lower()}_"
        ) as temp_dir:
            temp_path = Path(temp_dir)

            # Step 1: Run analysis (creates both outputs)
            output_parquet_points, metadata_points = self.process(params, temp_path)
            summary_result = self._summary_result

            # Step 2: Ingest primary points layer to DuckLake
            table_info_points = self._ingest_to_ducklake(
                user_id=params.user_id,
                layer_id=output_layer_id_points,
                parquet_path=output_parquet_points,
            )
            logger.info("Points DuckLake table: %s", table_info_points["table_name"])

            # Step 2b: Generate PMTiles for points
            if table_info_points.get("geometry_type"):
                pmtiles_path = self._generate_pmtiles(
                    user_id=params.user_id,
                    layer_id=output_layer_id_points,
                    table_name=table_info_points["table_name"],
                    geometry_column=table_info_points.get(
                        "geometry_column", "geometry"
                    ),
                )
                if pmtiles_path:
                    table_info_points["pmtiles_path"] = str(pmtiles_path)

            # Step 3: Ingest summary layer to DuckLake
            table_info_summary = None
            if summary_result:
                summary_path, metadata_summary = summary_result
                table_info_summary = self._ingest_to_ducklake(
                    user_id=params.user_id,
                    layer_id=output_layer_id_summary,
                    parquet_path=Path(summary_path),
                )
                logger.info(
                    "Summary DuckLake table: %s", table_info_summary["table_name"]
                )

            # Get cluster color style for points
            points_style = self.get_layer_properties(params, metadata_points)

            # Refresh database pool
            asyncio.get_event_loop().run_until_complete(self._close_db_service())

            # Step 4: Create points layer record
            result_info_points = asyncio.get_event_loop().run_until_complete(
                self._create_db_records(
                    output_layer_id=output_layer_id_points,
                    params=params,
                    output_name=output_name_points,
                    metadata=metadata_points,
                    table_info=table_info_points,
                    custom_properties=points_style,
                )
            )

            # Step 5: Create summary layer record
            result_info_summary = None
            if table_info_summary and summary_result:
                summary_style = self._get_summary_style(params)
                result_info_summary = asyncio.get_event_loop().run_until_complete(
                    self._create_db_records(
                        output_layer_id=output_layer_id_summary,
                        params=params,
                        output_name=output_name_summary,
                        metadata=metadata_summary,
                        table_info=table_info_summary,
                        custom_properties=summary_style,
                    )
                )

        # Close db service
        asyncio.get_event_loop().run_until_complete(self._close_db_service())

        # Build wm_labels
        wm_labels: list[str] = []
        if params.triggered_by_email:
            wm_labels.append(params.triggered_by_email)

        # Build primary output (points)
        detected_geom_type_points = table_info_points.get("geometry_type")
        output_points = ToolOutputBase(
            layer_id=output_layer_id_points,
            name=output_name_points,
            folder_id=result_info_points["folder_id"],
            user_id=params.user_id,
            project_id=params.project_id,
            layer_project_id=result_info_points.get("layer_project_id"),
            type="feature",
            feature_layer_type="tool",
            geometry_type=detected_geom_type_points,
            feature_count=table_info_points.get("feature_count", 0),
            extent=table_info_points.get("extent"),
            table_name=table_info_points["table_name"],
            wm_labels=wm_labels,
        )

        result = output_points.model_dump()

        # Build secondary output (summary multipoint)
        if result_info_summary and table_info_summary:
            detected_geom_type_summary = table_info_summary.get("geometry_type")
            output_summary = ToolOutputBase(
                layer_id=output_layer_id_summary,
                name=output_name_summary,
                folder_id=result_info_summary["folder_id"],
                user_id=params.user_id,
                project_id=params.project_id,
                layer_project_id=result_info_summary.get("layer_project_id"),
                type="feature",
                feature_layer_type="tool",
                geometry_type=detected_geom_type_summary,
                feature_count=table_info_summary.get("feature_count", 0),
                extent=table_info_summary.get("extent"),
                table_name=table_info_summary["table_name"],
                wm_labels=wm_labels,
            )
            result["secondary_layers"] = [output_summary.model_dump()]

        logger.info(
            "Clustering tool completed: points=%s, summary=%s",
            output_layer_id_points,
            output_layer_id_summary,
        )
        return result

    def _get_summary_style(
        self: Self, params: ClusteringZonesToolParams
    ) -> dict[str, Any]:
        """Get layer properties for styling the cluster summary layer."""
        cluster_values = list(range(params.nb_cluster))
        colors, color_map = build_ordinal_color_map(cluster_values, palette="Sunset")

        return {
            **DEFAULT_POINT_STYLE,
            "color": hex_to_rgb(colors[len(colors) // 2]),
            "opacity": 0.6,
            "radius": 8,
            "color_field": {"name": "cluster_id", "type": "number"},
            "color_range": {
                "name": "Custom",
                "type": "custom",
                "colors": colors,
                "category": "Custom",
                "color_map": color_map,
            },
            "color_scale": "ordinal",
        }

    def get_layer_properties(
        self: Self,
        params: ClusteringZonesToolParams,
        metadata: DatasetMetadata,
        table_info: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Get layer properties for styling the clustering results."""
        color_field = "cluster_id"

        # Generate cluster ID values based on number of clusters
        cluster_values = list(range(params.nb_cluster))

        # Use build_ordinal_color_map to create exact number of colors for clusters
        colors, color_map = build_ordinal_color_map(cluster_values, palette="Sunset")

        # Build custom style with interpolated colors
        return {
            **DEFAULT_POINT_STYLE,
            "color": hex_to_rgb(colors[len(colors) // 2]),  # Middle color as default
            "opacity": 0.8,
            "radius": 4,
            "color_field": {"name": color_field, "type": "number"},
            "color_range": {
                "name": "Custom",
                "type": "custom",
                "colors": colors,
                "category": "Custom",
                "color_map": color_map,
            },
            "color_scale": "ordinal",
        }


def main(params: ClusteringZonesToolParams) -> dict[str, Any]:
    """Windmill entry point for balanced zones clustering tool."""
    runner = ZonesClusteringToolRunner()
    runner.init_from_env()
    return runner.run(params)


if __name__ == "__main__":
    # For testing
    import sys

    from pydantic import ValidationError

    try:
        test_params = ClusteringZonesToolParams(
            user_id="test-user",
            input_layer_id="test-layer",
            nb_cluster=5,
        )
        print("Tool parameters validation: OK")
        print(f"Default layer name: {test_params.result_layer_name}")
    except ValidationError as e:
        print(f"Validation error: {e}")
        sys.exit(1)
