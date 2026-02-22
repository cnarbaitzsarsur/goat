import { Button, IconButton, Popover, Stack, TextField, Tooltip, Typography, useTheme } from "@mui/material";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ICON_NAME, Icon } from "@p4b/ui/components/Icon";

import type { PopperMenuItem } from "@/components/common/PopperMenu";
import MoreMenu from "@/components/common/PopperMenu";

import { MAX_FILTER_VALUES, useFilterValues } from "./useFilterValues";

interface FilterValueLabelConfigProps {
  layerId: string | undefined;
  fieldName: string | undefined;
  customOrder?: string[];
  labelMap?: [string, string][];
  cqlFilter?: object;
  onLabelMapChange: (labelMap: [string, string][]) => void;
}

interface LabelRowProps {
  value: string;
  displayLabel: string;
  onRename: (value: string, nextLabel: string) => void;
  onClear: (value: string) => void;
}

const LabelRow = ({ value, displayLabel, onRename, onClear }: LabelRowProps) => {
  const { t } = useTranslation("common");
  const theme = useTheme();
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  const [renameAnchorEl, setRenameAnchorEl] = useState<HTMLElement | null>(null);
  const [draftLabel, setDraftLabel] = useState(displayLabel);

  const menuItems = useMemo<PopperMenuItem[]>(
    () => [
      { id: "rename", label: t("rename"), icon: ICON_NAME.EDIT },
      { id: "remove", label: t("remove"), icon: ICON_NAME.TRASH, color: theme.palette.error.main },
    ],
    [t, theme.palette.error.main]
  );

  const handleStartRename = () => {
    setDraftLabel(displayLabel);
    setRenameAnchorEl(actionButtonRef.current);
  };

  const handleRenameClose = () => {
    setRenameAnchorEl(null);
  };

  const handleRenameSave = () => {
    const nextLabel = draftLabel.trim() || value;
    onRename(value, nextLabel);
    handleRenameClose();
  };

  const handleRenameCancel = () => {
    setDraftLabel(displayLabel);
    handleRenameClose();
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        py: 0.5,
        px: 1,
        borderRadius: 1,
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
      }}>
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
        {displayLabel}
      </Typography>

      <MoreMenu
        disablePortal={false}
        menuItems={menuItems}
        menuButton={
          <Tooltip title={t("more_options")} placement="top">
            <IconButton size="small" sx={{ px: 0.5 }} ref={actionButtonRef}>
              <Icon iconName={ICON_NAME.MORE_VERT} style={{ fontSize: "15px" }} />
            </IconButton>
          </Tooltip>
        }
        onSelect={(menuItem: PopperMenuItem) => {
          if (menuItem.id === "rename") {
            handleStartRename();
          } else if (menuItem.id === "remove") {
            onClear(value);
          }
        }}
      />

      <Popover
        open={Boolean(renameAnchorEl)}
        anchorEl={renameAnchorEl}
        onClose={handleRenameCancel}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <Stack spacing={1.5} sx={{ p: 1.5, width: 280 }}>
          <Typography variant="caption" color="text.secondary">
            {`${t("value")}: ${value}`}
          </Typography>
          <TextField
            size="small"
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleRenameSave();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                handleRenameCancel();
              }
            }}
            autoFocus
            fullWidth
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" onClick={handleRenameCancel} variant="text" sx={{ borderRadius: 0 }}>
              <Typography variant="body2" fontWeight="bold">
                {t("cancel")}
              </Typography>
            </Button>
            <Button
              size="small"
              variant="text"
              color="primary"
              onClick={handleRenameSave}
              sx={{ borderRadius: 0 }}>
              <Typography variant="body2" fontWeight="bold" color="inherit">
                {t("rename")}
              </Typography>
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </Stack>
  );
};

const FilterValueLabelConfig = ({
  layerId,
  fieldName,
  customOrder,
  labelMap,
  cqlFilter,
  onLabelMapChange,
}: FilterValueLabelConfigProps) => {
  const { t } = useTranslation("common");

  const { allValues, isLoading, hasMoreThanLimit, totalValuesCount } = useFilterValues({
    layerId: layerId || "",
    fieldName: fieldName || "",
    customOrder,
    cqlFilter,
  });

  const labelMapLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    labelMap?.forEach(([value, label]) => {
      lookup.set(value, label);
    });
    return lookup;
  }, [labelMap]);

  const updateLabel = (value: string, nextLabel: string) => {
    const current = new Map(labelMapLookup);
    const trimmed = nextLabel.trim();

    if (!trimmed || trimmed === value) {
      current.delete(value);
    } else {
      current.set(value, trimmed);
    }

    onLabelMapChange(Array.from(current.entries()));
  };

  const clearLabel = (value: string) => {
    const current = new Map(labelMapLookup);
    current.delete(value);
    onLabelMapChange(Array.from(current.entries()));
  };

  if (!layerId || !fieldName) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
        {t("select_dataset_and_field_first")}
      </Typography>
    );
  }

  if (isLoading) {
    return null;
  }

  if (allValues.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
        {t("no_values_found")}
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      <Typography variant="body2" fontWeight="medium">
        {t("value_labels")}
      </Typography>
      {allValues.map((value) => (
        <LabelRow
          key={value}
          value={value}
          displayLabel={labelMapLookup.get(value) || value}
          onRename={updateLabel}
          onClear={clearLabel}
        />
      ))}
      {hasMoreThanLimit && (
        <Typography variant="caption" color="warning.main">
          {t("filter_limit_warning", { count: MAX_FILTER_VALUES, total: totalValuesCount })}
        </Typography>
      )}
    </Stack>
  );
};

export default FilterValueLabelConfig;
