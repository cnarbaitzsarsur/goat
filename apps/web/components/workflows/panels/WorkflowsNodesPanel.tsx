"use client";

import { Box, Card, CardHeader, CircularProgress, Grid, Stack, Typography, useTheme } from "@mui/material";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";

import { ICON_NAME } from "@p4b/ui/components/Icon";

import type { AppDispatch } from "@/lib/store";
import { selectNode } from "@/lib/store/workflow/slice";
import type { ProjectLayer } from "@/lib/validations/project";
import type { WorkflowConfig } from "@/lib/validations/workflow";

import type { ToolCategory } from "@/types/map/ogc-processes";

import { useCategorizedProcesses } from "@/hooks/map/useOgcProcesses";

import SettingsGroupHeader from "@/components/builder/widgets/common/SettingsGroupHeader";
import SidePanel, { SidePanelTabPanel, SidePanelTabs } from "@/components/common/SidePanel";
import WorkflowNodeSettings from "@/components/workflows/panels/WorkflowNodeSettings";

/**
 * Category display configuration
 */
const CATEGORY_CONFIG: Record<ToolCategory, { name: string; icon: ICON_NAME; order: number }> = {
  accessibility_indicators: {
    name: "accessibility_indicators",
    icon: ICON_NAME.BULLSEYE,
    order: 1,
  },
  geoprocessing: {
    name: "geoprocessing",
    icon: ICON_NAME.SETTINGS,
    order: 2,
  },
  geoanalysis: {
    name: "geoanalysis",
    icon: ICON_NAME.CHART,
    order: 3,
  },
  data_management: {
    name: "data_management",
    icon: ICON_NAME.TABLE,
    order: 4,
  },
  other: {
    name: "other",
    icon: ICON_NAME.CIRCLEINFO,
    order: 5,
  },
};

interface ToolItem {
  id: string;
  title: string;
  description?: string;
}

// Draggable tool card component - styled same as ReportsElementsPanel
interface DraggableToolCardProps {
  tool: ToolItem;
  onDragStart: (event: React.DragEvent, toolId: string) => void;
}

const DraggableToolCard: React.FC<DraggableToolCardProps> = ({ tool, onDragStart }) => {
  const theme = useTheme();
  const { t } = useTranslation("common");
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (event: React.DragEvent) => {
    setIsDragging(true);
    onDragStart(event, tool.id);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <Card
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      sx={{
        cursor: isDragging ? "grabbing" : "grab",
        maxWidth: "130px",
        borderRadius: "6px",
        opacity: isDragging ? 0.5 : 1,
        transition: "opacity 0.2s",
      }}>
      <CardHeader
        sx={{
          px: 2,
          py: 4,
          ".MuiCardHeader-content": {
            width: "100%",
            color: isDragging ? theme.palette.primary.main : theme.palette.text.secondary,
          },
        }}
        title={
          <Typography variant="body2" fontWeight="bold" noWrap color="inherit">
            {t(tool.id, { defaultValue: tool.title })}
          </Typography>
        }
      />
    </Card>
  );
};

// Tools tab content
interface ToolsTabContentProps {
  onDragStart: (event: React.DragEvent, nodeType: string, toolId?: string, layerId?: string) => void;
}

