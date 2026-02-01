import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Delete as DeleteIcon,
  DragIndicator as DragIndicatorIcon,
  MoreVert as MoreVertIcon,
  SwapVert as SortIcon,
} from "@mui/icons-material";
import {
  Box,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import chroma from "chroma-js";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLayerUniqueValues } from "@/lib/api/layers";

import type { SelectorItem } from "@/types/map/common";

import WidgetColorPicker from "@/components/builder/widgets/common/WidgetColorPicker";
import Selector from "@/components/map/panels/common/Selector";

import { MAX_FILTER_VALUES } from "./useFilterValues";

// Default color palette for categories
const DEFAULT_PALETTE = ["#5A1846", "#900C3F", "#C70039", "#E3611C", "#F1920E", "#FFC300"];

interface ColorMapEntry {
  value: string;
  color: string;
}

interface SortableColorItemProps {
  item: ColorMapEntry;
  onRemove: (value: string) => void;
  onColorChange: (value: string, color: string) => void;
}

const SortableColorItem = ({ item, onRemove, onColorChange }: SortableColorItemProps) => {
  const theme = useTheme();
  const { t } = useTranslation("common");
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.value });
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleRemove = () => {
    handleMenuClose();
    onRemove(item.value);
  };

  return (
    <Stack
      ref={setNodeRef}
      style={style}
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        py: 0.5,
        px: 1,
        backgroundColor: theme.palette.background.paper,
        borderRadius: 1,
        border: `1px solid ${theme.palette.divider}`,
      }}>
      <Box {...attributes} {...listeners} sx={{ cursor: "grab", display: "flex", alignItems: "center" }}>
        <DragIndicatorIcon fontSize="small" sx={{ color: theme.palette.text.secondary }} />
      </Box>
      <WidgetColorPicker compact color={item.color} onChange={(color) => onColorChange(item.value, color)} />
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
        {item.value}
      </Typography>
      <IconButton size="small" onClick={handleMenuOpen}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={handleMenuClose}>
        <MenuItem onClick={handleRemove}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>{t("remove")}</ListItemText>
        </MenuItem>
      </Menu>
    </Stack>
  );
};

export interface CategoryColorConfigProps {
  layerId: string | undefined;
  fieldName: string | undefined;
  /** Custom order of categories */
  customOrder: string[] | undefined;
  /** Color map: array of [category_value, hex_color] tuples */
  colorMap: [string, string][] | undefined;
  /** Color palette for generating default colors */
  colorPalette?: string[];
  /** Combined callback for updating both order and color_map atomically */
  onChange: (order: string[], colorMap: [string, string][]) => void;
  cqlFilter?: object;
}

/**
 * Configuration panel for ordering categories with custom colors.
 * Similar to layer styling ordinal color picker - combines ordering with color assignment.
 */
