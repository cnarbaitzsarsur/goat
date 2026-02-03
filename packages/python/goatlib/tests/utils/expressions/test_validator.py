"""Tests for the ExpressionValidator.

Tests cover security validation, function whitelisting, and column validation.
"""

import pytest
from goatlib.utils.expressions import (
    FUNCTION_REGISTRY,
    ExpressionValidator,
    FunctionCategory,
)


class TestExpressionValidatorBasic:
    """Basic validation tests."""

    @pytest.fixture
    def validator(self):
        """Create a validator with sample columns."""
        columns = ["id", "name", "value", "category", "geometry"]
        return ExpressionValidator(columns, geometry_column="geometry")

    def test_valid_simple_expression(self, validator):
        """Test a simple valid expression."""
        result = validator.validate("value * 2")
        assert result.valid
        assert len(result.errors) == 0
        assert "value" in result.referenced_columns

    def test_valid_function_call(self, validator):
        """Test valid function calls."""
        result = validator.validate("UPPER(name)")
        assert result.valid
        assert "name" in result.referenced_columns

    def test_valid_math_expression(self, validator):
        """Test math expressions."""
        result = validator.validate("ROUND(value * 1.1, 2)")
        assert result.valid

    def test_valid_string_concatenation(self, validator):
        """Test string concatenation."""
        result = validator.validate("name || ' - ' || category")
        assert result.valid
        assert "name" in result.referenced_columns
        assert "category" in result.referenced_columns

    def test_valid_case_expression(self, validator):
        """Test CASE expression."""
        result = validator.validate(
            "CASE WHEN value > 100 THEN 'high' WHEN value > 50 THEN 'medium' ELSE 'low' END"
        )
        assert result.valid

    def test_valid_coalesce(self, validator):
        """Test COALESCE function."""
        result = validator.validate("COALESCE(name, 'Unknown')")
        assert result.valid

    def test_valid_nullif(self, validator):
        """Test NULLIF function."""
        result = validator.validate("NULLIF(value, 0)")
        assert result.valid


class TestExpressionValidatorSecurity:
    """Security-related validation tests."""

    @pytest.fixture
    def validator(self):
        """Create a validator with sample columns."""
        return ExpressionValidator(["id", "value"])

    def test_reject_drop_table(self, validator):
        """Test that DROP TABLE is rejected."""
        result = validator.validate("DROP TABLE users")
        assert not result.valid
        assert any("drop" in e.message.lower() for e in result.errors)

    def test_reject_delete(self, validator):
        """Test that DELETE is rejected."""
        result = validator.validate("DELETE FROM users WHERE id = 1")
        assert not result.valid

    def test_reject_insert(self, validator):
        """Test that INSERT is rejected."""
        result = validator.validate("INSERT INTO users VALUES (1, 'test')")
        assert not result.valid

    def test_reject_update(self, validator):
        """Test that UPDATE is rejected."""
        result = validator.validate("UPDATE users SET name = 'test'")
        assert not result.valid

    def test_reject_create_table(self, validator):
        """Test that CREATE TABLE is rejected."""
        result = validator.validate("CREATE TABLE test (id INT)")
        assert not result.valid

    def test_reject_alter_table(self, validator):
        """Test that ALTER TABLE is rejected."""
        result = validator.validate("ALTER TABLE users ADD COLUMN test INT")
        assert not result.valid

    def test_reject_truncate(self, validator):
        """Test that TRUNCATE is rejected."""
        result = validator.validate("TRUNCATE TABLE users")
        assert not result.valid

    def test_reject_select_statement(self, validator):
        """Test that full SELECT statements are rejected."""
        result = validator.validate("SELECT * FROM users")
        assert not result.valid

    def test_reject_subquery(self, validator):
        """Test that subqueries are rejected."""
        result = validator.validate("(SELECT MAX(value) FROM users)")
        assert not result.valid

    def test_reject_read_csv(self, validator):
        """Test that read_csv is rejected."""
        result = validator.validate("read_csv('/etc/passwd')")
        assert not result.valid

    def test_reject_read_parquet(self, validator):
        """Test that read_parquet is rejected."""
        result = validator.validate("read_parquet('/tmp/data.parquet')")
        assert not result.valid

    def test_reject_copy(self, validator):
        """Test that COPY is rejected."""
        result = validator.validate("COPY users TO '/tmp/out.csv'")
        assert not result.valid

    def test_reject_install_extension(self, validator):
        """Test that INSTALL EXTENSION is rejected."""
        result = validator.validate("INSTALL httpfs")
        assert not result.valid

    def test_reject_load_extension(self, validator):
        """Test that LOAD EXTENSION is rejected."""
        result = validator.validate("LOAD httpfs")
        assert not result.valid

    def test_reject_pragma(self, validator):
        """Test that PRAGMA is rejected."""
        result = validator.validate("PRAGMA database_list")
        assert not result.valid

    def test_reject_set_variable(self, validator):
        """Test that SET is rejected."""
        result = validator.validate("SET memory_limit = '2GB'")
        assert not result.valid

    def test_reject_multiple_columns(self, validator):
        """Test that multiple columns/expressions are rejected."""
        result = validator.validate('"id", "value"')
        assert not result.valid
        assert any(
            "single value" in e.message.lower()
            or "multiple columns" in e.message.lower()
            for e in result.errors
        )

    def test_reject_multiple_expressions(self, validator):
        """Test that multiple expressions separated by comma are rejected."""
        result = validator.validate('"id" + 1, "value" * 2')
        assert not result.valid
        assert any(
            "single value" in e.message.lower()
            or "multiple columns" in e.message.lower()
            for e in result.errors
        )


