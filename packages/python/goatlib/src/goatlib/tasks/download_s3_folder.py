"""S3 folder download task for Windmill.

This task downloads folders from S3 (Hetzner or any S3-compatible storage)
with resume support, validation, and parallel downloads.

Features:
- Resumable: skips already downloaded files that pass validation
- Validates files by size and optionally ETag/MD5
- Retries failed downloads
- Progress tracking
- Parallel downloads for speed

Usage as Windmill script:
    # Called by Windmill with DownloadS3FolderParams

Usage as library:
    from goatlib.tasks import DownloadS3FolderTask

    task = DownloadS3FolderTask()
    task.init_from_env()
    results = task.run(DownloadS3FolderParams(
        bucket="my-bucket",
        prefix="data/folder",
        output_dir="/app/data/downloads"
    ))
"""

import hashlib
import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Self

import boto3
from botocore.config import Config
from pydantic import BaseModel, Field

from goatlib.tools.base import ToolSettings

logger = logging.getLogger(__name__)

__all__ = ["DownloadS3FolderParams", "DownloadS3FolderTask", "main"]


class DownloadS3FolderParams(BaseModel):
    """Parameters for S3 folder download task."""

    bucket: str = Field(
        description="S3 bucket name",
    )
    prefix: str = Field(
        description="S3 prefix (folder path) to download",
    )
    output_dir: str = Field(
        description="Local output directory path",
    )
    endpoint_url: str | None = Field(
        default=None,
        description="S3 endpoint URL (uses S3_ENDPOINT_URL env var if not provided)",
    )
    max_retries: int = Field(
        default=3,
        description="Number of retries for failed downloads",
    )
    workers: int = Field(
        default=4,
        description="Number of parallel download workers",
    )
    validate_checksum: bool = Field(
        default=True,
        description="Whether to validate MD5 checksums",
    )
    access_key_id: str = Field(
        description="S3 access key ID",
    )
    secret_access_key: str = Field(
        description="S3 secret access key",
    )


@dataclass
class DownloadStats:
    """Track download progress and statistics."""

    total_files: int = 0
    downloaded: int = 0
    skipped: int = 0
    failed: int = 0
    total_bytes: int = 0
    downloaded_bytes: int = 0
    failed_files: list = field(default_factory=list)
    start_time: float = field(default_factory=time.time)

    def elapsed_time(self: Self) -> str:
        """Get elapsed time as formatted string."""
        elapsed = time.time() - self.start_time
        hours, remainder = divmod(int(elapsed), 3600)
        minutes, seconds = divmod(remainder, 60)
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

    def progress_str(self: Self) -> str:
        """Get progress as formatted string."""
        completed = self.downloaded + self.skipped
        pct = (completed / self.total_files * 100) if self.total_files > 0 else 0
        return (
            f"[{self.elapsed_time()}] "
            f"Progress: {completed}/{self.total_files} ({pct:.1f}%) | "
            f"Downloaded: {self.downloaded} | Skipped: {self.skipped} | "
            f"Failed: {self.failed} | "
            f"Size: {self._format_bytes(self.downloaded_bytes)}"
        )

    @staticmethod
    def _format_bytes(size: int) -> str:
        """Format bytes as human-readable string."""
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if size < 1024:
                return f"{size:.2f} {unit}"
            size /= 1024
        return f"{size:.2f} PB"

    def to_dict(self: Self) -> dict:
        """Convert to dictionary for output."""
        return {
            "total_files": self.total_files,
            "downloaded": self.downloaded,
            "skipped": self.skipped,
            "failed": self.failed,
            "total_bytes": self.total_bytes,
            "downloaded_bytes": self.downloaded_bytes,
            "failed_files": self.failed_files,
            "elapsed_time": self.elapsed_time(),
        }


@dataclass
class S3Object:
    """Represents an S3 object to download."""

    key: str
    size: int
    etag: str
    local_path: Path


