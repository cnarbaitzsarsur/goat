"""Expression evaluator for preview and execution.

This module executes validated expressions against DuckDB and returns
preview results.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Any

import duckdb

from goatlib.utils.expressions.functions import FUNCTION_REGISTRY, FunctionCategory
from goatlib.utils.expressions.validator import (
    ExpressionValidator,
    ValidationResult,
)

logger = logging.getLogger(__name__)

# Aggregate function names that require GROUP BY or OVER() clause
AGGREGATE_FUNCTIONS = {
    name.lower()
    for name, doc in FUNCTION_REGISTRY.items()
    if doc.category == FunctionCategory.AGGREGATE
}

logger = logging.getLogger(__name__)


@dataclass
class PreviewRow:
    """A single row in the preview results."""

    row_number: int
    result: Any
    context: dict[str, Any] = field(default_factory=dict)


@dataclass
class PreviewResult:
    """Result of expression preview."""

    success: bool
    expression: str
    result_type: str | None = None
    rows: list[PreviewRow] = field(default_factory=list)
    column_names: list[str] = field(default_factory=list)
    error: str | None = None
    validation: ValidationResult | None = None


class ExpressionEvaluator:
    """Evaluates expressions against DuckDB tables."""

    def __init__(
        self,
        con: duckdb.DuckDBPyConnection,
        table_name: str,
        column_names: list[str],
        geometry_column: str = "geometry",
    ) -> None:
        """Initialize evaluator.

        Args:
            con: DuckDB connection
            table_name: Fully qualified table name (e.g., "lake.schema.table")
            column_names: List of column names in the table
            geometry_column: Name of the geometry column
        """
        self.con = con
        self.table_name = table_name
        self.column_names = column_names
        self.geometry_column = geometry_column
        self.validator = ExpressionValidator(column_names, geometry_column)

    def preview(
        self,
        expression: str,
        limit: int = 5,
        where_clause: str | None = None,
    ) -> PreviewResult:
        """Generate a preview of the expression results.

        Args:
            expression: The SQL expression to evaluate
            limit: Maximum number of rows to return
            where_clause: Optional WHERE clause filter

        Returns:
            PreviewResult with sample rows and result type
        """
        # First validate the expression
        validation = self.validator.validate(expression)

        if not validation.valid:
            return PreviewResult(
                success=False,
                expression=expression,
                error="; ".join(e.message for e in validation.errors),
                validation=validation,
            )

        # Get the columns referenced in the expression for the preview
        referenced_cols = list(validation.referenced_columns)

        # Check if expression uses aggregate functions WITHOUT OVER() clause
        # In that case, we can't show row-level context
        is_pure_aggregate = self._is_pure_aggregate(
            expression, validation.used_functions
        )

        where_part = f"WHERE {where_clause}" if where_clause else ""

        if is_pure_aggregate:
            # For pure aggregates, just return the aggregate result
            query = f"""
                SELECT ({expression}) AS __result__
                FROM {self.table_name}
                {where_part}
            """
            try:
                result = self.con.execute(query)
                row = result.fetchone()
                result_value = self._serialize_value(row[0]) if row else None

                preview_rows = [
                    PreviewRow(row_number=1, result=result_value, context={})
                ]

                return PreviewResult(
                    success=True,
                    expression=expression,
                    result_type=self._infer_result_type(expression),
                    rows=preview_rows,
                    column_names=[],
                    validation=validation,
                )
            except duckdb.Error as e:
                logger.warning(f"Expression preview failed: {e}")
                return PreviewResult(
                    success=False,
                    expression=expression,
                    error=str(e),
                    validation=validation,
                )

        # Build the query with row context
        # Select referenced columns plus the computed result
        select_parts = []
        for col in referenced_cols:
            # Don't include geometry in preview (too large)
            if col.lower() != self.geometry_column.lower():
                select_parts.append(f'"{col}"')

        # Add the expression as the result column
        select_parts.append(f"({expression}) AS __result__")

        select_clause = (
            ", ".join(select_parts) if select_parts else f"({expression}) AS __result__"
        )

        query = f"""
            SELECT {select_clause}
            FROM {self.table_name}
            {where_part}
            LIMIT {limit}
        """

        try:
            # Execute the query
            result = self.con.execute(query)
            rows_data = result.fetchall()
            col_names = [desc[0] for desc in result.description]

            # Find the result column index
            result_idx = col_names.index("__result__")

            # Build preview rows
            preview_rows = []
            input_col_names = [c for c in col_names if c != "__result__"]

            for row_num, row in enumerate(rows_data, start=1):
                context = {}
                for i, col_name in enumerate(col_names):
                    if col_name != "__result__":
                        value = row[i]
                        # Convert to JSON-serializable types
                        context[col_name] = self._serialize_value(value)

                result_value = self._serialize_value(row[result_idx])
                preview_rows.append(
                    PreviewRow(row_number=row_num, result=result_value, context=context)
                )

            # Infer the result type
            result_type = self._infer_result_type(expression)

            return PreviewResult(
                success=True,
                expression=expression,
                result_type=result_type,
                rows=preview_rows,
                column_names=input_col_names,
                validation=validation,
            )

        except duckdb.Error as e:
            logger.warning(f"Expression preview failed: {e}")
            return PreviewResult(
                success=False,
                expression=expression,
                error=str(e),
                validation=validation,
            )

    def infer_type(self, expression: str) -> str | None:
        """Infer the result type of an expression.

        Args:
            expression: The SQL expression

        Returns:
            The DuckDB type name, or None if inference fails
        """
        return self._infer_result_type(expression)

    def _is_pure_aggregate(self, expression: str, used_functions: set[str]) -> bool:
        """Check if expression uses aggregate functions without OVER() clause.

        Returns True if the expression contains aggregate functions but no
        window function syntax (OVER clause), meaning it would collapse rows.
        """
        # Check if any used function is an aggregate function
        has_aggregate = any(fn.lower() in AGGREGATE_FUNCTIONS for fn in used_functions)

        if not has_aggregate:
            return False

        # Check if expression contains OVER() clause - if so, it's a window function
        # and doesn't require GROUP BY
        over_pattern = re.compile(r"\bOVER\s*\(", re.IGNORECASE)
        has_over = over_pattern.search(expression) is not None

        return not has_over

    def _infer_result_type(self, expression: str) -> str | None:
        """Infer the result type by running DESCRIBE on a limited query."""
        try:
            # Use DESCRIBE to get the type without actually running the query
            query = f"""
                SELECT ({expression}) AS result
                FROM {self.table_name}
                LIMIT 0
            """
            result = self.con.execute(f"DESCRIBE ({query})")
            type_info = result.fetchone()
            if type_info:
                return type_info[1]  # Column type is second field
        except Exception:
            pass
        return None

    def _serialize_value(self, value: Any) -> Any:
        """Convert a value to a JSON-serializable type."""
        if value is None:
            return None
        if isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, (list, tuple)):
            return [self._serialize_value(v) for v in value]
        if isinstance(value, dict):
            return {k: self._serialize_value(v) for k, v in value.items()}
        # For other types (datetime, bytes, etc.), convert to string
        return str(value)


def preview_expression(
    con: duckdb.DuckDBPyConnection,
    table_name: str,
    column_names: list[str],
    expression: str,
    limit: int = 5,
    where_clause: str | None = None,
    geometry_column: str = "geometry",
) -> PreviewResult:
    """Preview an expression.

    Convenience function that creates an evaluator and generates a preview.

    Args:
        con: DuckDB connection
        table_name: Fully qualified table name
        column_names: List of column names in the table
        expression: The SQL expression to evaluate
        limit: Maximum number of rows to return
        where_clause: Optional WHERE clause filter
        geometry_column: Name of the geometry column

    Returns:
        PreviewResult with sample rows and result type
    """
    evaluator = ExpressionEvaluator(con, table_name, column_names, geometry_column)
    return evaluator.preview(expression, limit, where_clause)
