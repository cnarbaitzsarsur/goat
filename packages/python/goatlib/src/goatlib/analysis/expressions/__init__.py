"""Expression builder module for formula validation and evaluation.

DEPRECATED: This module has moved to goatlib.utils.expressions.
This file re-exports for backwards compatibility.
"""

# Re-export from new location for backwards compatibility
from goatlib.utils.expressions import (
    ALLOWED_KEYWORDS,
    ALLOWED_TYPES,
    FUNCTION_REGISTRY,
    ExpressionEvaluator,
    ExpressionValidator,
    FunctionCategory,
    FunctionDoc,
    FunctionParameter,
    PreviewResult,
    PreviewRow,
    ValidationError,
    ValidationResult,
    get_allowed_functions,
    get_function_names_set,
    get_functions_by_category,
    preview_expression,
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
