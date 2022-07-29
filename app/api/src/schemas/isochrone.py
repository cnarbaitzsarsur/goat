from curses.ascii import HT
from enum import Enum, IntEnum
from typing import Dict, List, Optional, Union

from bson import STANDARD
from src.endpoints import deps
from geojson_pydantic.features import Feature, FeatureCollection
from geojson_pydantic.geometries import MultiPolygon, Polygon
from pydantic import BaseModel, Field, root_validator, validator
from fastapi import HTTPException
from src.resources.enums import RoutingTypes

"""
Body of the request
"""


class IsochroneTypeEnum(str, Enum):
    single = "single_isochrone"
    multi = "multi_isochrone"
    heatmap = "heatmap"


class IsochroneBase(BaseModel):
    user_id: Optional[int]
    scenario_id: Optional[int] = 0
    minutes: int
    speed: float
    modus: str
    n: int
    routing_profile: str
    active_upload_ids: Optional[List[int]] = [0]

    @root_validator
    def compute_values(cls, values):
        """Compute values."""
        # convert minutes to seconds (max_cutoff is in seconds)
        values["max_cutoff"] = values["minutes"] * 60

        return values

    @validator("routing_profile")
    def check_routing_profile(cls, v):
        if v not in RoutingTypes._value2member_map_:
            raise HTTPException(status_code=400, detail="Invalid routing profile.")
        return v

    @validator("modus")
    def check_modus(cls, v):
        if v not in CalculationTypes._value2member_map_:
            raise HTTPException(status_code=400, detail="Invalid calculation modus.")
        return v


class IsochroneSingle(IsochroneBase):
    x: float
    y: float


class IsochroneMulti(IsochroneBase):
    x: list[float]
    y: list[float]


class IsochronePoiMulti(IsochroneBase):
    region_type: str
    region: List[str]
    amenities: List[str]

    @root_validator
    def define_study_area_ids(cls, values):
        if values["region_type"] == "study_area":
            values["study_area_ids"] = [int(integer_string) for integer_string in values["region"]]
            values["region_geom"] = None
        elif values["region_type"] == "draw":
            values["study_area_ids"] = None
            values["region_geom"] = values["region"][0]
        else:
            raise HTTPException(status_code=400, detail="Invalid region type")
        return values


class IsochroneMultiCountPois(BaseModel):
    user_id: Optional[int]
    scenario_id: Optional[int] = 0
    amenities: List[str]
    minutes: int
    modus: str
    region: List[str]
    region_type: str
    speed: int
    active_upload_ids: Optional[List[int]] = [0]


class IsochroneMultiCountPoisProperties(BaseModel):
    gid: int
    count_pois: int
    region_name: str


class IsochroneMultiCountPoisFeature(Feature):
    geometry: Union[Polygon, MultiPolygon]
    properties: IsochroneMultiCountPoisProperties


class CalculationTypes(str, Enum):
    """Calculation types for isochrone."""

    default = "default"
    scenario = "scenario"


class IsochroneMode(Enum):
    WALKING = "walking"
    CYCLING = "cycling"
    TRANSIT = "transit"
    CAR = "car"


class IsochroneWalkingProfile(Enum):
    STANDARD = "standard"


class IsochroneCyclingProfile(Enum):
    STANDARD = "standard"


class IsochroneAccessMode(Enum):
    WALK = "walk"
    BICYCLE = "bicycle"
    CAR = "car"
    CAR_PARK = "car_park"


class IsochroneTransitMode(Enum):
    BUS = "bus"
    TRAM = "tram"
    RAIL = "rail"
    SUBWAY = "subway"
    FERRY = "ferry"
    CABLE_CAR = "cable_car"
    GONDOLA = "gondola"
    FUNICULAR = "funicular"


class IsochroneEgressMode(Enum):
    WALK = "walk"
    BICYCLE = "bicycle"


class IsochroneOutputType(Enum):
    GRID = "grid"
    GEOJSON = "geojson"
    NETWORK = "network"


class IsochroneDecayFunctionType(Enum):
    LOGISTIC = "logistic"
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    STEP = "step"