class TestExpressionValidatorFunctionWhitelist:
    """Test function whitelist validation."""

    @pytest.fixture
    def validator(self):
        """Create a validator with sample columns."""
        return ExpressionValidator(["value", "name"])

    def test_allow_whitelisted_functions(self, validator):
        """Test that whitelisted functions are allowed."""
        # Test some functions from each category
        test_cases = [
            "ABS(value)",
            "UPPER(name)",
            "NOW()",
            "COALESCE(name, 'default')",
        ]
        for expr in test_cases:
            result = validator.validate(expr)
            assert result.valid, f"Expected {expr} to be valid"

    def test_reject_non_whitelisted_function(self, validator):
        """Test that non-whitelisted functions are rejected."""
        result = validator.validate("system('ls')")
        assert not result.valid
        assert any("not allowed" in e.message.lower() for e in result.errors)

    def test_suggest_similar_function(self, validator):
        """Test that similar function names are suggested."""
        result = validator.validate("UPER(name)")  # Typo in UPPER
        assert not result.valid
        # Should suggest UPPER in the suggestion field
        assert any(
            e.suggestion and "UPPER" in e.suggestion.upper() for e in result.errors
        )


class TestExpressionValidatorColumns:
    """Test column validation."""

    @pytest.fixture
    def validator(self):
        """Create a validator with specific columns."""
        return ExpressionValidator(["id", "name", "value", "created_at"])

    def test_valid_column_reference(self, validator):
        """Test valid column references."""
        result = validator.validate("name")
        assert result.valid
        assert "name" in result.referenced_columns

    def test_invalid_column_reference(self, validator):
        """Test invalid column references."""
        result = validator.validate("nonexistent_column")
        assert not result.valid
        assert any("column" in e.message.lower() for e in result.errors)

    def test_suggest_similar_column(self, validator):
        """Test that similar column names are suggested."""
        result = validator.validate("naem")  # Typo in name
        assert not result.valid
        # Check suggestion is provided in the error
        assert any(
            e.suggestion and "name" in e.suggestion.lower() for e in result.errors
        )

    def test_case_insensitive_column(self, validator):
        """Test case-insensitive column matching."""
        result = validator.validate("NAME")
        assert result.valid
        assert "name" in result.referenced_columns

    def test_quoted_column(self, validator):
        """Test quoted column references."""
        result = validator.validate('"name"')
        assert result.valid


class TestExpressionValidatorComplexExpressions:
    """Test complex expression validation."""

    @pytest.fixture
    def validator(self):
        """Create a validator with sample columns."""
        return ExpressionValidator(["value", "name", "category", "date_field"])

    def test_nested_function_calls(self, validator):
        """Test nested function calls."""
        result = validator.validate("UPPER(TRIM(name))")
        assert result.valid

    def test_arithmetic_with_functions(self, validator):
        """Test arithmetic combined with functions."""
        result = validator.validate("ROUND(value * 1.05, 2) + ABS(value)")
        assert result.valid

    def test_complex_case_expression(self, validator):
        """Test complex CASE expression."""
        expr = """
            CASE
                WHEN value > 100 AND category = 'A' THEN 'High A'
                WHEN value > 50 OR category = 'B' THEN 'Medium'
                ELSE COALESCE(name, 'Unknown')
            END
        """
        result = validator.validate(expr)
        assert result.valid

    def test_date_functions(self, validator):
        """Test date functions."""
        result = validator.validate("DATE_PART('year', date_field)")
        assert result.valid


