"""Heatmap Connectivity tool for Windmill.

Computes connectivity heatmap - total area reachable within max cost.
"""

import logging
from pathlib import Path
from typing import Any, Self

from pydantic import ConfigDict, Field

from goatlib.analysis.accessibility import HeatmapConnectivityTool
from goatlib.analysis.schemas.heatmap import HeatmapConnectivityParams
from goatlib.analysis.schemas.ui import (
    SECTION_CONFIGURATION,
    SECTION_RESULT_ROUTING,
    SECTION_ROUTING,
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
from goatlib.tools.style import get_heatmap_style

logger = logging.getLogger(__name__)


class HeatmapConnectivityToolParams(
    ScenarioSelectorMixin, ToolInputBase, HeatmapConnectivityParams
):
    """Parameters for heatmap connectivity tool.

    Inherits heatmap options from HeatmapConnectivityParams, adds layer context from ToolInputBase.
    """

    model_config = ConfigDict(
        json_schema_extra=ui_sections(
            SECTION_ROUTING,
            SECTION_CONFIGURATION,
            SECTION_RESULT_ROUTING,
            UISection(
                id="scenario",
                order=8,
                icon="scenario",
                collapsible=True,
                collapsed=True,
                depends_on={"reference_area_layer_id": {"$ne": None}},
            ),
        )
    )

    # Override file paths as optional - they will be resolved internally
    od_matrix_path: str | None = Field(
        default=None,
        description="Path to OD matrix (auto-populated from routing_mode if not provided)",
        json_schema_extra=ui_field(section="configuration", hidden=True),
    )
    output_path: str | None = None  # type: ignore[assignment]
    reference_area_path: str | None = None  # type: ignore[assignment]

    # Layer ID for the reference area (replaces reference_area_path for tools)
    reference_area_layer_id: str = Field(
        description="Layer ID for the reference area polygon",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=4,
            label_key="reference_area_path",
            widget="layer-selector",
            widget_options={"geometry_types": ["Polygon", "MultiPolygon"]},
        ),
    )
    reference_area_layer_filter: dict[str, Any] | None = Field(
        None,
        description="CQL2-JSON filter to apply to the reference area layer",
        json_schema_extra=ui_field(section="configuration", field_order=5, hidden=True),
    )

    # Override result_layer_name with tool-specific defaults
    result_layer_name: str | None = Field(
        default=get_default_layer_name("heatmap_connectivity", "en"),
        description="Name for the heatmap connectivity result layer.",
        json_schema_extra=ui_field(
            section="result",
            field_order=1,
            label_key="result_layer_name",
            widget_options={
                "default_en": get_default_layer_name("heatmap_connectivity", "en"),
                "default_de": get_default_layer_name("heatmap_connectivity", "de"),
            },
        ),
    )


class HeatmapConnectivityToolRunner(BaseToolRunner[HeatmapConnectivityToolParams]):
    """Heatmap Connectivity tool runner for Windmill."""

    tool_class = HeatmapConnectivityTool
    output_geometry_type = "polygon"  # H3 cells
    default_output_name = get_default_layer_name("heatmap_connectivity", "en")

    @classmethod
    def predict_output_schema(
        cls,
        input_schemas: dict[str, dict[str, str]],
        params: dict[str, Any],
    ) -> dict[str, str]:
        """Predict heatmap connectivity output schema.

        Heatmap connectivity outputs:
        - h3_index: H3 cell index
        - accessibility: total area reachable within max travel cost
        - geometry: H3 cell polygon
        """
        return {
            "h3_index": "VARCHAR",
            "accessibility": "DOUBLE",
            "geometry": "GEOMETRY",
        }

    def get_layer_properties(
        self: Self,
        params: HeatmapConnectivityToolParams,
        metadata: DatasetMetadata,
        table_info: dict[str, Any] | None = None,
        parquet_path: Path | str | None = None,
    ) -> dict[str, Any] | None:
        """Return heatmap style for connectivity accessibility with quantile breaks."""
        # Connectivity outputs "accessibility" (not "total_accessibility")
        color_field = "accessibility"

        # Compute quantile breaks from the DuckLake table (6 breaks for 7 colors)
        color_scale_breaks = None
        table_name = table_info["table_name"] if table_info else None
        if table_name or parquet_path:
            color_scale_breaks = self.compute_quantile_breaks(
                table_name=table_name,
                column_name=color_field,
                num_breaks=6,
                strip_zeros=True,
                parquet_path=parquet_path,
            )
            if color_scale_breaks:
                logger.info(
                    "Computed quantile breaks for %s: %s",
                    color_field,
                    color_scale_breaks,
                )

        # Use Teal (blue) for connectivity - represents spatial coverage/area
        return get_heatmap_style(
            color_field_name=color_field,
            color_scale_breaks=color_scale_breaks,
            color_range_name="Teal",
        )

    def process(
        self: Self, params: HeatmapConnectivityToolParams, temp_dir: Path
    ) -> tuple[Path, DatasetMetadata]:
        """Run heatmap connectivity analysis."""
        output_path = temp_dir / "output.parquet"

        # Export reference area layer
        reference_area_path = str(
            self.export_layer_to_parquet(
                layer_id=params.reference_area_layer_id,
                user_id=params.user_id,
                cql_filter=params.reference_area_layer_filter,
                scenario_id=params.scenario_id,
                project_id=params.project_id,
            )
        )

        # Auto-resolve od_matrix_path from routing_mode if not provided
        od_matrix_path = params.od_matrix_path
        if not od_matrix_path:
            od_matrix_path = f"{self.settings.od_matrix_base_path}/{params.routing_mode.value}/"

        # Build analysis params
        analysis_params = HeatmapConnectivityParams(
            **params.model_dump(
                exclude={
                    "output_path",
                    "od_matrix_path",
                    "reference_area_path",
                    "reference_area_layer_id",
                    "reference_area_layer_filter",
                    "user_id",
                    "folder_id",
                    "project_id",
                    "scenario_id",
                    "output_name",
                }
            ),
            od_matrix_path=od_matrix_path,
            reference_area_path=reference_area_path,
            output_path=str(output_path),
        )

        tool = self.tool_class()
        try:
            results = tool.run(analysis_params)
            result_path, metadata = results[0]
            return Path(result_path), metadata
        finally:
            tool.cleanup()


def main(params: HeatmapConnectivityToolParams) -> dict:
    """Windmill entry point for heatmap connectivity tool."""
    runner = HeatmapConnectivityToolRunner()
    runner.init_from_env()

    try:
        return runner.run(params)
    finally:
        runner.cleanup()
