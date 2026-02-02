"""
Clustering using Kmean or balanced zones using Genetic Algorithm.

Inspired by ArcGIS Build Balanced Zones tool.
Uses K-means as initial population then applies genetic algorithm optimization
to create zones with approximately equal number of features.

H3 Grid Mode:
- Aggregates points to H3 level 10 cells
- Clusters H3 cells (not individual points) for efficiency
- Uses H3 hexagonal neighbor relationships for true spatial contiguity
- Each cell weighted by point count for balanced zone sizes
"""

import logging
from pathlib import Path
from typing import Self, List
import numpy as np
import pandas as pd
from shapely import wkt

import duckdb

from goatlib.analysis.core.base import AnalysisTool
from goatlib.analysis.schemas.clustering import ClusteringParams, ClusterType
from goatlib.io.parquet import write_optimized_parquet
from goatlib.models.io import DatasetMetadata

logger = logging.getLogger(__name__)


class ClusteringZones(AnalysisTool):
    """
    Clustering to n Zones.

    Kmean Clustering OR
    Balanced Zone clustering using Genetic Algorithm.

    Pure genetic algorithm implementation for balanced spatial clustering.
    Uses K-means only for seeding some initial individuals, then applies
    standard genetic operations uniformly across all generations.

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
    ) -> None:
        """
        Initialize the balanced zone clustering tool.
        Args:
            db_path: Path to DuckDB database
            population_size: Number of individuals in each generation
            n_generations: Maximum number of generations to evolve
            mutation_rate: Probability of mutation (also controls alien introduction)
            crossover_rate: Probability of crossover between parents
            equal_size_weight: Weight for equal number of features criterion
        """
        super().__init__(db_path=db_path)
        self.population_size = population_size
        self.n_generations = n_generations
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        self.equal_size_weight = equal_size_weight

    def _run_implementation(
        self: Self, params: ClusteringParams
    ) -> List[tuple[Path, DatasetMetadata]]:
        logger.info("Starting clustering implementation...")
        input_meta, input_view = self.import_input(params.input_path, "input_data")
        input_geom = input_meta.geometry_column
        k = params.nb_cluster
        self.con.execute(f"""
            CREATE OR REPLACE TEMP TABLE points_metric AS
            SELECT 
                ROW_NUMBER() OVER () - 1 as point_id,
                *,
                ST_X({input_geom}) AS lon,
                ST_Y({input_geom}) AS lat,
                1 AS weight,
                ST_X(ST_Transform({input_geom}, 'EPSG:4326', 'EPSG:3857')) AS x,
                ST_Y(ST_Transform({input_geom}, 'EPSG:4326', 'EPSG:3857')) AS y
            FROM {input_view}
        """)
        n_points = self.con.execute("SELECT COUNT(*) FROM points_metric").fetchone()[0]
        n_total_points = n_points
        if n_points == 0:
            raise ValueError("No points found in input data")
        if n_points < k:
            raise ValueError(f"Cannot create {k} clusters from {n_points} points")
        
        if params.cluster_type == ClusterType.equal_size:
            # Step 1: Create initial population using K-means for seeding
            self._run_kmeans(k, max_iter=50)
            self._build_distance_neighbor_graph()
            # Create ga_assignments table to store all individuals
            self.con.execute("""
                CREATE OR REPLACE TEMP TABLE ga_assignments (
                    individual_id INTEGER,
                    point_id INTEGER,
                    cluster_id INTEGER
                )
            """)
            # Create ga_seeds table to store seed arrays
            self.con.execute("""
                CREATE OR REPLACE TEMP TABLE ga_seeds (
                    individual_id INTEGER,
                    cluster_id INTEGER,
                    seed_id INTEGER
                )
            """)

            self._init_population(k)
            self._create_individuals_from_seeds_batch( list(range(self.population_size)), k, n_points)
            logger.info( f"Created initial population of {self.population_size} individuals")

            # Genetic algorithm evolution - treat ALL generations uniformly
            best_fitness = float("inf")
            best_individual = 0
            stagnation_count = 0
            population_ids = list(range(self.population_size))
            next_individual_id = self.population_size

            for gen in range(self.n_generations + 1):
                # Calculate fitness for current population and track best solution
                logger.info(f"Calculating fitness for generation {gen}...")
                fitness_dict = self._calculate_fitness_batch(population_ids, k, n_total_points)
                fitness_scores = [fitness_dict.get(i, float("inf")) for i in population_ids]
                gen_best_fitness = ( min(fitness_scores) if fitness_scores else float("inf") )
                improvement_threshold = 1e-6

                if gen_best_fitness < best_fitness - improvement_threshold:
                    best_fitness = gen_best_fitness
                    best_individual = population_ids[fitness_scores.index(best_fitness)]
                    stagnation_count = 0
                    logger.info(f"Generation {gen}: NEW BEST fitness = {best_fitness:.6f}")
                else:
                    stagnation_count += 1
                    if gen % 5 == 0:
                        logger.info( f"Generation {gen}: fitness = {gen_best_fitness:.6f}, stagnation = {stagnation_count}" )
                # Stop if this is the last generation or early stopping
                if gen >= self.n_generations or stagnation_count >= 12:
                    if stagnation_count >= 12:
                        logger.info( f"Early stopping at generation {gen} due to stagnation")
                    break

                # Apply genetic operations to create next generation (skip for last iteration)
                if gen < self.n_generations and stagnation_count < 12:
                    # Sort population by fitness to select parents and keep  elite individuals
                    sorted_indices = np.argsort(fitness_scores)
                    n_parents = self.population_size // 2
                    parent_ids = [population_ids[i] for i in sorted_indices[:n_parents]]
                    n_elite = max(2, self.population_size // 10)
                    elite_ids = [population_ids[i] for i in sorted_indices[:n_elite]]

                    # Create next generation
                    new_individual_ids, elite_ids_kept, next_individual_id = (self._evolve_generation_batch( parent_ids, elite_ids, next_individual_id, k, n_points) )

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

        # Prepare output path
        if not params.output_path:
            params.output_path = str(
                Path(params.source_path).parent
                / f"{Path(params.source_path).stem}_clustered_zones.parquet"
            )
        output_path = Path(params.output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if best_individual == "kmeans":
            self.con.execute(f"""
                CREATE OR REPLACE TEMP VIEW clustering_result AS
                SELECT 
                    p.* EXCLUDE (point_id, lon, lat, x, y, weight),
                    a.cluster_id,
                    COUNT(*) OVER (PARTITION BY a.cluster_id) AS cluster_size
                FROM points_metric p
                JOIN kmeans_assignments a ON p.point_id = a.point_id
            """)
        else:
            self.con.execute(f"""
                CREATE OR REPLACE TEMP VIEW clustering_result AS
                SELECT 
                    p.* EXCLUDE (point_id, lon, lat, x, y, weight),
                    a.cluster_id,
                    cs.cluster_size
                FROM points_metric p
                JOIN ga_assignments a ON p.point_id = a.point_id
                JOIN (
                    SELECT 
                        a_inner.cluster_id,
                        COUNT(*) AS cluster_size
                    FROM ga_assignments a_inner
                    WHERE a_inner.individual_id = {best_individual}
                    GROUP BY a_inner.cluster_id
                ) cs ON a.cluster_id = cs.cluster_id
                WHERE a.individual_id = {best_individual}
            """)
        write_optimized_parquet(
            self.con,
            "clustering_result",
            output_path,
            geometry_column=input_geom,
        )

        logger.info(f"Created {k} zones and saved to: %s", output_path)
        dataset_meta = DatasetMetadata(
            path=str(output_path),
            source_type="vector",
            format="geoparquet",
            geometry_type=input_meta.geometry_type,
            geometry_column=input_geom,
            crs=str(input_meta.crs),
        )
        return [(output_path, dataset_meta)]

    def _build_distance_neighbor_graph(self: Self) -> None:
        """
        Build neighbor graph using distance-based approach for points. This allows to maintain continguity
        """
        self.con.execute("""
            CREATE OR REPLACE TEMP TABLE neighbors AS
            WITH point_distances AS (
                SELECT 
                    p1.point_id AS from_id,
                    p2.point_id AS to_id,
                    (p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y) AS dist_sq
                FROM points_metric p1, points_metric p2
                WHERE p1.point_id != p2.point_id
            ),
            ranked AS (
                SELECT 
                    from_id, to_id,
                    ROW_NUMBER() OVER (PARTITION BY from_id ORDER BY dist_sq) AS rn
                FROM point_distances
            )
            SELECT from_id, to_id
            FROM ranked
            WHERE rn <= 8
        """)
        # Ensure connectivity: points that never appear as to_id should be connected
        self.con.execute("""
            CREATE OR REPLACE TEMP TABLE neighbors_complete AS
            WITH existing_neighbors AS (
                SELECT from_id, to_id FROM neighbors
            ),
            isolated_points AS (
                SELECT point_id
                FROM points_metric p
                WHERE NOT EXISTS (SELECT 1 FROM neighbors n WHERE n.to_id = p.point_id)
            ),
            closest_to_isolated AS (
                SELECT 
                    ip.point_id AS isolated_id,
                    p.point_id AS closest_id,
                    ROW_NUMBER() OVER (PARTITION BY ip.point_id ORDER BY 
                        (p.x - ip_coords.x) * (p.x - ip_coords.x) + (p.y - ip_coords.y) * (p.y - ip_coords.y)
                    ) AS rn
                FROM isolated_points ip
                CROSS JOIN points_metric p
                JOIN points_metric ip_coords ON ip.point_id = ip_coords.point_id
                WHERE p.point_id != ip.point_id
            ),
            connectivity_edges AS (
                SELECT closest_id AS from_id, isolated_id AS to_id
                FROM closest_to_isolated
                WHERE rn <= 8
            )
            SELECT from_id, to_id FROM existing_neighbors
            UNION ALL
            SELECT from_id, to_id FROM connectivity_edges
        """)

        # Replace neighbors table with the complete version
        self.con.execute("DROP TABLE neighbors")
        self.con.execute("ALTER TABLE neighbors_complete RENAME TO neighbors")

    def _run_kmeans(self: Self, k: int, max_iter: int = 100) -> None:
        """
        Run K-means clustering on points.
        """
        # Initialize centroids with well-distributed points
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
         # Ensure we have exactly k centroids
        actual_centroids = self.con.execute(
            "SELECT COUNT(*) FROM centroids"
        ).fetchone()[0]
        if actual_centroids < k:
            # Add random points if we don't have enough
            self.con.execute(f"""
                INSERT INTO centroids (cluster_id, cx, cy)
                SELECT 
                    {actual_centroids} + ROW_NUMBER() OVER () - 1 AS cluster_id,
                    x AS cx, y AS cy
                FROM points_metric
                WHERE NOT EXISTS (
                    SELECT 1 FROM centroids c 
                    WHERE c.cx = points_metric.x AND c.cy = points_metric.y
                )
                ORDER BY random()
                LIMIT {k - actual_centroids}
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
        Create initial population for GA.
        Works with original points directly.
        Population composition:
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
    ) -> dict[int, float]:
        """
        Calculate fitness scores 
        """
        if not individual_ids:
            return {}

        target_size = n_total_points / k
        ids_str = ",".join(map(str, individual_ids))

        results = self.con.execute(f"""
            WITH individual_data AS (
                SELECT a.individual_id, a.point_id, a.cluster_id, p.x, p.y, p.weight
                FROM ga_assignments a
                JOIN points_metric p ON a.point_id = p.point_id
                WHERE a.individual_id IN ({ids_str})
            ),
            zone_stats AS (
                SELECT 
                    individual_id,
                    cluster_id,
                    SUM(weight) AS zone_size,  -- Use weight (point count) not cell count
                    SUM(x * weight) / SUM(weight) AS cx,  -- Weighted centroid
                    SUM(y * weight) / SUM(weight) AS cy
                FROM individual_data
                GROUP BY individual_id, cluster_id
            ),
            size_fitness AS (
                SELECT 
                    individual_id,
                    SUM(((zone_size - {target_size}) / {target_size}) * ((zone_size - {target_size}) / {target_size})) AS size_score
                FROM zone_stats
                GROUP BY individual_id
            ),
            point_centroid_dist AS (
                SELECT 
                    id.individual_id,
                    id.cluster_id,
                    id.weight,
                    SQRT((id.x - zs.cx) * (id.x - zs.cx) + (id.y - zs.cy) * (id.y - zs.cy)) AS dist_to_centroid
                FROM individual_data id
                JOIN zone_stats zs ON id.individual_id = zs.individual_id AND id.cluster_id = zs.cluster_id
            )
            SELECT 
                sf.individual_id,
                sf.size_score
            FROM size_fitness sf
        """).df()

        fitness_dict = {}
        for _, row in results.iterrows():
            ind_id = int(row["individual_id"])
            size_f = row["size_score"] if row["size_score"] is not None else 0.0
            fitness_dict[ind_id] = self.equal_size_weight * size_f

        return fitness_dict

    def _evolve_generation_batch(
        self: Self,
        parent_ids: list[int],
        elite_ids: list[int],
        next_individual_id: int,
        k: int,
        n_points: int,
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

        # Get list of new individual IDs
        new_individual_ids = (self.con.execute("""  SELECT DISTINCT individual_id FROM generation_offspring_seeds ORDER BY individual_id
        """).df()["individual_id"].tolist())

        if not new_individual_ids:
            return elite_ids, elite_ids, next_individual_id

        #  Batch create all individuals (zone growing)
        logger.info( f"Creating {len(new_individual_ids)} new individuals via zone growing..." )
        self._create_individuals_from_seeds_batch(new_individual_ids, k, n_points)
        updated_next_id = next_individual_id + len(new_individual_ids)
        return new_individual_ids, elite_ids, updated_next_id

    def _create_individuals_from_seeds_batch(
        self: Self,
        individual_ids: list[int],
        k: int,
        n_points: int,
    ) -> None:
        """
        Create multiple individuals from their seeds using a growing process to maintain contiguity
        """
        if not individual_ids:
            return
        ids_str = ",".join(map(str, individual_ids))
        target_size = n_points // k
        points_per_zone_per_iter = max(10, target_size // 10)

        # Create assignments table
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

        # Maintain zone sizes incrementally to avoid full recompute each iteration
        self.con.execute("""
            CREATE OR REPLACE TEMP TABLE zone_sizes AS
            SELECT individual_id, cluster_id, SUM(weight) AS size
            FROM batch_zone_grow
            WHERE cluster_id >= 0
            GROUP BY individual_id, cluster_id
        """)

        self.con.execute("""
            CREATE OR REPLACE TEMP TABLE assignment_weights (
                individual_id INTEGER,
                cluster_id INTEGER,
                add_weight DOUBLE
            )
        """)

        # Batch zone growing 
        max_iterations = min(15, (n_points // (k * points_per_zone_per_iter)) + 15)
        for iteration in range(max_iterations):
            # find candidates, rank by zone size, resolve conflicts, and select
            self.con.execute("TRUNCATE batch_assignments")
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

            # Incrementally update zone sizes
            self.con.execute("TRUNCATE assignment_weights")
            self.con.execute("""
                INSERT INTO assignment_weights
                SELECT 
                    ba.individual_id,
                    ba.cluster_id,
                    SUM(bzg.weight) AS add_weight
                FROM batch_assignments ba
                JOIN batch_zone_grow bzg ON bzg.individual_id = ba.individual_id
                                          AND bzg.point_id = ba.point_id
                GROUP BY ba.individual_id, ba.cluster_id
            """)
            self.con.execute("""
                UPDATE zone_sizes zs
                SET size = zs.size + aw.add_weight
                FROM assignment_weights aw
                WHERE zs.individual_id = aw.individual_id
                  AND zs.cluster_id = aw.cluster_id
            """)
            self.con.execute("""
                INSERT INTO zone_sizes (individual_id, cluster_id, size)
                SELECT aw.individual_id, aw.cluster_id, aw.add_weight
                FROM assignment_weights aw
                LEFT JOIN zone_sizes zs
                  ON zs.individual_id = aw.individual_id
                 AND zs.cluster_id = aw.cluster_id
                WHERE zs.individual_id IS NULL
            """)

            # Early exit check
            unassigned_count = self.con.execute(
                "SELECT COUNT(*) FROM batch_zone_grow WHERE cluster_id = -1"
            ).fetchone()[0]
            if unassigned_count == 0:
                break

        # Handle remaining unassigned points - assign to closest zone centroid
        self.con.execute(f"""
            WITH zone_centroids AS (
                SELECT 
                    bzg.individual_id, 
                    bzg.cluster_id,
                    SUM(bzg.x * bzg.weight) / SUM(bzg.weight) AS cx,
                    SUM(bzg.y * bzg.weight) / SUM(bzg.weight) AS cy
                FROM batch_zone_grow bzg
                WHERE bzg.cluster_id >= 0
                GROUP BY bzg.individual_id, bzg.cluster_id
            ),
            closest_zone AS (
                SELECT 
                    u.individual_id,
                    u.point_id,
                    (SELECT zc.cluster_id FROM zone_centroids zc 
                     WHERE zc.individual_id = u.individual_id
                     ORDER BY (u.x - zc.cx)*(u.x - zc.cx) + (u.y - zc.cy)*(u.y - zc.cy)
                     LIMIT 1) AS new_cluster_id
                FROM batch_zone_grow u
                WHERE u.cluster_id = -1
            )
            UPDATE batch_zone_grow bzg
            SET cluster_id = cz.new_cluster_id
            FROM closest_zone cz
            WHERE bzg.individual_id = cz.individual_id 
              AND bzg.point_id = cz.point_id
              AND cz.new_cluster_id IS NOT NULL
        """)

        # Store results
        self.con.execute("""
            INSERT INTO ga_assignments (individual_id, point_id, cluster_id)
            SELECT individual_id, point_id, cluster_id FROM batch_zone_grow
        """)
