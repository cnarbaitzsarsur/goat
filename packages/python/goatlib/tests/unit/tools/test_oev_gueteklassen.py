"""Unit tests for ÖV-Güteklassen tool parameter schema."""

import pytest
from goatlib.analysis.schemas.catchment_area import Weekday
from goatlib.tools.oev_gueteklassen import (
    CatchmentType,
    OevGueteklassenToolParams,
)


class TestOevGueteklassenToolParams:
    """Test OevGueteklassenToolParams validation and defaults."""

    BASE_PARAMS = {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "reference_area_layer_id": "00000000-0000-0000-0000-000000000002",
    }

    def test_defaults(self):
        """Default weekday, time window and catchment type should be applied."""
        params = OevGueteklassenToolParams(**self.BASE_PARAMS)

        assert params.weekday == Weekday.weekday
        assert params.from_time == 25200
        assert params.to_time == 32400
        assert params.catchment_type == CatchmentType.buffer
        assert params.station_config is None

    def test_rejects_invalid_catchment_type(self):
        """Only buffer catchment type is currently supported."""
        with pytest.raises(ValueError):
            OevGueteklassenToolParams(
                **self.BASE_PARAMS,
                catchment_type="network",
            )

    def test_accepts_custom_station_config(self):
        """Custom station config should be parsed and expanded for route mappings."""
        params = OevGueteklassenToolParams(
            **self.BASE_PARAMS,
            station_config={
                "groups": {"2": "A", "3": "C"},
                "time_frequency": [10, 20],
                "categories": [
                    {"A": 1, "C": 2},
                    {"A": 2, "C": 3},
                ],
                "classification": {
                    "1": {300: "1"},
                    "2": {300: "2"},
                    "3": {300: "3"},
                },
            },
        )

        assert params.station_config is not None
        assert params.station_config.groups["700"] == "C"
        assert params.station_config.groups["100"] == "A"
