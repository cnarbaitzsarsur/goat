/**
 * Combined Toolbox Component
 *
 * Displays tools and workflows in a tabbed interface.
 * Tools tab: All tools from OGC API Processes, organized by category.
 * Workflows tab: Project workflows that can be run with runtime variables.
 */
import { Search as SearchIcon, Settings as SettingsIcon } from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  Grid,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { type TOOL_ICON_NAME, toolIconMap } from "@p4b/ui/assets/svg/ToolIcons";

import {
  setActiveRightPanel,
  setIsMapGetInfoActive,
  setMapCursor,
  setMaskLayer,
  setToolboxStartingPoints,
} from "@/lib/store/map/slice";

import type { ToolCategory } from "@/types/map/ogc-processes";

import { useCategorizedProcesses } from "@/hooks/map/useOgcProcesses";
import { useAppDispatch } from "@/hooks/store/ContextHooks";

import SettingsGroupHeader from "@/components/builder/widgets/common/SettingsGroupHeader";
import Container from "@/components/map/panels/Container";
import WorkflowList from "@/components/map/panels/toolbox/WorkflowList";
import WorkflowRunner from "@/components/map/panels/toolbox/WorkflowRunner";
import GenericTool from "@/components/map/panels/toolbox/generic/GenericTool";

/**
 * Category display configuration
 */
const CATEGORY_CONFIG: Record<ToolCategory, { name: string; order: number }> = {
  accessibility_indicators: { name: "accessibility_indicators", order: 1 },
  geoprocessing: { name: "geoprocessing", order: 2 },
  geoanalysis: { name: "geoanalysis", order: 3 },
  data_management: { name: "data_management", order: 4 },
  other: { name: "other", order: 5 },
};

interface ToolItem {
  id: string;
  title: string;
  description?: string;
}

interface ToolCardProps {
  tool: ToolItem;
  onSelect: (toolId: string) => void;
}

function ToolCard({ tool, onSelect }: ToolCardProps) {
  const { t } = useTranslation("common");
  const ToolIconComponent = toolIconMap[tool.id as TOOL_ICON_NAME];

  return (
    <Stack
      direction="column"
      alignItems="center"
      spacing={1}
      onClick={() => onSelect(tool.id)}
      sx={{
        cursor: "pointer",
        "&:hover .tool-card": {
          borderColor: "primary.main",
        },
        "&:hover .tool-label": {
          color: "primary.main",
        },
      }}>
      <Box
        className="tool-card"
        sx={{
          borderRadius: "6px",
          width: 68,
          height: 68,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: 1,
          borderColor: "divider",
          transition: "border-color 0.2s",
        }}>
        {ToolIconComponent ? (
          <ToolIconComponent sx={{ fontSize: 44 }} />
        ) : (
          <SettingsIcon sx={{ fontSize: 44, color: "text.secondary" }} />
        )}
      </Box>
      <Typography
        className="tool-label"
        variant="caption"
        fontWeight="bold"
        color="text.secondary"
        sx={{
          textAlign: "center",
          lineHeight: 1.2,
          wordBreak: "break-word",
          whiteSpace: "normal",
          transition: "color 0.2s",
        }}>
        {t(tool.id, { defaultValue: tool.title })}
      </Typography>
    </Stack>
  );
}

interface ToolsTabContentProps {
  onSelectTool: (toolId: string) => void;
}

