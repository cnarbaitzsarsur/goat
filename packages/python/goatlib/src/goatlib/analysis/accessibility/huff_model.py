
import logging
import uuid
from pathlib import Path
from typing import Self

from goatlib.analysis.accessibility.base import HeatmapToolBase, sanitize_sql_name
from goatlib.io.parquet import write_optimized_parquet

from goatlib.analysis.schemas.heatmap import (
    HuffmodelParams
)
from goatlib.io.utils import Metadata
from goatlib.models.io import DatasetMetadata

logger = logging.getLogger(__name__)


class HuffmodelTool(HeatmapToolBase):
    """
    Computes Huffmode
    """

    def _run_implementation(
        self: Self, params: HuffmodelParams
    ) -> list[tuple[Path, DatasetMetadata]]:
        logger.info("Starting Huff Model Analysis")
        # Register OD matrix and detect H3 resolution
        od_table, h3_resolution = self._prepare_od_matrix(
            params.od_matrix_path, params.od_column_map
        )
        logger.info(
            "OD matrix ready: table=%s, h3_resolution=%s", od_table, h3_resolution
        )

        meta, reference_table = self.import_input(
            params.reference_area_path, table_name="reference_area"
        )
        logger.info("Reference area processed ")

        reference_table_h3 = self._process_table_to_h3(
            reference_table, meta, h3_resolution, "reference_area_h3", "study_area_id"
        )

        opportunity_meta, opportunity_table = self._process_opportunity(
            params.opportunity_path, params.attractivity, h3_resolution
        )
        logger.info("Opportunity table created: %s", opportunity_table)

        # Process demand layer
        demand_table = self._process_demand(params.demand_path, params.demand_field, h3_resolution)
        logger.info("Demand table created: %s", demand_table)

        # Filter opportunities and demand to study area using SQL (more efficient than Python)
        self.con.execute(f"""
            CREATE OR REPLACE TEMP TABLE {opportunity_table}_filtered AS
            SELECT o.* FROM {opportunity_table} o
            WHERE o.dest_id IN (SELECT study_area_id FROM {reference_table_h3})
        """)
        opportunity_table_filtered = f"{opportunity_table}_filtered"
        
        self.con.execute(f"""
            CREATE OR REPLACE TEMP TABLE {demand_table}_filtered AS
            SELECT d.* FROM {demand_table} d
            WHERE d.orig_id IN (SELECT study_area_id FROM {reference_table_h3})
        """)
        demand_table_filtered = f"{demand_table}_filtered"
        
        # Get counts for logging and validation
        dest_count = self.con.execute(f"SELECT COUNT(DISTINCT dest_id) FROM {opportunity_table_filtered}").fetchone()[0]
        demand_count = self.con.execute(f"SELECT COUNT(DISTINCT orig_id) FROM {demand_table_filtered}").fetchone()[0]
        
        if dest_count == 0:
            raise ValueError("No opportunity IDs found in opportunity data within study area")
        if demand_count == 0:
            raise ValueError("No demand IDs found in demand data within study area")

        logger.info("Found %d unique opportunity IDs in study area", dest_count)
        logger.info("Found %d unique demand IDs in study area", demand_count)

        # Filter OD matrix using SQL JOINs (more efficient than Python list filtering)
        filtered_matrix = "od_matrix_filtered"
        self.con.execute(f"""
            CREATE OR REPLACE TEMP TABLE {filtered_matrix} AS
            SELECT m.* FROM {od_table} m
            WHERE m.dest_id IN (SELECT dest_id FROM {opportunity_table_filtered})
              AND m.orig_id IN (SELECT orig_id FROM {demand_table_filtered})
        """)

        # Compute Huff model using filtered tables
        result_table = self._compute_huff_model(
            filtered_matrix,
            opportunity_table_filtered,
            demand_table_filtered,
            params.attractiveness_param,
            params.distance_decay,
            params.max_cost
        )

        output_path = Path(params.output_path)
        logger.info("Huff model analysis completed successfully")

        # Export results with original supply geometries
        original_geom_output_path = output_path.with_name(
            output_path.stem + "_original_geom" + output_path.suffix
        )
        result_path = self._export_original_geom_results(
            result_table, original_geom_output_path
        )

        # Return as list of (path, metadata) tuples for consistency with other tools
        geometry_type = opportunity_meta.geometry_type or "Unknown"
        metadata = DatasetMetadata(
            path=str(result_path),
            source_type="vector",
            format="geoparquet",
            geometry_type=geometry_type,
            geometry_column="geometry",
        )
        return [(result_path, metadata)]

    def _process_table_to_h3(
        self: Self,
        input_table: str,
        meta: Metadata,
        h3_resolution: int,
        output_table: str,
        h3_column: str = "dest_id",
    ) -> str:
        """Convert Polygon/MultiPolygon geometries to H3 cells (experimental)."""
        geom_type = (meta.geometry_type or "").lower()
        geom_col = meta.geometry_column or "geom"

        if "polygon" not in geom_type:
            raise ValueError(
                f"Unsupported geometry type '{geom_type}'. Only Polygon/MultiPolygon supported."
            )
        if not hasattr(meta, "crs") or meta.crs is None:
            raise ValueError("No CRS information found in input data.")

        transform_to_4326 = geom_col
        if meta.crs.to_epsg() != 4326:
            source_crs = meta.crs.to_string()
            logger.info(f"Transforming geometry from {source_crs} to EPSG:4326")
            transform_to_4326 = f"ST_Transform({geom_col}, '{source_crs}', 'EPSG:4326')"

        query = f"""
            CREATE OR REPLACE TEMP TABLE {output_table} AS
            WITH features AS (
                SELECT {transform_to_4326} AS geom
                FROM {input_table}
                WHERE {geom_col} IS NOT NULL
            ),
            polygons AS (
                SELECT (UNNEST(ST_Dump(ST_Force2D(geom)))).geom AS simple_geom
                FROM features
            ),
            h3_cells_raw AS (
                SELECT
                    UNNEST(h3_polygon_wkt_to_cells_experimental(ST_AsText(simple_geom), {h3_resolution}, 'CONTAINMENT_OVERLAPPING')) AS {h3_column}
                FROM polygons
            )
            SELECT DISTINCT {h3_column} FROM h3_cells_raw
        """
        self.con.execute(query)
        count = self.con.execute(f"SELECT COUNT(*) FROM {output_table}").fetchone()[0]
        logger.info("Converted %d polygons to H3 cells: %s", count, output_table)
        return output_table

    def _process_opportunity(
        self: Self, supply_table: str, attractivity: str, h3_resolution: int
    ) -> str:
        """
        Imports and standardizes all opportunity datasets.
         Returns a list of (standardized_table_name, opportunity_name)
        """
        table_name = "supply_input"
        try:
            meta, table_name = self.import_input(
                supply_table, table_name=table_name
            )
            geom_col = meta.geometry_column or "geom"
            geom_type = (meta.geometry_type or "").lower()
            output_table = f"{table_name}_std"

            transform_to_4326 = geom_col
            if meta.crs and meta.crs.to_epsg() != 4326:
                source_crs = meta.crs.to_string()
                transform_to_4326 = (
                    f"ST_Transform({geom_col}, '{source_crs}', 'EPSG:4326')"
                )
        except Exception:
            pass

        if "point" in geom_type:
            query = f"""
            CREATE OR REPLACE TEMP TABLE {output_table} AS
            WITH features AS (
                SELECT
                    ROW_NUMBER() OVER () AS supply_id,
                    {attractivity}::DOUBLE AS attractivity,
                    {transform_to_4326} AS geom
                FROM {table_name} opp
                WHERE {geom_col} IS NOT NULL
            ),
            exploded AS (
                SELECT
                    supply_id,
                    attractivity,
                    (UNNEST(ST_Dump(geom))).geom AS simple_geom
                FROM features
            )
            SELECT
                h3_latlng_to_cell(ST_Y(simple_geom), ST_X(simple_geom), {h3_resolution}) AS dest_id,
                attractivity,
                supply_id
            FROM exploded
            WHERE simple_geom IS NOT NULL
            """
        elif "polygon" in geom_type or "multipolygon" in geom_type:
            query = f"""
            CREATE OR REPLACE TEMP TABLE {output_table} AS
            WITH features AS (
                SELECT
                    ROW_NUMBER() OVER () AS supply_id,
                    {attractivity}::DOUBLE AS attractivity,
                    {transform_to_4326} AS geom
                FROM {table_name}
                WHERE {geom_col} IS NOT NULL
            ),
            polygons AS (
                SELECT 
                    supply_id,
                    attractivity,
                    (UNNEST(ST_Dump(ST_Force2D(geom))).geom) AS geom
                FROM features
            ),
            h3_cells AS (
                SELECT
                    supply_id,
                    attractivity,
                    UNNEST(h3_polygon_wkt_to_cells_experimental(ST_AsText(geom), {h3_resolution}, 'CONTAINMENT_OVERLAPPING')) AS dest_id
                FROM polygons
                WHERE geom IS NOT NULL
            )
            SELECT
                dest_id,
                attractivity,
                supply_id
            FROM h3_cells
            WHERE dest_id IS NOT NULL
            """

        else:
            raise ValueError(f"Unsupported geometry type: '{geom_type}'")

        self.con.execute(query)
        return meta, output_table

    def _process_demand(
        self: Self,
        demand_path: str,
        demand_field: str,
        h3_resolution: int,
    ) -> str:
        """
         Imports and standardizes the demand dataset.
        Returns the standardized demand table name with schema: dest_id, demand_value
        """
        try:
            table_name = "demand_input"
            meta, table_name = self.import_input(
                demand_path, table_name=table_name
            )
            geom_col = meta.geometry_column or "geom"
            geom_type = (meta.geometry_type or "").lower()
            output_table = f"{table_name}_std"

            transform_to_4326 = geom_col
            if meta.crs and meta.crs.to_epsg() != 4326:
                source_crs = meta.crs.to_string()
                transform_to_4326 = (
                    f"ST_Transform({geom_col}, '{source_crs}', 'EPSG:4326')"
                )
        except Exception:
            pass

        if "point" in geom_type:
            query = f"""
            CREATE OR REPLACE TEMP TABLE {output_table} AS
            WITH features AS (
                SELECT
                    {demand_field}::DOUBLE AS demand_value,
                    {transform_to_4326} AS geom
                FROM {table_name}
                WHERE {geom_col} IS NOT NULL
            ),
            exploded AS (
                SELECT
                    demand_value,
                    (UNNEST(ST_Dump(geom))).geom AS simple_geom
                FROM features
            )
            SELECT
                h3_latlng_to_cell(ST_Y(simple_geom), ST_X(simple_geom), {h3_resolution}) AS orig_id,
                SUM(demand_value) AS demand_value
            FROM exploded
            WHERE simple_geom IS NOT NULL
            GROUP BY orig_id
            """
        elif "polygon" in geom_type or "multipolygon" in geom_type:
            query = f"""
            CREATE OR REPLACE TEMP TABLE {output_table} AS
            WITH features AS (
                SELECT
                    ROW_NUMBER() OVER () AS row_id,
                    {demand_field}::DOUBLE AS demand_value,
                    {transform_to_4326} AS geom
                FROM {table_name}
                WHERE {geom_col} IS NOT NULL
            ),
            polygons AS (
                SELECT
                    row_id,
                    demand_value,
                    (UNNEST(ST_Dump(ST_Force2D(geom)))).geom AS simple_geom
                FROM features
            ),
            h3_cells_raw AS (
                SELECT
                    row_id,
                    demand_value,
                    UNNEST(h3_polygon_wkt_to_cells_experimental(ST_AsText(simple_geom), {h3_resolution}, 'CONTAINMENT_OVERLAPPING')) AS orig_id
                FROM polygons
                WHERE simple_geom IS NOT NULL
            ),
            h3_cells_unique AS (
                SELECT DISTINCT row_id, demand_value, orig_id
                FROM h3_cells_raw
            ),
            h3_counts AS (
                SELECT
                    row_id,
                    COUNT(*) AS num_cells,
                    demand_value
                FROM h3_cells_unique
                GROUP BY row_id, demand_value
            )
            SELECT
                u.orig_id,
                SUM(u.demand_value / hc.num_cells) AS demand_value
            FROM h3_cells_unique u
            JOIN h3_counts hc ON u.row_id = hc.row_id
            WHERE u.orig_id IS NOT NULL
            GROUP BY u.orig_id
            """
        else:
            raise ValueError(f"Unsupported geometry type: '{geom_type}'")

        self.con.execute(query)
        return output_table


    def _compute_huff_model(
        self: Self,
        filtered_matrix: str,
        supply_table: str,
        demand_table: str,
        attractiveness_param: float,
        distance_decay: float,
        max_cost: int,
    ) -> str:
        """
        Compute Huff model accessibility using gravity-style pattern.
        
        Uses single JOIN + GROUP BY pattern inspired by _compute_gravity_accessibility:
        - Direct aggregation without window functions
        - Pre-filter by max_cost in WHERE clause
        - Individual column computation with sum expressions
        """
        result_table = "huff_model_final"
        
        # Pre-compute total demand once for efficiency
        total_demand = self.con.execute(
            f"SELECT SUM(demand_value) FROM {demand_table}"
        ).fetchone()[0] or 0
        
        if total_demand == 0:
            raise ValueError("Total demand is zero - cannot compute Huff model")

        query = f"""
            CREATE OR REPLACE TEMP TABLE {result_table} AS
            WITH origin_supply_min_cost AS (
                -- Get minimum cost per origin-supply pair in single pass
                SELECT
                    m.orig_id,
                    o.supply_id,
                    o.attractivity,
                    MIN(m.cost) AS min_cost
                FROM {filtered_matrix} AS m
                JOIN {supply_table} AS o ON m.dest_id = o.dest_id
                WHERE m.cost <= {max_cost}
                GROUP BY m.orig_id, o.supply_id, o.attractivity
            ),
            origin_supply_weights AS (
                -- Compute weighted attractiveness with origin totals in single pass
                SELECT
                    orig_id,
                    supply_id,
                    attractivity,
                    POW(attractivity, {attractiveness_param}) * POW(min_cost, -{distance_decay}) AS weighted_attr,
                    SUM(POW(attractivity, {attractiveness_param}) * POW(min_cost, -{distance_decay})) 
                        OVER (PARTITION BY orig_id) AS total_weighted_attr
                FROM origin_supply_min_cost
            ),
            probabilities_with_demand AS (
                -- Join with demand and compute probability * demand
                SELECT
                    osw.supply_id,
                    osw.attractivity,
                    (osw.weighted_attr / osw.total_weighted_attr) * d.demand_value AS captured_demand
                FROM origin_supply_weights osw
                JOIN {demand_table} d ON osw.orig_id = d.orig_id
                WHERE osw.weighted_attr > 0 AND osw.total_weighted_attr > 0
            )
            SELECT
                supply_id,
                SUM(captured_demand) / {total_demand}*100 AS probability,
                MAX(attractivity) AS attractivity
            FROM probabilities_with_demand
            GROUP BY supply_id
        """

        self.con.execute(query)
        row_count = self.con.execute(f"SELECT COUNT(*) FROM {result_table}").fetchone()[0]
        logger.info("Computed Huff model probabilities for %d supply locations", row_count)
        return result_table

    def _export_original_geom_results(
        self: Self,
        results_table: str,
        output_path: Path,
        supply_id_column: str = "supply_id",
    ) -> Path:
        """Export results with original supply geometry instead of H3 cells."""
        output_path_obj = Path(output_path)
        output_path_obj.parent.mkdir(parents=True, exist_ok=True)

        if output_path_obj.suffix.lower() != ".parquet":
            output_path_obj = output_path_obj.with_suffix(".parquet")

        # Check if geometry column is named 'geometry' or 'geom'
        geometry_col = "geometry"
        columns_result = self.con.execute("PRAGMA table_info(supply_input)").fetchall()
        column_names = [col[1] for col in columns_result]
        
        if "geom" in column_names:
            geometry_col = "geom"
        elif "geometry" in column_names:
            geometry_col = "geometry"
        else:
            for col_name in column_names:
                if "geom" in col_name.lower():
                    geometry_col = col_name
                    break

        # Join results back to original supply geometries using supply_id
        query = f"""
            SELECT
                r.*,
                o.{geometry_col} AS geometry
            FROM {results_table} r
            INNER JOIN (
                SELECT 
                    ROW_NUMBER() OVER () AS supply_id,
                    {geometry_col}
                FROM supply_input
                WHERE {geometry_col} IS NOT NULL
            ) o ON r.{supply_id_column} = o.supply_id
        """

        # Execute the query and write results to parquet file
        write_optimized_parquet(
            self.con, query, output_path_obj, geometry_column="geometry"
        )

        return output_path_obj