import {
  Autocomplete,
  Button,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Radio,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { type CSSProperties, useMemo, useState } from "react";

import {
  getOevStationConfigPreset,
  type OevConfigPresetKey,
} from "@/lib/constants/oev-gueteklassen";
import { stationConfigSchema } from "@/lib/validations/tools";

import type { ProcessedInput } from "@/types/map/ogc-processes";
import type { SelectorItem } from "@/types/map/common";

import {
  classLabelToNumber,
  classNumberToLabel,
  getCategoryIds,
  getDistanceKeys,
  getIntervalLabels,
  updateCategoryCell,
  updateClassificationCell,
  withFrequencies,
} from "@/components/map/panels/toolbox/tools/oev-gueteklassen/utils";
import Selector from "@/components/map/panels/common/Selector";
import FormLabelHelper from "@/components/common/FormLabelHelper";
interface OevStationConfigInputProps {
  input: Pick<ProcessedInput, "name" | "title">;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

const PRESETS: { value: OevConfigPresetKey; label: string }[] = [
  { value: "compact_60", label: "Takt bis 60 Minuten" },
  { value: "standard_120", label: "Takt bis 120 Minuten" },
  { value: "extended_210", label: "Takt bis 210 Minuten" },
];

const DEFAULT_PRESET: OevConfigPresetKey = "standard_120";
const COMMON_FREQUENCY_OPTIONS = [5, 10, 15, 20, 30, 40, 60, 90, 120, 180, 210];
const GROUP_OPTIONS = ["A", "B", "C"] as const;

type GroupKey = (typeof GROUP_OPTIONS)[number];

interface ModeGroupOption {
  id: string;
  label: string;
  routeTypes: string[];
}

const MODE_GROUP_OPTIONS: ModeGroupOption[] = [
  {
    id: "2",
    label: "Bahn",
    routeTypes: [
      "2",
      "100",
      "101",
      "102",
      "103",
      "104",
      "105",
      "106",
      "107",
      "108",
      "109",
      "110",
      "111",
      "112",
      "114",
      "116",
      "117",
      "400",
      "403",
      "405",
    ],
  },
  { id: "1", label: "U-Bahn / Metro", routeTypes: ["1", "401", "402"] },
  { id: "0", label: "Tram", routeTypes: ["0", "900", "901", "902", "903", "904", "905", "906"] },
  {
    id: "3",
    label: "Bus",
    routeTypes: ["3", "200", "201", "202", "204", "700", "701", "702", "704", "705", "712", "715", "800"],
  },
  { id: "4", label: "Fähre", routeTypes: ["4", "1000"] },
  { id: "5", label: "Seilbahn", routeTypes: ["5", "1300"] },
  { id: "6", label: "Gondel", routeTypes: ["6"] },
  { id: "7", label: "Standseilbahn", routeTypes: ["7", "1400"] },
];

const sortObject = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sortObject(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nestedValue]) => [key, sortObject(nestedValue)])
    );
  }
  return value;
};

const stationConfigEquals = (first: unknown, second: unknown): boolean => {
  return JSON.stringify(sortObject(first)) === JSON.stringify(sortObject(second));
};