class IsochroneMultiRegionType(Enum):
    STUDY_AREA = "study_area"
    DRAW = "draw"


class IsochroneDecayFunction(BaseModel):
    type: Optional[str] = Field(
        IsochroneDecayFunctionType.LOGISTIC, description="Decay function type"
    )
    standard_deviation_minutes: Optional[int] = Field(
        12, description="Standard deviation in minutes"
    )
    width_minutes: Optional[int] = Field(10, description="Width in minutes")


class IsochroneSettings(BaseModel):
    # === SETTINGS FOR WALKING AND CYCLING ===#
    travel_time: int = Field(
        10,
        gt=0,
        description="Travel time in **minutes** for walking and cycling **(Not considered for PT or CAR)**",
    )
    speed: Optional[float] = Field(
        5,
        gt=0,
        le=25,
        description="Walking or Cycling speed in **km/h** **(Not considered for PT or CAR)**",
    )
    walking_profile: Optional[IsochroneWalkingProfile] = Field(
        IsochroneWalkingProfile.STANDARD.value,
        description="Walking profile. **(Not considered for PT)**",
    )
    cycling_profile: Optional[IsochroneCyclingProfile] = Field(
        IsochroneCyclingProfile.STANDARD.value,
        description="Cycling profile. **(Not considered for PT)**",
    )
    # === SETTINGS FOR CAR AND PT ===#
    departure_date: Optional[str] = Field("2022-04-25", description="(PT) Departure date")
    from_time: Optional[int] = Field(
        25200, gt=0, lt=86400, description="(PT) From time. Number of seconds since midnight"
    )
    to_time: Optional[int] = Field(
        39600, gt=0, lt=86400, description="(PT) To time . Number of seconds since midnight"
    )
    transit_modes: List[IsochroneTransitMode] = Field(
        [
            IsochroneTransitMode.BUS.value,
            IsochroneTransitMode.TRAM.value,
            IsochroneTransitMode.SUBWAY.value,
            IsochroneTransitMode.RAIL.value,
        ],
        description="(PT) Transit modes",
        unique_items=True,
    )
    access_mode: Optional[IsochroneAccessMode] = Field(
        IsochroneAccessMode.WALK, description="(PT) Access mode"
    )
    egress_mode: Optional[IsochroneEgressMode] = Field(
        IsochroneEgressMode.WALK, description="(PT) Egress mode"
    )
    bike_speed: Optional[float] = Field(15, gt=0, le=15, description="(PT) Bike speed")
    walk_speed: Optional[float] = Field(5, gt=0, le=15, description="(PT) Walk speed")
    bike_traffic_stress: Optional[int] = Field(
        4, ge=1, le=4, description="(PT) Bike traffic stress. 1: Low stress, 4: Very high stress"
    )
    max_rides: Optional[int] = Field(4, description="(PT) Max number of rides")
    max_bike_time: Optional[int] = Field(
        20,
        description="(PT) Max bike time (in minutes) to access and egress the transit network, or to make transfers within the network.",
    )
    max_walk_time: Optional[int] = Field(
        20,
        description="(PT) The maximum walking time (in minutes) to access and egress the transit network, or to make transfers within the network. Defaults to no restrictions, as long as max_trip_duration is respected. The max time is considered separately for each leg (e.g. if you set max_walk_time to 20, you could potentially walk up to 20 minutes to reach transit, and up to another 20 minutes to reach the destination after leaving transit).",
    )
    percentiles: Optional[List[int]] = Field(
        [5, 25, 50, 75, 95],
        description="(PT) Specifies the percentile to use when returning accessibility estimates within the given time window. Please note that this parameter is applied to the travel time estimates that generate the accessibility results, and not to the accessibility distribution itself (i.e. if the 25th percentile is specified, the accessibility is calculated from the 25th percentile travel time, which may or may not be equal to the 25th percentile of the accessibility distribution itself). Defaults to 50, returning the accessibility calculated from the median travel time. If a vector with length bigger than 1 is passed, the output contains an additional column that specifies the percentile of each accessibility estimate. Due to upstream restrictions, only 5 percentiles can be specified at a time. For more details, please see R5 documentation at https://docs.conveyal.com/analysis/methodology#accounting-for-variability.",
    )
    monte_carlo_draws: Optional[int] = Field(
        200,
        gt=0,
        le=200,
        description="(PT) The number of Monte Carlo draws to perform per time window minute when calculating travel time matrices and when estimating accessibility.",
    )
    decay_function: Optional[IsochroneDecayFunction] = Field(
        {
            "type": "logistic",
            "standard_deviation_minutes": 12,
            "width_minutes": 10,
        },
        description="(PT) A family of monotonically decreasing functions from travel times to weight factors in the range [0...1]. This determines how much an opportunity at a given travel time is weighted when included in an accessibility value",
    )


