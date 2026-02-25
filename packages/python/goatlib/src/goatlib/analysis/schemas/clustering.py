import logging
from enum import StrEnum

from pydantic import BaseModel, Field

from goatlib.analysis.schemas.ui import (
    ui_field,
)

logger = logging.getLogger(__name__)


class ClusterType(StrEnum):
    """Type of potential value source."""

    kmean = "kmean"
    equal_size = "equal_size"


ClusterType_LABELS: dict[str, str] = {
    "kmean": "cluster_type.kmean",
    "equal_size": "cluster_type.equal_size",
}


class SizeMethod(StrEnum):
    """Method used to determine balance weight per point."""

    count = "count"
    field = "field"


SizeMethod_LABELS: dict[str, str] = {
    "count": "size_method.count",
    "field": "size_method.field",
}


class ClusteringParams(BaseModel):
    """Parameters for Huff heatmaps."""

    cluster_type: ClusterType = Field(
        default=ClusterType.kmean,
        description="clustering_zones",
        json_schema_extra=ui_field(
            section="configuration", field_order=1, enum_labels=ClusterType_LABELS
        ),
    )

    input_path: str = Field(
        ...,
        description="Path to inputlayer dataset to cluster.",
        json_schema_extra=ui_field(
            section="input",
            field_order=1,
            widget="layer-selector",
        ),
    )
    nb_cluster: int = Field(
        10,
        description="Number of clusters " "It should be an integer ",
        json_schema_extra=ui_field(
            section="input",
            field_order=2,
            widget="number-input",
        ),
    )

    size_method: SizeMethod = Field(
        default=SizeMethod.count,
        description="Method to determine balance weight: count (each point = 1) or field (use a numeric column).",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=2,
            label_key="size_method",
            enum_labels=SizeMethod_LABELS,
            visible_when={"cluster_type": "equal_size"},
        ),
    )

    size_field: str | None = Field(
        default=None,
        description="Numeric field to use as balance weight when size_method is 'field'.",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=3,
            label_key="size_field",
            widget="field-selector",
            widget_options={"source_layer": "input_path", "field_types": ["number"]},
            visible_when={
                "$and": [
                    {"cluster_type": "equal_size"},
                    {"size_method": "field"},
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
            visible_when={"cluster_type": "equal_size"},
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
                ]
            },
        ),
    )

    compactness_weight: float = Field(
        default=0.01,
        ge=0.0,
        le=0.5,
        description="Weight for the compactness fitness criterion ",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=7,
            label_key="compactness_weight",
            widget="slider",
            widget_options={"min": 0, "max": 0.5, "step": 0.01},
            visible_when={
                "$and": [
                    {"cluster_type": "equal_size"},
                    {"use_compactness": True},
                ]
            },
             advanced=True,
        ),
    )

    output_path: str = Field(
        ...,
        description="Cluster at the feature level",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=99,
            hidden=True,  
        ),
    )
    
    output_summary_path: str = Field(
        ...,
        description="Cluster Summary",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=99,
            hidden=True,  
        ),
    )
    
