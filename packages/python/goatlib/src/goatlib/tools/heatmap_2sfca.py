"""Heatmap 2SFCA tool for Windmill.

Computes Two-Step Floating Catchment Area (2SFCA) accessibility analysis.
Measures spatial accessibility considering both supply (opportunities/capacity)
and demand (population).
"""

import logging
from pathlib import Path
from typing import Any, Self

from pydantic import ConfigDict, Field

from goatlib.analysis.accessibility.two_step_catchment_area import Heatmap2SFCATool
from goatlib.analysis.schemas.heatmap import (
    Heatmap2SFCAParams,
    Opportunity2SFCA,
)
from goatlib.analysis.schemas.ui import (
    SECTION_CONFIGURATION,
    SECTION_DEMAND,
    SECTION_OPPORTUNITIES,
    SECTION_ROUTING,
    SECTION_RESULT_ROUTING,
    UISection,
    ui_field,
    ui_sections
)
from goatlib.models.io import DatasetMetadata
from goatlib.tools.base import BaseToolRunner
from goatlib.tools.schemas import (
    get_default_layer_name,
    ScenarioSelectorMixin,
    ToolInputBase,
)
from goatlib.tools.style import get_heatmap_style

logger = logging.getLogger(__name__)


class Heatmap2SFCAToolParams(ScenarioSelectorMixin, ToolInputBase, Heatmap2SFCAParams):
    """Parameters for heatmap 2SFCA tool.

    Inherits heatmap options from Heatmap2SFCAParams, adds layer context from ToolInputBase.
    The Two-Step Floating Catchment Area method measures spatial accessibility
    by considering both supply (capacity of opportunities) and demand (population).
    """

    model_config = ConfigDict(
        json_schema_extra=ui_sections(
            SECTION_ROUTING,
            SECTION_CONFIGURATION,
            SECTION_DEMAND,
            SECTION_OPPORTUNITIES,
            SECTION_RESULT_ROUTING,
            UISection(
                id="scenario",
                order=8,
                icon="scenario",
                collapsible=True,
                collapsed=True,
                depends_on={"demand_layer_id": {"$ne": None}},
            ),
        )
    )

    # Layer IDs for the tool
    demand_layer_id: str = Field(
        ...,
        description="Layer containing demand data (e.g., population).",
        json_schema_extra=ui_field(
            section="demand",
            field_order=1,
            label_key="demand_path",
            widget="layer-selector",
        ),
    )
    demand_layer_filter: dict[str, Any] | None = Field(
        None,
        description="CQL2-JSON filter to apply to the demand layer",
        json_schema_extra=ui_field(section="demand", field_order=2, hidden=True),
    )

    # Override demand_field to reference the correct layer ID
    demand_field: str = Field(
        ...,
        description="Field from the demand layer that contains the demand value (e.g., population).",
        json_schema_extra=ui_field(
            section="demand",
            field_order=3,
            label_key="demand_field",
            widget="field-selector",
            widget_options={
                "source_layer": "demand_layer_id",
                "field_types": ["number"],
            },
            visible_when={"demand_layer_id": {"$ne": None}},
        ),
    )

    # Override file paths as optional - they will be resolved internally
    od_matrix_path: str | None = Field(
        default=None,
        description="Path to OD matrix (auto-populated from routing_mode if not provided)",
        json_schema_extra=ui_field(section="configuration", hidden=True),
    )
    demand_path: str | None = Field(  # type: ignore[assignment]
        default=None,
        json_schema_extra=ui_field(section="demand", hidden=True),
    )
    output_path: str | None = None  # type: ignore[assignment]

    # Override result_layer_name with tool-specific defaults
    result_layer_name: str | None = Field(
        default=get_default_layer_name("heatmap_2sfca", "en"),
        description="Name for the heatmap 2SFCA result layer.",
        json_schema_extra=ui_field(
            section="result",
            field_order=1,
            label_key="result_layer_name",
            widget_options={
                "default_en": get_default_layer_name("heatmap_2sfca", "en"),
                "default_de": get_default_layer_name("heatmap_2sfca", "de"),
            },
        ),
    )


class Heatmap2SFCAToolRunner(BaseToolRunner[Heatmap2SFCAToolParams]):
    """Heatmap 2SFCA tool runner for Windmill."""

    tool_class = Heatmap2SFCATool
    output_geometry_type = "polygon"  # H3 cells
    default_output_name = get_default_layer_name("heatmap_2sfca", "en")

    def get_layer_properties(
        self: Self,
        params: Heatmap2SFCAToolParams,
        metadata: DatasetMetadata,
        table_info: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Return heatmap style for 2SFCA accessibility with quantile breaks."""
        # 2SFCA outputs "accessibility" representing the accessibility index
        color_field = "total_accessibility"

        # Compute quantile breaks from the DuckLake table (6 breaks for 7 colors)
        color_scale_breaks = None
        if table_info and table_info.get("table_name"):
            color_scale_breaks = self.compute_quantile_breaks(
                table_name=table_info["table_name"],
                column_name=color_field,
                num_breaks=6,
                strip_zeros=True,
            )
            if color_scale_breaks:
                logger.info(
                    "Computed quantile breaks for %s: %s",
                    color_field,
                    color_scale_breaks,
                )

        # Use Sunset (orange/red) for 2SFCA - represents supply-demand ratio
        return get_heatmap_style(
            color_field_name=color_field,
            color_scale_breaks=color_scale_breaks,
            color_range_name="Sunset",
        )

    def process(
        self: Self, params: Heatmap2SFCAToolParams, temp_dir: Path
    ) -> tuple[Path, DatasetMetadata]:
        """Run heatmap 2SFCA analysis."""
        output_path = temp_dir / "output.parquet"

        # Resolve opportunity layer IDs to parquet paths
        resolved_opportunities = self.resolve_layer_paths(
            params.opportunities, params.user_id, "input_path"
        )
        
        # Resolve demand layer ID to parquet path
        demand_path = self.export_layer_to_parquet(
            params.demand_layer_id, 
            user_id=params.user_id,
            cql_filter=params.demand_layer_filter,
            scenario_id=params.scenario_id,
            project_id=params.project_id,
        )

        # Build analysis params
        analysis_params = Heatmap2SFCAParams(
            **params.model_dump(
                exclude={
                    "output_path",
                    "user_id",
                    "folder_id",
                    "project_id",
                    "scenario_id",
                    "output_name",
                    "opportunities",
                    "demand_path",
                    "demand_layer_id",
                    "demand_layer_filter",
                }
            ),
            opportunities=resolved_opportunities,
            demand_path=demand_path,
            output_path=str(output_path),
        )

        tool = self.tool_class()
        try:
            results = tool.run(analysis_params)
            result_path, metadata = results[0]
            return Path(result_path), metadata
        finally:
            tool.cleanup()


def main(params: Heatmap2SFCAToolParams) -> dict:
    """Windmill entry point for heatmap 2SFCA tool."""
    runner = Heatmap2SFCAToolRunner()
    runner.init_from_env()

    try:
        return runner.run(params)
    finally:
        runner.cleanup()