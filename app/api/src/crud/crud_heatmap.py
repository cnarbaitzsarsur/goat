import asyncio
import bz2
import json
import os
import time
import math 
from typing import List

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
from codetiming import Timer
from geoalchemy2.functions import ST_Dump
from rich import print
from shapely.geometry import Polygon
from sqlalchemy.ext.asyncio.session import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.sql import delete, select, text
from sqlalchemy.sql.functions import func

from src import crud, schemas
from src.core.isochrone import heatmap_multiprocessing, prepare_network_isochrone
from src.crud.base import CRUDBase
from src.db import models
from src.db.session import async_session, legacy_engine, sync_session
from src.endpoints import deps
from src.resources.enums import (
    RoutingTypes,
)
from src.schemas.heatmap import (
    HeatmapMode,
    HeatmapBaseSpeed,
    HeatmapSettings,
    HeatmapType,
    HeatmapWalkingBulkResolution,
    HeatmapWalkingCalculationResolution,
)
from src.schemas.isochrone import (
    IsochroneDTO,
    IsochroneMode,
    IsochroneOutput,
    IsochroneOutputType,
    IsochroneScenario,
    IsochroneSettings,
    IsochroneStartingPoint,
    IsochroneStartingPointCoord,
)
from src.utils import (
    create_dir,
    delete_dir,
    delete_file,
    print_hashtags,
    print_info,
    print_warning,
)

poi_layers = {
    "poi": models.Poi,
    "poi_modified": models.PoiModified,
    "poi_user": models.PoiUser,
}


class CRUDGridCalculation(
    CRUDBase[models.GridCalculation, models.GridCalculation, models.GridCalculation]
):
    pass


import os


