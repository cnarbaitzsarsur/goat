import { AccountTree as WorkflowIcon } from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  Typography,
} from "@mui/material";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { ICON_NAME, Icon } from "@p4b/ui/components/Icon";

import { useWorkflows } from "@/lib/api/workflows";

interface WorkflowListProps {
  onSelectWorkflow: (workflowId: string) => void;
}

export default function WorkflowList({ onSelectWorkflow }: WorkflowListProps) {
  const { t } = useTranslation("common");
  const { projectId } = useParams();

  const { workflows, isLoading } = useWorkflows(projectId as string);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!workflows || workflows.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t("no_workflows_available")}
        </Typography>
      </Box>
    );
  }

  return (
    <List dense sx={{ pt: 0 }}>
      {workflows.map((workflow) => (
        <ListItemButton key={workflow.id} onClick={() => onSelectWorkflow(workflow.id)}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <WorkflowIcon sx={{ fontSize: 18, color: "text.secondary" }} />
          </ListItemIcon>
          <ListItemText
            primary={workflow.name}
            secondary={
              workflow.description && workflow.description.length > 60
                ? `${workflow.description.substring(0, 60)}...`
                : workflow.description
            }
            secondaryTypographyProps={{
              variant: "caption",
              sx: { opacity: 0.7 },
            }}
          />
          <ListItemSecondaryAction>
            <Icon iconName={ICON_NAME.CHEVRON_RIGHT} sx={{ fontSize: "12px" }} />
          </ListItemSecondaryAction>
        </ListItemButton>
      ))}
    </List>
  );
}
