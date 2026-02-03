"""Feature service for GeoJSON queries.

This service retrieves features from DuckLake as GeoJSON.
"""

import json
import logging
from typing import Any, Optional

from goatlib.storage import build_filters, build_order_clause

from geoapi.config import settings
from geoapi.dependencies import LayerInfo
from geoapi.ducklake import ducklake_manager
from geoapi.ducklake_pool import execute_with_retry

logger = logging.getLogger(__name__)


def sanitize_string(value: Any) -> Any:
    """Sanitize string values to ensure valid UTF-8.

    Some data may contain invalid UTF-8 bytes (e.g., Latin-1 or Windows-1252).
    This function attempts to fix encoding issues.
    """
    if isinstance(value, bytes):
        # Try UTF-8 first, then fallback to latin-1
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.decode("latin-1", errors="replace")
    elif isinstance(value, str):
        # Re-encode and decode to fix any invalid sequences
        try:
            # Encode to bytes and back to ensure valid UTF-8
            return value.encode("utf-8", errors="surrogatepass").decode(
                "utf-8", errors="replace"
            )
        except (UnicodeDecodeError, UnicodeEncodeError):
            return value.encode("latin-1", errors="replace").decode(
                "utf-8", errors="replace"
            )
    return value


def sanitize_properties(properties: dict[str, Any]) -> dict[str, Any]:
    """Sanitize all string values in properties dict and remove hidden fields."""
    return {
        k: sanitize_string(v)
        for k, v in properties.items()
        if k not in settings.HIDDEN_FIELDS
    }


