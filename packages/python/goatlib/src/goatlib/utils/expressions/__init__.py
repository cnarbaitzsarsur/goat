"""Expression builder module for formula validation and evaluation.

This module provides functionality for validating and evaluating SQL expressions
against DuckDB tables. It is used by the Formula Builder feature in the UI
and can also be used by statistics endpoints.

Example usage:
    from goatlib.utils.expressions import (
        ExpressionValidator,
        ExpressionEvaluator,
        FUNCTION_REGISTRY,
    )

    # Validate an expression
    validator = ExpressionValidator(["population", "area"])
    result = validator.validate("population / area * 1000")
    if result.valid:
        print("Expression is valid!")

    # Preview results with DuckDB
    evaluator = ExpressionEvaluator(con, "my_table", ["population", "area"])
    preview = evaluator.preview("population / area * 1000", limit=5)
"""

from goatlib.utils.expressions.evaluator import (
    ExpressionEvaluator,
    PreviewResult,
    PreviewRow,
    preview_expression,
)
from goatlib.utils.expressions.functions import (
    ALLOWED_KEYWORDS,
    ALLOWED_TYPES,
    FUNCTION_REGISTRY,
    FunctionCategory,
    FunctionDoc,
    FunctionParameter,
    get_allowed_functions,
    get_function_names_set,
    get_functions_by_category,
)
from goatlib.utils.expressions.validator import (
    ExpressionValidator,
    ValidationError,
    ValidationResult,
    validate_expression,
)

__all__ = [
    # Function registry
    "ALLOWED_KEYWORDS",
    "ALLOWED_TYPES",
    "FUNCTION_REGISTRY",
    "FunctionCategory",
    "FunctionDoc",
    "FunctionParameter",
    "get_allowed_functions",
    "get_function_names_set",
    "get_functions_by_category",
    # Validator
    "ExpressionValidator",
    "ValidationError",
    "ValidationResult",
    "validate_expression",
    # Evaluator
    "ExpressionEvaluator",
    "PreviewResult",
    "PreviewRow",
    "preview_expression",
]
