"""Expression validator using sqlglot.

This module validates user expressions against the allowed function whitelist
and ensures security by rejecting dangerous patterns.
"""

import logging
import re
from dataclasses import dataclass, field

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError

from goatlib.utils.expressions.functions import (
    ALLOWED_KEYWORDS,
    ALLOWED_TYPES,
    FUNCTION_REGISTRY,
    get_function_names_set,
)

logger = logging.getLogger(__name__)


@dataclass
class ValidationError:
    """A validation error with location info."""

    message: str
    code: str  # e.g., "UNKNOWN_FUNCTION", "UNKNOWN_COLUMN", "FORBIDDEN_PATTERN"
    position: int | None = None  # Character position in expression
    suggestion: str | None = None


@dataclass
class ValidationResult:
    """Result of expression validation."""

    valid: bool
    expression: str
    errors: list[ValidationError] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    referenced_columns: set[str] = field(default_factory=set)
    used_functions: set[str] = field(default_factory=set)


# Patterns that indicate potentially dangerous SQL
FORBIDDEN_PATTERNS = [
    # DDL/DML statements
    (r"\bSELECT\s+.*\s+FROM\b", "SELECT...FROM statements are not allowed"),
    (r"\bINSERT\s+INTO\b", "INSERT statements are not allowed"),
    (r"\bUPDATE\s+\w+\s+SET\b", "UPDATE statements are not allowed"),
    (r"\bDELETE\s+FROM\b", "DELETE statements are not allowed"),
    (r"\bDROP\s+", "DROP statements are not allowed"),
    (r"\bCREATE\s+", "CREATE statements are not allowed"),
    (r"\bALTER\s+", "ALTER statements are not allowed"),
    (r"\bTRUNCATE\s+", "TRUNCATE statements are not allowed"),
    # Database operations
    (r"\bATTACH\b", "ATTACH is not allowed"),
    (r"\bDETACH\b", "DETACH is not allowed"),
    (r"\bCOPY\s+", "COPY is not allowed"),
    (r"\bEXPORT\b", "EXPORT is not allowed"),
    (r"\bIMPORT\b", "IMPORT is not allowed"),
    (r"\bINSTALL\b", "INSTALL is not allowed"),
    (r"\bLOAD\s+", "LOAD is not allowed"),
    (r"\bPRAGMA\b", "PRAGMA is not allowed"),
    # File system functions
    (r"\bread_csv\s*\(", "read_csv() is not allowed"),
    (r"\bread_parquet\s*\(", "read_parquet() is not allowed"),
    (r"\bread_json\s*\(", "read_json() is not allowed"),
    (r"\bwrite_csv\s*\(", "write_csv() is not allowed"),
    (r"\bwrite_parquet\s*\(", "write_parquet() is not allowed"),
    (r"\bglob\s*\(", "glob() is not allowed"),
    # Subqueries
    (r"\(\s*SELECT\b", "Subqueries are not allowed"),
    # System functions
    (r"\bcurrent_schema\s*\(", "current_schema() is not allowed"),
    (r"\bcurrent_database\s*\(", "current_database() is not allowed"),
    (r"\bpg_\w+\s*\(", "PostgreSQL system functions are not allowed"),
    (r"\bduckdb_\w+\s*\(", "DuckDB system functions are not allowed"),
    # Statement separators (multiple statements)
    (r";", "Multiple statements (;) are not allowed"),
    # Comments (could hide malicious code)
    (r"--", "SQL comments (--) are not allowed"),
    (r"/\*", "SQL comments (/*) are not allowed"),
]