class IsochroneScenario(BaseModel):
    id: Optional[int] = Field(..., description="Scenario ID")
    modus: Optional[CalculationTypes] = Field(
        CalculationTypes.default, description="Scenario modus"
    )


class IsochroneStartingPointCoord(BaseModel):
    lat: float = Field(..., gt=-90, lt=90)
    lon: float = Field(..., gt=-180, lt=180)


class IsochroneStartingPoint(BaseModel):
    region_type: Optional[IsochroneMultiRegionType] = Field(
        IsochroneMultiRegionType.STUDY_AREA,
        description="The type of region to use for the multi-isochrone calculation",
    )
    region: Optional[List[str]] = Field(
        [],
        description="The region to use for the multi-isochrone calculation. If region_type is study_area, this is a list of study area IDs. If region_type is draw, this is a list of WKT polygons.",
    )
    input: Union[List[str], List[IsochroneStartingPointCoord]] = Field(
        ...,
        description="The input to use for the multi-isochrone calculation. It can be a list of amenities, or a list of coordinates.",
    )


class IsochroneOutput(BaseModel):
    type: Optional[IsochroneOutputType] = Field(
        IsochroneOutputType.GRID,
        description="The type of response isochrone is generated. If type is `grid`, the output is a grid of accessibility values on every cell. If type is `geojson`, the output is a geojson file with the accessibility distribution for every step.",
    )
    steps: Optional[int] = Field(2, description="Number of isochrone steps for 'geojson' output")
    resolution: Optional[int] = Field(
        9,
        description="GRID Resolution for `grid` output type. Default (9 for PT Isochrone, 10 for Waking and Cycling Isochrone",
    )