# TODO: Refactor filepaths using os.path.join
class CRUDHeatmap:
    def __init__(self, db, db_sync, current_user):
        self.db = db
        self.db_sync = db_sync
        self.current_user = current_user
        self.multi_processing_bulk_size = 50
        self.path_traveltime_matrices = "/app/src/cache/traveltime_matrices"
        self.path_opportunity_matrices = "/app/src/cache/opportunity_matrices"

    async def read_h3_grids_study_areas(
        self, resolution: int, buffer_size: int, study_area_ids: list[int] = None
    ) -> list[str]:

        """Reads grid ids for study areas.

        Args:
            resolution (int): H3 resolution for grids.
            buffer_size (int): Buffer size in meters.
            study_area_ids (list[int], optional): List of study area ids. Defaults to None and will use all study area.

        Returns:
            list[str]: List of grid ids.
        """

        # Get relevant study areas
        if study_area_ids is None:
            statement = select(models.StudyArea.id)
        else:
            statement = select(models.StudyArea.id).where(models.StudyArea.id.in_(study_area_ids))
        study_area_ids = await self.db.execute(statement)
        study_area_ids = study_area_ids.scalars().all()
        print_info(f"Processing will be done for Study area ids: {str(study_area_ids)[1:-1]}")

        # Get buffer size
        buffer_size = buffer_size + h3.edge_length(resolution, "m")

        # # Get unioned study areas
        # # Doing this in Raw SQL because query could not be build with SQLAlchemy ORM
        # TODO: Reduce the amount of grids
        sql_query = text(
            f"""
            SELECT ST_AsGeoJSON(ST_BUFFER(geom::geography, :buffer_size)::geometry) AS geom
            FROM
            ( 
                SELECT (ST_DUMP(geom)).geom AS geom
                FROM basic.study_area sa
                WHERE sa.id = :study_area_id
            ) AS dumped
        """
        )
        union_geoms = [
            self.db.execute(sql_query, {"study_area_id": i, "buffer_size": buffer_size})
            for i in study_area_ids
        ]
        union_geoms = await asyncio.gather(*union_geoms)
        union_geoms = [geom.fetchall() for geom in union_geoms][0]
        union_geoms_json = [json.loads(geom[0]) for geom in union_geoms]

        #  Get all grids for the bulk resolution
        bulk_ids = []
        for geom in union_geoms_json:
            if geom["type"] != "Polygon":
                raise ValueError("Unioned Study area geometries are not a of type polygon.")

            bulk_ids.extend(list(h3.polyfill_geojson(geom, resolution)))

        # kring_buffer = ceil(buffer_size / h3.edge_length(resolution, "m"))
        bulk_ids = list(set(bulk_ids))
        # bulk_ids = set().union(*[set().union(*h3.k_ring_distances(i, kring_buffer)) for i in bulk_ids])
        # Testing grids for the bulk resolution

        # # Get hexagon geometries and convert to GeoDataFrame
        hex_polygons = lambda hex_id: Polygon(h3.h3_to_geo_boundary(hex_id, geo_json=True))
        hex_polygons = gpd.GeoSeries(list(map(hex_polygons, bulk_ids)), crs="EPSG:4326")
        gdf = gpd.GeoDataFrame(data={"bulk_id": bulk_ids}, geometry=hex_polygons, crs="EPSG:4326")
        gdf.to_file("hex_polygons.geojson", driver="GeoJSON")

        return bulk_ids

    async def prepare_bulk_objs(
        self,
        bulk_resolution: int,
        calculation_resolution: int,
        buffer_size: float,
        study_area_ids: list[int] = None,
    ) -> dict:

        """Created the starting points for the traveltime matrix calculation.

        Args:
            db (AsyncSession): Database session.
            bulk_resolution (int): H3 resolution for the bulk grids.
            calculation_resolution (int): H3 resolution for the calculation grids.
            study_area_ids (list[int], optional): List of study area ids. Defaults to None and will use all study area.

        Raises:
            ValueError: If the bulk resolution is smaller than the calculation resolution.

        Returns:
            dict: Hierarchical structure of starting points for the calculation using the bulk resolution as parent and calculation resolution as children.
        """
        begin = time.time()
        if bulk_resolution >= calculation_resolution:
            raise ValueError(
                "Resolution of parent grid cannot be smaller then resolution of children grid."
            )

        print_hashtags()
        print_info("Preparing starting points for heatmap calculation")

        begin = time.time()
        # Get unioned study areas
        bulk_ids = await self.read_h3_grids_study_areas(
            resolution=bulk_resolution, buffer_size=buffer_size, study_area_ids=study_area_ids
        )
        end = time.time()
        print_info(f"Time to get bulk ids: {end - begin}")

        # Get all grids for the calculation resolution that are children of the bulk resolution
        calculation_objs = {}
        cnt_calculation_ids = 0

        for bulk_id in bulk_ids:
            lons = []
            lats = []
            calculation_ids = h3.h3_to_children(bulk_id, calculation_resolution)
            starting_point_objs = []
            coords = []
            calculation_objs[bulk_id] = {}
            for calculation_id in calculation_ids:
                lat, lon = h3.h3_to_geo(calculation_id)
                coords.append([lon, lat])
                starting_point_objs.append(IsochroneStartingPointCoord(lat=lat, lon=lon))
                lons.append(lon)
                lats.append(lat)
            calculation_objs[bulk_id]["calculation_ids"] = list(calculation_ids)
            calculation_objs[bulk_id]["coords"] = coords
            calculation_objs[bulk_id]["starting_point_objs"] = starting_point_objs
            cnt_calculation_ids += len(calculation_ids)


            # Get buffered extents for grid size
            gdf_starting_points = gpd.points_from_xy(x=lons, y=lats, crs="epsg:4326")
            gdf_starting_points = gdf_starting_points.to_crs(epsg=3395)
            extents = gdf_starting_points.buffer(buffer_size * math.sqrt(2), cap_style=3)
            extents = extents.to_crs(epsg=3857)
            extents = extents.bounds
            extents = extents.tolist()
            calculation_objs[bulk_id]["extents"] = extents
            calculation_objs[bulk_id]["lats"] = lats
            calculation_objs[bulk_id]["lons"] = lons

        end = time.time()
        print_info(f"Number of bulk grids: {len(bulk_ids)}")
        print_info(f"Number of calculation grids: {cnt_calculation_ids}")
        print_info(f"Calculation time: {end - begin} seconds")
        print_hashtags()
        return calculation_objs

    async def compute_traveltime_active_mobility(
        self, isochrone_dto: IsochroneDTO, calculation_objs: dict
    ):
        """Computes the traveltime for active mobility in matrix style.

        Args:
            isochrone_dto (IsochroneDTO): Settings for the isochrone calculation
            calculation_objs (dict): Hierarchical structure of starting points for the calculation using the bulk resolution as parent and calculation resolution as children.
        """
        starting_time = time.time()

        cnt = 0
        cnt_sections = len(calculation_objs)

        routing_profile = None
        if isochrone_dto.mode.value == IsochroneMode.WALKING.value:
            routing_profile = (
                isochrone_dto.mode.value + "_" + isochrone_dto.settings.walking_profile.value
            )
        elif isochrone_dto.mode.value == IsochroneMode.CYCLING.value:
            routing_profile = (
                isochrone_dto.mode.value + "_" + isochrone_dto.settings.cycling_profile.value
            )

        for key, obj in calculation_objs.items():
            starting_time_section = time.time()
            starting_time_network_preparation = time.time()
            cnt += 1
            cnt_theoretical_starting_points = len(obj["starting_point_objs"])
            # Check if there are no starting points
            if len(obj["starting_point_objs"]) == 0:
                print_info(
                    f"No starting points for section [bold magenta]{str(cnt)}[/bold magenta]"
                )
                continue

            # Prepare starting points using routing network
            starting_ids = await self.db.execute(
                func.basic.heatmap_prepare_artificial(
                    obj["lons"],
                    obj["lats"],
                    isochrone_dto.settings.travel_time * 60,
                    isochrone_dto.settings.speed,
                    isochrone_dto.scenario.modus.value,
                    isochrone_dto.scenario.id,
                    routing_profile,
                )
            )
            await self.db.commit()
            starting_ids = starting_ids.scalars().all()
            starting_ids = np.array(starting_ids)
            starting_ids.sort()
            theoretical_starting_ids = np.arange(
                2147483647 - cnt_theoretical_starting_points + 1, 2147483647 + 1
            )
            valid_starting_ids = np.isin(theoretical_starting_ids, starting_ids)
            grid_ids = np.array(obj["calculation_ids"])[valid_starting_ids]
            extents = np.array(obj["extents"])[valid_starting_ids]
            starting_point_objs = np.array(obj["starting_point_objs"])[valid_starting_ids]
            isochrone_dto.starting_point.input = starting_point_objs

            # Read network
            network = await crud.isochrone.read_network(
                db=self.db,
                obj_in=isochrone_dto,
                current_user=self.current_user,
                isochrone_type=schemas.isochrone.IsochroneTypeEnum.heatmap.value,
            )
            network = network[0]
            network = network.iloc[1:, :]

            # Get end time for network preparation
            end_time_network_preparation = time.time()

            (
                adj_list,
                edges_source,
                edges_target,
                edges_cost,
                edges_reverse_cost,
                edges_geom,
                edges_length,
                unordered_map,
                node_coords,
                total_extent,
            ) = prepare_network_isochrone(edge_network_input=network)

            # Prepare heatmap calculation objects
            heatmapObject = []
            for i in range(0, len(starting_ids), self.multi_processing_bulk_size):
                starting_ids_bulk = starting_ids[i : i + self.multi_processing_bulk_size]
                grid_ids_bulk = grid_ids[i : i + self.multi_processing_bulk_size]
                extents_bulk = extents[i : i + self.multi_processing_bulk_size]
                singleHeatmapIsochrone = (
                    edges_source,
                    edges_target,
                    edges_cost,
                    edges_reverse_cost,
                    edges_geom,
                    edges_length,
                    unordered_map,
                    node_coords,
                    extents_bulk.tolist(),
                    starting_ids_bulk.tolist(),
                    grid_ids_bulk.tolist(),
                    isochrone_dto.settings.travel_time,
                    isochrone_dto.output.resolution,
                )

                heatmapObject.append(singleHeatmapIsochrone)

            # Run multiprocessing
            traveltimeobjs = heatmap_multiprocessing(heatmapObject)

            # Save files into cache folder
            file_dir = f"{self.path_traveltime_matrices}/{isochrone_dto.mode.value}/{isochrone_dto.settings.walking_profile.value}/{key}.npz"
            delete_file(file_dir)
            np.savez_compressed(
                file_dir,
                **traveltimeobjs,
            )

            end_time_section = time.time()

            print_hashtags()
            print_info(
                f"You computed [bold magenta]{cnt}[/bold magenta] out of [bold magenta]{cnt_sections}[/bold magenta] added."
            )
            print_info(
                f"Section contains [bold magenta]{starting_ids.size}[/bold magenta] starting points"
            )
            print_info(
                f"Section took [bold magenta]{(end_time_section - starting_time_section)}[/bold magenta] seconds"
            )
            print_info(
                f"Network preparation took [bold magenta]{(end_time_network_preparation - starting_time_network_preparation)}[/bold magenta] seconds"
            )
            print_hashtags()

        end_time = time.time()
        print_hashtags()
        print_info(
            f"Total time: [bold magenta]{(end_time - starting_time)}[/bold magenta] seconds"
        )

    async def compute_opportunity_matrix(
        self, isochrone_dto: IsochroneDTO, calculation_objs: dict
    ):
        """Computes opportunity matrix

        Args:
            isochrone_dto (IsochroneDTO): _description_
            calculation_objs (dict): _description_
        """

        # Read relevant pois
        filter_geoms = []
        bulk_ids = list(calculation_objs.keys())
        for bulk_id in bulk_ids:
            coords = h3.h3_to_geo_boundary(h=bulk_id, geo_json=True)
            coords_str = ""
            for coord in coords:
                coords_str = coords_str + str(coord[0]) + " " + str(coord[1]) + ", "
            coords_str = coords_str + str(coords[0][0]) + " " + str(coords[0][1])
            filter_geoms.append(f"POLYGON(({coords_str}))")

        pois = await self.read_poi(
            isochrone_dto=isochrone_dto, table_name="poi", filter_geoms=filter_geoms, bulk_ids=bulk_ids
        )

        # Read relevant opportunity matrices and merged arrays
        travel_time_matrices_north = []
        travel_time_matrices_west = []
        travel_time_matrices_south = []
        travel_time_matrices_east = []
        travel_time_matrices_height = []
        travel_time_matrices_width = []
        travel_time_matrices_grids_ids = []
        travel_time_matrices_travel_times = []

        # TODO Performance improvements here (consider multiprocessing)
        begin = time.time()

        test_obj = {"861f81537ffffff": calculation_objs["861f81537ffffff"]}

        for key in test_obj:#calculation_objs["861f81537ffffff"]:
            matrix = np.load(
                f"{self.path_traveltime_matrices}/{isochrone_dto.mode.value}/{isochrone_dto.settings.walking_profile.value}/{key}.npz",
                allow_pickle=True,
            )

            travel_time_matrices_north.append(matrix["north"])
            travel_time_matrices_west.append(matrix["west"])
            travel_time_matrices_south.append(matrix["north"] + matrix["height"] - 1)
            travel_time_matrices_east.append(matrix["west"] + matrix["width"] - 1)
            travel_time_matrices_travel_times.append(matrix["travel_times"])
            travel_time_matrices_height.append(matrix["height"])
            travel_time_matrices_width.append(matrix["width"])
            travel_time_matrices_grids_ids.append(matrix["grid_ids"])

        travel_time_matrices_north = np.concatenate(travel_time_matrices_north)
        travel_time_matrices_west = np.concatenate(travel_time_matrices_west)
        travel_time_matrices_south = np.concatenate(travel_time_matrices_south)
        travel_time_matrices_east = np.concatenate(travel_time_matrices_east)
        travel_time_matrices_travel_times = np.concatenate(travel_time_matrices_travel_times)
        travel_time_matrices_height = np.concatenate(travel_time_matrices_height)
        travel_time_matrices_width = np.concatenate(travel_time_matrices_width)
        travel_time_matrices_grids_ids = np.concatenate(travel_time_matrices_grids_ids)

        # Loop through all POIs
        # TODO Performance improvements here (consider multiprocessing) and avoid loops
        pois = {"861f81537ffffff": pois["861f81537ffffff"]}
        for bulk_id in pois:
            poi_bulk = pois[bulk_id]
            poi_matrix = {}
            for poi in poi_bulk:
                uid, category, name, x, y = poi

                indices_relevant_matrices = (
                    (travel_time_matrices_north <= x)
                    & (travel_time_matrices_south >= x)
                    & (travel_time_matrices_west <= y)
                    & (travel_time_matrices_east >= y)
                ).nonzero()[0]
                relevant_traveltime_matrices = travel_time_matrices_travel_times[
                    indices_relevant_matrices
                ]
                indices_travel_times = (
                    (x - travel_time_matrices_north[indices_relevant_matrices])
                    * travel_time_matrices_width[indices_relevant_matrices]
                    + y
                    - travel_time_matrices_west[indices_relevant_matrices]
                )

                arr_travel_times = []
                arr_grid_ids = []

                cnt = 0
                # TODO: Avoid this loop by selecting the indices directly from nested array
                for idx, matrix in enumerate(relevant_traveltime_matrices):
                    travel_time = matrix[indices_travel_times[idx]]

                    if travel_time < 2147483647:
                        arr_travel_times.append(travel_time)
                        arr_grid_ids.append(travel_time_matrices_grids_ids[idx])
                    else:
                        cnt += 1
                arr_travel_times = np.array(arr_travel_times)
                arr_grid_ids = np.array(arr_grid_ids)

                if category in poi_matrix and len(arr_travel_times) > 0:
                    poi_matrix[category]["travel_times"].append(arr_travel_times)
                    poi_matrix[category]["grid_ids"].append(arr_grid_ids)
                    poi_matrix[category]["uids"].append(uid)
                    poi_matrix[category]["names"].append(name)
                elif len(arr_travel_times) > 0:
                    poi_matrix[category] = {}
                    poi_matrix[category]["travel_times"] = [arr_travel_times]
                    poi_matrix[category]["grid_ids"] = [arr_grid_ids]
                    poi_matrix[category]["uids"] = [uid]
                    poi_matrix[category]["names"] = [name]
                else:
                    continue
            for category in poi_matrix:
                poi_matrix[category]["travel_times"] = np.array(
                    poi_matrix[category]["travel_times"], dtype=object
                )
                poi_matrix[category]["grid_ids"] = np.array(
                    poi_matrix[category]["grid_ids"], dtype=object
                )
                poi_matrix[category]["uids"] = np.array(poi_matrix[category]["uids"], dtype=object)
                poi_matrix[category]["names"] = np.array(
                    poi_matrix[category]["names"], dtype=object
                )

                dir = f"{self.path_opportunity_matrices}/{isochrone_dto.mode.value}/{isochrone_dto.settings.walking_profile.value}/{bulk_id}"
                create_dir(dir)
                np.savez(
                    f"{dir}/{category}.npz",
                    **poi_matrix[category],
                )

    async def read_poi(
        self,
        isochrone_dto: IsochroneDTO,
        table_name: str,
        filter_geoms: List[str],
        data_upload_id: int = None,
        bulk_ids: List[int] = None,
    ) -> pd.DataFrame:
        """Read POIs from database for given filter geoms

        Args:
            isochrone_dto (IsochroneDTO): Settings for the isochrone calculation
            table_name (str): Name of the POI table
            filter_geoms (List[str]): Geometries to filter the POIs
            data_upload_id (int, optional): Upload ids for poi_user. Defaults to None.

        Raises:
            ValueError: If table_name is not poi or poi_user

        Returns:
            POIs (List): Nested list of POIs
        """

        if table_name == "poi":
            sql_query = f"""
                SELECT :bulk_id AS bulk_id, p.uid, p.category, p.name, pixel[1] AS x, pixel[2] AS y
                FROM basic.poi p, LATERAL basic.coordinate_to_pixel(ST_Y(p.geom), ST_X(p.geom), :pixel_resolution) AS pixel
                WHERE ST_Intersects(p.geom, ST_GeomFromText(:filter_geom, 4326))
                AND category = 'nursery'
            """
            sql_params = {}
        elif table_name == "poi_user" and data_upload_id is not None:
            sql_query = f"""
                SELECT :bulk_id AS bulk_id, p.uid, p.category, p.name, pixel[1] AS x, pixel[2] AS y
                FROM basic.poi_user p, LATERAL basic.coordinate_to_pixel(ST_Y(p.geom), ST_X(p.geom), :pixel_resolution) AS pixel
                WHERE ST_Intersects(p.geom, ST_GeomFromText(:filter_geom, 4326))
                AND p.data_upload_id = :data_upload_id
            """
            sql_params = {"data_upload_id": data_upload_id}

        else:
            raise ValueError(f"Table name {table_name} is not a valid poi table name")

        pois = [
            self.db.execute(
                sql_query,
                sql_params
                | {
                    "bulk_id": bulk_ids[idx],
                    "filter_geom": filter_geom,
                    "pixel_resolution": isochrone_dto.output.resolution,
                },
            )
            for idx, filter_geom in enumerate(filter_geoms)
        ]

        pois = await asyncio.gather(*pois)
        pois = [batch.fetchall() for batch in pois]
        pois_dict = {}
        for idx_bulk, batch in enumerate(pois):
            if len(batch) > 0:
                bulk_id = batch[0][0]
                batch = [poi[1:] for poi in batch]
                pois_dict[bulk_id] = batch
        return pois_dict

    async def execute_pre_calculation(
        self,
        isochrone_dto: IsochroneDTO,
        bulk_resolution: HeatmapWalkingBulkResolution,
        calculation_resolution: HeatmapWalkingCalculationResolution,
        study_area_ids: list[int] = None,
    ):
        """Executes pre-calculation for the heatmaps

        Args:
            isochrone_dto (IsochroneDTO): Settings for the isochrone calculation
            bulk_resolution (int): H3 resolution for the bulk grids.
            calculation_resolution (int): H3 resolution for the calculation grids.
            study_area_ids (list[int], optional): List of study area ids. Defaults to None and will use all study area.
        """

        buffer_size = isochrone_dto.settings.speed * (isochrone_dto.settings.travel_time * 60)

        # Get calculation objects
        calculation_objs = await self.prepare_bulk_objs(
            study_area_ids=study_area_ids,
            bulk_resolution=bulk_resolution,
            calculation_resolution=calculation_resolution,
            buffer_size=buffer_size,
        )

        await self.compute_traveltime_active_mobility(
            isochrone_dto=isochrone_dto,
            calculation_objs=calculation_objs,
        )

        await self.compute_opportunity_matrix(
            isochrone_dto=isochrone_dto,
            calculation_objs=calculation_objs,
        )

    async def get_categories_opportunities(self, heatmap_settings: HeatmapSettings) -> list[str]:
        """Get all categories from the heatmap config

        Args:
            heatmap_settings (HeatmapSettings): Heatmap settings

        Returns:
            list: List of categories
        """
        categories = []
        if heatmap_settings.heatmap_type == HeatmapType.closest:
            for category in heatmap_settings.heatmap_config["opportunity"]["poi"]:
                categories.append(category)

        return categories

    async def read_opportunity_matrix(
        self,
        matrix_base_path: str,
        category: str,
        bulk_ids: list[str],
    ):
        arr_travel_times = []
        arr_grid_ids = []
        matrix = None
        matrix_df = None
        for bulk_id in bulk_ids:
            try:
                matrix = np.load(
                    os.path.join(matrix_base_path, bulk_id, category + ".npz"),
                    allow_pickle=True,
                )
                arr_travel_times.append(np.concatenate(matrix["travel_times"]))
                arr_grid_ids.append(np.concatenate(matrix["grid_ids"]))
            except FileNotFoundError:
                continue

        if arr_travel_times != []:
            flat_travel_times = np.concatenate(arr_travel_times)
            flat_grid_ids = np.concatenate(arr_grid_ids)
            begin = time.time()
            matrix_df = pd.DataFrame({"grid_id": flat_grid_ids, "travel_time": flat_travel_times})
            end = time.time()
            print("Time to create df", end - begin)

        return matrix_df

    async def read_heatmap(
        self,
        heatmap_settings: HeatmapSettings,
        current_user: models.User,
        study_area_ids: list[int] = None,
    ) -> list[dict]:

        speed = HeatmapBaseSpeed[heatmap_settings.mode.value].value
        buffer_size = (speed / 3.6) * (heatmap_settings.max_travel_time * 60)
        begin = time.time()
        bulk_ids = await self.read_h3_grids_study_areas(
            resolution=6, buffer_size=buffer_size, study_area_ids=study_area_ids
        )
        end = time.time()
        opportunities = await self.get_categories_opportunities(heatmap_settings)
        if heatmap_settings.mode == HeatmapMode.walking:
            profile = heatmap_settings.walking_profile.value
        elif heatmap_settings.mode == HeatmapMode.cycling:
            profile = heatmap_settings.cycling_profile.value

        matrix_base_path = (
            f"{self.path_opportunity_matrices}/{heatmap_settings.mode.value}/{profile}/"
        )

        for category in opportunities:
            matrix_df = await self.read_opportunity_matrix(
                matrix_base_path=matrix_base_path, category=category, bulk_ids=bulk_ids
            )
            if matrix_df is not None:
                matrix_min_travel_time = matrix_df.groupby("grid_id").min().reset_index()

        grid_ids = matrix_min_travel_time["grid_id"]
        travel_times = matrix_min_travel_time["travel_time"]

        # # Get hexagon geometries and convert to GeoDataFrame
        hex_polygons = lambda hex_id: Polygon(h3.h3_to_geo_boundary(hex_id, geo_json=True))
        hex_polygons = gpd.GeoSeries(list(map(hex_polygons, matrix_min_travel_time["grid_id"].tolist())), crs="EPSG:4326")
        gdf=gpd.GeoDataFrame(data={"grid_ids": matrix_min_travel_time["grid_id"], "travel_times": matrix_min_travel_time["travel_time"]}, geometry=hex_polygons)
        gdf.to_file("test_results.geojson", driver="GeoJSON")
        print(f"Read study areas: {end - begin}")


        

