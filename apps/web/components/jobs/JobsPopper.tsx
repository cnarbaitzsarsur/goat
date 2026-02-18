import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import {
  Badge,
  Box,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
  styled,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

import { ICON_NAME, Icon } from "@p4b/ui/components/Icon";

import { type Job, dismissJob, useJobs } from "@/lib/api/processes";

import { ArrowPopper as JobStatusMenu } from "@/components/ArrowPoper";
import JobProgressItem from "@/components/jobs/JobProgressItem";

const StyledBadge = styled(Badge)(({ theme }) => ({
  "& .MuiBadge-badge": {
    backgroundColor: "#44b700",
    color: "#44b700",
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
    "&::after": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      borderRadius: "50%",
      animation: "ripple 1.2s infinite ease-in-out",
      border: "1px solid currentColor",
      content: '""',
    },
  },
  "@keyframes ripple": {
    "0%": {
      transform: "scale(.8)",
      opacity: 1,
    },
    "100%": {
      transform: "scale(2.4)",
      opacity: 0,
    },
  },
}));

export default function JobsPopper() {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const { jobs, mutate } = useJobs({ read: false });
  const [cancellingJobs, setCancellingJobs] = useState<Set<string>>(new Set());

  // Track which export/print jobs have been auto-downloaded to avoid duplicate downloads
  const downloadedJobsRef = useRef<Set<string>>(new Set());
  // Track jobs that were already successful on initial load (don't auto-download these)
  const initialSuccessfulJobsRef = useRef<Set<string> | null>(null);

  // Filter to get running/accepted jobs using OGC status
  const runningJobs = useMemo(() => {
    return jobs?.jobs?.filter((job) => job.status === "running" || job.status === "accepted");
  }, [jobs?.jobs]);

  // Handle download for export and print jobs
  const handleDownload = useCallback(
    async (payload: Record<string, unknown> | undefined) => {
      if (!payload) return;
      try {
        const downloadUrl = payload.download_url as string;
        const fileName = (payload.file_name as string) || "export.zip";
        if (!downloadUrl) {
          throw new Error("No download_url in job payload");
        }

        // Fetch the file and create a blob URL for proper download
        // This is needed for cross-origin URLs (like S3) where link.download doesn't work
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status}`);
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the blob URL
        URL.revokeObjectURL(blobUrl);
      } catch (error) {
        console.error("Download failed:", error);
        toast.error(t("error_downloading") || "Download failed");
      }
    },
    [t]
  );

  // Auto-download completed export and print jobs (only for jobs that complete AFTER initial load)
  useEffect(() => {
    if (!jobs?.jobs) return;

    // On first load, capture which jobs are already successful (don't auto-download these)
    if (initialSuccessfulJobsRef.current === null) {
      initialSuccessfulJobsRef.current = new Set(
        jobs.jobs
          .filter(
            (job) =>
              (job.processID === "layer_export" || job.processID === "print_report") &&
              job.status === "successful"
          )
          .map((job) => job.jobID)
      );
      return;
    }

    jobs.jobs.forEach((job) => {
      // Only auto-download jobs that:
      // 1. Are layer_export or print_report
      // 2. Completed successfully
      // 3. Were NOT already successful on initial load
      // 4. Haven't been downloaded yet in this session
      if (
        (job.processID === "layer_export" || job.processID === "print_report") &&
        job.status === "successful" &&
        !initialSuccessfulJobsRef.current?.has(job.jobID) &&
        !downloadedJobsRef.current.has(job.jobID)
      ) {
        const result = job.result as Record<string, unknown> | undefined;
        if (result?.download_url) {
          // Mark as downloaded before triggering to prevent race conditions
          downloadedJobsRef.current.add(job.jobID);

          // Dismiss all existing toasts and show success toast
          toast.dismiss();
          const jobType = t(job.processID) || job.processID;
          toast.success(`"${jobType}" - ${t("job_success")}`);

          // Trigger download
          handleDownload(result);
        }
      }
    });
  }, [jobs?.jobs, handleDownload, t]);

  // Helper to render download button for export jobs
  const renderExportDownloadButton = (job: Job) => {
    const result = job.result as Record<string, unknown> | undefined;
    const canDownload = job.status === "successful" && result?.download_url;

    if (!canDownload) return undefined;

    return (
      <Tooltip title={t("download")}>
        <IconButton
          size="small"
          onClick={() => handleDownload(result)}
          sx={{ fontSize: "1.2rem", color: "success.main" }}>
          <DownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  };

  // Helper to render download button for print_report jobs
  const renderPrintReportDownloadButton = (job: Job) => {
    const result = job.result as Record<string, unknown> | undefined;
    const canDownload = job.status === "successful" && result?.download_url;

    if (!canDownload) return undefined;

    return (
      <Tooltip title={t("download")}>
        <IconButton
          size="small"
          onClick={() => handleDownload(result)}
          sx={{ fontSize: "1.2rem", color: "success.main" }}>
          <DownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  };

  // Handle cancel job
  const handleCancelJob = useCallback(
    async (jobId: string) => {
      setCancellingJobs((prev) => new Set(prev).add(jobId));
      try {
        await dismissJob(jobId);
        mutate();
      } catch (error) {
        console.error("Failed to cancel job:", error);
        toast.error(t("error_cancelling_job") || "Failed to cancel job");
      } finally {
        setCancellingJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [mutate, t]
  );

  // Helper to render cancel button for running/accepted jobs
  const renderCancelButton = (job: Job) => {
    const canCancel = job.status === "running" || job.status === "accepted";
    if (!canCancel) return undefined;

    const isCancelling = cancellingJobs.has(job.jobID);

    return (
      <Tooltip title={t("cancel")}>
        <IconButton
          size="small"
          onClick={() => handleCancelJob(job.jobID)}
          disabled={isCancelling}
          sx={{ fontSize: "1.2rem", color: "error.main" }}>
          {isCancelling ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            <CancelOutlinedIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
    );
  };

  // Get action button based on job type and status
  const getActionButton = (job: Job) => {
    // For running/accepted jobs, show cancel button
    if (job.status === "running" || job.status === "accepted") {
      return renderCancelButton(job);
    }
    // For completed jobs, show type-specific buttons
    if (job.processID === "layer_export") {
      return renderExportDownloadButton(job);
    }
    if (job.processID === "print_report") {
      return renderPrintReportDownloadButton(job);
    }
    return undefined;
  };

  return (
    <>
      {jobs?.jobs && jobs.jobs.length > 0 && (
        <JobStatusMenu
          content={
            <Paper
              sx={{
                width: "320px",
                overflow: "auto",
                pt: 4,
                pb: 2,
              }}>
              <Box>
                <Typography variant="body1" fontWeight="bold" sx={{ px: 4, py: 1 }}>
                  {t("job_status")}
                </Typography>
                <Divider sx={{ mb: 0, pb: 0 }} />
              </Box>
              <Box
                sx={{
                  maxHeight: "300px",
                  overflowY: "auto",
                  overflowX: "hidden",
                  py: 2,
                }}>
                <Stack direction="column">
                  {jobs?.jobs?.map((job, index) => {
                    const actionButton = getActionButton(job);

                    return (
                      <Box key={job.jobID}>
                        <JobProgressItem
                          id={job.jobID}
                          type={job.processID}
                          status={job.status}
                          name={job.jobID}
                          date={job.updated || job.created || ""}
                          errorMessage={job.status === "failed" ? job.message : undefined}
                          actionButton={actionButton}
                        />
                        {index < jobs.jobs.length - 1 && <Divider />}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            </Paper>
          }
          open={open}
          placement="bottom"
          onClose={() => setOpen(false)}>
          {jobs?.jobs && jobs.jobs.length > 0 ? (
            <Tooltip title={t("job_status")}>
              <IconButton
                onClick={() => {
                  setOpen(!open);
                }}
                size="small"
                sx={{
                  ...(open && {
                    color: "primary.main",
                  }),
                }}>
                {runningJobs && runningJobs?.length > 0 && (
                  <StyledBadge
                    overlap="circular"
                    anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                    variant="dot">
                    <Icon fontSize="inherit" iconName={ICON_NAME.BARS_PROGRESS} htmlColor="inherit" />
                  </StyledBadge>
                )}
                {!runningJobs ||
                  (runningJobs?.length === 0 && (
                    <Icon fontSize="inherit" iconName={ICON_NAME.BARS_PROGRESS} htmlColor="inherit" />
                  ))}
              </IconButton>
            </Tooltip>
          ) : (
            <></>
          )}
        </JobStatusMenu>
      )}
    </>
  );
}