class IsochroneDTO(BaseModel):
    mode: IsochroneMode = Field(IsochroneAccessMode.WALK, description="Isochrone Mode")
    settings: IsochroneSettings = Field(..., description="Isochrone settings parameters")
    scenario: Optional[IsochroneScenario] = Field(
        {
            "id": 1,
            "modus": CalculationTypes.default,
        },
        description="Isochrone scenario parameters. Only supported for Walking and Cycling Isochrones",
    )
    starting_point: IsochroneStartingPoint = Field(
        ...,
        description="Isochrone starting points. If multiple starting points are specified, the isochrone is considered a multi-isochrone calculation. **Multi-Isochrone Only works for Walking and Cycling Isochrones**. Alternatively, amenities can be used to specify the starting points for multi-isochrones.",
    )
    output: Optional[IsochroneOutput] = Field(..., description="Isochrone output parameters")

    class Config:
        extra = "forbid"

    @root_validator
    def validate_output(cls, values):
        """Validate"""

        if not values.get("mode"):
            raise ValueError("Isochrone mode is required")

        if not values.get("starting_point"):
            raise ValueError("Isochrone starting point is required")

        # Validation check on grid resolution and number of steps for geojson
        if values["output"].type.value == IsochroneOutputType.GRID.value and values[
            "output"
        ].resolution not in [9, 10]:
            raise ValueError("Resolution must be 9 or 10")
        if values["output"].type.value == IsochroneOutputType.GEOJSON.value and (
            values["output"].steps > 6 or values["output"].steps < 1
        ):
            raise ValueError("Step must be between 1 and 6")

        # Don't allow multi-isochrone calculation for PT and Car Isochrone
        if len(values["starting_point"].input) > 1 and values["mode"].value in [
            IsochroneMode.TRANSIT.value,
            IsochroneMode.CAR.value,
        ]:
            raise ValueError("Multi-Isochrone is not supported for Transit and Car")

        # For walking and cycling travel time maximumn should be 20 minutes
        if values["mode"].value in [IsochroneMode.WALKING.value, IsochroneMode.CYCLING.value]:
            if values["settings"].travel_time >= 20:
                raise ValueError(
                    "Travel time maximum for walking and cycling should be less or equal to 20 minutes"
                )

        # For PT and Car Isochrone starting point should be only lat lon coordinates and not amenities, travel time smaller than 120 minutes
        if values["mode"].value in [
            IsochroneMode.TRANSIT.value,
            IsochroneMode.CAR.value,
        ]:
            if values["output"].type.value in [
                IsochroneOutputType.GEOJSON.value,
                IsochroneOutputType.NETWORK.value,
            ]:
                raise ValueError("Geojson output is not supported for PT and Car")
            # travel time should be smaller than 120 minutes
            if values["settings"].travel_time > 120:
                raise ValueError("Travel time should be smaller than 120 minutes")

            if len(values["starting_point"].input) > 0:
                for point in values["starting_point"].input:
                    if not isinstance(point, IsochroneStartingPointCoord):
                        raise ValueError("Starting point should be lat lon coordinates")

            # from_time should be smaller than to_time
            if values["settings"].from_time > values["settings"].to_time:
                raise ValueError("Start time should be smaller than end time")

            # convert bike speed to m/s
            values["settings"].bike_speed = values["settings"].bike_speed / 3.6
            # convert walk speed to m/s
            values["settings"].walk_speed = values["settings"].walk_speed / 3.6

        # If starting-point input length is more than 1 then it should be multi-isochrone and region should be specified
        if len(values["starting_point"].input) > 1 and len(values["starting_point"].region) == 0:
            raise ValueError("Region is not specified for multi-isochrone")

        return values


request_examples = {
    "isochrone": {
        "single_walking_default": {
            "summary": "Single Walking Isochrone with Default Profile",
            "value": {
                "mode": "walking",
                "settings": {
                    "travel_time": "10",
                    "speed": "5",
                    "walking_profile": "standard",
                },
                "starting_point": {
                    "input": [{"lat": 48.1502132, "lon": 11.5696284}],
                },
                "scenario": {"id": 0, "modus": "default"},
                "output": {
                    "type": "geojson",
                    "steps": "3",
                },
            },
        },
        "pois_multi_isochrone": {
            "summary": "Multi Isochrone with Pois",
            "value": {
                "mode": "walking",
                "settings": {
                    "travel_time": "10",
                    "speed": "5",
                    "walking_profile": "standard",
                },
                "starting_point": {
                    "input": ["nursery", "kindergarten"],
                    "region_type": "study_area",
                    "region": 1,
                },
                "output": {
                    "type": "geojson",
                    "steps": "3",
                },
            },
        },
        "transit_single": {
            "summary": "Single Transit Isochrone",
            "value": {
                "mode": "transit",
                "settings": {
                    "travel_time": "60",
                    "transit_modes": ["bus", "tram", "subway", "rail"],
                    "departure_date": "2022-04-25",
                    "access_mode": "walk",
                    "egress_mode": "walk",
                    "bike_traffic_stress": 4,
                    "from_time": 25200,
                    "to_time": 39600,
                    "max_rides": 4,
                    "max_bike_time": 20,
                    "max_walk_time": 20,
                    "percentiles": [5, 25, 50, 75, 95],
                    "monte_carlo_draws": 200,
                    "decay_function": {
                        "type": "logistic",
                        "standard_deviation_minutes": 12,
                        "width_minutes": 10,
                    },
                },
                "starting_point": {
                    "input": [{"lat": 48.1502132, "lon": 11.5696284}],
                },
                "scenario": {"id": 0, "modus": "default"},
                "output": {
                    "type": "grid",
                    "resolution": "9",
                },
            },
        },
    },
}
