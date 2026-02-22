"""Tests for analytics dispatch in processes router."""

from unittest.mock import patch

from processes.routers.processes import _execute_analytics_sync


class TestExecuteAnalyticsSyncHistogram:
    """Tests for histogram dispatch arguments."""

    def test_histogram_forwards_method_and_custom_breaks(self):
        """Histogram execution forwards method and custom_breaks inputs."""
        inputs = {
            "collection": "layer-123",
            "column": "population",
            "num_bins": 7,
            "method": "quantile",
            "custom_breaks": [10.0, 20.0],
            "filter": "population > 0",
            "order": "descendent",
        }

        with patch("processes.routers.processes.analytics_service.histogram") as mock_histogram:
            mock_histogram.return_value = {"bins": [], "missing_count": 0, "total_rows": 0}

            result = _execute_analytics_sync("histogram", inputs)

            assert result == {"bins": [], "missing_count": 0, "total_rows": 0}
            mock_histogram.assert_called_once_with(
                collection="layer-123",
                column="population",
                num_bins=7,
                method="quantile",
                custom_breaks=[10.0, 20.0],
                filter_expr="population > 0",
                order="descendent",
            )