class TestExpressionValidatorEdgeCases:
    """Test edge cases and error handling."""

    @pytest.fixture
    def validator(self):
        """Create a validator with sample columns."""
        return ExpressionValidator(["value", "name"])

    def test_empty_expression(self, validator):
        """Test empty expression."""
        result = validator.validate("")
        assert not result.valid

    def test_whitespace_only(self, validator):
        """Test whitespace-only expression."""
        result = validator.validate("   ")
        assert not result.valid

    def test_literal_number(self, validator):
        """Test literal number (should be valid)."""
        result = validator.validate("42")
        assert result.valid

    def test_literal_string(self, validator):
        """Test literal string (should be valid)."""
        result = validator.validate("'hello world'")
        assert result.valid

    def test_null_literal(self, validator):
        """Test NULL literal."""
        result = validator.validate("NULL")
        assert result.valid

    def test_boolean_literals(self, validator):
        """Test boolean literals."""
        result = validator.validate("TRUE")
        assert result.valid
        result = validator.validate("FALSE")
        assert result.valid

    def test_syntax_error(self, validator):
        """Test syntax error handling."""
        result = validator.validate("value +")
        assert not result.valid

    def test_unmatched_parentheses(self, validator):
        """Test unmatched parentheses."""
        result = validator.validate("UPPER(name")
        assert not result.valid


class TestFunctionRegistry:
    """Test the function registry."""

    def test_registry_has_functions(self):
        """Test that registry contains functions."""
        assert len(FUNCTION_REGISTRY) > 50

    def test_all_categories_have_functions(self):
        """Test that all categories have at least one function."""
        categories_with_functions = set()
        for func in FUNCTION_REGISTRY.values():
            categories_with_functions.add(func.category)

        for category in FunctionCategory:
            assert (
                category in categories_with_functions
            ), f"Category {category} has no functions"

    def test_function_has_required_fields(self):
        """Test that all functions have required fields."""
        for name, func in FUNCTION_REGISTRY.items():
            assert func.name == name, f"Function {name} has mismatched name"
            assert func.syntax, f"Function {name} missing syntax"
            assert func.example, f"Function {name} missing example"
            assert func.description_key, f"Function {name} missing description_key"
            assert func.category, f"Function {name} missing category"

    def test_math_functions_exist(self):
        """Test that expected math functions exist."""
        math_funcs = ["abs", "round", "floor", "ceil", "sqrt", "power"]
        for func in math_funcs:
            assert func in FUNCTION_REGISTRY, f"Missing math function: {func}"

    def test_string_functions_exist(self):
        """Test that expected string functions exist."""
        string_funcs = ["upper", "lower", "trim", "length", "substring", "replace"]
        for func in string_funcs:
            assert func in FUNCTION_REGISTRY, f"Missing string function: {func}"

    def test_date_functions_exist(self):
        """Test that expected date functions exist."""
        date_funcs = ["now", "date_part", "date_trunc", "current_date"]
        for func in date_funcs:
            assert func in FUNCTION_REGISTRY, f"Missing date function: {func}"

    def test_aggregate_functions_exist(self):
        """Test that expected aggregate functions exist."""
        agg_funcs = ["count", "sum", "avg", "min", "max"]
        for func in agg_funcs:
            assert func in FUNCTION_REGISTRY, f"Missing aggregate function: {func}"

    def test_spatial_functions_exist(self):
        """Test that expected spatial functions exist."""
        spatial_funcs = ["st_area", "st_length", "st_centroid", "st_buffer"]
        for func in spatial_funcs:
            assert func in FUNCTION_REGISTRY, f"Missing spatial function: {func}"


