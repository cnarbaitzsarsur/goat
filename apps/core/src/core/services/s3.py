import hashlib
import logging
import posixpath
from typing import BinaryIO, Dict

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from core.core.config import settings
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


class S3Service:
    def __init__(self) -> None:
        """
        Initialize an S3 client that can talk to either AWS S3
        or an S3-compatible provider like Hetzner or MinIO.
        """
        extra_kwargs = {}

        # Use endpoint_url if provided (Hetzner, MinIO, etc.)
        if settings.S3_ENDPOINT_URL:
            extra_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL

        # Special config for non-AWS providers
        provider = (settings.S3_PROVIDER or "aws").lower()
        if provider in {"hetzner", "minio"}:
            # MinIO always needs path-style, Hetzner can use virtual
            use_path_style = provider == "minio" or settings.S3_FORCE_PATH_STYLE
            extra_kwargs["config"] = Config(
                signature_version="s3v4",
                s3={
                    "payload_signing_enabled": False,
                    "addressing_style": "path" if use_path_style else "virtual",
                },
            )

        self.s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
            **extra_kwargs,
        )

        # Create a separate client for public URL signing (if different from internal)
        self._public_client = None
        if (
            settings.S3_PUBLIC_ENDPOINT_URL
            and settings.S3_PUBLIC_ENDPOINT_URL != settings.S3_ENDPOINT_URL
        ):
            public_extra = dict(extra_kwargs)
            public_extra["endpoint_url"] = settings.S3_PUBLIC_ENDPOINT_URL
            self._public_client = boto3.client(
                "s3",
                aws_access_key_id=settings.S3_ACCESS_KEY_ID,
                aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
                region_name=settings.S3_REGION,
                **public_extra,
            )

    def generate_presigned_post(
        self,
        bucket_name: str,
        s3_key: str,
        content_type: str,
        max_size: int,
        expires_in: int = 300,
    ) -> Dict[str, str]:
        try:
            result = self.s3_client.generate_presigned_post(
                Bucket=bucket_name,
                Key=s3_key,
                Fields={"Content-Type": content_type},
                Conditions=[
                    {"Content-Type": content_type},
                    ["content-length-range", 0, max_size],
                ],
                ExpiresIn=expires_in,
            )

            # Replace internal URL (minio:9000) with public one (localhost:9000)
            if settings.S3_PUBLIC_ENDPOINT_URL:
                result["url"] = result["url"].replace(
                    settings.S3_ENDPOINT_URL, settings.S3_PUBLIC_ENDPOINT_URL
                )

            return result

        except ClientError as e:
            logger.error(f"S3 presigned POST failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate presigned POST: {e}",
            )

    def upload_file(
        self,
        file_content: BinaryIO,
        bucket_name: str,
        s3_key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload a file server-side (API → S3)."""
        try:
            self.s3_client.upload_fileobj(
                file_content,
                bucket_name,
                s3_key,
                ExtraArgs={"ContentType": content_type},
            )
            return f"s3://{bucket_name}/{s3_key}"
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload file: {e}",
            )

    def generate_presigned_download_url(
        self,
        bucket_name: str,
        s3_key: str,
        expires_in: int = 3600,
        filename: str | None = None,
    ) -> str:
        """Generate a presigned GET URL for downloading an object.

        Args:
            bucket_name: The S3 bucket name
            s3_key: The object key in S3
            expires_in: URL expiration time in seconds
            filename: Optional filename for Content-Disposition header (forces download)
        """
        try:
            params = {"Bucket": bucket_name, "Key": s3_key}

            # Add Content-Disposition to force download instead of inline display
            if filename:
                params["ResponseContentDisposition"] = (
                    f'attachment; filename="{filename}"'
                )

            return self.s3_client.generate_presigned_url(
                "get_object",
                Params=params,
                ExpiresIn=expires_in,
            )
        except ClientError as e:
            logger.error(f"Presigned download URL failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate presigned download URL: {e}",
            )

    def delete_file(self, bucket_name: str, s3_key: str) -> None:
        """Delete an object from S3."""
        try:
            self.s3_client.delete_object(Bucket=bucket_name, Key=s3_key)
        except ClientError as e:
            logger.error(f"Delete failed for {bucket_name}/{s3_key}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete file: {e}",
            )

    def get_thumbnail_url(
        self,
        thumbnail_key: str | None,
        default_url: str | None = None,
        expires_in: int = 3600,
    ) -> str | None:
        """Convert a thumbnail S3 key to a presigned URL.

        If the thumbnail_key is already a full URL (http/https), returns it as-is.
        If it's an S3 key (starts with 'thumbnails/'), generates a presigned URL.
        If it's None or empty, returns the default_url.

        Args:
            thumbnail_key: S3 key or full URL for the thumbnail
            default_url: Default URL to return if thumbnail_key is None
            expires_in: Presigned URL expiration time in seconds (default 1 hour)
        """
        if not thumbnail_key:
            return default_url

        # If already a full URL, return as-is
        if thumbnail_key.startswith(("http://", "https://")):
            return thumbnail_key

        # It's an S3 key, generate presigned URL using public client if available
        try:
            # Use public client for user-facing URLs (if configured)
            client = self._public_client if self._public_client else self.s3_client
            params = {"Bucket": settings.S3_BUCKET_NAME, "Key": thumbnail_key}
            return client.generate_presigned_url(
                "get_object",
                Params=params,
                ExpiresIn=expires_in,
            )
        except ClientError as e:
            logger.warning(f"Failed to generate presigned URL for {thumbnail_key}: {e}")
            return default_url

    @staticmethod
    def calculate_sha256(file_content: bytes) -> str:
        return hashlib.sha256(file_content).hexdigest()

    @staticmethod
    def build_s3_key(*parts: str) -> str:
        """Safely join S3 key parts into a normalized prefix/key."""
        return posixpath.join(*(p.strip("/") for p in parts if p))


s3_service = S3Service()