class FeatureService:
    """Service for querying features."""

    def get_features(
        self,
        layer_info: LayerInfo,
        limit: int = 10,
        offset: int = 0,
        bbox: Optional[list[float]] = None,
        properties: Optional[list[str]] = None,
        cql_filter: Optional[dict] = None,
        column_names: Optional[list[str]] = None,
        sortby: Optional[str] = None,
        ids: Optional[list[str]] = None,
        geometry_column: str = "geometry",
        has_geometry: bool = True,
    ) -> tuple[list[dict[str, Any]], int]:
        """Get features from a layer.

        Args:
            layer_info: Layer information
            limit: Maximum features to return
            offset: Number of features to skip
            bbox: Bounding box filter [minx, miny, maxx, maxy]
            properties: List of properties to include
            cql_filter: CQL2 filter
            column_names: Available column names for validation
            sortby: Sort column (prefix with - for descending)
            ids: List of feature IDs to filter
            geometry_column: Name of the geometry column
            has_geometry: Whether the layer has a geometry column

        Returns:
            Tuple of (features, total_count)
        """
        table = layer_info.full_table_name
        geom_col = geometry_column if has_geometry else None

        # Build SELECT clause - always include rowid as fallback for id
        # Check if 'id' column exists in the table
        has_id_column = "id" in (column_names or [])

        if properties:
            # Ensure id is always included if it exists
            props_set = set(properties)
            if has_id_column:
                props_set.add("id")
            select_cols = ", ".join(f'"{p}"' for p in props_set if p != geom_col)
            # Add rowid as fallback if no id column
            rowid_select = "" if has_id_column else ", rowid"
            if has_geometry and geom_col:
                select_clause = f'{select_cols}{rowid_select}, ST_AsGeoJSON("{geom_col}") AS geom_json'
            else:
                select_clause = f"{select_cols}{rowid_select}"
        else:
            # Add rowid to select all
            rowid_select = "" if has_id_column else ", rowid"
            if has_geometry and geom_col:
                select_clause = (
                    f'*{rowid_select}, ST_AsGeoJSON("{geom_col}") AS geom_json'
                )
            else:
                select_clause = f"*{rowid_select}" if not has_id_column else "*"

        # Build WHERE clause using shared query builder
        filters = build_filters(
            bbox=bbox,
            cql_filter=cql_filter,
            ids=ids,
            geometry_column=geom_col or "geometry",
            column_names=column_names,
            has_geometry=has_geometry,
        )
        where_sql = filters.to_full_where()
        params = filters.params

        # Build ORDER BY clause
        order_clause = build_order_clause(sortby)

        # Get total count
        count_query = f"SELECT COUNT(*) FROM {table} WHERE {where_sql}"
        logger.debug("Count query: %s with params: %s", count_query, params)
        try:
            count_result, _ = execute_with_retry(
                ducklake_manager,
                count_query,
                params if params else None,
                fetch_all=False,
            )
            total_count = count_result[0] if count_result else 0
        except Exception as e:
            logger.warning("Count query failed: %s", e)
            total_count = 0

        # Get features
        query = f"""
            SELECT {select_clause}
            FROM {table}
            WHERE {where_sql}
            {order_clause}
            LIMIT {limit} OFFSET {offset}
        """
        logger.debug("Feature query: %s with params: %s", query, params)

        features = []
        try:
            result, description = execute_with_retry(
                ducklake_manager, query, params if params else None, fetch_all=True
            )

            # Get column names from description
            col_names = [desc[0] for desc in description]

            for idx, row in enumerate(result):
                row_dict = dict(zip(col_names, row))

                # Extract geometry (only if layer has geometry)
                geometry = None
                if has_geometry and geom_col:
                    geom_json = row_dict.pop("geom_json", None)
                    geometry = json.loads(geom_json) if geom_json else None
                    # Remove raw geometry column if present
                    row_dict.pop(geom_col, None)

                # Get ID - use actual id column if present, otherwise use rowid
                feature_id = row_dict.pop("id", None)
                if feature_id is None:
                    # Use DuckLake's stable rowid as fallback
                    feature_id = row_dict.pop("rowid", None)
                effective_id = feature_id

                # Sanitize string values to ensure valid UTF-8
                sanitized_props = sanitize_properties(row_dict)

                features.append(
                    {
                        "type": "Feature",
                        "id": str(effective_id) if effective_id is not None else None,
                        "geometry": geometry,
                        "properties": sanitized_props,
                    }
                )
        except Exception as e:
            logger.error(f"Feature query error: {e}", exc_info=True)
            raise

        return features, total_count

    def get_feature_by_id(
        self,
        layer_info: LayerInfo,
        feature_id: str,
        properties: Optional[list[str]] = None,
        geometry_column: str = "geometry",
        has_geometry: bool = True,
    ) -> Optional[dict[str, Any]]:
        """Get a single feature by ID.

        Args:
            layer_info: Layer information
            feature_id: Feature ID
            properties: Properties to include
            geometry_column: Name of the geometry column
            has_geometry: Whether the layer has a geometry column

        Returns:
            Feature dict or None if not found
        """
        table = layer_info.full_table_name
        geom_col = geometry_column if has_geometry else None

        # Build SELECT clause
        if properties:
            props_set = set(properties) | {"id"}
            select_cols = ", ".join(f'"{p}"' for p in props_set if p != geom_col)
            if has_geometry and geom_col:
                select_clause = (
                    f'{select_cols}, ST_AsGeoJSON("{geom_col}") AS geom_json'
                )
            else:
                select_clause = select_cols
        else:
            if has_geometry and geom_col:
                select_clause = f'*, ST_AsGeoJSON("{geom_col}") AS geom_json'
            else:
                select_clause = "*"

        query = f"""
            SELECT {select_clause}
            FROM {table}
            WHERE "id" = ?
            LIMIT 1
        """

        try:
            result, description = execute_with_retry(
                ducklake_manager, query, [feature_id], fetch_all=False
            )

            if not result:
                return None

            # Get column names
            col_names = [desc[0] for desc in description]
            row_dict = dict(zip(col_names, result))

            # Extract geometry (only if layer has geometry)
            geometry = None
            if has_geometry and geom_col:
                geom_json = row_dict.pop("geom_json", None)
                geometry = json.loads(geom_json) if geom_json else None
                # Remove raw geometry column
                row_dict.pop(geom_col, None)

            # Get ID
            fid = row_dict.pop("id", None)

            # Sanitize string values to ensure valid UTF-8
            sanitized_props = sanitize_properties(row_dict)

            return {
                "type": "Feature",
                "id": str(fid) if fid else None,
                "geometry": geometry,
                "properties": sanitized_props,
            }
        except Exception as e:
            logger.error(f"Feature by ID error: {e}", exc_info=True)
            return None

    def get_temp_features(
        self,
        user_id: str,
        layer_uuid: str,
        limit: int = 100,
        offset: int = 0,
        bbox: Optional[list[float]] = None,
        properties: Optional[list[str]] = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Get features from a temporary layer's parquet file.

        Used for workflow preview - searches for t_{layer_uuid}.parquet under user's temp directory.

        Args:
            user_id: User UUID
            layer_uuid: The layer UUID (filename is t_{layer_uuid}.parquet)
            limit: Maximum features to return
            offset: Number of features to skip
            bbox: Bounding box filter [minx, miny, maxx, maxy]
            properties: List of properties to include

        Returns:
            Tuple of (features, total_count)
        """
        from pathlib import Path

        import duckdb

        user_id_clean = user_id.replace("-", "")
        layer_uuid_clean = layer_uuid.replace("-", "")

        # Temp data is in /data/temporary with structure: user_{uuid}/w_{uuid}/n_{uuid}/t_{layer_uuid}.parquet
        temp_data_root = Path(settings.DUCKLAKE_DATA_DIR).parent / "temporary"
        user_path = temp_data_root / f"user_{user_id_clean}"

        # Search for the parquet file by layer_uuid
        parquet_path = None
        if user_path.exists():
            matches = list(user_path.glob(f"**/t_{layer_uuid_clean}.parquet"))
            if matches:
                parquet_path = matches[0]

        if not parquet_path or not parquet_path.exists():
            logger.warning(
                "Temp parquet not found for layer %s under user %s", layer_uuid, user_id
            )
            return [], 0

        try:
            con = duckdb.connect(":memory:")
            con.execute("INSTALL spatial; LOAD spatial;")

            # Get total count
            count_result = con.execute(
                f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
            ).fetchone()
            total_count = count_result[0] if count_result else 0

            # Detect geometry column
            cols = con.execute(
                f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
            ).fetchall()
            geom_col = None
            col_names = []
            for col_name, col_type, *_ in cols:
                col_names.append(col_name)
                if "GEOMETRY" in col_type.upper():
                    geom_col = col_name

            # Build select clause
            if properties:
                select_cols = [
                    f'"{p}"' for p in properties if p != geom_col and p in col_names
                ]
            else:
                select_cols = [f'"{c}"' for c in col_names if c != geom_col]

            if geom_col:
                select_cols.append(f'ST_AsGeoJSON("{geom_col}") AS geom_json')

            select_clause = ", ".join(select_cols) if select_cols else "*"

            # Build query
            where_clause = "1=1"
            if bbox and geom_col and len(bbox) == 4:
                where_clause = (
                    f'ST_Intersects("{geom_col}", '
                    f"ST_MakeEnvelope({bbox[0]}, {bbox[1]}, {bbox[2]}, {bbox[3]}))"
                )

            query = f"""
                SELECT {select_clause}
                FROM read_parquet('{parquet_path}')
                WHERE {where_clause}
                LIMIT {limit} OFFSET {offset}
            """

            results = con.execute(query).fetchall()
            description = con.execute(query).description

            col_names_result = [desc[0] for desc in description]
            features = []
            for row in results:
                row_dict = dict(zip(col_names_result, row))

                # Extract geometry
                geometry = None
                geom_json = row_dict.pop("geom_json", None)
                if geom_json:
                    geometry = json.loads(geom_json)

                # Generate feature ID from row index
                fid = offset + len(features) + 1

                # Sanitize properties
                sanitized_props = sanitize_properties(row_dict)

                features.append(
                    {
                        "type": "Feature",
                        "id": str(fid),
                        "geometry": geometry,
                        "properties": sanitized_props,
                    }
                )

            con.close()
            return features, total_count

        except Exception as e:
            logger.error(f"Temp features error: {e}", exc_info=True)
            return [], 0


# Singleton instance
feature_service = FeatureService()