class DownloadS3FolderTask:
    """Download folders from S3 with resume and validation support.

    This task downloads a folder (prefix) from S3 to a local directory,
    with support for resuming interrupted downloads, checksum validation,
    and parallel downloads.

    Example (Windmill):
        def main(params: DownloadS3FolderParams) -> dict:
            task = DownloadS3FolderTask()
            task.init_from_env()
            return task.run(params)

    Example (Library):
        task = DownloadS3FolderTask()
        task.init_from_env()
        stats = task.run(DownloadS3FolderParams(
            bucket="my-bucket",
            prefix="data/folder",
            output_dir="/app/data/downloads"
        ))
    """

    def __init__(self: Self) -> None:
        """Initialize the S3 folder download task."""
        self.settings: ToolSettings | None = None
        self._s3_client = None

    @staticmethod
    def _configure_logging_for_windmill() -> None:
        """Configure Python logging to output to stdout for Windmill."""
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.INFO)

        for handler in root_logger.handlers[:]:
            root_logger.removeHandler(handler)

        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.INFO)
        handler.setFormatter(
            logging.Formatter("%(name)s - %(levelname)s - %(message)s")
        )
        root_logger.addHandler(handler)

    def init_from_env(self: Self) -> None:
        """Initialize settings from environment variables."""
        self._configure_logging_for_windmill()
        self.settings = ToolSettings.from_env()

    def _get_s3_client(
        self: Self, endpoint_url: str | None, max_retries: int, workers: int,
        access_key_id: str, secret_access_key: str
    ) -> "boto3.client":
        """Get or create S3 client."""
        if not self.settings:
            raise RuntimeError("Call init_from_env() before running task")

        # Use provided endpoint or fall back to settings
        endpoint = endpoint_url or self.settings.s3_endpoint_url

        # Configure boto3 with retries
        config = Config(
            retries={"max_attempts": max_retries, "mode": "adaptive"},
            max_pool_connections=workers + 5,
        )

        return boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=config,
        )

    def _load_state(self: Self, state_file: Path) -> dict:
        """Load download state from file."""
        if state_file.exists():
            try:
                with open(state_file) as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError):
                pass
        return {"completed": {}, "failed": []}

    def _save_state(self: Self, state: dict, state_file: Path) -> None:
        """Save download state to file."""
        state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(state_file, "w") as f:
            json.dump(state, f, indent=2)

    def _compute_md5(self: Self, file_path: Path) -> str:
        """Compute MD5 hash of a file."""
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192 * 1024), b""):  # 8MB chunks
                hash_md5.update(chunk)
        return hash_md5.hexdigest()

    def _is_valid_file(
        self: Self, obj: S3Object, state: dict, validate_checksum: bool
    ) -> bool:
        """Check if a local file is valid (exists with correct size/checksum)."""
        if not obj.local_path.exists():
            return False

        local_size = obj.local_path.stat().st_size
        if local_size != obj.size:
            logger.debug(
                f"Size mismatch for {obj.key}: local={local_size}, expected={obj.size}"
            )
            return False

        # Check if already validated in state
        if obj.key in state.get("completed", {}):
            saved_etag = state["completed"][obj.key].get("etag")
            if saved_etag == obj.etag:
                return True

        # Validate checksum if enabled
        if validate_checksum:
            # S3 ETags are usually MD5 for non-multipart uploads
            # For multipart uploads, ETag format is "hash-partcount"
            etag = obj.etag.strip('"')
            if "-" not in etag:  # Simple upload, ETag is MD5
                local_md5 = self._compute_md5(obj.local_path)
                if local_md5 != etag:
                    logger.debug(
                        f"Checksum mismatch for {obj.key}: "
                        f"local={local_md5}, expected={etag}"
                    )
                    return False

        return True

    def _list_objects(
        self: Self, s3_client: "boto3.client", bucket: str, prefix: str
    ) -> list[S3Object]:
        """List all objects under the prefix."""
        objects = []
        paginator = s3_client.get_paginator("list_objects_v2")

        prefix_with_slash = prefix.rstrip("/") + "/" if prefix else ""

        logger.info(f"Listing objects in s3://{bucket}/{prefix_with_slash}...")

        for page in paginator.paginate(Bucket=bucket, Prefix=prefix_with_slash):
            for obj in page.get("Contents", []):
                key = obj["Key"]

                # Skip if it's just the prefix directory itself
                if key.endswith("/"):
                    continue

                objects.append(
                    S3Object(
                        key=key,
                        size=obj["Size"],
                        etag=obj["ETag"],
                        local_path=Path(""),  # Will be set later
                    )
                )

        return objects

    def _download_file(
        self: Self,
        s3_client: "boto3.client",
        bucket: str,
        obj: S3Object,
        state: dict,
        max_retries: int,
        validate_checksum: bool,
    ) -> tuple[S3Object, bool, str]:
        """Download a single file with retries."""
        for attempt in range(max_retries):
            try:
                # Create parent directories
                obj.local_path.parent.mkdir(parents=True, exist_ok=True)

                # Download to temp file first
                temp_path = obj.local_path.with_suffix(obj.local_path.suffix + ".tmp")

                s3_client.download_file(
                    bucket,
                    obj.key,
                    str(temp_path),
                )

                # Verify downloaded file size
                if temp_path.stat().st_size != obj.size:
                    temp_path.unlink(missing_ok=True)
                    raise ValueError(
                        f"Size mismatch after download: got {temp_path.stat().st_size}, "
                        f"expected {obj.size}"
                    )

                # Verify checksum for non-multipart uploads
                if validate_checksum:
                    etag = obj.etag.strip('"')
                    if "-" not in etag:
                        local_md5 = self._compute_md5(temp_path)
                        if local_md5 != etag:
                            temp_path.unlink(missing_ok=True)
                            raise ValueError(
                                f"Checksum mismatch: got {local_md5}, expected {etag}"
                            )

                # Move temp file to final location
                temp_path.rename(obj.local_path)

                # Update state
                state["completed"][obj.key] = {
                    "etag": obj.etag,
                    "size": obj.size,
                    "downloaded_at": datetime.now().isoformat(),
                }

                return obj, True, ""

            except Exception as e:
                error_msg = str(e)
                if attempt < max_retries - 1:
                    wait_time = 2**attempt  # Exponential backoff
                    time.sleep(wait_time)
                else:
                    return obj, False, error_msg

        return obj, False, "Max retries exceeded"

    def run(self: Self, params: DownloadS3FolderParams) -> dict:
        """Execute the S3 folder download.

        Args:
            params: Download parameters

        Returns:
            Dictionary with download statistics
        """
        if not self.settings:
            raise RuntimeError("Call init_from_env() before running task")

        output_dir = Path(params.output_dir)
        prefix = params.prefix.rstrip("/")

        # Create output directory
        output_dir.mkdir(parents=True, exist_ok=True)

        # State file for tracking progress
        state_file = output_dir / ".download_state.json"
        state = self._load_state(state_file)

        # Create S3 client
        s3_client = self._get_s3_client(
            params.endpoint_url, params.max_retries, params.workers,
            params.access_key_id, params.secret_access_key
        )

        # Initialize stats
        stats = DownloadStats()

        # List all objects
        objects = self._list_objects(s3_client, params.bucket, prefix)
        if not objects:
            logger.info(f"No objects found under s3://{params.bucket}/{prefix}/")
            return stats.to_dict()

        # Set local paths for all objects
        prefix_len = len(prefix) + 1 if prefix else 0
        for obj in objects:
            relative_key = obj.key[prefix_len:]
            obj.local_path = output_dir / relative_key

        stats.total_files = len(objects)
        stats.total_bytes = sum(obj.size for obj in objects)

        logger.info(
            f"Found {len(objects)} files " f"({stats._format_bytes(stats.total_bytes)})"
        )

        # Filter out already valid files
        to_download = []
        for obj in objects:
            if self._is_valid_file(obj, state, params.validate_checksum):
                stats.skipped += 1
            else:
                to_download.append(obj)

        if stats.skipped > 0:
            logger.info(f"Skipping {stats.skipped} already downloaded and valid files")

        if not to_download:
            logger.info("All files already downloaded and validated!")
            return stats.to_dict()

        logger.info(
            f"Downloading {len(to_download)} files with {params.workers} workers..."
        )

        # Download files in parallel
        with ThreadPoolExecutor(max_workers=params.workers) as executor:
            futures = {
                executor.submit(
                    self._download_file,
                    s3_client,
                    params.bucket,
                    obj,
                    state,
                    params.max_retries,
                    params.validate_checksum,
                ): obj
                for obj in to_download
            }

            for future in as_completed(futures):
                obj, success, error = future.result()

                if success:
                    stats.downloaded += 1
                    stats.downloaded_bytes += obj.size
                else:
                    stats.failed += 1
                    stats.failed_files.append({"key": obj.key, "error": error})
                    state["failed"].append(obj.key)

                # Save state periodically
                if (stats.downloaded + stats.failed) % 10 == 0:
                    self._save_state(state, state_file)

                # Log progress
                logger.info(stats.progress_str())

        # Final state save
        self._save_state(state, state_file)

        # Report results
        logger.info("=" * 60)
        logger.info(f"Download completed in {stats.elapsed_time()}")
        logger.info(f"  Total files:     {stats.total_files}")
        logger.info(f"  Downloaded:      {stats.downloaded}")
        logger.info(f"  Skipped (valid): {stats.skipped}")
        logger.info(f"  Failed:          {stats.failed}")
        logger.info(f"  Total size:      {stats._format_bytes(stats.downloaded_bytes)}")

        if stats.failed_files:
            logger.warning("Failed files:")
            for item in stats.failed_files[:20]:
                logger.warning(f"  - {item['key']}: {item['error']}")
            if len(stats.failed_files) > 20:
                logger.warning(f"  ... and {len(stats.failed_files) - 20} more")

        return stats.to_dict()


def main(params: DownloadS3FolderParams) -> dict:
    """Download a folder from S3.

    This is the Windmill entry point. Credentials must be provided as parameters.

    Args:
        params: Download parameters including bucket, prefix, output_dir, credentials, etc.

    Returns:
        Dict with download statistics
    """
    task = DownloadS3FolderTask()
    task.init_from_env()

    return task.run(params)