class ExpressionValidator:
    """Validates SQL expressions against the allowed function whitelist."""

    # Mapping from JSON types to function parameter types
    TYPE_MAPPING = {
        "integer": {"NUMERIC", "INTEGER", "BIGINT", "ANY"},
        "number": {"NUMERIC", "DOUBLE", "FLOAT", "ANY"},
        "string": {"VARCHAR", "TEXT", "STRING", "ANY"},
        "boolean": {"BOOLEAN", "BOOL", "ANY"},
        "geometry": {"GEOMETRY", "ANY"},
    }

    def __init__(
        self,
        column_names: list[str],
        geometry_column: str | None = "geometry",
        column_types: dict[str, str] | None = None,
    ) -> None:
        """Initialize validator.

        Args:
            column_names: List of valid column names in the table
            geometry_column: Name of the geometry column (optional)
            column_types: Dict mapping column names to their JSON types
                         (e.g., {"population": "integer", "name": "string"})
        """
        self.column_names = {c.lower() for c in column_names}
        self.column_names_original = {c.lower(): c for c in column_names}
        self.geometry_column = geometry_column.lower() if geometry_column else None
        self.allowed_functions = get_function_names_set()
        # Store column types with lowercase keys
        self.column_types = (
            {k.lower(): v for k, v in column_types.items()} if column_types else {}
        )

    def validate(self, expression: str) -> ValidationResult:
        """Validate an expression.

        Args:
            expression: The SQL expression to validate

        Returns:
            ValidationResult with validation status and any errors
        """
        result = ValidationResult(valid=True, expression=expression)

        if not expression or not expression.strip():
            result.valid = False
            result.errors.append(
                ValidationError(
                    message="Expression cannot be empty",
                    code="EMPTY_EXPRESSION",
                )
            )
            return result

        # Step 1: Check for forbidden patterns (fast regex check)
        pattern_errors = self._check_forbidden_patterns(expression)
        if pattern_errors:
            result.valid = False
            result.errors.extend(pattern_errors)
            return result

        # Step 2: Parse with sqlglot
        try:
            # Wrap expression to make it a valid SELECT for parsing
            wrapped = f"SELECT {expression} AS result"
            parsed = sqlglot.parse_one(wrapped, dialect="duckdb")
        except ParseError as e:
            result.valid = False
            result.errors.append(
                ValidationError(
                    message=f"Syntax error: {str(e)}",
                    code="SYNTAX_ERROR",
                )
            )
            return result

        # Step 2.5: Check for multiple columns (expressions must return a single value)
        if isinstance(parsed, exp.Select):
            select_expressions = list(parsed.expressions)
            if len(select_expressions) > 1:
                result.valid = False
                result.errors.append(
                    ValidationError(
                        message="Expression must return a single value, not multiple columns",
                        code="MULTIPLE_COLUMNS",
                    )
                )
                return result

        # Step 3: Walk AST and validate
        try:
            self._validate_ast(parsed, result)
        except Exception as e:
            logger.exception("Error validating AST")
            result.valid = False
            result.errors.append(
                ValidationError(
                    message=f"Validation error: {str(e)}",
                    code="VALIDATION_ERROR",
                )
            )

        return result

    def _check_forbidden_patterns(self, expression: str) -> list[ValidationError]:
        """Check expression against forbidden patterns."""
        errors = []

        for pattern, message in FORBIDDEN_PATTERNS:
            if re.search(pattern, expression, re.IGNORECASE):
                errors.append(
                    ValidationError(
                        message=message,
                        code="FORBIDDEN_PATTERN",
                    )
                )

        return errors

    def _validate_ast(self, node: exp.Expression, result: ValidationResult) -> None:
        """Recursively validate AST nodes."""

        # Handle Column references
        if isinstance(node, exp.Column):
            col_name = node.name.lower() if node.name else ""
            if col_name and col_name not in self.column_names:
                # Check if it's a table reference (which we don't allow)
                if node.table:
                    result.valid = False
                    result.errors.append(
                        ValidationError(
                            message=f"Table references are not allowed: {node.table}.{node.name}",
                            code="TABLE_REFERENCE",
                        )
                    )
                else:
                    result.valid = False
                    similar = self._find_similar_column(col_name)
                    suggestion = f"Did you mean '{similar}'?" if similar else None
                    result.errors.append(
                        ValidationError(
                            message=f'Unknown column: "{node.name}"',
                            code="UNKNOWN_COLUMN",
                            suggestion=suggestion,
                        )
                    )
            else:
                result.referenced_columns.add(col_name)

        # Handle Function calls
        elif isinstance(node, (exp.Func, exp.Anonymous)):
            # Get the function name
            func_name = ""

            # For Anonymous nodes (unrecognized functions), the name is in node.name or node.this
            if isinstance(node, exp.Anonymous):
                if hasattr(node, "name") and node.name:
                    func_name = node.name.lower()
                elif hasattr(node, "this"):
                    func_name = str(node.this).lower()
            else:
                # For recognized function nodes, prefer sql_name() which gives canonical name
                if hasattr(node, "sql_name"):
                    name = node.sql_name()
                    # sql_name() might return the class name like 'ANONYMOUS' for some nodes
                    if name and name.upper() != "ANONYMOUS":
                        func_name = name.lower()
                if not func_name and hasattr(node, "key"):
                    func_name = node.key.lower()
                if not func_name and hasattr(node, "name") and node.name:
                    func_name = node.name.lower()
                if not func_name and hasattr(node, "this"):
                    func_name = str(node.this).lower()

            if func_name:
                # Check if function is allowed
                if (
                    func_name not in self.allowed_functions
                    and func_name not in ALLOWED_KEYWORDS
                ):
                    # Special case: some functions might be parsed differently
                    # e.g., CAST, CASE, etc.
                    if not self._is_special_sql_construct(node):
                        result.valid = False
                        similar = self._find_similar_function(func_name)
                        suggestion = f"Did you mean '{similar}'?" if similar else None
                        result.errors.append(
                            ValidationError(
                                message=f"Function not allowed: {func_name}()",
                                code="FORBIDDEN_FUNCTION",
                                suggestion=suggestion,
                            )
                        )
                else:
                    result.used_functions.add(func_name)
                    # Validate function parameter types if column_types is available
                    if self.column_types:
                        self._validate_function_param_types(node, func_name, result)

        # Handle CAST
        elif isinstance(node, exp.Cast):
            # Validate the target type
            target_type = str(node.to).lower() if node.to else ""
            # Extract base type (e.g., "varchar(100)" -> "varchar")
            base_type = target_type.split("(")[0].strip()
            if base_type and base_type not in ALLOWED_TYPES:
                result.valid = False
                result.errors.append(
                    ValidationError(
                        message=f"Type not allowed in CAST: {target_type}",
                        code="FORBIDDEN_TYPE",
                    )
                )

        # Handle subqueries (should be caught by pattern, but double-check)
        elif isinstance(node, exp.Subquery):
            result.valid = False
            result.errors.append(
                ValidationError(
                    message="Subqueries are not allowed",
                    code="SUBQUERY_NOT_ALLOWED",
                )
            )
            return  # Don't recurse into subquery

        # Recurse into children
        for child in node.iter_expressions():
            self._validate_ast(child, result)

    def _validate_function_param_types(
        self,
        node: exp.Expression,
        func_name: str,
        result: ValidationResult,
    ) -> None:
        """Validate that function arguments match expected parameter types.

        Args:
            node: The function AST node
            func_name: The function name (lowercase)
            result: ValidationResult to append errors to
        """
        func_doc = FUNCTION_REGISTRY.get(func_name)
        if not func_doc or not func_doc.parameters:
            return

        # Get the function arguments
        args = list(node.args.values()) if hasattr(node, "args") else []
        if not args and hasattr(node, "expressions"):
            args = list(node.expressions)

        # Check each argument against expected parameter type
        for i, arg in enumerate(args):
            if i >= len(func_doc.parameters):
                break

            param = func_doc.parameters[i]
            expected_type = param.type.upper()

            # Skip type checking for ANY type
            if expected_type == "ANY":
                continue

            # Only check column references (direct arguments)
            if isinstance(arg, exp.Column):
                col_name = arg.name.lower()
                col_type = self.column_types.get(col_name)

                if col_type:
                    # Check if column type is compatible with expected parameter type
                    if not self._is_type_compatible(col_type, expected_type):
                        result.valid = False
                        result.errors.append(
                            ValidationError(
                                message=(
                                    f"Type mismatch in {func_name}(): "
                                    f'column "{arg.name}" is of type {col_type}, '
                                    f"but {expected_type} is expected"
                                ),
                                code="TYPE_MISMATCH",
                            )
                        )

    def _is_type_compatible(self, column_type: str, expected_type: str) -> bool:
        """Check if a column type is compatible with an expected parameter type.

        Args:
            column_type: The JSON type of the column (e.g., "integer", "string")
            expected_type: The expected parameter type (e.g., "NUMERIC", "VARCHAR")

        Returns:
            True if compatible, False otherwise
        """
        column_type = column_type.lower()
        expected_type = expected_type.upper()

        # Get compatible types for the column's JSON type
        compatible_types = self.TYPE_MAPPING.get(column_type, {"ANY"})

        # Check if the expected type is in the compatible set
        return expected_type in compatible_types

    def _is_special_sql_construct(self, node: exp.Expression) -> bool:
        """Check if node is a special SQL construct (CASE, CAST, etc.)."""
        return isinstance(
            node,
            (
                exp.Case,
                exp.Cast,
                exp.If,
                exp.Between,
                exp.In,
                exp.Like,
                exp.ILike,
                exp.Is,
                exp.Not,
                exp.And,
                exp.Or,
                exp.Distinct,
                exp.Filter,
            ),
        )

    def _find_similar_column(self, col_name: str) -> str | None:
        """Find the most similar column name for suggestions."""
        best_match = None
        best_distance = float("inf")

        for known_col in self.column_names:
            distance = self._levenshtein_distance(col_name, known_col)
            if distance <= 2 and distance < best_distance:
                best_distance = distance
                best_match = known_col

        if best_match:
            return self.column_names_original.get(best_match, best_match)
        return None

    def _find_similar_function(self, func_name: str) -> str | None:
        """Find the most similar function name for suggestions."""
        best_match = None
        best_distance = float("inf")

        for known_func in self.allowed_functions:
            distance = self._levenshtein_distance(func_name, known_func)
            if distance <= 2 and distance < best_distance:
                best_distance = distance
                best_match = known_func

        if best_match:
            func_doc = FUNCTION_REGISTRY.get(best_match)
            return func_doc.name if func_doc else best_match
        return None

    def _levenshtein_distance(self, s1: str, s2: str) -> int:
        """Calculate Levenshtein edit distance between two strings. This can be refactored"""
        if len(s1) < len(s2):
            return self._levenshtein_distance(s2, s1)

        if len(s2) == 0:
            return len(s1)

        previous_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row

        return previous_row[-1]

    def _is_similar(self, a: str, b: str, threshold: int = 2) -> bool:
        """Check if two strings are similar (within edit distance threshold)."""
        if abs(len(a) - len(b)) > threshold:
            return False

        # Simple check: same prefix or suffix
        min_len = min(len(a), len(b))
        prefix_match = sum(1 for i in range(min_len) if a[i] == b[i])
        if prefix_match >= min_len - threshold:
            return True

        # Check if one contains the other
        if a in b or b in a:
            return True

        return False


def validate_expression(
    expression: str,
    column_names: list[str],
    geometry_column: str = "geometry",
) -> ValidationResult:
    """Validate an expression.

    Convenience function that creates a validator and validates the expression.

    Args:
        expression: The SQL expression to validate
        column_names: List of valid column names
        geometry_column: Name of the geometry column

    Returns:
        ValidationResult with validation status and any errors
    """
    validator = ExpressionValidator(column_names, geometry_column)
    return validator.validate(expression)
