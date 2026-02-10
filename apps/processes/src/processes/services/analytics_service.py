"""Analytics service for synchronous statistics operations.

Uses goatlib statistics functions to compute analytics on DuckLake layers.
These are synchronous operations that return immediate results.
"""

import json
import logging
import re
from typing import Any

import duckdb
from goatlib.analysis.statistics import (
    AreaOperation,
    ClassBreakMethod,
    SortOrder,
    StatisticsOperation,
    calculate_aggregation_stats,
    calculate_area_statistics,
    calculate_class_breaks,
    calculate_extent,
    calculate_feature_count,
    calculate_histogram,
    calculate_unique_values,
)
from goatlib.storage import build_cql_filter
from goatlib.tools.custom_sql import validate_sql_query

from processes.dependencies import (
    _layer_id_to_table_name,
    get_schema_for_layer,
    normalize_layer_id,
)
from processes.ducklake import ducklake_manager

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Service for computing analytics on DuckLake layers."""

    def _get_table_name(self, collection: str) -> str:
        """Get the full DuckLake table name for a collection/layer ID.

        Args:
            collection: Layer ID (UUID format)

        Returns:
            Full table name like 'lake.user_xxx.t_layerid'
        """
        layer_id = normalize_layer_id(collection)
        schema_name = get_schema_for_layer(layer_id)
        table_name = _layer_id_to_table_name(layer_id)
        return f"lake.{schema_name}.{table_name}"

    def _get_column_names(self, table_name: str) -> list[str]:
        """Get column names for a table.

        Args:
            table_name: Full table name

        Returns:
            List of column names
        """
        with ducklake_manager.connection() as con:
            result = con.execute(f"DESCRIBE {table_name}").fetchall()
            return [row[0] for row in result]

    def _detect_geometry_column(self, table_name: str) -> str:
        """Detect the geometry column name for a table.

        Args:
            table_name: Full table name

        Returns:
            Geometry column name (defaults to 'geometry')
        """
        with ducklake_manager.connection() as con:
            result = con.execute(f"DESCRIBE {table_name}").fetchall()
            for row in result:
                col_name, col_type = row[0], row[1]
                if "GEOMETRY" in col_type.upper():
                    return col_name
        return "geometry"

    def _build_where_clause(
        self,
        filter_expr: str | None,
        table_name: str,
        geometry_column: str = "geometry",
    ) -> tuple[str, list[Any]]:
        """Build SQL WHERE clause from CQL2 filter.

        Args:
            filter_expr: CQL2 filter expression (JSON string) or None
            table_name: Full table name (for getting column names)
            geometry_column: Name of geometry column

        Returns:
            Tuple of (where_clause, params)
        """
        if not filter_expr:
            return "TRUE", []

        try:
            # Parse the filter JSON string
            if isinstance(filter_expr, str):
                filter_dict = json.loads(filter_expr)
            else:
                filter_dict = filter_expr

            # Get column names and detect geometry column from the table
            with ducklake_manager.connection() as con:
                result = con.execute(f"DESCRIBE {table_name}").fetchall()
                column_names = [row[0] for row in result]
                column_types = {row[0]: row[1] for row in result}

            # Detect geometry column name (could be 'geom', 'geometry', etc.)
            geometry_column = "geometry"  # default
            for col_name, col_type in column_types.items():
                if "geometry" in col_type.lower() or col_name.lower() in (
                    "geom",
                    "geometry",
                ):
                    geometry_column = col_name
                    break

            # Build CQL filter with proper structure
            cql_filter = {"filter": filter_dict, "lang": "cql2-json"}
            query_filters = build_cql_filter(
                cql_filter,
                column_names,
                geometry_column=geometry_column,
            )

            where_clause = query_filters.to_full_where(default="TRUE")
            params = query_filters.params

            logger.debug("CQL filter built: %s with params %s", where_clause, params)
            return where_clause, params

        except json.JSONDecodeError as e:
            logger.warning("Failed to parse filter JSON '%s': %s", filter_expr, e)
            return "TRUE", []
        except Exception as e:
            logger.warning("Failed to build filter '%s': %s", filter_expr, e)
            return "TRUE", []

    def feature_count(
        self,
        collection: str,
        filter_expr: str | None = None,
    ) -> dict[str, Any]:
        """Count features in a collection.

        Args:
            collection: Layer ID
            filter_expr: Optional CQL2 filter

        Returns:
            Dict with 'count' key
        """
        table_name = self._get_table_name(collection)
        geometry_column = self._detect_geometry_column(table_name)
        where_clause, params = self._build_where_clause(
            filter_expr, table_name, geometry_column
        )

        with ducklake_manager.connection() as con:
            result = calculate_feature_count(
                con,
                table_name,
                where_clause=where_clause,
                params=params if params else None,
            )

        return result.model_dump()

    def unique_values(
        self,
        collection: str,
        attribute: str,
        order: str = "descendent",
        filter_expr: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Get unique values for an attribute.

        Args:
            collection: Layer ID
            attribute: Column name
            order: Sort order ('ascendent' or 'descendent')
            filter_expr: Optional CQL2 filter
            limit: Maximum values to return
            offset: Pagination offset

        Returns:
            Dict with attribute, total, and values
        """
        table_name = self._get_table_name(collection)
        geometry_column = self._detect_geometry_column(table_name)
        where_clause, params = self._build_where_clause(
            filter_expr, table_name, geometry_column
        )

        # Map string to enum
        sort_order = SortOrder.descendent
        if order == "ascendent":
            sort_order = SortOrder.ascendent

        with ducklake_manager.connection() as con:
            result = calculate_unique_values(
                con,
                table_name,
                attribute,
                where_clause=where_clause,
                params=params if params else None,
                order=sort_order,
                limit=limit,
                offset=offset,
            )

        return result.model_dump()

    def class_breaks(
        self,
        collection: str,
        attribute: str,
        method: str = "quantile",
        breaks: int = 5,
        filter_expr: str | None = None,
        strip_zeros: bool = False,
    ) -> dict[str, Any]:
        """Calculate class breaks for a numeric attribute.

        Args:
            collection: Layer ID
            attribute: Numeric column name
            method: Classification method
            breaks: Number of breaks
            filter_expr: Optional CQL2 filter
            strip_zeros: Exclude zero values

        Returns:
            Dict with breaks, min, max, mean, std_dev
        """
        table_name = self._get_table_name(collection)
        geometry_column = self._detect_geometry_column(table_name)
        where_clause, params = self._build_where_clause(
            filter_expr, table_name, geometry_column
        )

        # Map string to enum
        break_method = ClassBreakMethod.quantile
        if method in ClassBreakMethod.__members__:
            break_method = ClassBreakMethod(method)

        with ducklake_manager.connection() as con:
            result = calculate_class_breaks(
                con,
                table_name,
                attribute,
                method=break_method,
                num_breaks=breaks,
                where_clause=where_clause,
                params=params if params else None,
                strip_zeros=strip_zeros,
            )

        return result.model_dump()

    def area_statistics(
        self,
        collection: str,
        operation: str = "sum",
        filter_expr: str | None = None,
    ) -> dict[str, Any]:
        """Calculate area statistics for polygon features.

        Args:
            collection: Layer ID
            operation: Statistical operation (sum, mean, min, max)
            filter_expr: Optional CQL2 filter

        Returns:
            Dict with result, total_area, feature_count, unit
        """
        table_name = self._get_table_name(collection)
        geometry_column = self._detect_geometry_column(table_name)
        where_clause, params = self._build_where_clause(
            filter_expr, table_name, geometry_column
        )

        # Map string to enum
        area_op = AreaOperation.sum
        if operation in AreaOperation.__members__:
            area_op = AreaOperation(operation)

        with ducklake_manager.connection() as con:
            result = calculate_area_statistics(
                con,
                table_name,
                geometry_column=geometry_column,
                operation=area_op,
                where_clause=where_clause,
                params=params if params else None,
            )

        return result.model_dump()

    def extent(
        self,
        collection: str,
        filter_expr: str | None = None,
    ) -> dict[str, Any]:
        """Calculate bounding box extent for features.

        Args:
            collection: Layer ID
            filter_expr: Optional CQL2 filter

        Returns:
            Dict with bbox [minx, miny, maxx, maxy] and feature_count
        """
        table_name = self._get_table_name(collection)
        geometry_column = self._detect_geometry_column(table_name)
        where_clause, params = self._build_where_clause(
            filter_expr, table_name, geometry_column
        )

        logger.info(
            "Extent query: table=%s, geom_col=%s, where=%s, params=%s",
            table_name,
            geometry_column,
            where_clause,
            params,
        )

        with ducklake_manager.connection() as con:
            result = calculate_extent(
                con,
                table_name,
                geometry_column=geometry_column,
                where_clause=where_clause,
                params=params if params else None,
            )
        return result.model_dump()

    def aggregation_stats(
        self,
        collection: str,
        operation: str = "count",
        operation_column: str | None = None,
        group_by_column: str | None = None,
        filter_expr: str | None = None,
        order: str = "descendent",
        limit: int = 100,
    ) -> dict[str, Any]:
        """Calculate aggregation statistics with optional grouping.

        Args:
            collection: Layer ID
            operation: Statistical operation (count, sum, mean, min, max, expression)
            operation_column: Column to perform the operation on. For 'expression', this
                contains the raw SQL expression.
            group_by_column: Optional column to group results by
            filter_expr: Optional CQL2 filter
            order: Sort order (ascendent or descendent)
            limit: Maximum number of grouped values to return

        Returns:
            Dict with items, total_items, and total_count
        """
        table_name = self._get_table_name(collection)
        where_clause, params = self._build_where_clause(filter_expr, table_name)

        # Map string to enum
        stats_op = StatisticsOperation.count
        if operation in StatisticsOperation.__members__:
            stats_op = StatisticsOperation(operation)

        # Validate expression if operation is expression
        if stats_op == StatisticsOperation.expression:
            if not operation_column:
                raise ValueError(
                    "operation_column (expression) is required for operation 'expression'"
                )
            # Import validator to validate the expression
            from goatlib.utils.expressions import ExpressionValidator

            column_names = self._get_column_names(table_name)
            validator = ExpressionValidator(column_names=column_names)
            validation = validator.validate(operation_column)
            if not validation.valid:
                error_messages = [e.message for e in validation.errors]
                raise ValueError(f"Invalid expression: {'; '.join(error_messages)}")

        sort_order = SortOrder.descendent
        if order == "ascendent":
            sort_order = SortOrder.ascendent

        with ducklake_manager.connection() as con:
            result = calculate_aggregation_stats(
                con,
                table_name,
                operation=stats_op,
                operation_column=operation_column,
                group_by_column=group_by_column,
                where_clause=where_clause,
                params=params if params else None,
                order=sort_order,
                limit=limit,
            )

        return result.model_dump()

    def histogram(
        self,
        collection: str,
        column: str,
        num_bins: int = 10,
        filter_expr: str | None = None,
        order: str = "ascendent",
    ) -> dict[str, Any]:
        """Calculate histogram for a numeric column.

        Args:
            collection: Layer ID
            column: Numeric column name
            num_bins: Number of histogram bins
            filter_expr: Optional CQL2 filter
            order: Sort order of bins (ascendent or descendent)

        Returns:
            Dict with bins, missing_count, and total_rows
        """
        table_name = self._get_table_name(collection)
        where_clause, params = self._build_where_clause(filter_expr, table_name)

        sort_order = SortOrder.ascendent
        if order == "descendent":
            sort_order = SortOrder.descendent

        with ducklake_manager.connection() as con:
            result = calculate_histogram(
                con,
                table_name,
                column=column,
                num_bins=num_bins,
                where_clause=where_clause,
                params=params if params else None,
                order=sort_order,
            )

        return result.model_dump()

    def validate_sql(
        self,
        sql_query: str,
        table_schemas: dict[str, dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """Validate a SQL SELECT statement against provided table schemas.

        Args:
            sql_query: The SQL SELECT statement to validate
            table_schemas: Table schemas: {alias: {column_name: duckdb_type}}

        Returns:
            Dict with valid, errors, columns
        """
        # Step 1: Basic SQL security validation
        try:
            validate_sql_query(sql_query)
        except ValueError as e:
            return {"valid": False, "errors": [str(e)], "columns": {}}

        # Step 2: Schema validation — create mock tables and execute with LIMIT 0
        if not table_schemas:
            return {"valid": True, "errors": [], "columns": {}}

        con = duckdb.connect()
        try:
            con.execute("INSTALL spatial; LOAD spatial;")

            for alias, columns in table_schemas.items():
                if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", alias):
                    return {
                        "valid": False,
                        "errors": [f"Invalid table alias: {alias}"],
                        "columns": {},
                    }

                col_defs = []
                if columns:
                    for col_name, col_type in columns.items():
                        if "GEOMETRY" in col_type.upper():
                            col_defs.append(f'"{col_name}" GEOMETRY')
                        else:
                            col_defs.append(f'"{col_name}" {col_type}')

                if not col_defs:
                    # Schema not yet available — create table with placeholder
                    col_defs = ['"_placeholder" INTEGER']

                create_sql = f'CREATE TABLE "{alias}" ({", ".join(col_defs)})'
                con.execute(create_sql)

            # Execute with LIMIT 0 to validate and get output schema
            limited_sql = f"SELECT * FROM ({sql_query}) _v LIMIT 0"
            con.execute(limited_sql)

            # Get output column types via DESCRIBE
            describe_result = con.execute(
                f"DESCRIBE SELECT * FROM ({sql_query}) _v LIMIT 0"
            )
            output_columns: dict[str, str] = {}
            for row in describe_result.fetchall():
                output_columns[row[0]] = row[1]

            return {"valid": True, "errors": [], "columns": output_columns}

        except duckdb.Error as e:
            return {"valid": False, "errors": [str(e)], "columns": {}}
        except Exception as e:
            logger.warning("SQL validation error: %s", e)
            return {"valid": False, "errors": [str(e)], "columns": {}}
        finally:
            con.close()

    def preview_sql(
        self,
        sql_query: str,
        layers: dict[str, str],
        limit: int = 10,
    ) -> dict[str, Any]:
        """Preview a SQL query against actual layer data.

        Loads each referenced layer from DuckLake as a named view in an
        in-memory DuckDB connection, then executes the query with a LIMIT.

        Args:
            sql_query: The SQL SELECT statement to preview
            layers: Layer mapping {alias: layer_id}
            limit: Max rows to return

        Returns:
            Dict with success, columns, rows, error
        """
        # Validate SQL first
        try:
            validate_sql_query(sql_query)
        except ValueError as e:
            return {"success": False, "columns": [], "rows": [], "error": str(e)}

        if not layers:
            return {
                "success": False,
                "columns": [],
                "rows": [],
                "error": "No layers provided for preview",
            }

        con = duckdb.connect()
        try:
            con.execute("INSTALL spatial; LOAD spatial;")

            # Load each layer from DuckLake as a view in isolated connection
            with ducklake_manager.connection() as lake_con:
                for alias, layer_id in layers.items():
                    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", alias):
                        return {
                            "success": False,
                            "columns": [],
                            "rows": [],
                            "error": f"Invalid table alias: {alias}",
                        }

                    # Resolve layer to DuckLake table name
                    try:
                        norm_id = normalize_layer_id(layer_id)
                        schema_name = get_schema_for_layer(norm_id)
                        table_name = _layer_id_to_table_name(norm_id)
                        full_table = f"lake.{schema_name}.{table_name}"
                    except Exception as e:
                        return {
                            "success": False,
                            "columns": [],
                            "rows": [],
                            "error": f"Layer {alias} ({layer_id}): {e}",
                        }

                    # Read data from DuckLake and register in isolated connection
                    try:
                        data = lake_con.execute(
                            f"SELECT * FROM {full_table}"
                        ).fetchdf()
                        con.register(alias, data)
                    except Exception as e:
                        return {
                            "success": False,
                            "columns": [],
                            "rows": [],
                            "error": f"Failed to load layer {alias}: {e}",
                        }

            # Execute the query with limit
            limited_sql = (
                f"SELECT * FROM ({sql_query}) _preview "
                f"LIMIT {limit}"
            )
            result = con.execute(limited_sql)

            # Get column info
            columns: list[dict[str, str]] = []
            if result.description:
                describe = con.execute(
                    f"DESCRIBE SELECT * FROM ({sql_query}) _preview LIMIT 0"
                )
                for row in describe.fetchall():
                    columns.append({"name": row[0], "type": row[1]})

            # Fetch rows
            rows_data = result.fetchall()
            col_names = [c["name"] for c in columns]
            rows: list[dict[str, Any]] = []
            for row_tuple in rows_data:
                values: dict[str, Any] = {}
                for i, val in enumerate(row_tuple):
                    col_name = col_names[i] if i < len(col_names) else f"col_{i}"
                    if hasattr(val, "wkt"):
                        values[col_name] = val.wkt
                    elif val is None:
                        values[col_name] = None
                    else:
                        try:
                            values[col_name] = (
                                val
                                if isinstance(val, (str, int, float, bool))
                                else str(val)
                            )
                        except Exception:
                            values[col_name] = str(val)
                rows.append({"values": values})

            return {
                "success": True,
                "columns": columns,
                "rows": rows,
            }

        except duckdb.Error as e:
            return {"success": False, "columns": [], "rows": [], "error": str(e)}
        except Exception as e:
            logger.exception("Error previewing SQL")
            return {"success": False, "columns": [], "rows": [], "error": str(e)}
        finally:
            con.close()


# Singleton instance
analytics_service = AnalyticsService()
