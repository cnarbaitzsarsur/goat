"use client";

import { Add as AddIcon, AccountTree as WorkflowIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { ICON_NAME, Icon } from "@p4b/ui/components/Icon";

import { createWorkflow, deleteWorkflow, duplicateWorkflow, useWorkflows } from "@/lib/api/workflows";
import type { Project } from "@/lib/validations/project";
import { createEmptyWorkflowConfig } from "@/lib/validations/workflow";
import type { Workflow } from "@/lib/validations/workflow";

import MoreMenu from "@/components/common/PopperMenu";
import type { PopperMenuItem } from "@/components/common/PopperMenu";
import { SIDE_PANEL_WIDTH, SidePanelContainer } from "@/components/common/SidePanel";
import ConfirmModal from "@/components/modals/Confirm";

const PanelContainer = styled(SidePanelContainer)(({ theme }) => ({
  width: SIDE_PANEL_WIDTH,
  minWidth: SIDE_PANEL_WIDTH,
  height: "100%",
  maxHeight: "100%",
  boxShadow: "none",
  borderRight: `1px solid ${theme.palette.background.paper}`,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  position: "relative",
  zIndex: 1,
}));

interface WorkflowsConfigPanelProps {
  project?: Project;
  selectedWorkflow: Workflow | null;
  onSelectWorkflow: (workflow: Workflow | null) => void;
}

const WorkflowsConfigPanel: React.FC<WorkflowsConfigPanelProps> = ({
  project,
  selectedWorkflow: _selectedWorkflow,
  onSelectWorkflow,
}) => {
  const { t } = useTranslation("common");

  // Fetch workflows from API
  const { workflows, isLoading, mutate } = useWorkflows(project?.id);

  // Local state
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Track last synced workflow ID to prevent unnecessary parent updates
  const lastSyncedIdRef = useRef<string | null>(null);

  // Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [actionWorkflowId, setActionWorkflowId] = useState<string | null>(null);
  const [actionWorkflowName, setActionWorkflowName] = useState<string>("");

  // Sync selected workflow with parent - only when ID actually changes
  useEffect(() => {
    // Only notify parent if the workflow ID has actually changed
    if (selectedWorkflowId === lastSyncedIdRef.current) {
      return;
    }

    if (selectedWorkflowId && workflows) {
      const workflow = workflows.find((w) => w.id === selectedWorkflowId);
      if (workflow) {
        lastSyncedIdRef.current = selectedWorkflowId;
        onSelectWorkflow(workflow);
      }
    } else {
      lastSyncedIdRef.current = null;
      onSelectWorkflow(null);
    }
  }, [selectedWorkflowId, workflows, onSelectWorkflow]);

  // Auto-select first workflow when workflows load
  useEffect(() => {
    if (workflows && workflows.length > 0 && !selectedWorkflowId) {
      setSelectedWorkflowId(workflows[0].id);
    }
  }, [workflows, selectedWorkflowId]);

  // Handle create new workflow
  const handleCreateWorkflow = useCallback(async () => {
    if (!project?.id) return;

    setIsCreating(true);
    try {
      const newWorkflow = await createWorkflow(project.id, {
        name: `${t("workflow")} ${(workflows?.length || 0) + 1}`,
        description: null,
        is_default: false,
        config: createEmptyWorkflowConfig(),
      });

      await mutate();
      setSelectedWorkflowId(newWorkflow.id);
    } catch (error) {
      console.error("Failed to create workflow:", error);
    } finally {
      setIsCreating(false);
    }
  }, [project?.id, t, workflows?.length, mutate]);

  // Handle duplicate workflow
  const handleDuplicateWorkflow = useCallback(
    async (workflowId: string) => {
      if (!project?.id) return;

      try {
        const duplicated = await duplicateWorkflow(project.id, workflowId);
        await mutate();
        setSelectedWorkflowId(duplicated.id);
      } catch (error) {
        console.error("Failed to duplicate workflow:", error);
      }
    },
    [project?.id, mutate]
  );

  // Handle delete workflow
  const handleDeleteWorkflow = useCallback(async () => {
    if (!project?.id || !actionWorkflowId) return;

    try {
      await deleteWorkflow(project.id, actionWorkflowId);
      await mutate();

      // If deleted workflow was selected, clear selection
      if (selectedWorkflowId === actionWorkflowId) {
        setSelectedWorkflowId(null);
        onSelectWorkflow(null);
      }
    } catch (error) {
      console.error("Failed to delete workflow:", error);
    } finally {
      setDeleteModalOpen(false);
      setActionWorkflowId(null);
    }
  }, [project?.id, actionWorkflowId, selectedWorkflowId, mutate, onSelectWorkflow]);

  // Context menu items for workflow
  const getWorkflowMenuItems = useCallback(
    (workflow: Workflow): PopperMenuItem[] => [
      {
        id: "duplicate",
        label: t("duplicate"),
        icon: ICON_NAME.COPY,
        onClick: () => handleDuplicateWorkflow(workflow.id),
      },
      {
        id: "delete",
        label: t("delete"),
        icon: ICON_NAME.TRASH,
        color: "error.main",
        onClick: () => {
          setActionWorkflowId(workflow.id);
          setActionWorkflowName(workflow.name);
          setDeleteModalOpen(true);
        },
      },
    ],
    [t, handleDuplicateWorkflow]
  );

  return (
    <PanelContainer>
      {/* Workflows Section */}
      <Box sx={{ display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
        {/* Workflows Header */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ p: 2, pb: 0, mb: 2, flexShrink: 0 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {t("workflows")}
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={isCreating ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
            onClick={handleCreateWorkflow}
            disabled={isCreating || !project?.id}
            sx={{ textTransform: "none" }}>
            {t("add_workflow")}
          </Button>
        </Stack>

        {/* Workflows List - Scrollable */}
        <Box
          sx={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            px: 2,
            "&::-webkit-scrollbar": {
              width: "6px",
            },
            "&::-webkit-scrollbar-thumb": {
              background: "#2836484D",
              borderRadius: "3px",
              "&:hover": {
                background: "#28364880",
              },
            },
          }}>
          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <List dense sx={{ mx: -2 }}>
              {workflows?.map((workflow) => (
                <ListItem
                  key={workflow.id}
                  disablePadding
                  secondaryAction={
                    <MoreMenu
                      menuItems={getWorkflowMenuItems(workflow)}
                      disablePortal={false}
                      menuButton={
                        <Tooltip title={t("more_options")} placement="top">
                          <IconButton edge="end" size="small">
                            <Icon iconName={ICON_NAME.MORE_VERT} style={{ fontSize: "15px" }} />
                          </IconButton>
                        </Tooltip>
                      }
                    />
                  }>
                  <ListItemButton
                    selected={selectedWorkflowId === workflow.id}
                    onClick={() => setSelectedWorkflowId(workflow.id)}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <WorkflowIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={workflow.name} primaryTypographyProps={{ fontSize: "0.875rem" }} />
                  </ListItemButton>
                </ListItem>
              ))}
              {(!workflows || workflows.length === 0) && (
                <Box sx={{ py: 2, px: 2, textAlign: "center" }}>
                  <Typography variant="body2" color="text.secondary">
                    {t("no_workflows_yet")}
                  </Typography>
                </Box>
              )}
            </List>
          )}
        </Box>
      </Box>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <ConfirmModal
          open={deleteModalOpen}
          title={t("delete_workflow")}
          body={
            <Trans
              i18nKey="common:delete_workflow_confirmation"
              values={{ name: actionWorkflowName }}
              components={{ b: <b /> }}
            />
          }
          onClose={() => {
            setDeleteModalOpen(false);
            setActionWorkflowId(null);
            setActionWorkflowName("");
          }}
          closeText={t("cancel")}
          confirmText={t("delete")}
          onConfirm={handleDeleteWorkflow}
        />
      )}
    </PanelContainer>
  );
};

export default WorkflowsConfigPanel;