def test_heatmap():
    """Test heatmap calculation"""
    db = async_session()
    db_sync = sync_session()
    superuser = asyncio.get_event_loop().run_until_complete(
        CRUDBase(models.User).get_by_key(db, key="id", value=15)
    )
    superuser = superuser[0]
    heatmap_setting = HeatmapSettings(
        mode="walking",
        max_travel_time=20,
        walking_profile="standard",
        scenario=IsochroneScenario(
            id=1,
            name="Default",
        ),
        analysis_unit="building",
        heatmap_type="closest",
        heatmap_config={
            "opportunity": {
                "poi": [
                    "nursery",
                    # "kindergarten",
                    # "grundschule",
                    # "realschule",
                    # "gymnasium",
                    # "restaurant",
                    # "fast_food",
                    # "bar",
                    # "pub",
                    # "cafe",
                    # "nightclub",
                    # "bus_stop",
                    # "tram_stop",
                    # "subway_entrance",
                    # "rail_station",
                    # "bike_sharing",
                    # "car_sharing",
                    # "charging_station",
                    # "dentist",
                    # "general_practitioner",
                    # "pharmacy",
                    # "atm",
                    # "bank",
                    # "post_office",
                    # "post_box",
                    # "fuel",
                    # "recycling",
                    # "supermarket",
                    # "discount_supermarket",
                    # "hypermarket",
                    # "organic_supermarket",
                    # "convenience",
                    # "marketplace",
                    # "bakery",
                    # "butcher",
                    # "cinema",
                    # "museum",
                    # "hotel",
                    # "playground",
                    # "gym",
                    # "discount_gym",
                    # "yoga",
                    # "park",
                    # "forest",
                    # "hauptschule_mittelschule",
                ]
            }
        },
        return_type="geojson",
    )

    crud_heatmap = CRUDHeatmap(db=db, db_sync=db_sync, current_user=superuser)
    asyncio.get_event_loop().run_until_complete(
        crud_heatmap.read_heatmap(
            heatmap_settings=heatmap_setting,
            current_user=superuser,
            study_area_ids=[
                #91620000,
                83110000,
                # 9184,
                # 9263,
                # 9274,
                # 9186,
                # 9188,
                # 9361,
                # 9362,
                # 9363,
                # 9461,
                # 9462,
                # 9463,
            ],
        )
    )





