"""
Clustering using Kmean or balanced zones using Genetic Algorithm.
Inspired by ArcGIS Build Balanced Zones tool.
Uses K-means as initial population then applies genetic algorithm optimization
to create zones with approximately equal number of features.
"""

import logging
from pathlib import Path
from typing import Self
import numpy as np
from goatlib.analysis.core.base import AnalysisTool
from goatlib.analysis.schemas.base import GeometryType
from goatlib.analysis.schemas.clustering import ClusteringParams, ClusterType
from goatlib.io.parquet import write_optimized_parquet
from goatlib.models.io import DatasetMetadata

logger = logging.getLogger(__name__)


class ClusteringZones(AnalysisTool):
    """
    Clustering to n Zones.
    - Kmean Clustering 
    - Genetic algorithm implementation for balanced spatial clustering, with potnetial field based size definnition and compactness constraint
    In the Genetic Algorithm implementation, all cosntraints are soft. the maximum distance is not a hard threshold but rather a penalty function that encourages more compact zones.
    
    The algorithm:
    1. Build spatial neighbor graph for contiguity constraints
    2. Create initial population (K-means seeded + mutations + random individuals)
    3. For each generation:
       - Calculate fitness score based on zone size variance
       - Select top individuals as parents (lowest fitness = best)
       - Apply crossover and mutation to create offspring + add random "aliens" for diversity
       - Apply elitism to preserve best solutions
    4. Return the solution with lowest fitness score after convergence
    """

    def __init__(
        self: Self,
        db_path: Path | None = None,
        population_size: int = 50,
        n_generations: int = 50,
        mutation_rate: float = 0.1,
        crossover_rate: float = 0.7,
        equal_size_weight: float = 1,
        compactness_weight: float = 0.1
    ) -> None:
        """Initialize the balanced zone clustering tool.

        Args:
            db_path: Path to DuckDB database.
            population_size: Number of individuals in each generation.
            n_generations: Maximum number of generations to evolve.
            mutation_rate: Probability of mutation (also controls alien introduction).
            crossover_rate: Probability of crossover between parents.
            equal_size_weight: Weight for the equal-size fitness criterion.
            compactness_weight: Weight for the compactness fitness criterion.
        """
        super().__init__(db_path=db_path)
        self.population_size = population_size
        self.n_generations = n_generations
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        self.equal_size_weight = equal_size_weight
        self.compactness_weight = compactness_weight

    def _run_implementation(
        self: Self, params: ClusteringParams
    ) -> list[tuple[Path, DatasetMetadata]]:
        logger.info("Starting clustering implementation...")
        input_meta, input_view = self.import_input(params.input_path, "input_data")
        input_geom = input_meta.geometry_column

        if not input_geom:
            raise ValueError(
                f"Could not detect geometry column for input: {params.input_path}"
            )

        # Validate that input contains point geometries
        self.validate_geometry_types(
            input_view,
            input_geom,
            [GeometryType.point, GeometryType.multipoint],
            "input",
        )

        # Get CRS from source metadata
        crs = input_meta.crs
        if crs:
            crs_str = crs.to_string()
        else:
            crs_str = "EPSG:4326"
            logger.warning(
                "Could not detect CRS for %s, using fallback: %s",
                params.input_path,
                crs_str,
            )

        k = params.nb_cluster
        use_compactness=params.use_compactness
        if use_compactness:
            threshold_distance = params.threshold_distance
        else:
            self.compactness_weight=0.0
            threshold_distance = None

        # Determine weight expression: use numeric field if specified, otherwise 1 per point
        if params.weight_method == "field" and params.weight_field:
            weight_expr = f'CAST("{params.weight_field}" AS DOUBLE)'
        else:
            weight_expr = '1'

        self.con.execute(f"""
            CREATE OR REPLACE TEMP TABLE points_metric AS
            SELECT 
                ROW_NUMBER() OVER () - 1 as point_id,
                *,
                ST_X({input_geom}) AS lon,
                ST_Y({input_geom}) AS lat,
                {weight_expr} AS weight,
                ST_X(ST_Transform({input_geom}, 'EPSG:4326', 'EPSG:3857')) AS x,
                ST_Y(ST_Transform({input_geom}, 'EPSG:4326', 'EPSG:3857')) AS y
            FROM {input_view}
        """)
        n_points = self.con.execute("SELECT COUNT(*) FROM points_metric").fetchone()[0]
        n_total_points = self.con.execute("SELECT SUM(weight) FROM points_metric").fetchone()[0]
        if n_points == 0:
            raise ValueError("No points found in input data")
        if n_points < k:
            raise ValueError(f"Cannot create {k} clusters from {n_points} points")
        
        # Validate point limit for performance reasons
        max_points = 4000
        if n_points > max_points:
            raise ValueError( f"Clustering zones support a maximum of {max_points} points. Got {n_points} points." )

        # Adaptive GA parameters based on dataset size to balance convergence and runtime
        if n_points > 1000:
            self.population_size = min(self.population_size, 30)
            self.n_generations = min(self.n_generations, 35)
        elif n_points > 500:
            self.population_size = min(self.population_size, 40)
            self.n_generations = min(self.n_generations, 40)

        if params.cluster_type == ClusterType.equal_size:
            # Step 1: Create initial population using K-means for seeding
            self._run_kmeans(k, max_iter=50)
            self._build_distance_neighbor_graph()
            
            # Create ga_assignments table to store all individuals and ga_seeds table to store seed array
            self.con.execute(""" CREATE OR REPLACE TEMP TABLE ga_assignments (individual_id INTEGER,point_id INTEGER, cluster_id INTEGER ) """)
            self.con.execute(""" CREATE OR REPLACE TEMP TABLE ga_seeds ( individual_id INTEGER, cluster_id INTEGER,seed_id INTEGER) """)

            self._init_population(k)
            batch_size = max(5, self.population_size // 4)
            for batch_start in range(0, self.population_size, batch_size):
                batch_ids = list(range(batch_start, min(batch_start + batch_size, self.population_size)))
                self._create_individuals_from_seeds_batch(batch_ids, k, n_points, use_compactness, )
            logger.info("Created initial population of %d individuals", self.population_size)

            # Genetic algorithm evolution 
            best_fitness = float("inf")
            best_individual = 0
            stagnation_count = 0
            population_ids = list(range(self.population_size))
            next_individual_id = self.population_size

            for gen in range(self.n_generations + 1):
                # Calculate fitness for current population and track best solution
                fitness_dict = self._calculate_fitness_batch(population_ids, k, n_total_points,use_compactness, threshold_distance)
                fitness_scores = [fitness_dict.get(i, {}).get('total', float("inf")) for i in population_ids]
                gen_best_fitness = ( min(fitness_scores) if fitness_scores else float("inf") )
                improvement_threshold = 1e-6

                if gen_best_fitness < best_fitness - improvement_threshold:
                    best_fitness = gen_best_fitness
                    best_individual = population_ids[fitness_scores.index(best_fitness)]
                    stagnation_count = 0
                    
                    # Log detailed fitness breakdown from the same calculation
                    best_detail = fitness_dict[best_individual]
                    logger.info( "Generation %d: NEW BEST fitness = %.6f (size=%.6f, compactness=%.6f)", gen, best_fitness, best_detail["size"], best_detail["compactness"],)
                else:
                    stagnation_count += 1
                    if gen % 5 == 0:
                        logger.info("Generation %d: fitness = %.6f, stagnation = %d", gen, gen_best_fitness,stagnation_count, )

                # Stop if this is the last generation or early stopping
                if gen >= self.n_generations or stagnation_count >= 15:
                    if stagnation_count >= 15:
                        logger.info(
                            "Early stopping at generation %d due to stagnation",
                            gen,
                        )
                    break

                # Apply genetic operations to create next generation 
                if gen < self.n_generations and stagnation_count < 15:
                    # Sort population by fitness to select parents and keep  elite individuals
                    sorted_indices = np.argsort(fitness_scores)
                    n_parents = self.population_size // 2
                    parent_ids = [population_ids[i] for i in sorted_indices[:n_parents]]
                    n_elite = max(2, self.population_size // 10)
                    elite_ids = [population_ids[i] for i in sorted_indices[:n_elite]]

                    # Create next generation
                    new_individual_ids, elite_ids_kept, next_individual_id = (self._evolve_generation_batch( parent_ids, elite_ids, next_individual_id, k, n_points, use_compactness) )

                    # Update population for next iteration
                    population_ids = list(elite_ids_kept) + list(new_individual_ids)
                    if len(population_ids) > self.population_size:
                        population_ids = population_ids[: self.population_size]

                    # Cleanup old individuals to save memory
                    if population_ids:
                        current_ids = ",".join(map(str, population_ids))
                        self.con.execute(f""" DELETE FROM ga_assignments WHERE individual_id NOT IN ({current_ids})""")
                        self.con.execute(f"""DELETE FROM ga_seeds WHERE individual_id NOT IN ({current_ids}) """)
        else:
            self._run_kmeans(k, max_iter=100)
            best_individual = "kmeans"

        # Unify assignments into a single view for stats and output
        if best_individual == "kmeans":
            self.con.execute("""
                CREATE OR REPLACE TEMP VIEW final_assignments AS
                SELECT point_id, cluster_id FROM kmeans_assignments
            """)
        else:
            self.con.execute(f"""
                CREATE OR REPLACE TEMP VIEW final_assignments AS
                SELECT point_id, cluster_id
                FROM ga_assignments
                WHERE individual_id = {best_individual}
            """)

        # Compute per-zone statistics
        self.con.execute("""
            CREATE OR REPLACE TEMP TABLE zone_stats AS
            SELECT
                a.cluster_id,
                SUM(p.weight) AS cluster_size,
                AVG(p.x) AS cx,
                AVG(p.y) AS cy
            FROM final_assignments a
            JOIN points_metric p ON a.point_id = p.point_id
            GROUP BY a.cluster_id
        """)
        self.con.execute("""
            CREATE OR REPLACE TEMP TABLE zone_metrics AS
            SELECT
                zs.cluster_id,
                zs.cluster_size,
                2.0 * MAX(SQRT(
                    (p.x - zs.cx) * (p.x - zs.cx) +
                    (p.y - zs.cy) * (p.y - zs.cy)
                )) AS max_distance
            FROM zone_stats zs
            JOIN final_assignments a ON a.cluster_id = zs.cluster_id
            JOIN points_metric p ON a.point_id = p.point_id
            GROUP BY zs.cluster_id, zs.cluster_size
        """)

        stats = self.con.execute("""
            SELECT cluster_id, cluster_size, max_distance
            FROM zone_metrics ORDER BY cluster_id
        """).fetchall()

        logger.info("Final zone statistics:")
        for cluster_id, cluster_size, max_dist in stats:
            logger.info(
                "  Zone %d: size=%d, max_distance=%.1fm",
                cluster_id,
                int(cluster_size),
                max_dist or 0.0,
            )

        # Prepare output paths
        input_stem = Path(params.input_path).stem
        input_dir = Path(params.input_path).parent
        if not params.output_path:
            params.output_path = str( input_dir / f"{input_stem}_clustered_zones.parquet")
        output_path = Path(params.output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path = output_path.parent / f"{input_stem}_cluster_summary.parquet"

        # Output 1: Original points with cluster_id 
        self.con.execute("""
            CREATE OR REPLACE TEMP VIEW clustering_result AS
            SELECT
                p.* EXCLUDE (point_id, lon, lat, x, y, weight),
                a.cluster_id
            FROM points_metric p
            JOIN final_assignments a ON p.point_id = a.point_id
        """)

        write_optimized_parquet(
            self.con,
            "clustering_result",
            output_path,
            geometry_column=input_geom,
        )
        logger.info("Created %d zones (points) saved to: %s", k, output_path)

        # Output 2: Multipoint summary per cluster with characteristics
        self.con.execute(f"""
            CREATE OR REPLACE TEMP VIEW cluster_summary AS
            SELECT
                a.cluster_id,
                ST_Collect(LIST(p.{input_geom})) AS geometry,
                zm.cluster_size,
                zm.max_distance
            FROM final_assignments a
            JOIN points_metric p ON a.point_id = p.point_id
            JOIN zone_metrics zm ON a.cluster_id = zm.cluster_id
            GROUP BY a.cluster_id, zm.cluster_size, zm.max_distance
        """)

        write_optimized_parquet(
            self.con,
            "cluster_summary",
            summary_path,
            geometry_column="geometry",
        )
        logger.info("Created cluster summary (multipoint) saved to: %s", summary_path)

        points_meta = DatasetMetadata(
            path=str(output_path),
            source_type="vector",
            format="geoparquet",
            geometry_type="Point",
            geometry_column=input_geom,
            crs=crs_str,
        )
        summary_meta = DatasetMetadata(
            path=str(summary_path),
            source_type="vector",
            format="geoparquet",
            geometry_type="MultiPoint",
            geometry_column="geometry",
            crs=crs_str,
        )
        return [(output_path, points_meta), (summary_path, summary_meta)]

    def _build_distance_neighbor_graph(self: Self) -> None:
        """
        Build neighbor graph using distance-based approach for k=5 nearest neighbors.
        Uses spatial bucketing to avoid full N² cross join for large datasets.
        """
        self.con.execute("""
                CREATE OR REPLACE TEMP TABLE neighbors AS
                WITH ranked AS (
                    SELECT
                        p1.point_id AS from_id,
                        p2.point_id AS to_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY p1.point_id
                            ORDER BY (p1.x - p2.x)*(p1.x - p2.x) + (p1.y - p2.y)*(p1.y - p2.y)
                        ) AS rn
                    FROM points_metric p1, points_metric p2
                    WHERE p1.point_id != p2.point_id
                )
                SELECT from_id, to_id FROM ranked WHERE rn <= 5
            """)

        # Ensure full connectivity: add reverse edges for isolated points
        self.con.execute("""
            INSERT INTO neighbors (from_id, to_id)
            WITH isolated AS (
                SELECT point_id, x, y FROM points_metric p
                WHERE NOT EXISTS (SELECT 1 FROM neighbors n WHERE n.to_id = p.point_id)
            ),
            closest AS (
                SELECT ip.point_id AS isolated_id, p.point_id AS closest_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY ip.point_id
                        ORDER BY (p.x - ip.x)*(p.x - ip.x) + (p.y - ip.y)*(p.y - ip.y)
                    ) AS rn
                FROM isolated ip
                JOIN points_metric p ON p.point_id != ip.point_id
            )
            SELECT closest_id AS from_id, isolated_id AS to_id
            FROM closest WHERE rn <= 3
        """)
        logger.info("Neighbor graph built: %d edges",
            self.con.execute("SELECT COUNT(*) FROM neighbors").fetchone()[0])
        
        # Index neighbors for fast lookup during zone growing
        self.con.execute("CREATE INDEX IF NOT EXISTS idx_neighbors_from ON neighbors(from_id)")

    def _run_kmeans(self: Self, k: int, max_iter: int = 100) -> None:
        """
        Run K-means clustering on points.
        """
        # Initialize centroids 
        self.con.execute(f"""
        CREATE OR REPLACE TEMP TABLE centroids AS
        SELECT 0 AS cluster_id, x AS cx, y AS cy
        FROM points_metric
        ORDER BY RANDOM()
        LIMIT 1;""")

        for i in range(1, k):
            self.con.execute(f"""
                INSERT INTO centroids(cluster_id, cx, cy)
                SELECT {i}, x, y
                FROM points_metric p
                WHERE p.point_id NOT IN (
                    SELECT p2.point_id 
                    FROM points_metric p2
                    JOIN centroids c ON (p2.x = c.cx AND p2.y = c.cy)
                )
                ORDER BY (
                    SELECT MIN((p.x - c.cx)*(p.x - c.cx) + (p.y - c.cy)*(p.y - c.cy))
                    FROM centroids c
                ) DESC
                LIMIT 1
            """)

        for _ in range(max_iter):
            # Assignment step: assign each point to nearest centroid
            self.con.execute("""
                CREATE OR REPLACE TEMP TABLE kmeans_assignments AS
                WITH distances AS (
                    SELECT 
                        p.point_id, c.cluster_id,
                        (p.x - c.cx) * (p.x - c.cx) + (p.y - c.cy) * (p.y - c.cy) AS dist_sq
                    FROM points_metric p CROSS JOIN centroids c
                ),
                ranked AS (
                    SELECT point_id, cluster_id,
                        ROW_NUMBER() OVER (PARTITION BY point_id ORDER BY dist_sq) AS rn
                    FROM distances
                )
                SELECT point_id, cluster_id FROM ranked WHERE rn = 1
            """)

            # Update centroids 
            self.con.execute(f"""
                CREATE OR REPLACE TEMP TABLE new_centroids AS
                WITH updated_centroids AS (
                    SELECT 
                        a.cluster_id, 
                        AVG(p.x) AS cx,
                        AVG(p.y) AS cy
                    FROM kmeans_assignments a
                    JOIN points_metric p ON a.point_id = p.point_id
                    GROUP BY a.cluster_id
                ),
                all_cluster_ids AS (
                    SELECT cluster_id FROM generate_series(0, {k-1}) AS g(cluster_id)
                )
                SELECT 
                    aci.cluster_id,
                    COALESCE(uc.cx, (SELECT AVG(x) FROM points_metric)) AS cx,
                    COALESCE(uc.cy, (SELECT AVG(y) FROM points_metric)) AS cy
                FROM all_cluster_ids aci
                LEFT JOIN updated_centroids uc ON aci.cluster_id = uc.cluster_id
            """)

            # Check convergence
            max_movement = self.con.execute("""
                SELECT COALESCE(MAX(
                    (c.cx - n.cx) * (c.cx - n.cx) + (c.cy - n.cy) * (c.cy - n.cy)
                ), 0)
                FROM centroids c JOIN new_centroids n ON c.cluster_id = n.cluster_id
            """).fetchone()[0]

            self.con.execute("DROP TABLE IF EXISTS centroids")
            self.con.execute("ALTER TABLE new_centroids RENAME TO centroids")

            if max_movement < 1e-8:
                break

    def _init_population(self, k):
        """
        Create initial population for GA:
        - 25% pure K-means seeded individuals
        - 50% mutated K-means (seeds shifted to nearby points)
        - 25% random aliens (random points as seeds)
        """
        n_kmeans_based = self.population_size // 4
        n_mutations = self.population_size // 2  
        n_aliens = self.population_size - n_kmeans_based - n_mutations

        # Extract K-means seeds: find point closest to each K-means centroid
        self.con.execute(f"""
            CREATE OR REPLACE TEMP TABLE kmeans_seeds AS
            WITH centroid_distances AS (
                SELECT 
                    c.cluster_id AS cluster_id,
                    p.point_id,
                    (p.x - c.cx) * (p.x - c.cx) + (p.y - c.cy) * (p.y - c.cy) AS dist_sq
                FROM centroids c
                CROSS JOIN points_metric p
            ),
            closest_points AS (
                SELECT 
                    cluster_id, point_id,
                    ROW_NUMBER() OVER (PARTITION BY cluster_id ORDER BY dist_sq) AS rn
                FROM centroid_distances
            )
            SELECT cluster_id, point_id AS seed_id FROM closest_points WHERE rn = 1
        """)

        # Create all initial individuals
        self.con.execute(f"""
            INSERT INTO ga_seeds (individual_id, cluster_id, seed_id)
            WITH kmeans_individuals AS (
                SELECT 
                    individual_idx - 1 AS individual_id,
                    ks.cluster_id,
                    ks.seed_id
                FROM generate_series(1, {n_kmeans_based}) AS g(individual_idx)
                CROSS JOIN kmeans_seeds ks
            ),
            mutation_individuals AS (
                SELECT 
                    {n_kmeans_based} + individual_idx - 1 AS individual_id,
                    ks.cluster_id,
                    CASE 
                        WHEN random() < {self.mutation_rate}
                        THEN (SELECT point_id FROM points_metric ORDER BY random() LIMIT 1)
                        ELSE ks.seed_id
                    END AS seed_id
                FROM generate_series(1, {n_mutations}) AS g(individual_idx)
                CROSS JOIN kmeans_seeds ks
            ),
            alien_individuals AS (
                SELECT 
                    {n_kmeans_based + n_mutations} + alien_idx - 1 AS individual_id,
                    cluster_id,
                    (SELECT point_id FROM points_metric ORDER BY random() LIMIT 1) AS seed_id
                FROM generate_series(1, {n_aliens}) AS a(alien_idx)
                CROSS JOIN generate_series(0, {k - 1}) AS z(cluster_id)
            )
            SELECT * FROM kmeans_individuals
            UNION ALL
            SELECT individual_id, cluster_id, COALESCE(seed_id, (SELECT point_id FROM points_metric LIMIT 1)) 
            FROM mutation_individuals  
            UNION ALL
            SELECT * FROM alien_individuals
        """)

    def _calculate_fitness_batch(
        self: Self,
        individual_ids: list[int],
        k: int,
        n_total_points: int,
        use_compactness: bool,
        threshold_distance: float ,
    ) -> dict[int, dict]:
        """
        Calculate fitness scores.
        Returns dict of {individual_id: {'total': float, 'size': float, 'compactness': float}}
        Fast path: when compactness_weight == 0, skip compactness calculations.
        """
        if not individual_ids:
            return {}

        target_size = n_total_points / k
        ids_str = ",".join(map(str, individual_ids))

        if not use_compactness:
            results = self.con.execute(f"""
                WITH zone_stats AS (
                    SELECT
                        a.individual_id,
                        a.cluster_id,
                        SUM(p.weight) AS zone_size
                    FROM ga_assignments a
                    JOIN points_metric p ON a.point_id = p.point_id
                    WHERE a.individual_id IN ({ids_str})
                    GROUP BY a.individual_id, a.cluster_id
                )
                SELECT
                    individual_id,
                    AVG(POWER((zone_size - {target_size}) / {target_size}, 2))
                    + 0.1*POWER((MIN(zone_size) - {target_size}) / {target_size}, 2)
                          AS size_score
                FROM zone_stats
                GROUP BY individual_id
            """).df()

            fitness_dict = {}
            for _, row in results.iterrows():
                ind_id = int(row["individual_id"])
                size_f = row["size_score"] if row["size_score"] is not None else 0.0
                size_weighted = self.equal_size_weight * size_f
                fitness_dict[ind_id] = {
                    'total': size_weighted,
                    'size': size_weighted,
                    'compactness': 0.0,
                }
            return fitness_dict

        # size + compactness
        results = self.con.execute(f"""
            WITH individual_data AS (
                SELECT a.individual_id, a.point_id, a.cluster_id, p.x, p.y, p.weight
                FROM ga_assignments a
                JOIN points_metric p ON a.point_id = p.point_id
                WHERE a.individual_id IN ({ids_str})
            ),
            zone_stats AS (
                SELECT
                    individual_id, cluster_id,
                    SUM(weight) AS zone_size,
                    AVG(x) AS cx, AVG(y) AS cy
                FROM individual_data
                GROUP BY individual_id, cluster_id
            ),
            size_fitness AS (
                SELECT individual_id,
                    AVG(POWER((zone_size - {target_size}) / {target_size}, 2))
                      + 0.1*POWER((MIN(zone_size) - {target_size}) / {target_size}, 2)
                      AS size_score
                FROM zone_stats
                GROUP BY individual_id
            ),
            point_centroid_dist AS (
                SELECT
                    id.individual_id, id.cluster_id,
                    (id.x - zs.cx) * (id.x - zs.cx) + (id.y - zs.cy) * (id.y - zs.cy) AS dist_sq
                FROM individual_data id
                JOIN zone_stats zs ON id.individual_id = zs.individual_id AND id.cluster_id = zs.cluster_id
            ),
            compactness_per_zone AS (
                SELECT individual_id, cluster_id,
                    MAX(POWER((SQRT(dist_sq) - {threshold_distance}/2) / ({threshold_distance}/2), 2)) AS max_zone_length
                FROM point_centroid_dist
                GROUP BY individual_id, cluster_id
            ),
            compactness_fitness AS (
                SELECT individual_id, MAX(max_zone_length) AS compactness_score
                FROM compactness_per_zone
                GROUP BY individual_id
            )
            SELECT sf.individual_id, sf.size_score, cf.compactness_score
            FROM size_fitness sf
            JOIN compactness_fitness cf ON sf.individual_id = cf.individual_id
        """).df()

        fitness_dict = {}
        for _, row in results.iterrows():
            ind_id = int(row["individual_id"])
            size_f = row["size_score"] if row["size_score"] is not None else 0.0
            compact_f = row["compactness_score"] if row["compactness_score"] is not None else 0.0
            size_weighted = self.equal_size_weight * size_f
            compact_weighted = self.compactness_weight * compact_f
            fitness_dict[ind_id] = {
                'total': size_weighted + compact_weighted,
                'size': size_weighted,
                'compactness': compact_weighted,
            }
        return fitness_dict

    def _evolve_generation_batch(
        self: Self,
        parent_ids: list[int],
        elite_ids: list[int],
        next_individual_id: int,
        k: int,
        n_points: int,
        use_compactness: bool
    ) -> tuple[list[int], list[int], int]:
        """
        Create new generation: crossover, mutation, zone growing,
        Returns: (new_individual_ids, elite_ids_kept, updated_next_individual_id)
        """
        n_elite = len(elite_ids)
        n_offspring_needed = self.population_size - n_elite
        n_aliens = max(1, int(self.population_size * self.mutation_rate))
        n_crossover_offspring = n_offspring_needed - n_aliens

        parent_ids_str = ",".join(map(str, parent_ids))
        n_parents = len(parent_ids)

        # Step 1: Generate offspring seeds (crossover + mutation)
        self.con.execute(f"""
            CREATE OR REPLACE TEMP TABLE generation_offspring_seeds AS
            WITH parent_seeds AS (
                SELECT individual_id, cluster_id, seed_id
                FROM ga_seeds 
                WHERE individual_id IN ({parent_ids_str})
            ),
            parent_list AS (
                SELECT individual_id, ROW_NUMBER() OVER (ORDER BY random()) AS parent_rank
                FROM (SELECT DISTINCT individual_id FROM parent_seeds)
            ),
            crossover_offspring AS (
                SELECT 
                    {next_individual_id} + offspring_idx - 1 AS individual_id,
                    ps1.cluster_id,
                    CASE 
                        WHEN random() < 0.5  -- 50% chance to take from first parent
                        THEN ps1.seed_id
                        ELSE ps2.seed_id
                    END AS base_seed_id
                FROM generate_series(1, {n_crossover_offspring}) AS o(offspring_idx)
                CROSS JOIN parent_seeds ps1
                JOIN parent_seeds ps2 ON ps1.cluster_id = ps2.cluster_id
                WHERE ps1.individual_id = (
                    SELECT individual_id FROM parent_list 
                    WHERE parent_rank = ((o.offspring_idx * 2 - 1) % {n_parents}) + 1
                )
                AND ps2.individual_id = (
                    SELECT individual_id FROM parent_list 
                    WHERE parent_rank = ((o.offspring_idx * 2) % {n_parents}) + 1
                )
            ),
            mutated_offspring AS (
                SELECT 
                    individual_id, 
                    cluster_id,
                    CASE 
                        WHEN random() < {self.mutation_rate}
                        THEN (SELECT point_id FROM points_metric ORDER BY random() LIMIT 1)
                        ELSE base_seed_id
                    END AS seed_id
                FROM crossover_offspring
            ),
            aliens AS (
                SELECT 
                    {next_individual_id + n_crossover_offspring} + (alien_idx - 1) AS individual_id,
                    cluster_id,
                    (SELECT point_id FROM points_metric ORDER BY random() LIMIT 1) AS seed_id
                FROM generate_series(1, {n_aliens}) AS a(alien_idx)
                CROSS JOIN generate_series(0, {k - 1}) AS z(cluster_id)
            )
            SELECT individual_id, cluster_id, seed_id FROM mutated_offspring
            UNION ALL
            SELECT individual_id, cluster_id, seed_id FROM aliens
        """)

        # Insert  new seeds into ga_seeds
        self.con.execute("""
            INSERT INTO ga_seeds (individual_id, cluster_id, seed_id)
            SELECT individual_id, cluster_id, seed_id FROM generation_offspring_seeds
        """)

        new_individual_ids = (self.con.execute("""  SELECT DISTINCT individual_id FROM generation_offspring_seeds ORDER BY individual_id
        """).df()["individual_id"].tolist())

        if not new_individual_ids:
            return elite_ids, elite_ids, next_individual_id

        
        logger.info("Creating %d new individuals via zone growing...", len(new_individual_ids))
        batch_size = max(5, len(new_individual_ids) // 4)
        for batch_start in range(0, len(new_individual_ids), batch_size):
            batch_ids = new_individual_ids[batch_start:batch_start + batch_size]
            self._create_individuals_from_seeds_batch(batch_ids, k, n_points, use_compactness)
        updated_next_id = next_individual_id + len(new_individual_ids)
        return new_individual_ids, elite_ids, updated_next_id

    def _create_individuals_from_seeds_batch(
        self: Self,
        individual_ids: list[int],
        k: int,
        n_points: int,
        use_compactness: bool 
    ) -> None:
        """
        Create multiple individuals from their seeds using a growing process to maintain contiguity. Infavor proximity if use_compactness is True. 
        Multiple tables are created
        1. batch_zone_grow: Main working table containing all points for all individuals in the batch.
           - cluster_id = -1 for unassigned points, >= 0 for assigned points
           - Includes coordinates (x,y) and weight to avoid repeated joins during hot loop
        
        2. batch_assignments: Temporary staging table for new assignments in each iteration.
           - Holds candidate point assignments before applying them to batch_zone_grow
           - Cleared/truncated at start of each iteration
        
        3. zone_sizes: Tracks current total weight (size) of each zone for each individual.
           - Updated incrementally using direct merge operations for efficiency
        
        4. zone_centroids_grow: Zone centroids for compactness-aware growing (optional).
           - Only created when use_compactness=True
           - Computed fresh each iteration for distance-based candidate ranking
        """
        if not individual_ids:
            return
        ids_str = ",".join(map(str, individual_ids))
        
        self.con.execute(f"""
            CREATE OR REPLACE TEMP TABLE batch_zone_grow AS
            SELECT 
                i.individual_id,
                p.point_id,
                p.weight,
                p.x,
                p.y,
                COALESCE(s.cluster_id, -1) AS cluster_id
            FROM (SELECT UNNEST([{ids_str}]) AS individual_id) i
            CROSS JOIN points_metric p
            LEFT JOIN ga_seeds s ON i.individual_id = s.individual_id 
                                AND p.point_id = s.seed_id
        """)
        
        
        self.con.execute("""
            CREATE OR REPLACE TEMP TABLE batch_assignments (
                individual_id INTEGER,
                point_id INTEGER,
                cluster_id INTEGER
            )
        """)

        self.con.execute("""
            CREATE OR REPLACE TEMP TABLE zone_sizes AS
            SELECT individual_id, cluster_id, SUM(weight) AS size
            FROM batch_zone_grow
            WHERE cluster_id >= 0
            GROUP BY individual_id, cluster_id
        """)



        target_size = n_points // k
        #  growth per iteration 
        points_per_zone_per_iter = max(10, min(50, target_size // 3))
        # smaller growth for small zones
        if target_size< 50:
            points_per_zone_per_iter = 3

        # Batch zone growing with optional compactness awareness
        max_iterations = max(10, (n_points // (k * points_per_zone_per_iter)) + 10)
        for iteration in range(max_iterations):
            if use_compactness:
                self.con.execute("""
                    CREATE OR REPLACE TEMP TABLE zone_centroids_grow AS
                    SELECT individual_id, cluster_id,
                           AVG(x) AS cx,
                           AVG(y) AS cy
                    FROM batch_zone_grow
                    WHERE cluster_id >= 0
                    GROUP BY individual_id, cluster_id
                """)
            
            # find candidates, rank by zone size + compactness, resolve conflicts
            self.con.execute("TRUNCATE batch_assignments")
            if use_compactness:
                # Compactness-aware zone growing: rank by size, then by distance to zone centroid
                self.con.execute(f"""
                    INSERT INTO batch_assignments
                    WITH frontier_candidates AS (
                        SELECT DISTINCT
                            f.individual_id, f.cluster_id, n.to_id AS candidate_pt, 
                            zs.size AS zone_size, random() AS rand,
                            g.x AS pt_x, g.y AS pt_y
                        FROM batch_zone_grow f
                        JOIN neighbors n ON f.point_id = n.from_id
                        JOIN batch_zone_grow g ON f.individual_id = g.individual_id 
                                                AND n.to_id = g.point_id
                        JOIN zone_sizes zs ON f.individual_id = zs.individual_id 
                                           AND f.cluster_id = zs.cluster_id
                        WHERE f.cluster_id >= 0 AND g.cluster_id = -1
                    ),
                    with_compactness AS (
                        SELECT 
                            fc.individual_id, fc.cluster_id, fc.candidate_pt, fc.zone_size, fc.rand,
                            SQRT((fc.pt_x - zc.cx)*(fc.pt_x - zc.cx) + (fc.pt_y - zc.cy)*(fc.pt_y - zc.cy)) AS dist_to_centroid
                        FROM frontier_candidates fc
                        JOIN zone_centroids_grow zc ON fc.individual_id = zc.individual_id 
                                                      AND fc.cluster_id = zc.cluster_id
                    ),
                    ranked AS (
                        SELECT 
                            individual_id, cluster_id, candidate_pt, zone_size, rand, dist_to_centroid,
                            ROW_NUMBER() OVER (
                                PARTITION BY individual_id, cluster_id 
                                ORDER BY dist_to_centroid, zone_size, rand
                            ) AS zone_rank,
                            ROW_NUMBER() OVER (
                                PARTITION BY individual_id, candidate_pt 
                                ORDER BY dist_to_centroid, zone_size, rand
                            ) AS conflict_rank
                        FROM with_compactness
                    )
                    SELECT individual_id, candidate_pt AS point_id, cluster_id 
                    FROM ranked
                    WHERE zone_rank <= {points_per_zone_per_iter} AND conflict_rank = 1
                """)
            else:
                # Size-only zone growing 
                self.con.execute(f"""
                    INSERT INTO batch_assignments
                    WITH frontier_candidates AS (
                        SELECT DISTINCT
                            f.individual_id, f.cluster_id, n.to_id AS candidate_pt, 
                            zs.size AS zone_size, random() AS rand
                        FROM batch_zone_grow f
                        JOIN neighbors n ON f.point_id = n.from_id
                        JOIN batch_zone_grow g ON f.individual_id = g.individual_id 
                                                AND n.to_id = g.point_id
                        JOIN zone_sizes zs ON f.individual_id = zs.individual_id 
                                           AND f.cluster_id = zs.cluster_id
                        WHERE f.cluster_id >= 0 AND g.cluster_id = -1
                    ),
                    ranked AS (
                        SELECT 
                            individual_id, cluster_id, candidate_pt, zone_size, rand,
                            ROW_NUMBER() OVER (PARTITION BY individual_id, cluster_id ORDER BY zone_size, rand) AS zone_rank,
                            ROW_NUMBER() OVER (PARTITION BY individual_id, candidate_pt ORDER BY zone_size, rand) AS conflict_rank
                        FROM frontier_candidates
                    )
                    SELECT individual_id, candidate_pt AS point_id, cluster_id 
                    FROM ranked
                    WHERE zone_rank <= {points_per_zone_per_iter} AND conflict_rank = 1
                """)

            assigned = self.con.execute("SELECT COUNT(*) FROM batch_assignments").fetchone()[0]
            if assigned == 0:
                break
            # Update zone assignments
            self.con.execute("""
                UPDATE batch_zone_grow bzg
                SET cluster_id = ba.cluster_id
                FROM batch_assignments ba
                WHERE bzg.individual_id = ba.individual_id 
                  AND bzg.point_id = ba.point_id
            """)

            # Incrementally update zone sizes - simple two-step approach
            self.con.execute("""
                WITH new_weights AS (
                    SELECT 
                        ba.individual_id,
                        ba.cluster_id,
                        SUM(bzg.weight) AS add_weight
                    FROM batch_assignments ba
                    JOIN batch_zone_grow bzg ON bzg.individual_id = ba.individual_id
                                              AND bzg.point_id = ba.point_id
                    GROUP BY ba.individual_id, ba.cluster_id
                )
                UPDATE zone_sizes 
                SET size = zone_sizes.size + nw.add_weight
                FROM new_weights nw
                WHERE zone_sizes.individual_id = nw.individual_id 
                  AND zone_sizes.cluster_id = nw.cluster_id
            """)
            self.con.execute("""
                WITH new_weights AS (
                    SELECT 
                        ba.individual_id,
                        ba.cluster_id,
                        SUM(bzg.weight) AS add_weight
                    FROM batch_assignments ba
                    JOIN batch_zone_grow bzg ON bzg.individual_id = ba.individual_id
                                              AND bzg.point_id = ba.point_id
                    GROUP BY ba.individual_id, ba.cluster_id
                )
                INSERT INTO zone_sizes (individual_id, cluster_id, size)
                SELECT nw.individual_id, nw.cluster_id, nw.add_weight
                FROM new_weights nw
                WHERE NOT EXISTS (
                    SELECT 1 FROM zone_sizes zs 
                    WHERE zs.individual_id = nw.individual_id 
                      AND zs.cluster_id = nw.cluster_id
                )
            """)

            # Early exit check
            unassigned_count = self.con.execute(
                "SELECT COUNT(*) FROM batch_zone_grow WHERE cluster_id = -1"
            ).fetchone()[0]
            if unassigned_count == 0:
                break

        # Handle remaining unassigned points - assign to SMALLEST nearby zone
        self.con.execute(f"""
            WITH unassigned AS (
                SELECT individual_id, point_id, x, y
                FROM batch_zone_grow
                WHERE cluster_id = -1
            ),
            nearby_zones AS (
                SELECT 
                    u.individual_id,
                    u.point_id,
                    a.cluster_id,
                    zs.size AS zone_size,
                    (u.x - a.x)*(u.x - a.x) + (u.y - a.y)*(u.y - a.y) AS dist_sq,
                    ROW_NUMBER() OVER (
                        PARTITION BY u.individual_id, u.point_id 
                        ORDER BY (u.x - a.x)*(u.x - a.x) + (u.y - a.y)*(u.y - a.y)
                    ) AS dist_rank
                FROM unassigned u
                JOIN batch_zone_grow a ON u.individual_id = a.individual_id AND a.cluster_id >= 0
                JOIN zone_sizes zs ON a.individual_id = zs.individual_id AND a.cluster_id = zs.cluster_id
            ),
            -- Among the 3 nearest assigned points, pick the one with the smallest zone
            best_zone AS (
                SELECT 
                    individual_id, point_id, cluster_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY individual_id, point_id 
                        ORDER BY zone_size, dist_sq
                    ) AS rn
                FROM nearby_zones
                WHERE dist_rank <= 3
            )
            UPDATE batch_zone_grow bzg
            SET cluster_id = bz.cluster_id
            FROM best_zone bz
            WHERE bzg.individual_id = bz.individual_id 
              AND bzg.point_id = bz.point_id
              AND bz.rn = 1
        """)

        self.con.execute("""
            INSERT INTO ga_assignments (individual_id, point_id, cluster_id)
            SELECT individual_id, point_id, cluster_id FROM batch_zone_grow
        """)
