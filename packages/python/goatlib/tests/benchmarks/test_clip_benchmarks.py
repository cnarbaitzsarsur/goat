"""
Benchmark tests for GIS overlay operations with large datasets
"""

import time
from pathlib import Path
from typing import Tuple

from goatlib.analysis.geoprocessing.clip import ClipTool
from goatlib.analysis.schemas.geoprocessing import ClipParams


def benchmark_clip_large_dataset() -> Tuple[float, int, str]:
    """
    Benchmark clip operation with large Bayern landuse dataset (~6.8M features)

    Returns:
        Tuple of (execution_time_seconds, feature_count_processed, output_file_path)
    """
    # Test data paths
    test_data_dir = Path(__file__).parent.parent / "data" / "vector"
    result_dir = Path(__file__).parent.parent / "result"

    landuse_data = str(test_data_dir / "landuse.parquet")
    munich_boundary = str(
        test_data_dir / "munich_and_county.parquet"
    )  # Multiple overlay features
    output_path = str(result_dir / "clip_landuse_by_munich_and_county.parquet")

    # Clean up any existing output
    if Path(output_path).exists():
        Path(output_path).unlink()

    # Set up clip parameters
    params = ClipParams(
        input_path=landuse_data, overlay_path=munich_boundary, output_path=output_path
    )

    print("🔧 Benchmark: Large Dataset Clip Operation")
    print(f"📊 Input: Bayern landuse data ({landuse_data})")
    print(
        f"✂️  Clip boundary: Munich and County (multiple features) ({munich_boundary})"
    )
    print(f"💾 Output: {output_path}")

    # Start timing
    start_time = time.time()

    # Run clip operation
    tool = ClipTool()
    results = tool.run(params)

    # End timing
    end_time = time.time()
    execution_time = end_time - start_time

    # Get result info
    output_size_mb = Path(output_path).stat().st_size / (1024 * 1024)

    print("✅ Benchmark completed!")
    print(f"⏱️  Execution time: {execution_time:.2f} seconds")
    print(f"📄 Output file size: {output_size_mb:.1f} MB")
    print(f"🗂️  Results: {len(results)} datasets created")

    return execution_time, output_size_mb, output_path


def benchmark_summary():
    """Run all benchmark tests and provide summary"""
    print("=" * 60)
    print("🚀 GOAT GIS OVERLAY BENCHMARKS")
    print("=" * 60)

    # Clip benchmark
    try:
        exec_time, file_size, output_file = benchmark_clip_large_dataset()

        print("\n📋 BENCHMARK RESULTS:")
        print("   Operation: Clip (Zuschneiden)")
        print("   Dataset: Bayern Landuse (~6.8M features)")
        print(f"   Execution Time: {exec_time:.2f}s")
        print(f"   Output Size: {file_size:.1f} MB")
        print(f"   Performance: {6_794_964 / exec_time:.0f} features/second")
        print(f"   Output File: {output_file}")

    except Exception as e:
        print(f"❌ Benchmark failed: {e}")

    print("=" * 60)


if __name__ == "__main__":
    benchmark_summary()
