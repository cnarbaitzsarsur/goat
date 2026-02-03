import logging
from enum import StrEnum
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from goatlib.analysis.schemas.ui import (
    ui_field,
    ui_sections,
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


class ClusteringParams(BaseModel):
    """Parameters for Huff heatmaps."""

    cluster_type: ClusterType = Field(
        default=ClusterType.kmean,
        description="clustering_zones",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=1,
            enum_labels=ClusterType_LABELS
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
        ...,
        description="Number of clusters "
        "It should be an integer ",
        json_schema_extra=ui_field(
            section="input",
            field_order=2,
            widget="number-input",
            visible_when={"input_path": {"$ne": None}},
        ),
    )
    output_path: str = Field(
        ...,
        description="Output GeoParquet path.",
        json_schema_extra=ui_field(
            section="configuration",
            field_order=99,
            hidden=True,  # Internal field
        ),
    )
