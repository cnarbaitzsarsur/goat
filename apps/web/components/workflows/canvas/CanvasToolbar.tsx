"use client";

import {
  Redo as RedoIcon,
  PlayArrow as RunIcon,
  NearMe as SelectIcon,
  TextFields as TextIcon,
  Undo as UndoIcon,
} from "@mui/icons-material";
import { Box, Button, IconButton, Tooltip } from "@mui/material";
import { styled } from "@mui/material/styles";
import React from "react";
import { useTranslation } from "react-i18next";

const ToolbarContainer = styled(Box)(({ theme }) => ({
  position: "absolute",
  bottom: theme.spacing(2),
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1.5),
  zIndex: 10,
}));

const ToolGroup = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(0.5),
  padding: theme.spacing(0.5),
  backgroundColor: theme.palette.background.paper,
  borderRadius: 28,
  boxShadow: theme.shadows[4],
  border: `1px solid ${theme.palette.divider}`,
}));

const ToolButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== "active",
})<{ active?: boolean }>(({ theme, active }) => ({
  width: 40,
  height: 40,
  backgroundColor: active ? theme.palette.primary.main : "transparent",
  color: active ? theme.palette.primary.contrastText : theme.palette.text.primary,
  "&:hover": {
    backgroundColor: active ? theme.palette.primary.dark : theme.palette.action.hover,
  },
  "&.Mui-disabled": {
    color: theme.palette.text.disabled,
  },
}));

const Divider = styled(Box)(({ theme }) => ({
  width: 1,
  height: 24,
  backgroundColor: theme.palette.divider,
  margin: theme.spacing(0, 0.5),
}));

const RunButton = styled(Button)(({ theme }) => ({
  height: 40,
  paddingLeft: theme.spacing(2),
  paddingRight: theme.spacing(2.5),
  borderRadius: 20,
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  fontWeight: 600,
  textTransform: "none",
  boxShadow: theme.shadows[4],
  "&:hover": {
    backgroundColor: theme.palette.primary.dark,
  },
  "&.Mui-disabled": {
    backgroundColor: theme.palette.action.disabledBackground,
    color: theme.palette.text.disabled,
  },
  "& .MuiButton-startIcon": {
    marginRight: theme.spacing(0.5),
  },
}));

type CanvasTool = "select" | "text";

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRun: () => void;
  isRunning?: boolean;
  canRun?: boolean;
}

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  activeTool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRun,
  isRunning = false,
  canRun = true,
}) => {
  const { t } = useTranslation("common");

  return (
    <ToolbarContainer>
      {/* Tools and History Group */}
      <ToolGroup>
        {/* Selection Tools */}
        <Tooltip title={t("workflow_select_tool")} placement="top">
          <ToolButton active={activeTool === "select"} onClick={() => onToolChange("select")}>
            <SelectIcon fontSize="small" />
          </ToolButton>
        </Tooltip>

        <Tooltip title={t("workflow_text_tool_hint")} placement="top">
          <ToolButton active={activeTool === "text"} onClick={() => onToolChange("text")}>
            <TextIcon fontSize="small" />
          </ToolButton>
        </Tooltip>

        <Divider />

        {/* History Controls */}
        <Tooltip title={t("undo")} placement="top">
          <span>
            <ToolButton disabled={!canUndo} onClick={onUndo}>
              <UndoIcon fontSize="small" />
            </ToolButton>
          </span>
        </Tooltip>

        <Tooltip title={t("redo")} placement="top">
          <span>
            <ToolButton disabled={!canRedo} onClick={onRedo}>
              <RedoIcon fontSize="small" />
            </ToolButton>
          </span>
        </Tooltip>
      </ToolGroup>

      {/* Run Button - Separate for emphasis */}
      <RunButton
        disabled={!canRun || isRunning}
        onClick={onRun}
        startIcon={<RunIcon />}
        variant="contained"
        disableElevation>
        {t("workflow_run")}
      </RunButton>
    </ToolbarContainer>
  );
};

export default CanvasToolbar;
