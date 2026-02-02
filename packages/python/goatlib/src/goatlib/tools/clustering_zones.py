"""Zone Clustering tool for Windmill.

This tool creates spatial clusters.
For fast run it uses kmean clustering but do not garantee equal size
For equal size zone, it uses a genetic algorithm approach.
"""

import logging
from pathlib import Path
from typing import Any, Self

from pydantic import ConfigDict, Field

from goatlib.analysis.geoanalysis.clustering_zones import ClusteringZones
from goatlib.analysis.schemas.clustering import ClusteringParams, ClusterType
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
    get_default_layer_name,
)
from goatlib.tools.style import build_ordinal_color_map, hex_to_rgb, DEFAULT_POINT_STYLE

logger = logging.getLogger(__name__)


class ClusteringZonesToolParams(
    ScenarioSelectorMixin, ToolInputBase, ClusteringParams
):
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
        description="Number of clusters "
        "It should be an integer ",
        json_schema_extra=ui_field(
            section="input",
            field_order=2,
            widget="number-input",
            visible_when={"input_layer_id": {"$ne": None}},
        ),
    )

    # Override result_layer_name with tool-specific defaults
    result_layer_name: str | None = Field(
        default=get_default_layer_name("clustered_zones", "en"),
        description="Name for the clustering result layer.",
        json_schema_extra=ui_field(
            section="result",
            field_order=1,
            label_key="result_layer_name",
            widget_options={
                "default_en": get_default_layer_name("clustered_zones", "en"),
                "default_de": get_default_layer_name("clustered_zones", "de"),
            },
        ),
    )


class ZonesClusteringToolRunner(
    BaseToolRunner[ClusteringZonesToolParams]
):
    """zones clustering tool runner for Windmill."""

    tool_class = ClusteringZones
    output_geometry_type = "point"  # Original points with cluster_id attribute
    default_output_name = get_default_layer_name("clustered_zones", "en")

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
            Tuple of (output_path, metadata)
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
                    "triggered_by_email",
                    "input_layer_id",
                    "input_layer_filter",
                }
            ),
            input_path=str(input_layer_path),
            output_path=str(output_path),
        )

        # Run the analysis
        results = tool.run(analysis_params)

        # Return the first result (should be only one)
        result_path, metadata = results[0]
        return Path(result_path), metadata

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
