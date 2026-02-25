"""Huff Model tool for Windmill.

Computes Huff model accessibility analysis for market area and service probability estimation.
Unlike other heatmap tools, output geometry matches the opportunity layer geometry type.
"""

import logging
from pathlib import Path
from typing import Any, Self

from pydantic import ConfigDict, Field

from goatlib.analysis.accessibility.huff_model import HuffmodelTool
from goatlib.analysis.schemas.heatmap import (
    HuffmodelParams,
)
from goatlib.analysis.schemas.ui import (
    SECTION_CONFIGURATION,
    SECTION_DEMAND,
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
    get_default_layer_name,
    ScenarioSelectorMixin,
    ToolInputBase,
)
from goatlib.tools.style import get_heatmap_style

logger = logging.getLogger(__name__)


class HuffModelToolParams(ScenarioSelectorMixin, ToolInputBase, HuffmodelParams):
    """Parameters for Huff model tool.

    The Huff model calculates consumer choice probabilities based on:
    - Attractiveness of opportunities (e.g., store size, capacity)
    - Distance/travel cost between demand and opportunities

    Output geometry matches the opportunity layer geometry type.
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

    # Hide base path fields - we use layer IDs instead
    demand_path: str | None = Field(
        None,
        json_schema_extra=ui_field(section="demand", hidden=True),
    )  # type: ignore[assignment]

    opportunity_path: str | None = Field(
        None,
        json_schema_extra=ui_field(section="opportunities", hidden=True),
    )  # type: ignore[assignment]
    
    reference_area_path: str | None = Field(
        None,
        json_schema_extra=ui_field(section="configuration", hidden=True),
    )  # type: ignore[assignment]
    
    # Layer IDs for the tool
    demand_layer_id: str = Field(
        ...,
        description="Layer containing demand data (e.g., population).",
        json_schema_extra=ui_field(
            section="demand",
            field_order=1,
            widget="layer-selector",
            label_key="demand_path",
        ),
    )
    demand_layer_filter: dict[str, Any] | None = Field(
        None,
        description="CQL2-JSON filter to apply to the demand layer",
        json_schema_extra=ui_field(section="demand", field_order=2, hidden=True),
    )
    
    opportunity_layer_id: str = Field(
        ...,
        description="Layer containing opportunity data.",
        json_schema_extra=ui_field(
            section="opportunities",
            field_order=1,
            widget="layer-selector",
            label_key="opportunity_path",
        ),
    )
    opportunity_layer_filter: dict[str, Any] | None = Field(
        None,
        description="CQL2-JSON filter to apply to the opportunity layer",
        json_schema_extra=ui_field(section="opportunities", field_order=2, hidden=True),
    )
    
    reference_area_layer_id: str = Field(
        ...,
        description="Reference area polygon layer.",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=1,
            widget="layer-selector",
            widget_options={"geometry_types": ["Polygon", "MultiPolygon"]},
            label_key="reference_area_path",
        ),
    )
    reference_area_layer_filter: dict[str, Any] | None = Field(
        None,
        description="CQL2-JSON filter to apply to the reference area layer",
        json_schema_extra=ui_field(section="configuration", field_order=2, hidden=True),
    )
    
    # Override field selectors to reference the correct layer IDs
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
    
    attractivity: str = Field(
        ...,
        description="Field from the opportunity layer that contains the attractivity value.",
        json_schema_extra=ui_field(
            section="opportunities",
            field_order=3,
            label_key="attractivity",
            widget="field-selector",
            widget_options={
                "source_layer": "opportunity_layer_id",
                "field_types": ["number"],
            },
            visible_when={"opportunity_layer_id": {"$ne": None}},
        )
    )
    od_matrix_path: str | None = Field(
        default=None,
        description="Path to OD matrix (auto-populated from routing_mode if not provided)",
        json_schema_extra=ui_field(section="configuration", hidden=True),
    )
    output_path: str | None = None  # type: ignore[assignment]

    # Override result_layer_name with tool-specific defaults
    result_layer_name: str | None = Field(
        default=get_default_layer_name("huff_model", "en"),
        description="Name for the Huff model result layer.",
        json_schema_extra=ui_field(
            section="result",
            field_order=1,
            label_key="result_layer_name",
            widget_options={
                "default_en": get_default_layer_name("huff_model", "en"),
                "default_de": get_default_layer_name("huff_model", "de"),
            },
        ),
    )


class HuffModelToolRunner(BaseToolRunner[HuffModelToolParams]):
    """Huff Model tool runner for Windmill.

    Unlike other heatmap tools that output fixed H3 polygon cells,
    the Huff model outputs geometries matching the opportunity layer type
    (points, polygons, etc.) with probability values per facility.
    """

    tool_class = HuffmodelTool
    output_geometry_type = None
    default_output_name = get_default_layer_name("huff_model", "en")

    def get_layer_properties(
        self: Self,
        params: HuffModelToolParams,
        metadata: DatasetMetadata,
        table_info: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Return style for Huff model probability results with quantile breaks.

        The Huff model outputs probability values (0-1) per opportunity/facility,
        representing the likelihood that consumers will choose each facility.
        """
        # Huff model outputs "huff_probability" representing choice probability
        color_field = "huff_probability"

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

        # Use Teal (blue-green) for Huff model - represents probability/market share
        return get_heatmap_style(
            color_field_name=color_field,
            color_scale_breaks=color_scale_breaks,
            color_range_name="Teal",
        )

    def process(
        self: Self, params: HuffModelToolParams, temp_dir: Path
    ) -> tuple[Path, DatasetMetadata]:
        """Run Huff model analysis."""
        output_path = temp_dir / "output.parquet"

        # Export demand layer
        demand_path = self.export_layer_to_parquet(
            layer_id=params.demand_layer_id,
            user_id=params.user_id,
            cql_filter=params.demand_layer_filter,
            scenario_id=params.scenario_id,
            project_id=params.project_id,
        )

        # Export opportunity layer
        opportunity_path = self.export_layer_to_parquet(
            layer_id=params.opportunity_layer_id,
            user_id=params.user_id,
            cql_filter=params.opportunity_layer_filter,
            scenario_id=params.scenario_id,
            project_id=params.project_id,
        )

        # Export reference area layer
        reference_area_path = self.export_layer_to_parquet(
            layer_id=params.reference_area_layer_id,
            user_id=params.user_id,
            cql_filter=params.reference_area_layer_filter,
            scenario_id=params.scenario_id,
            project_id=params.project_id,
        )

        # Build analysis params
        analysis_params = HuffmodelParams(
            **params.model_dump(
                exclude={
                    "output_path",
                    "user_id",
                    "folder_id",
                    "project_id",
                    "scenario_id",
                    "output_name",
                    "demand_path",
                    "opportunity_path",
                    "reference_area_path",
                    "demand_layer_id",
                    "demand_layer_filter", 
                    "opportunity_layer_id",
                    "opportunity_layer_filter",
                    "reference_area_layer_id",
                    "reference_area_layer_filter",
                }
            ),
            demand_path=str(demand_path),
            opportunity_path=str(opportunity_path),
            reference_area_path=str(reference_area_path),
            output_path=str(output_path),
        )

        tool = self.tool_class()
        try:
            results = tool.run(analysis_params)
            result_path, metadata = results[0]

            # Update output_geometry_type based on actual result metadata
            # This is the key difference from other heatmap tools
            if metadata.geometry_type:
                self.output_geometry_type = metadata.geometry_type.lower()
                logger.info(
                    "Huff model output geometry type: %s (from opportunity layer)",
                    self.output_geometry_type,
                )

            return Path(result_path), metadata
        finally:
            tool.cleanup()


def main(params: HuffModelToolParams) -> dict:
    """Windmill entry point for Huff model tool."""
    runner = HuffModelToolRunner()
    runner.init_from_env()

    try:
        return runner.run(params)
    finally:
        runner.cleanup()