class TestExpressionValidatorTypeChecking:
    """Tests for function parameter type validation."""

    @pytest.fixture
    def validator_with_types(self):
        """Create a validator with column types."""
        columns = ["id", "name", "value", "category", "population", "geometry"]
        column_types = {
            "id": "integer",
            "name": "string",
            "value": "number",
            "category": "string",
            "population": "integer",
            "geometry": "geometry",
        }
        return ExpressionValidator(
            columns, geometry_column="geometry", column_types=column_types
        )

    @pytest.fixture
    def validator_without_types(self):
        """Create a validator without column types."""
        columns = ["id", "name", "value"]
        return ExpressionValidator(columns, geometry_column="geometry")

    def test_sum_with_numeric_column_valid(self, validator_with_types):
        """Test that SUM with numeric column is valid."""
        result = validator_with_types.validate('SUM("population") OVER ()')
        assert result.valid, f"Errors: {[e.message for e in result.errors]}"

    def test_sum_with_string_column_invalid(self, validator_with_types):
        """Test that SUM with string column is invalid."""
        result = validator_with_types.validate('SUM("name") OVER ()')
        assert not result.valid
        assert any(e.code == "TYPE_MISMATCH" for e in result.errors)
        assert any("name" in e.message and "string" in e.message for e in result.errors)

    def test_avg_with_numeric_column_valid(self, validator_with_types):
        """Test that AVG with numeric column is valid."""
        result = validator_with_types.validate('AVG("value") OVER ()')
        assert result.valid

    def test_avg_with_string_column_invalid(self, validator_with_types):
        """Test that AVG with string column is invalid."""
        result = validator_with_types.validate('AVG("category") OVER ()')
        assert not result.valid
        assert any(e.code == "TYPE_MISMATCH" for e in result.errors)

    def test_abs_with_numeric_column_valid(self, validator_with_types):
        """Test that ABS with numeric column is valid."""
        result = validator_with_types.validate('ABS("value")')
        assert result.valid

    def test_abs_with_string_column_invalid(self, validator_with_types):
        """Test that ABS with string column is invalid."""
        result = validator_with_types.validate('ABS("name")')
        assert not result.valid
        assert any(e.code == "TYPE_MISMATCH" for e in result.errors)

    def test_round_with_numeric_column_valid(self, validator_with_types):
        """Test that ROUND with numeric column is valid."""
        result = validator_with_types.validate('ROUND("value", 2)')
        assert result.valid

    def test_upper_with_string_column_valid(self, validator_with_types):
        """Test that UPPER with string column is valid."""
        result = validator_with_types.validate('UPPER("name")')
        assert result.valid

    def test_min_max_any_type_valid(self, validator_with_types):
        """Test that MIN/MAX work with any type."""
        # MIN and MAX have parameter type "ANY"
        result = validator_with_types.validate('MIN("name") OVER ()')
        assert result.valid
        result = validator_with_types.validate('MAX("value") OVER ()')
        assert result.valid

    def test_count_any_type_valid(self, validator_with_types):
        """Test that COUNT works with any type."""
        result = validator_with_types.validate('COUNT("name") OVER ()')
        assert result.valid
        result = validator_with_types.validate('COUNT("value") OVER ()')
        assert result.valid

    def test_no_type_checking_without_column_types(self, validator_without_types):
        """Test that type checking is skipped when column_types is not provided."""
        # This should pass because without column_types, no type checking is done
        result = validator_without_types.validate('SUM("name") OVER ()')
        assert result.valid

    def test_sqrt_with_numeric_valid(self, validator_with_types):
        """Test that SQRT with numeric column is valid."""
        result = validator_with_types.validate('SQRT("value")')
        assert result.valid

    def test_sqrt_with_string_invalid(self, validator_with_types):
        """Test that SQRT with string column is invalid."""
        result = validator_with_types.validate('SQRT("name")')
        assert not result.valid
        assert any(e.code == "TYPE_MISMATCH" for e in result.errors)

    def test_integer_compatible_with_numeric(self, validator_with_types):
        """Test that integer columns are compatible with NUMERIC parameters."""
        result = validator_with_types.validate('SUM("id") OVER ()')
        assert result.valid
        result = validator_with_types.validate('AVG("population") OVER ()')
        assert result.valid

    def test_nested_functions_type_checking(self, validator_with_types):
        """Test type checking in nested function calls."""
        # ROUND expects NUMERIC, ABS expects NUMERIC
        result = validator_with_types.validate('ROUND(ABS("value"), 2)')
        assert result.valid

    def test_type_error_message_contains_details(self, validator_with_types):
        """Test that type error messages contain useful details."""
        result = validator_with_types.validate('SUM("name") OVER ()')
        assert not result.valid
        error = next(e for e in result.errors if e.code == "TYPE_MISMATCH")
        assert "sum" in error.message.lower()
        assert "name" in error.message
        assert "string" in error.message
        assert "NUMERIC" in error.message
