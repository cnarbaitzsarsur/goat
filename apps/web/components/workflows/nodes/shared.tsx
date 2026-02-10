"use client";

/**
 * Shared styled components for workflow canvas nodes.
 * Used by ToolNode, ExportNode, and other node types to ensure
 * consistent visual appearance across the workflow canvas.
 */
import { Box, GlobalStyles, IconButton, Stack } from "@mui/material";
import { keyframes, styled } from "@mui/material/styles";
import { Handle } from "@xyflow/react";

// Keyframe animation for border angle (animates CSS custom property)
export const borderAngleRunning = keyframes`
  from {
    --border-angle: 0deg;
  }
  to {
    --border-angle: 360deg;
  }
`;

// Global styles to register @property for --border-angle
export const BorderAnglePropertyStyles = () => (
  <GlobalStyles
    styles={`
      @property --border-angle {
        syntax: "<angle>";
        inherits: true;
        initial-value: 0deg;
      }
    `}
  />
);

export const NodeContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== "selected",
})<{ selected?: boolean }>(({ theme, selected }) => ({
  padding: theme.spacing(1.5),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  border: `2px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
  boxShadow: selected
    ? `0 0 0 4px ${theme.palette.primary.main}40, 0 2px 8px rgba(0, 0, 0, 0.1)`
    : "0 2px 8px rgba(0, 0, 0, 0.08)",
  minWidth: 220,
  maxWidth: 360,
  transition: "all 0.2s ease",
  position: "relative",
  "&:hover": {
    boxShadow: selected
      ? `0 0 0 4px ${theme.palette.primary.main}40, 0 2px 8px rgba(0, 0, 0, 0.12)`
      : "0 2px 8px rgba(0, 0, 0, 0.12)",
  },
}));

export const NodeHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
}));

// Icon wrapper with status-based styling
export const NodeIconWrapper = styled(Box, {
  shouldForwardProp: (prop) => prop !== "status",
})<{ status?: "pending" | "running" | "completed" | "failed" }>(({ theme, status }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  minWidth: 40,
  borderRadius: theme.shape.borderRadius,
  position: "relative",
  // Animated conic-gradient border when running
  ...(status === "running" &&
    ({
      "--border-angle": "0deg",
      background: `linear-gradient(${theme.palette.background.paper}, ${theme.palette.background.paper}) padding-box, conic-gradient(from var(--border-angle), ${theme.palette.warning.main} 50%, ${theme.palette.divider} 50%) border-box`,
      borderColor: "transparent",
      borderStyle: "solid",
      borderWidth: "2px",
      animation: `${borderAngleRunning} 2s linear infinite`,
    } as const)),
  // Static styles for other states
  ...(status !== "running" && {
    border: `1px solid ${
      status === "completed"
        ? theme.palette.primary.main
        : status === "failed"
          ? theme.palette.error.main
          : theme.palette.divider
    }`,
    backgroundColor:
      status === "completed"
        ? theme.palette.primary.main + "20"
        : status === "failed"
          ? theme.palette.error.light + "30"
          : theme.palette.background.default,
  }),
}));

// Small badge on icon corner (completed checkmark)
export const IconStatusBadge = styled(Box)(({ theme }) => ({
  position: "absolute",
  top: -6,
  right: -6,
  width: 18,
  height: 18,
  borderRadius: "50%",
  backgroundColor: theme.palette.primary.main,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: theme.palette.common.white,
  zIndex: 2,
  border: `2px solid ${theme.palette.background.paper}`,
}));

// Animated border wrapper for running state
export const AnimatedBorderWrapper = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isRunning",
})<{ isRunning?: boolean }>(({ theme: _theme, isRunning: _isRunning }) => ({
  position: "relative",
  width: 40,
  height: 40,
  minWidth: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  "@property --border-angle": {
    syntax: "'<angle>'",
    inherits: "true",
    initialValue: "0deg",
  },
}));

export const StyledHandle = styled(Handle, {
  shouldForwardProp: (prop) => prop !== "selected",
})<{ selected?: boolean }>(({ theme, selected }) => ({
  width: 12,
  height: 12,
  backgroundColor: selected ? theme.palette.primary.main : theme.palette.grey[500],
  border: `2px solid ${theme.palette.background.paper}`,
}));

// Tinted background section for parameters below the header
export const NodeParamsSection = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark"
    ? "rgba(255, 255, 255, 0.03)"
    : "rgba(0, 0, 0, 0.025)",
  margin: theme.spacing(1.5, -1.5, -1.5, -1.5),
  padding: theme.spacing(1, 1.5, 1.5, 1.5),
  borderTop: `1px solid ${theme.palette.divider}`,
  borderRadius: `0 0 ${theme.shape.borderRadius - 1}px ${theme.shape.borderRadius - 1}px`,
}));

export const ToolbarContainer = styled(Stack)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius * 2,
  padding: theme.spacing(1),
  gap: theme.spacing(0.5),
  flexDirection: "row",
  alignItems: "center",
  boxShadow: theme.shadows[4],
  border: `1px solid ${theme.palette.divider}`,
}));

export const ToolbarButton = styled(IconButton)(({ theme }) => ({
  width: 36,
  height: 36,
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },
}));
