"""Unit tests for ClusteringTool to verify clustering functionality."""

from pathlib import Path

import duckdb
import numpy as np
import pytest

from goatlib.analysis.geoanalysis.clustering_kmean import (
    ClusteringSpatialKMeansUDF,
)
from goatlib.analysis.geoanalysis.clustering_zones import (
    ClusteringZones,
)
from goatlib.analysis.schemas.clustering import ClusteringParams, ClusterType


# Test data and result directories
TEST_DATA_DIR = Path(__file__).parent.parent.parent / "data" / "analysis"
RESULT_DIR = Path(__file__).parent.parent.parent / "result"


@pytest.fixture(autouse=True)
def ensure_result_dir():
    """Ensure result directory exists."""
    RESULT_DIR.mkdir(parents=True, exist_ok=True)


class TestKMeansClustering:
    """Unit tests for K-means clustering."""

    def test_kmeans_clustering_kita_data(self) -> None:
        """Test spatial K-means clustering with kita (kindergarten) data."""
        input_path = str(TEST_DATA_DIR / "kita_munich.geojson")
        result_dir = Path(__file__).parent.parent.parent / "result"
        result_dir.mkdir(parents=True, exist_ok=True)

        # Verify test data exists
        assert Path(input_path).exists(), f"Test data not found: {input_path}"

        # Initialize clustering tool
        clustering_tool = ClusteringSpatialKMeansUDF()

        # Set up clustering parameters
        params = ClusteringParams(
            input_path=input_path,
            output_path=str(result_dir / "cluster_kita_kmeans.parquet"),
            nb_cluster=8,
        )

        # Run clustering analysis
        results = clustering_tool._run_implementation(params)

        # Verify results
        assert len(results) == 1
        output_path, metadata = results[0]
        assert output_path.exists()

        # Read output and verify cluster assignments
        con = duckdb.connect()
        con.execute("INSTALL spatial; LOAD spatial;")
        df = con.execute(f"SELECT * FROM '{output_path}'").df()
        con.close()

        assert "cluster_id" in df.columns
        assert len(df["cluster_id"].unique()) == 8


class TestZonesClustering:
    """Unit tests for Balanced Zones clustering (iterative boundary refinement)."""

    def test_balanced_zones_kita_data(self) -> None:
        """Test balanced zones clustering with kita (kindergarten) data."""
        input_path = str(TEST_DATA_DIR / "kita_munich.geojson")
        result_dir = Path(__file__).parent.parent.parent / "result"
        result_dir.mkdir(parents=True, exist_ok=True)

        # Verify test data exists
        assert Path(input_path).exists(), f"Test data not found: {input_path}"

        # Initialize clustering tool
        clustering_tool = ClusteringZones()

        # Set up clustering parameters
        params = ClusteringParams(
            input_path=input_path,
            output_path=str(result_dir / "cluster_kita_balanced.parquet"),
            nb_cluster=8,
            cluster_type=ClusterType.equal_size,
        )

        # Run clustering analysis
        results = clustering_tool._run_implementation(params)

        # Verify results
        assert len(results) == 1
        output_path, metadata = results[0]
        assert output_path.exists()

        # Read output and verify cluster assignments
        con = duckdb.connect()
        con.execute("INSTALL spatial; LOAD spatial;")
        df = con.execute(f"SELECT * FROM '{output_path}'").df()
        con.close()

        assert "cluster_id" in df.columns
        unique_clusters = df["cluster_id"].unique()
        assert len(unique_clusters) == 8

        # Check zone sizes are more balanced than K-means would typically produce
        zone_sizes = df["cluster_id"].value_counts().values
        size_std = np.std(zone_sizes)
        size_mean = np.mean(zone_sizes)
        cv = size_std / size_mean  # Coefficient of variation

        print(f"\nBalanced zones size distribution:")
        print(f"  Sizes: {sorted(zone_sizes)}")
        print(f"  Mean: {size_mean:.1f}, Std: {size_std:.1f}, CV: {cv:.3f}")

        # CV should be reasonably low for balanced zones (< 0.8)
        assert cv < 0.8, f"Zones are not well balanced: CV = {cv:.3f}"