def main():
    # Get superuser
    db = async_session()
    db_sync = sync_session()
    superuser = asyncio.get_event_loop().run_until_complete(
        CRUDBase(models.User).get_by_key(db, key="id", value=15)
    )
    superuser = superuser[0]

    isochrone_dto = IsochroneDTO(
        mode="walking",
        settings=IsochroneSettings(
            travel_time=20,
            speed=5,
            walking_profile=RoutingTypes["walking_standard"].value.split("_")[1],
        ),
        starting_point=IsochroneStartingPoint(
            input=[
                IsochroneStartingPointCoord(lat=0, lon=0)
            ],  # Dummy points will be replaced in the function
            region_type="study_area",  # Dummy to avoid validation error
            region=[1, 2, 3],  # Dummy to avoid validation error
        ),
        output=IsochroneOutput(
            format=IsochroneOutputType.GRID,
            resolution=12,
        ),
        scenario=IsochroneScenario(
            id=1,
            name="Default",
        ),
    )

    crud_heatmap = CRUDHeatmap(db=db, db_sync=db_sync, current_user=superuser)
    asyncio.get_event_loop().run_until_complete(
        crud_heatmap.execute_pre_calculation(
            isochrone_dto=isochrone_dto,
            bulk_resolution=HeatmapWalkingBulkResolution["resolution"],
            calculation_resolution=HeatmapWalkingCalculationResolution["resolution"],
            study_area_ids=[
                83110000,
            ],
        )
    )

    print("Heatmap is finished. Press Ctrl+C to exit.")
    input()


main()
#test_heatmap()