export default function OevStationConfigInput({
  value,
  onChange,
  disabled,
}: OevStationConfigInputProps) {
  const theme = useTheme();

  const parsedValue = stationConfigSchema.safeParse(value);
  const stationConfig = parsedValue.success
    ? parsedValue.data
    : getOevStationConfigPreset(DEFAULT_PRESET);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftConfig, setDraftConfig] = useState(stationConfig);
  const [draftFrequencyInput, setDraftFrequencyInput] = useState("");
  const [classificationInputDrafts, setClassificationInputDrafts] = useState<Record<string, string>>({});
  const [isCustomPresetSelected, setIsCustomPresetSelected] = useState(false);

  const sanitizeFrequencies = (values: number[]): number[] => {
    return [...new Set(values)]
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.round(value))
      .sort((a, b) => a - b);
  };

  const parseFrequencyTokens = (tokens: string[]): number[] => {
    return sanitizeFrequencies(
      tokens.flatMap((token) =>
        token
          .split(/[\s,;]+/)
          .map((item) => Number(item.trim()))
      )
    );
  };

  const selectedDraftPresetValue = useMemo(() => {
    if (isCustomPresetSelected) {
      return "custom";
    }

    const matchingPreset = PRESETS.find((preset) => {
      const presetConfig = getOevStationConfigPreset(preset.value);
      return stationConfigEquals(presetConfig, draftConfig);
    });
    return matchingPreset?.value ?? "custom";
  }, [draftConfig, isCustomPresetSelected]);

  const presetItems = useMemo<SelectorItem[]>(() => {
    return [
      ...PRESETS.map((preset) => ({ value: preset.value, label: preset.label })),
      { value: "custom", label: "Benutzerdefiniert" },
    ];
  }, []);

  const selectedDraftPresetItem = useMemo<SelectorItem | undefined>(() => {
    return presetItems.find((item) => item.value === selectedDraftPresetValue);
  }, [presetItems, selectedDraftPresetValue]);

  const intervalLabels = useMemo(
    () => getIntervalLabels(draftConfig.time_frequency),
    [draftConfig.time_frequency]
  );
  const categoryIds = useMemo(() => getCategoryIds(draftConfig), [draftConfig]);
  const distanceKeys = useMemo(() => getDistanceKeys(draftConfig), [draftConfig]);
  const groupKeys = useMemo<GroupKey[]>(() => {
    const keys = new Set<string>();
    draftConfig.categories.forEach((row) => {
      Object.keys(row).forEach((key) => keys.add(key));
    });

    const sortedKeys = [...keys]
      .filter((key): key is GroupKey => GROUP_OPTIONS.includes(key as GroupKey))
      .sort((left, right) => left.localeCompare(right));

    if (sortedKeys.length === 0) {
      return [...GROUP_OPTIONS];
    }

    return sortedKeys;
  }, [draftConfig.categories]);

  const stationConfigValidation = stationConfigSchema.safeParse(draftConfig);
  const isDraftValid = stationConfigValidation.success;

  const compactNumberInputSx = {
    width: "64px",
    "& .MuiInputBase-input": {
      px: 0.75,
      py: 0.625,
      textAlign: "center",
      fontSize: "0.8rem",
    },
  };

  const tableCellStyle: CSSProperties = {
    textAlign: "left",
    padding: "3px 4px",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
    fontSize: "0.8rem",
  };

  const tableHeaderCellStyle: CSSProperties = {
    ...tableCellStyle,
    fontSize: "0.8rem",
    fontWeight: 600,
  };

  const matrixCellCenterStyle: CSSProperties = {
    ...tableCellStyle,
    textAlign: "center",
  };

  const sectionHeadingSx = {
    fontSize: "0.9rem",
    lineHeight: 1.25,
    fontWeight: 700,
  };

  const handleDialogPresetChange = (item: SelectorItem | SelectorItem[] | undefined) => {
    if (!item || Array.isArray(item)) {
      return;
    }

    const preset = item.value as OevConfigPresetKey | "custom";
    if (preset === "custom") {
      setIsCustomPresetSelected(true);
      return;
    }

    setIsCustomPresetSelected(false);
    const nextConfig = getOevStationConfigPreset(preset);
    setDraftConfig(nextConfig);
  };

  const getModeGroupValue = (config: typeof draftConfig, option: ModeGroupOption): GroupKey => {
    const foundGroups = option.routeTypes
      .map((routeType) => config.groups[routeType])
      .filter((group): group is GroupKey => GROUP_OPTIONS.includes(group as GroupKey));

    const matchedGroup = foundGroups.find((group) => groupKeys.includes(group));
    return matchedGroup ?? groupKeys[0] ?? GROUP_OPTIONS[0];
  };

  const handleModeGroupChange = (option: ModeGroupOption, nextGroup: GroupKey | null) => {
    if (!nextGroup) {
      return;
    }

    setDraftConfig((current) => {
      const nextGroups = { ...current.groups };
      option.routeTypes.forEach((routeType) => {
        nextGroups[routeType] = nextGroup;
      });

      return {
        ...current,
        groups: nextGroups,
      };
    });
  };

  const handleOpenDialog = () => {
    setDraftConfig(stationConfig);
    setDraftFrequencyInput("");
    setClassificationInputDrafts({});
    setIsCustomPresetSelected(false);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setClassificationInputDrafts({});
    setDialogOpen(false);
  };

  const handleApplyDialog = () => {
    if (!isDraftValid) {
      return;
    }
    onChange(draftConfig);
    setClassificationInputDrafts({});
    setDialogOpen(false);
  };

  const getClassificationCellKey = (categoryId: string, distance: number): string => {
    return `${categoryId}-${distance}`;
  };

  const getClassificationDisplayValue = (categoryId: string, distance: number): string => {
    const cellKey = getClassificationCellKey(categoryId, distance);
    const draftValue = classificationInputDrafts[cellKey];
    if (draftValue !== undefined) {
      return draftValue;
    }

    const numericValue = Number(draftConfig.classification[categoryId]?.[distance]);
    return Number.isInteger(numericValue) && numericValue > 0 ? classNumberToLabel(numericValue) : "";
  };

  const handleClassificationInputChange = (categoryId: string, distance: number, rawValue: string) => {
    const normalizedValue = rawValue.toUpperCase();
    const cellKey = getClassificationCellKey(categoryId, distance);

    setClassificationInputDrafts((current) => ({
      ...current,
      [cellKey]: normalizedValue,
    }));

    const stationClass = classLabelToNumber(normalizedValue);
    if (!stationClass) {
      return;
    }

    setDraftConfig((current) => updateClassificationCell(current, categoryId, distance, String(stationClass)));
  };

  const handleClassificationInputCommit = (categoryId: string, distance: number) => {
    const cellKey = getClassificationCellKey(categoryId, distance);
    const rawValue = classificationInputDrafts[cellKey];
    if (rawValue === undefined) {
      return;
    }

    const stationClass = classLabelToNumber(rawValue);
    if (stationClass) {
      setDraftConfig((current) => updateClassificationCell(current, categoryId, distance, String(stationClass)));
    }

    setClassificationInputDrafts((current) => {
      const next = { ...current };
      delete next[cellKey];
      return next;
    });
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}>
        <Button variant="outlined" onClick={handleOpenDialog} disabled={disabled}>
          Haltestellenkonfiguration
        </Button>

        <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="lg">
          <DialogTitle>Haltestellenkonfiguration</DialogTitle>
          <DialogContent dividers>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75, pt: 0.5 }}>
              <Selector
                selectedItems={selectedDraftPresetItem}
                setSelectedItems={handleDialogPresetChange}
                items={presetItems}
                  label="Konfigurationsprofil"
                  placeholder="Profil auswählen"
                disabled={disabled}
              />

              <FormControl size="small" fullWidth>
                <FormLabelHelper
                  label="Taktgrenzen (Minuten)"
                  color={theme.palette.text.secondary}
                />
                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  disabled={disabled}
                  options={COMMON_FREQUENCY_OPTIONS.map(String)}
                  value={draftConfig.time_frequency.map(String)}
                  inputValue={draftFrequencyInput}
                  onInputChange={(_event, nextInput) => {
                    setDraftFrequencyInput(nextInput);
                  }}
                  onChange={(_event, nextValues) => {
                    const parsed = parseFrequencyTokens(nextValues);
                    if (!parsed.length) {
                      return;
                    }
                    setDraftConfig((current) => withFrequencies(current, parsed));
                    setDraftFrequencyInput("");
                  }}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        {...getTagProps({ index })}
                        key={`${option}-${index}`}
                        label={`${option} Min.`}
                        size="small"
                      />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Wert in Minuten eingeben + Enter"
                      onBlur={() => {
                        if (!draftFrequencyInput.trim()) {
                          return;
                        }
                        const parsedDraft = parseFrequencyTokens([
                          ...draftConfig.time_frequency.map(String),
                          draftFrequencyInput,
                        ]);
                        if (!parsedDraft.length) {
                          return;
                        }
                        setDraftConfig((current) => withFrequencies(current, parsedDraft));
                        setDraftFrequencyInput("");
                      }}
                    />
                  )}
                />
              </FormControl>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "minmax(280px, 0.95fr) minmax(360px, 1.05fr)" },
                  gap: 1.25,
                  alignItems: "start",
                }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography variant="subtitle2" sx={sectionHeadingSx}>
                    Verkehrsmittelgruppen
                  </Typography>
                  <Box
                    sx={{
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 1,
                      maxWidth: "100%",
                      overflowX: "auto",
                      overflowY: "hidden",
                    }}>
                    <table style={{ width: "max-content", borderCollapse: "collapse" }}>
                      <colgroup>
                        <col style={{ width: 130 }} />
                        {groupKeys.map((groupKey) => (
                          <col key={`mode-col-${groupKey}`} style={{ width: 38 }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={tableHeaderCellStyle}>Verkehrsmittel</th>
                          {groupKeys.map((groupKey) => (
                            <th key={`mode-group-header-${groupKey}`} style={tableHeaderCellStyle}>
                              {groupKey}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MODE_GROUP_OPTIONS.map((option) => {
                          const selectedGroup = getModeGroupValue(draftConfig, option);
                          return (
                            <tr key={option.id}>
                              <td style={{ ...tableCellStyle, padding: "2px 4px" }}>{option.label}</td>
                              {groupKeys.map((groupKey) => (
                                <td
                                  key={`${option.id}-${groupKey}`}
                                  style={{ ...matrixCellCenterStyle, padding: "1px 4px" }}>
                                  <Radio
                                    size="small"
                                    checked={selectedGroup === groupKey}
                                    disabled={disabled}
                                    onChange={() => handleModeGroupChange(option, groupKey)}
                                    sx={{ p: 0.25 }}
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Box>
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography variant="subtitle2" sx={sectionHeadingSx}>
                    Haltestellenkategorien
                  </Typography>
                  <Box
                    sx={{
                      maxWidth: "100%",
                      overflowX: "auto",
                      overflowY: "hidden",
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 1,
                    }}>
                    <table style={{ width: "max-content", borderCollapse: "collapse" }}>
                      <colgroup>
                        <col style={{ width: 180 }} />
                        <col style={{ width: 66 }} />
                        <col style={{ width: 66 }} />
                        <col style={{ width: 66 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={tableHeaderCellStyle}>Taktintervall</th>
                          <th style={tableHeaderCellStyle}>A</th>
                          <th style={tableHeaderCellStyle}>B</th>
                          <th style={tableHeaderCellStyle}>C</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftConfig.categories.map((row, rowIndex) => (
                          <tr key={`category-row-${rowIndex}`}>
                            <td style={tableCellStyle}>{intervalLabels[rowIndex] || `#${rowIndex + 1}`}</td>
                            {(["A", "B", "C"] as const).map((group) => (
                              <td key={`category-${rowIndex}-${group}`} style={tableCellStyle}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={row[group] ?? ""}
                                  inputProps={{ min: 1 }}
                                  disabled={disabled}
                                  onChange={(event) => {
                                    const category = Number(event.target.value);
                                    if (!Number.isFinite(category) || category <= 0) {
                                      return;
                                    }
                                    setDraftConfig((current) =>
                                      updateCategoryCell(current, rowIndex, group, category)
                                    );
                                  }}
                                  sx={compactNumberInputSx}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                </Box>
              </Box>

              <Typography variant="subtitle2" sx={sectionHeadingSx}>
                Distanzklassen
              </Typography>
              <Box
                sx={{
                  maxWidth: "100%",
                  overflowX: "auto",
                  overflowY: "hidden",
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 1,
                }}>
                <table style={{ width: "max-content", borderCollapse: "collapse" }}>
                  <colgroup>
                    <col style={{ width: 110 }} />
                    {distanceKeys.map((distance) => (
                      <col key={`distance-col-${distance}`} style={{ width: 82 }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Kategorie</th>
                      {distanceKeys.map((distance) => (
                        <th key={`distance-${distance}`} style={tableHeaderCellStyle}>
                          {distance} m
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categoryIds.map((categoryId) => (
                      <tr key={`classification-row-${categoryId}`}>
                        <td style={tableCellStyle}>{categoryId}</td>
                        {distanceKeys.map((distance) => (
                          <td key={`classification-${categoryId}-${distance}`} style={tableCellStyle}>
                            <TextField
                              size="small"
                              value={getClassificationDisplayValue(categoryId, distance)}
                              inputProps={{ style: { textTransform: "uppercase" } }}
                              disabled={disabled}
                              onChange={(event) => {
                                handleClassificationInputChange(categoryId, distance, event.target.value);
                              }}
                              onFocus={(event) => event.target.select()}
                              onBlur={() => handleClassificationInputCommit(categoryId, distance)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  handleClassificationInputCommit(categoryId, distance);
                                }
                              }}
                              sx={compactNumberInputSx}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>

              {!isDraftValid ? (
                <Typography color="error" variant="caption">
                  {stationConfigValidation.error.issues[0]?.message}
                </Typography>
              ) : null}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Cancel</Button>
            <Button onClick={handleApplyDialog} variant="contained" disabled={!isDraftValid}>
              Apply
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}