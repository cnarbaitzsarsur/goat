"""Temporary workflow layers router.

Serves temporary layer data for workflow execution preview.
These endpoints read from /data/temporary instead of DuckLake.
"""

import json
import logging
from pathlib import Path
from typing import Any

import duckdb
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from geoapi.deps.auth import get_user_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflows/temp", tags=["Workflow Temp Layers"])

# Temp data root
TEMP_DATA_ROOT = Path("/app/data/temporary")


class TempLayerMetadata(BaseModel):
    """Metadata for a temporary layer."""

    layer_name: str
    geometry_type: str | None = None
    feature_count: int = 0
    bbox: list[float] | None = None
    columns: dict[str, str] = {}
    workflow_id: str
    node_id: str
    process_id: str | None = None


class TempFeatureCollection(BaseModel):
    """GeoJSON FeatureCollection response."""

    type: str = "FeatureCollection"
    features: list[dict[str, Any]]
    numberMatched: int | None = None
    numberReturned: int | None = None


def get_temp_layer_path(user_id: str, workflow_id: str, node_id: str) -> Path:
    """Get the path to a temp layer's data directory.

    Note: user_id and workflow_id have dashes stripped to match temp storage format.
    """
    user_id_clean = user_id.replace("-", "")
    workflow_id_clean = workflow_id.replace("-", "")
    return TEMP_DATA_ROOT / user_id_clean / workflow_id_clean / node_id


@router.get(
    "/{workflow_id}/{node_id}/metadata",
    response_model=TempLayerMetadata,
    summary="Get temp layer metadata",
)
async def get_temp_metadata(
    workflow_id: str,
    node_id: str,
    user_token: dict = Depends(get_user_token),
) -> TempLayerMetadata:
    """Fetch metadata for a temporary workflow layer."""
    user_id = user_token.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User ID required")

    layer_path = get_temp_layer_path(user_id, workflow_id, node_id)
    metadata_path = layer_path / "metadata.json"

    if not metadata_path.exists():
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Temp layer not found: {workflow_id}/{node_id}",
        )

    try:
        with open(metadata_path) as f:
            metadata = json.load(f)
        return TempLayerMetadata(**metadata)
    except Exception as e:
        logger.error(f"Failed to read temp layer metadata: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))


@router.get(
    "/{workflow_id}/{node_id}/features",
    response_model=TempFeatureCollection,
    summary="Get temp layer features",
)
async def get_temp_features(
    workflow_id: str,
    node_id: str,
    limit: int = Query(50, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    user_token: dict = Depends(get_user_token),
) -> TempFeatureCollection:
    """Fetch features from a temporary workflow layer as GeoJSON."""
    user_id = user_token.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User ID required")

    layer_path = get_temp_layer_path(user_id, workflow_id, node_id)
    parquet_path = layer_path / "data.parquet"

    if not parquet_path.exists():
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Temp layer data not found: {workflow_id}/{node_id}",
        )

    try:
        con = duckdb.connect(":memory:")
        con.install_extension("spatial")
        con.load_extension("spatial")

        # Get total count
        count_result = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
        ).fetchone()
        total_count = count_result[0] if count_result else 0

        # Check if geometry column exists
        schema_result = con.execute(
            f"SELECT column_name FROM parquet_schema('{parquet_path}') WHERE column_name = 'geometry'"
        ).fetchall()
        has_geometry = len(schema_result) > 0

        # Fetch features
        if has_geometry:
            query = f"""
                SELECT
                    row_number() OVER () as __feature_id,
                    ST_AsGeoJSON(geometry) as __geojson,
                    * EXCLUDE (geometry)
                FROM read_parquet('{parquet_path}')
                LIMIT {limit} OFFSET {offset}
            """
        else:
            query = f"""
                SELECT
                    row_number() OVER () as __feature_id,
                    *
                FROM read_parquet('{parquet_path}')
                LIMIT {limit} OFFSET {offset}
            """

        result = con.execute(query).fetchall()
        columns = [desc[0] for desc in con.description]

        features = []
        for row in result:
            row_dict = dict(zip(columns, row))
            feature_id = row_dict.pop("__feature_id", None)

            if has_geometry:
                geojson_str = row_dict.pop("__geojson", None)
                geometry = json.loads(geojson_str) if geojson_str else None
            else:
                geometry = None

            features.append(
                {
                    "type": "Feature",
                    "id": feature_id,
                    "geometry": geometry,
                    "properties": row_dict,
                }
            )

        con.close()

        return TempFeatureCollection(
            type="FeatureCollection",
            features=features,
            numberMatched=total_count,
            numberReturned=len(features),
        )

    except Exception as e:
        logger.error(f"Failed to read temp layer features: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))


# Export router
temp_layers_router = router
