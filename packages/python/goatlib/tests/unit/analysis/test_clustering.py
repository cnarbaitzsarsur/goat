"""Unit tests for ClusteringTool to verify clustering functionality."""

from pathlib import Path

import duckdb
import numpy as np
import pytest


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

class TestZonesClustering:
    """Unit tests for Balanced Zones clustering (iterative boundary refinement)."""

    def test_balanced_zones_kita_data(self) -> None:
        """Test balanced zones clustering with kita (kindergarten) data."""
        input_path = str(TEST_DATA_DIR / "kita.gpkg")
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
            nb_cluster=4,
            cluster_type=ClusterType.equal_size,
        )

        # Run clustering analysis
        results = clustering_tool._run_implementation(params)

        # Verify results
        assert len(results) == 2  # Main points output + summary output
        output_path, metadata = results[0]  # Main points output
        summary_path, summary_metadata = results[1]  # Summary output
        assert output_path.exists()
        assert summary_path.exists()

        # Read output and verify cluster assignments
        con = duckdb.connect()
        con.execute("INSTALL spatial; LOAD spatial;")
        df = con.execute(f"SELECT * FROM '{summary_path}'").df()
        con.close()

        assert "cluster_id" in df.columns
        unique_clusters = df["cluster_id"].unique()
        assert len(unique_clusters) == 4

        # Check zone sizes are more balanced than K-means would typically produce
        zone_sizes = df["cluster_size"].values
        size_std = np.std(zone_sizes)
        size_mean = np.mean(zone_sizes)
        cv = size_std / size_mean  
        assert cv < 0.5, f"Zones are not well balanced: CV = {cv:.3f}"


    def test_kmeans_kita_data(self) -> None:
        """Test K-means clustering with kita (kindergarten) data."""
        input_path = str(TEST_DATA_DIR / "kita.gpkg")
        result_dir = Path(__file__).parent.parent.parent / "result"
        result_dir.mkdir(parents=True, exist_ok=True)

        # Verify test data exists
        assert Path(input_path).exists(), f"Test data not found: {input_path}"

        # Initialize clustering tool
        clustering_tool = ClusteringZones()

        # Set up K-means parameters
        params = ClusteringParams(
            input_path=input_path,
            output_path=str(result_dir / "cluster_kita_kmeans.parquet"),
            nb_cluster=4,
            cluster_type=ClusterType.kmean,
        )

        # Run clustering analysis
        results = clustering_tool._run_implementation(params)

        # Verify results
        assert len(results) == 2  # Main points output + summary output
        output_path, metadata = results[0]  # Main points output
        summary_path, summary_metadata = results[1]  # Summary output
        assert output_path.exists()
        assert summary_path.exists()

        # Read output and verify cluster assignments
        con = duckdb.connect()
        con.execute("INSTALL spatial; LOAD spatial;")
        df = con.execute(f"SELECT * FROM '{summary_path}'").df()
        con.close()

        assert "cluster_id" in df.columns
        unique_clusters = df["cluster_id"].unique()
        assert len(unique_clusters) == 4

        print(f"\nK-means cluster distribution:")
        print(f"  Cluster sizes: {sorted(df['cluster_size'].values)}")

    def test_balanced_zones_kita_field_weight(self) -> None:
        """Test balanced zones clustering with field-based weighting (capacity_int)."""
        input_path = str(TEST_DATA_DIR / "kita.gpkg")
        result_dir = Path(__file__).parent.parent.parent / "result"
        result_dir.mkdir(parents=True, exist_ok=True)

        # Verify test data exists
        assert Path(input_path).exists(), f"Test data not found: {input_path}"

        # Initialize clustering tool
        clustering_tool = ClusteringZones()

        # Set up clustering parameters with field-based weighting
        params = ClusteringParams(
            input_path=input_path,
            output_path=str(result_dir / "cluster_kita_field.parquet"),
            nb_cluster=4,
            cluster_type=ClusterType.equal_size,
            weight_method="field",
            weight_field="capacity_int",
        )

        # Run clustering analysis
        results = clustering_tool._run_implementation(params)

        # Verify results
        assert len(results) == 2  # Main points output + summary output
        output_path, metadata = results[0]  # Main points output
        summary_path, summary_metadata = results[1]  # Summary output
        assert output_path.exists()
        assert summary_path.exists()

        # Read output and verify cluster assignments
        con = duckdb.connect()
        con.execute("INSTALL spatial; LOAD spatial;")
        df = con.execute(f"SELECT * FROM '{summary_path}'").df()
        con.close()

        assert "cluster_id" in df.columns
        unique_clusters = df["cluster_id"].unique()
        assert len(unique_clusters) == 4

        # Check that cluster_size reflects the weighted sum (capacity_int), not just point count
        print(f"\nBalanced zones (field: capacity_int) distribution:")
        print(f"  Cluster sizes (weighted): {sorted(df['cluster_size'].values)}")

        # Verify balance on the weighted sizes
        zone_sizes = df["cluster_size"].values
        size_std = np.std(zone_sizes)
        size_mean = np.mean(zone_sizes)
        cv = size_std / size_mean

        print(f"  Mean: {size_mean:.1f}, Std: {size_std:.1f}, CV: {cv:.3f}")
        assert cv < 0.5, f"Weighted zones are not well balanced: CV = {cv:.3f}"