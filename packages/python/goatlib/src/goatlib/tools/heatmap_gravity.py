"""Heatmap Gravity tool for Windmill.

Performs gravity-based spatial accessibility analysis.
"""

import logging
from pathlib import Path
from typing import Any, Self

from pydantic import ConfigDict, Field

from goatlib.analysis.accessibility import HeatmapGravityTool
from goatlib.analysis.schemas.heatmap import HeatmapGravityParams
from goatlib.analysis.schemas.ui import (
    SECTION_CONFIGURATION,
    SECTION_OPPORTUNITIES,
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


class HeatmapGravityToolParams(
    ScenarioSelectorMixin, ToolInputBase, HeatmapGravityParams
):
    """Parameters for heatmap gravity tool.

    Inherits heatmap options from HeatmapGravityParams, adds layer context from ToolInputBase.
    """

    model_config = ConfigDict(
        json_schema_extra=ui_sections(
            SECTION_ROUTING,
            SECTION_CONFIGURATION,
            SECTION_OPPORTUNITIES,
            SECTION_RESULT_ROUTING,
            UISection(
                id="scenario",
                order=8,
                icon="scenario",
                collapsible=True,
                collapsed=True,
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

    # Numbered opportunity layer inputs for workflow canvas handles (up to 3)
    # These generate input handles on the workflow node; workflow_runner.py
    # maps them to the `opportunities` list before tool execution.
    opportunity_layer_1_id: str | None = Field(
        None,
        description="First opportunity layer (connected from workflow)",
        json_schema_extra=ui_field(
            section="opportunities",
            field_order=1,
            widget="layer-selector",
            label_key="opportunity_layer_1",
        ),
    )
    opportunity_layer_1_filter: dict[str, Any] | None = Field(
        None,
        description="CQL2-JSON filter for first opportunity layer",
        json_schema_extra=ui_field(section="opportunities", field_order=2, hidden=True),
    )
    opportunity_layer_2_id: str | None = Field(
        None,
        description="Second opportunity layer (connected from workflow)",
        json_schema_extra=ui_field(
            section="opportunities",
            field_order=3,
            widget="layer-selector",
            label_key="opportunity_layer_2",
        ),
    )
    opportunity_layer_2_filter: dict[str, Any] | None = Field(
        None,
        description="CQL2-JSON filter for second opportunity layer",
        json_schema_extra=ui_field(section="opportunities", field_order=4, hidden=True),
    )
    opportunity_layer_3_id: str | None = Field(
        None,
        description="Third opportunity layer (connected from workflow)",
        json_schema_extra=ui_field(
            section="opportunities",
            field_order=5,
            widget="layer-selector",
            label_key="opportunity_layer_3",
        ),
    )
    opportunity_layer_3_filter: dict[str, Any] | None = Field(
        None,
        description="CQL2-JSON filter for third opportunity layer",
        json_schema_extra=ui_field(section="opportunities", field_order=6, hidden=True),
    )

    # Override result_layer_name with tool-specific defaults
    result_layer_name: str | None = Field(
        default=get_default_layer_name("heatmap_gravity", "en"),
        description="Name for the heatmap gravity result layer.",
        json_schema_extra=ui_field(
            section="result",
            field_order=1,
            label_key="result_layer_name",
            widget_options={
                "default_en": get_default_layer_name("heatmap_gravity", "en"),
                "default_de": get_default_layer_name("heatmap_gravity", "de"),
            },
        ),
    )


class HeatmapGravityToolRunner(BaseToolRunner[HeatmapGravityToolParams]):
    """Heatmap Gravity tool runner for Windmill."""

    tool_class = HeatmapGravityTool
    output_geometry_type = "polygon"  # H3 cells
    default_output_name = get_default_layer_name("heatmap_gravity", "en")

    @classmethod
    def predict_output_schema(
        cls,
        input_schemas: dict[str, dict[str, str]],
        params: dict[str, Any],
    ) -> dict[str, str]:
        """Predict heatmap gravity output schema.

        Heatmap gravity outputs:
        - h3_index: H3 cell index
        - total_accessibility: gravity-weighted accessibility score
        - geometry: H3 cell polygon
        """
        return {
            "h3_index": "VARCHAR",
            "total_accessibility": "DOUBLE",
            "geometry": "GEOMETRY",
        }

    def get_layer_properties(
        self: Self,
        params: HeatmapGravityToolParams,
        metadata: DatasetMetadata,
        table_info: dict[str, Any] | None = None,
        parquet_path: Path | str | None = None,
    ) -> dict[str, Any] | None:
        """Return heatmap style for gravity accessibility with quantile breaks."""
        color_field = "total_accessibility"

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

        # Use Emrld (green) for gravity - represents access to opportunities
        return get_heatmap_style(
            color_field_name=color_field,
            color_scale_breaks=color_scale_breaks,
            color_range_name="Emrld",
        )

    def process(
        self: Self, params: HeatmapGravityToolParams, temp_dir: Path
    ) -> tuple[Path, DatasetMetadata]:
        """Run heatmap gravity analysis."""
        output_path = temp_dir / "output.parquet"

        # Resolve opportunity layer IDs to parquet paths
        resolved_opportunities = self.resolve_layer_paths(
            params.opportunities, params.user_id, "input_path"
        )

        # Auto-resolve od_matrix_path from routing_mode if not provided
        od_matrix_path = params.od_matrix_path
        if not od_matrix_path:
            od_matrix_path = f"{self.settings.od_matrix_base_path}/{params.routing_mode.value}/"

        # Build analysis params
        analysis_params = HeatmapGravityParams(
            **params.model_dump(
                exclude={
                    "output_path",
                    "od_matrix_path",
                    "user_id",
                    "folder_id",
                    "project_id",
                    "output_name",
                    "opportunities",  # Use resolved opportunities
                    # Exclude workflow-only numbered input fields
                    "opportunity_layer_1_id",
                    "opportunity_layer_1_filter",
                    "opportunity_layer_2_id",
                    "opportunity_layer_2_filter",
                    "opportunity_layer_3_id",
                    "opportunity_layer_3_filter",
                }
            ),
            opportunities=resolved_opportunities,
            od_matrix_path=od_matrix_path,
            output_path=str(output_path),
        )

        tool = self.tool_class()
        try:
            results = tool.run(analysis_params)
            result_path, metadata = results[0]
            return Path(result_path), metadata
        finally:
            tool.cleanup()


def main(params: HeatmapGravityToolParams) -> dict:
    """Windmill entry point for heatmap gravity tool."""
    runner = HeatmapGravityToolRunner()
    runner.init_from_env()

    try:
        return runner.run(params)
    finally:
        runner.cleanup()
