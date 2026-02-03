"""Tests for the ExpressionEvaluator.

Tests cover preview generation and type inference.
"""

import duckdb
import pytest
from goatlib.utils.expressions import (
    ExpressionEvaluator,
    preview_expression,
)


class TestExpressionEvaluatorPreview:
    """Tests for expression preview functionality."""

    @pytest.fixture
    def con(self):
        """Create a DuckDB connection with test data."""
        con = duckdb.connect(":memory:")

        # Load spatial extension for geometry tests
        con.execute("INSTALL spatial; LOAD spatial;")

        # Create a test table
        con.execute("""
            CREATE TABLE test_data (
                id INTEGER,
                name VARCHAR,
                value DOUBLE,
                category VARCHAR,
                created_at TIMESTAMP,
                geometry GEOMETRY
            )
        """)

        # Insert sample data
        con.execute("""
            INSERT INTO test_data VALUES
            (1, 'Alice', 100.5, 'A', '2024-01-15 10:00:00', ST_Point(11.5, 48.1)),
            (2, 'Bob', 200.0, 'B', '2024-02-20 14:30:00', ST_Point(11.6, 48.2)),
            (3, 'Charlie', 50.25, 'A', '2024-03-10 09:15:00', ST_Point(11.7, 48.3)),
            (4, NULL, 75.0, 'C', '2024-04-05 16:45:00', ST_Point(11.8, 48.4)),
            (5, 'Eve', NULL, 'B', '2024-05-01 11:00:00', ST_Point(11.9, 48.5))
        """)

        yield con
        con.close()

    @pytest.fixture
    def evaluator(self, con):
        """Create an evaluator for the test table."""
        columns = ["id", "name", "value", "category", "created_at", "geometry"]
        return ExpressionEvaluator(con, "test_data", columns)

    def test_preview_simple_column(self, evaluator):
        """Test preview of a simple column reference."""
        result = evaluator.preview("value", limit=3)

        assert result.success
        assert len(result.rows) == 3
        assert result.error is None

    def test_preview_math_expression(self, evaluator):
        """Test preview of a math expression."""
        result = evaluator.preview("value * 2", limit=3)

        assert result.success
        assert len(result.rows) == 3

        # Check that results are doubled
        for row in result.rows:
            if row.context.get("value") is not None:
                expected = row.context["value"] * 2
                assert row.result == pytest.approx(expected)

    def test_preview_string_function(self, evaluator):
        """Test preview of a string function."""
        result = evaluator.preview("UPPER(name)", limit=3)

        assert result.success

        for row in result.rows:
            if row.context.get("name") is not None:
                assert row.result == row.context["name"].upper()

    def test_preview_coalesce(self, evaluator):
        """Test preview of COALESCE function."""
        result = evaluator.preview("COALESCE(name, 'Unknown')", limit=5)

        assert result.success

        for row in result.rows:
            if row.context.get("name") is None:
                assert row.result == "Unknown"
            else:
                assert row.result == row.context["name"]

    def test_preview_case_expression(self, evaluator):
        """Test preview of CASE expression."""
        expr = "CASE WHEN value > 100 THEN 'high' WHEN value > 50 THEN 'medium' ELSE 'low' END"
        result = evaluator.preview(expr, limit=5)

        assert result.success
        assert all(row.result in ("high", "medium", "low", None) for row in result.rows)

    def test_preview_with_where_clause(self, evaluator):
        """Test preview with a WHERE clause filter."""
        result = evaluator.preview("value", limit=10, where_clause="category = 'A'")

        assert result.success
        assert len(result.rows) == 2  # Only 2 rows with category 'A'

    def test_preview_includes_referenced_columns(self, evaluator):
        """Test that preview includes referenced columns."""
        result = evaluator.preview("value * 2 + id", limit=3)

        assert result.success
        assert "value" in result.column_names
        assert "id" in result.column_names

    def test_preview_excludes_geometry(self, evaluator):
        """Test that geometry column is excluded from preview."""
        result = evaluator.preview("ST_X(geometry)", limit=3)

        assert result.success
        # geometry should not be in the column_names for display
        assert "geometry" not in result.column_names

    def test_preview_invalid_expression(self, evaluator):
        """Test preview with invalid expression."""
        result = evaluator.preview("nonexistent_column")

        assert not result.success
        assert result.error is not None

    def test_preview_forbidden_expression(self, evaluator):
        """Test preview with forbidden expression."""
        result = evaluator.preview("SELECT * FROM test_data")

        assert not result.success
        assert result.validation is not None
        assert not result.validation.valid


class TestExpressionEvaluatorTypeInference:
    """Tests for type inference."""

    @pytest.fixture
    def con(self):
        """Create a DuckDB connection with test data."""
        con = duckdb.connect(":memory:")
        con.execute("""
            CREATE TABLE test_data (
                id INTEGER,
                name VARCHAR,
                value DOUBLE
            )
        """)
        con.execute("INSERT INTO test_data VALUES (1, 'test', 100.5)")
        yield con
        con.close()

    @pytest.fixture
    def evaluator(self, con):
        """Create an evaluator for the test table."""
        return ExpressionEvaluator(con, "test_data", ["id", "name", "value"])

    def test_infer_integer_type(self, evaluator):
        """Test type inference for integer."""
        result_type = evaluator.infer_type("id")
        assert result_type is not None
        assert "INT" in result_type.upper()

    def test_infer_double_type(self, evaluator):
        """Test type inference for double."""
        result_type = evaluator.infer_type("value * 2")
        assert result_type is not None
        assert "DOUBLE" in result_type.upper() or "FLOAT" in result_type.upper()

    def test_infer_string_type(self, evaluator):
        """Test type inference for string."""
        result_type = evaluator.infer_type("UPPER(name)")
        assert result_type is not None
        assert "VARCHAR" in result_type.upper() or "STRING" in result_type.upper()


class TestPreviewExpressionHelper:
    """Tests for the preview_expression convenience function."""

    @pytest.fixture
    def con(self):
        """Create a DuckDB connection with test data."""
        con = duckdb.connect(":memory:")
        con.execute("CREATE TABLE test (id INTEGER, value DOUBLE)")
        con.execute("INSERT INTO test VALUES (1, 100.0), (2, 200.0)")
        yield con
        con.close()

    def test_preview_expression_function(self, con):
        """Test the convenience function."""
        result = preview_expression(
            con=con,
            table_name="test",
            column_names=["id", "value"],
            expression="value * 2",
            limit=2,
        )

        assert result.success
        assert len(result.rows) == 2