const CategoryColorConfig = ({
  layerId,
  fieldName,
  customOrder,
  colorMap,
  colorPalette = DEFAULT_PALETTE,
  onChange,
  cqlFilter,
}: CategoryColorConfigProps) => {
  const { t } = useTranslation("common");

  const queryParams = useMemo(
    () => ({
      size: 100,
      page: 1,
      order: "descendent" as const,
      ...(cqlFilter ? { query: JSON.stringify(cqlFilter) } : {}),
    }),
    [cqlFilter]
  );

  const { data, isLoading } = useLayerUniqueValues(
    layerId || "",
    fieldName || "",
    layerId && fieldName ? queryParams : undefined
  );

  const totalValuesCount = data?.items?.length || 0;
  const hasMoreThanLimit = totalValuesCount > MAX_FILTER_VALUES;

  // All available values from the data
  const allValues = useMemo(() => {
    const values = data?.items?.map((item) => item.value) || [];
    return values.slice(0, MAX_FILTER_VALUES);
  }, [data?.items]);

  // Generate colors for values using the palette
  const generateColor = useCallback(
    (index: number, totalCount: number): string => {
      if (totalCount <= colorPalette.length) {
        return colorPalette[index % colorPalette.length];
      }
      // Generate interpolated colors for more items
      const colors = chroma.scale(colorPalette).mode("lch").colors(totalCount);
      return colors[index];
    },
    [colorPalette]
  );

  // Build color map lookup
  const colorMapLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    colorMap?.forEach(([value, color]) => {
      lookup.set(value, color);
    });
    return lookup;
  }, [colorMap]);

  // Currently visible items with their colors
  const currentItems = useMemo((): ColorMapEntry[] => {
    const order = customOrder && customOrder.length > 0 ? customOrder : allValues;
    const validOrder = order.filter((v) => allValues.includes(v));

    return validOrder.map((value, index) => ({
      value,
      color: colorMapLookup.get(value) || generateColor(index, validOrder.length),
    }));
  }, [customOrder, allValues, colorMapLookup, generateColor]);

  // Items that can be added (not currently visible)
  const availableToAdd = useMemo(() => {
    const currentValues = currentItems.map((item) => item.value);
    return allValues.filter((v) => !currentValues.includes(v));
  }, [allValues, currentItems]);

  // Options for the selector dropdown
  const itemOptions = useMemo(() => {
    return availableToAdd.map((value) => ({
      value,
      label: value,
    }));
  }, [availableToAdd]);

  const updateBoth = (newItems: ColorMapEntry[]) => {
    const newOrder = newItems.map((item) => item.value);
    const newColorMap: [string, string][] = newItems.map((item) => [item.value, item.color]);
    onChange(newOrder, newColorMap);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = currentItems.findIndex((v) => v.value === active.id);
      const newIndex = currentItems.findIndex((v) => v.value === over.id);
      const newOrder = [...currentItems];
      const [removed] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, removed);
      updateBoth(newOrder);
    }
  };

  const handleRemoveItem = (value: string) => {
    const newItems = currentItems.filter((v) => v.value !== value);
    updateBoth(newItems);
  };

  const handleColorChange = (value: string, color: string) => {
    const newItems = currentItems.map((item) => (item.value === value ? { ...item, color } : item));
    updateBoth(newItems);
  };

  const handleAddItem = (item: SelectorItem | SelectorItem[] | undefined) => {
    if (item && !Array.isArray(item) && item.value) {
      const value = item.value as string;
      if (!currentItems.find((i) => i.value === value)) {
        const newColor = generateColor(currentItems.length, currentItems.length + 1);
        const newItems = [...currentItems, { value, color: newColor }];
        updateBoth(newItems);
      }
    }
  };

  const handleAddAll = () => {
    const newItems = allValues.map((value, index) => ({
      value,
      color: colorMapLookup.get(value) || generateColor(index, allValues.length),
    }));
    updateBoth(newItems);
  };

  const handleRemoveAll = () => {
    updateBoth([]);
  };

  // Smart sort: handles numbers numerically and strings alphabetically
  const handleSort = () => {
    const sorted = [...currentItems].sort((a, b) => {
      const numA = parseFloat(a.value);
      const numB = parseFloat(b.value);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.value.localeCompare(b.value);
    });
    updateBoth(sorted);
  };

  if (!layerId || !fieldName) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
        {t("select_dataset_and_field_first")}
      </Typography>
    );
  }

  if (isLoading) {
    return (
      <Stack spacing={1}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} variant="rounded" height={40} />
        ))}
      </Stack>
    );
  }

  if (allValues.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
        {t("no_values_found")}
      </Typography>
    );
  }

  return (
    <Box>
      {/* Header with title and actions */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="body2" fontWeight="medium">
          {t("order")} ({currentItems.length}/{allValues.length})
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title={t("sort_ascending")}>
            <span>
              <IconButton size="small" onClick={handleSort} disabled={currentItems.length < 2}>
                <SortIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {hasMoreThanLimit && (
        <Typography variant="caption" color="warning.main" sx={{ mb: 1, display: "block" }}>
          {t("filter_limit_warning", { count: MAX_FILTER_VALUES, total: totalValuesCount })}
        </Typography>
      )}

      {/* Add item dropdown */}
      {itemOptions.length > 0 ? (
        <Box sx={{ mb: 1 }}>
          <Selector
            selectedItems={undefined}
            setSelectedItems={handleAddItem}
            items={itemOptions}
            label={t("add_category")}
            placeholder={t("select_category")}
          />
        </Box>
      ) : null}

      {/* Quick actions */}
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <Chip
          label={t("add_all")}
          size="small"
          variant="outlined"
          onClick={handleAddAll}
          disabled={availableToAdd.length === 0}
          sx={{ fontSize: "0.75rem" }}
        />
        <Chip
          label={t("remove_all")}
          size="small"
          variant="outlined"
          onClick={handleRemoveAll}
          disabled={currentItems.length === 0}
          sx={{ fontSize: "0.75rem" }}
        />
      </Stack>

      {/* Visible items list with colors */}
      {currentItems.length > 0 && (
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}>
          <SortableContext items={currentItems.map((i) => i.value)} strategy={verticalListSortingStrategy}>
            <Stack spacing={1}>
              {currentItems.map((item) => (
                <SortableColorItem
                  key={item.value}
                  item={item}
                  onRemove={handleRemoveItem}
                  onColorChange={handleColorChange}
                />
              ))}
            </Stack>
          </SortableContext>
        </DndContext>
      )}
    </Box>
  );
};

export default CategoryColorConfig;