function ToolsTabContent({ onSelectTool }: ToolsTabContentProps) {
  const { t } = useTranslation("common");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [searchTerm, setSearchTerm] = useState("");

  const { processes: ogcProcesses, isLoading, error } = useCategorizedProcesses();

  const matchesSearch = useCallback(
    (tool: ToolItem) => {
      if (!searchTerm) return true;
      const lower = searchTerm.toLowerCase();
      const translatedName = t(tool.id, { defaultValue: tool.title }).toLowerCase();
      return translatedName.includes(lower) || tool.id.toLowerCase().includes(lower);
    },
    [searchTerm, t]
  );

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

  const sortedCategories = useMemo(() => {
    return Object.entries(toolsByCategory)
      .map(([category, tools]) => [category, tools.filter(matchesSearch)] as [string, ToolItem[]])
      .filter(([_, tools]) => tools.length > 0)
      .sort(([a], [b]) => {
        const orderA = CATEGORY_CONFIG[a as ToolCategory]?.order ?? 99;
        const orderB = CATEGORY_CONFIG[b as ToolCategory]?.order ?? 99;
        return orderA - orderB;
      });
  }, [toolsByCategory, matchesSearch]);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Stack direction="column" height="100%" width="100%" overflow="hidden">
      <Box sx={{ flexShrink: 0, p: 3 }}>
        <TextField
          fullWidth
          placeholder={t("search")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          size="small"
        />
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          "--icon-color-1": isDark ? "#FAFAFA" : "#283648",
          "--icon-color-2": isDark ? "#B2AFB6" : "#74707A",
          "--icon-color-3": isDark ? "#74707A" : "#B2AFB6",
          "--icon-color-4": isDark ? "rgba(255, 255, 255, 0.12)" : "#E5E4E7",
          "--icon-color-5": isDark ? "rgba(0, 0, 0, 0.5)" : "#FAFAFA",
        }}>
        <Stack spacing={4} sx={{ p: 3 }}>
          {error && (
            <Typography color="warning.main" variant="caption" sx={{ display: "block" }}>
              {t("some_tools_unavailable")}
            </Typography>
          )}

          {sortedCategories.map(([category, tools]) => {
            const config = CATEGORY_CONFIG[category as ToolCategory];

            return (
              <Box key={category}>
                <SettingsGroupHeader label={t(config?.name ?? category)} />
                <Grid container spacing={4}>
                  {tools.map((tool) => (
                    <Grid item xs={4} key={tool.id}>
                      <ToolCard tool={tool} onSelect={onSelectTool} />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            );
          })}

          {sortedCategories.length === 0 && (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                {searchTerm ? t("no_results") : t("no_tools_available")}
              </Typography>
            </Box>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}

export default function CombinedToolbox() {
  const { t } = useTranslation("common");
  const dispatch = useAppDispatch();

  const [activeTab, setActiveTab] = useState(0);
  const [selectedToolId, setSelectedToolId] = useState<string | undefined>(undefined);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | undefined>(undefined);

  const handleSelectTool = (toolId: string) => {
    setSelectedToolId(toolId);
  };

  const handleToolBack = () => {
    setSelectedToolId(undefined);
    dispatch(setMaskLayer(undefined));
    dispatch(setToolboxStartingPoints(undefined));
    dispatch(setIsMapGetInfoActive(true));
    dispatch(setMapCursor(undefined));
  };

  const handleWorkflowBack = () => {
    setSelectedWorkflowId(undefined);
  };

  const handleClose = () => {
    setSelectedToolId(undefined);
    setSelectedWorkflowId(undefined);
    dispatch(setActiveRightPanel(undefined));
  };

  // Render selected tool (full panel takeover)
  if (selectedToolId) {
    return <GenericTool processId={selectedToolId} onBack={handleToolBack} onClose={handleClose} />;
  }

  // Render selected workflow (full panel takeover)
  if (selectedWorkflowId) {
    return (
      <WorkflowRunner
        workflowId={selectedWorkflowId}
        onBack={handleWorkflowBack}
        onClose={handleClose}
      />
    );
  }

  // Main toolbox view with tabs
  return (
    <Container
      disablePadding={true}
      close={handleClose}
      header={
        <Typography variant="body1" fontWeight="bold">
          {t("toolbox")}
        </Typography>
      }
      body={
        <Stack
          direction="column"
          sx={{ height: "100%", overflow: "hidden", mt: -2 }}>
          <Box sx={{ borderBottom: 1, borderColor: "divider", flexShrink: 0 }}>
            <Tabs
              value={activeTab}
              onChange={(_e, newValue) => setActiveTab(newValue)}
              variant="fullWidth"
              sx={{
                minHeight: 36,
                "& .MuiTab-root": {
                  minHeight: 36,
                  textTransform: "none",
                  fontSize: "0.8125rem",
                },
              }}>
              <Tab label={t("tools")} />
              <Tab label={t("workflows")} />
            </Tabs>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0 }}>
            {/* Tools Tab */}
            {activeTab === 0 && <ToolsTabContent onSelectTool={handleSelectTool} />}

            {/* Workflows Tab */}
            {activeTab === 1 && (
              <WorkflowList onSelectWorkflow={(id) => setSelectedWorkflowId(id)} />
            )}
          </Box>
        </Stack>
      }
    />
  );
}
