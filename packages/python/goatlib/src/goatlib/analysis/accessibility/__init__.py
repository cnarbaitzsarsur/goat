"""Accessibility analysis tools.

This module contains tools for accessibility/heatmap analysis:
- HeatmapGravityTool: Gravity-based accessibility analysis
- HeatmapConnectivityTool: Connectivity heatmap (reachable area)
- HeatmapClosestAverageTool: Average distance to N closest destinations
- OevGueteklasseTool: Public Transport Quality Classes (ÖV-Güteklassen)
- TripCountStationTool: Public Transport Trip Count per station
- CatchmentAreaTool: Catchment area / isochrone generation (unified tool)
"""

# Re-export schemas from the schemas module for backwards compatibility
from goatlib.analysis.schemas.base import PTTimeWindow
from goatlib.analysis.schemas.oev_gueteklasse import (
    STATION_CONFIG_DEFAULT,
    CatchmentType,
    OevGueteklasseParams,
    OevGueteklasseStationConfig,
)
from goatlib.analysis.schemas.trip_count import TripCountStationParams

from .base import TRANSPORT_MODE_MAPPING, PTToolBase
from .catchment_area import (
    CatchmentAreaTool,
    compute_r5_surface,
    decode_r5_grid,
    generate_jsolines,
    jsolines,
)
from .closest_average import HeatmapClosestAverageTool
from .connectivity import HeatmapConnectivityTool
from .gravity import HeatmapGravityTool
from .oev_gueteklasse import OevGueteklasseTool
from .trip_count import TripCountStationTool