const ToolsTabContent: React.FC<ToolsTabContentProps> = ({ onDragStart }) => {
  const { t } = useTranslation("common");
  const theme = useTheme();

  // Fetch all processes from OGC API
  const { processes: ogcProcesses, isLoading, error } = useCategorizedProcesses();

  // Organize tools by category
  const toolsByCategory = useMemo(() => {
    const categories: Record<ToolCategory, ToolItem[]> = {
      accessibility_indicators: [],
      geoprocessing: [],
      geoanalysis: [],
      data_management: [],
      other: [],
    };

    for (const process of ogcProcesses) {
      const category = process.category || "other";
      categories[category].push({
        id: process.id,
        title: process.title,
        description: process.description,
      });
    }

    return categories;
  }, [ogcProcesses]);

  // Sort categories and filter empty ones
  const sortedCategories = useMemo(() => {
    return Object.entries(toolsByCategory)
      .filter(([_, tools]) => tools.length > 0)
      .sort(([a], [b]) => {
        const orderA = CATEGORY_CONFIG[a as ToolCategory]?.order ?? 99;
        const orderB = CATEGORY_CONFIG[b as ToolCategory]?.order ?? 99;
        return orderA - orderB;
      });
  }, [toolsByCategory]);

  // Handle drag start for tools
  const handleToolDragStart = (event: React.DragEvent, toolId: string) => {
    onDragStart(event, "tool", toolId);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  // Handle drag start for Add Dataset node
  const handleDatasetDragStart = (event: React.DragEvent) => {
    onDragStart(event, "dataset");
  };

  return (
    <Stack spacing={4} sx={{ p: 3 }}>
      {/* Data Input Section - single Add Dataset node */}
      <Box sx={{ mb: 4 }}>
        <SettingsGroupHeader label={t("data_input")} />
        <Grid container spacing={4}>
          <Grid item xs={6}>
            <Card
              draggable
              onDragStart={handleDatasetDragStart}
              sx={{
                cursor: "grab",
                maxWidth: "130px",
                borderRadius: "6px",
                "&:active": { cursor: "grabbing" },
              }}>
              <CardHeader
                sx={{
                  px: 2,
                  py: 4,
                  ".MuiCardHeader-content": {
                    width: "100%",
                    color: theme.palette.text.secondary,
                  },
                }}
                title={
                  <Typography variant="body2" fontWeight="bold" noWrap color="inherit">
                    {t("add_dataset")}
                  </Typography>
                }
              />
            </Card>
          </Grid>
        </Grid>
      </Box>

      {error && (
        <Typography color="warning.main" variant="caption" sx={{ display: "block" }}>
          {t("some_tools_unavailable")}
        </Typography>
      )}

      {/* Tool Categories */}
      {sortedCategories.map(([category, tools]) => {
        const categoryConfig = CATEGORY_CONFIG[category as ToolCategory];

        return (
          <Box key={category} sx={{ mb: 4 }}>
            <SettingsGroupHeader label={t(categoryConfig?.name ?? category)} />
            <Grid container spacing={4}>
              {tools.map((tool) => (
                <Grid item xs={6} key={tool.id}>
                  <DraggableToolCard tool={tool} onDragStart={handleToolDragStart} />
                </Grid>
              ))}
            </Grid>
          </Box>
        );
      })}

      {sortedCategories.length === 0 && (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="body2" color="text.secondary">
            {t("no_tools_available")}
          </Typography>
        </Box>
      )}
    </Stack>
  );
};

// History tab content - shows workflow run history
interface HistoryTabContentProps {
  workflowId?: string;
}

const HistoryTabContent: React.FC<HistoryTabContentProps> = ({ workflowId: _workflowId }) => {
  const { t } = useTranslation("common");

  // TODO: Implement workflow run history when execution is added
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 200,
        textAlign: "center",
      }}>
      <Typography variant="body2" color="text.secondary">
        {t("no_workflow_runs_yet")}
      </Typography>
    </Box>
  );
};

interface WorkflowsNodesPanelProps {
  config: WorkflowConfig | null;
  selectedNodeId: string | null;
  projectLayers?: ProjectLayer[];
  workflowId?: string;
  onDragStart: (event: React.DragEvent, nodeType: string, toolId?: string, layerId?: string) => void;
}

const WorkflowsNodesPanel: React.FC<WorkflowsNodesPanelProps> = ({
  config,
  selectedNodeId,
  projectLayers = [],
  workflowId,
  onDragStart,
}) => {
  const { t } = useTranslation("common");
  const dispatch = useDispatch<AppDispatch>();
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Handle back from node settings - deselect all nodes
  const handleBack = () => {
    dispatch(selectNode(null));
  };

  // If a node is selected, show the node settings panel (like LayerSettingsPanel in Layouts)
  if (selectedNodeId && config) {
    const selectedNode = config.nodes.find((n) => n.id === selectedNodeId);
    if (selectedNode) {
      return (
        <SidePanel sx={{ borderLeft: (theme) => `1px solid ${theme.palette.background.paper}` }}>
          <WorkflowNodeSettings node={selectedNode} projectLayers={projectLayers} onBack={handleBack} />
        </SidePanel>
      );
    }
  }

  // Default view: Tools and History tabs
  return (
    <SidePanel sx={{ borderLeft: (theme) => `1px solid ${theme.palette.background.paper}` }}>
      <SidePanelTabs
        value={activeTab}
        onChange={handleTabChange}
        tabs={[
          { label: t("tools"), id: "tools" },
          { label: t("history"), id: "history" },
        ]}
        ariaLabel="workflow panel tabs"
      />
      <SidePanelTabPanel value={activeTab} index={0} id="tools">
        <ToolsTabContent onDragStart={onDragStart} />
      </SidePanelTabPanel>
      <SidePanelTabPanel value={activeTab} index={1} id="history">
        <HistoryTabContent workflowId={workflowId} />
      </SidePanelTabPanel>
    </SidePanel>
  );
};

export default WorkflowsNodesPanel;
