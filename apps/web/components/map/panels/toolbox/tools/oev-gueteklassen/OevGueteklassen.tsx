import { Box, TextField, Typography, useTheme } from "@mui/material";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

import { ICON_NAME } from "@p4b/ui/components/Icon";

import { useJobs } from "@/lib/api/processes";
import { computeOevGueteKlassen } from "@/lib/api/tools";
import {
  getOevStationConfigPreset,
  type OevConfigPresetKey,
} from "@/lib/constants/oev-gueteklassen";
import { setRunningJobIds } from "@/lib/store/jobs/slice";
import { setMaskLayer } from "@/lib/store/map/slice";
import { jobTypeEnum } from "@/lib/validations/jobs";
import {
  oevGueteklassenCatchmentType,
  oevGueteklassenSchema,
  stationConfigSchema,
  toolboxMaskLayerNames,
} from "@/lib/validations/tools";

import type { SelectorItem } from "@/types/map/common";
import type { IndicatorBaseProps } from "@/types/map/toolbox";

import { useLayerByGeomType, usePTTimeSelectorValues } from "@/hooks/map/ToolsHooks";
import { useAppDispatch, useAppSelector } from "@/hooks/store/ContextHooks";

import Container from "@/components/map/panels/Container";
import SectionHeader from "@/components/map/panels/common/SectionHeader";
import SectionOptions from "@/components/map/panels/common/SectionOptions";
import Selector from "@/components/map/panels/common/Selector";
import ToolboxActionButtons from "@/components/map/panels/common/ToolboxActionButtons";
import ToolsHeader from "@/components/map/panels/common/ToolsHeader";
import LearnMore from "@/components/map/panels/toolbox/common/LearnMore";
import PTTimeSelectors from "@/components/map/panels/toolbox/common/PTTimeSelectors";
import {
  ensureClassificationCoverage,
  getCategoryIds,
  getDistanceKeys,
  getFrequencyInputValue,
  getIntervalLabels,
  parseFrequencyInput,
  updateCategoryCell,
  updateClassificationCell,
  withFrequencies,
} from "@/components/map/panels/toolbox/tools/oev-gueteklassen/utils";

const OevGueteklassen = ({ onBack, onClose }: IndicatorBaseProps) => {
  const { t } = useTranslation("common");
  const theme = useTheme();
  const defaultPreset: OevConfigPresetKey = "standard_120";
  const [isBusy, setIsBusy] = useState(false);
  const { mutate } = useJobs({
    read: false,
  });
  const dispatch = useAppDispatch();
  const runningJobIds = useAppSelector((state) => state.jobs.runningJobIds);
  const { projectId } = useParams();
  const { filteredLayers } = useLayerByGeomType(["feature"], ["polygon"], projectId as string);
  const [referenceLayer, setReferenceLayer] = useState<SelectorItem | undefined>(undefined);

  const presets: SelectorItem[] = useMemo(
    () => [
      { value: "compact_60", label: "Compact (60)", icon: ICON_NAME.CLOCK },
      { value: "standard_120", label: "Standard (120)", icon: ICON_NAME.CLOCK },
      { value: "extended_210", label: "Extended (210)", icon: ICON_NAME.CLOCK },
    ],
    []
  );
  const [selectedPreset, setSelectedPreset] = useState<SelectorItem>(
    presets.find((preset) => preset.value === defaultPreset) || presets[1]
  );
  const [stationConfig, setStationConfig] = useState(
    getOevStationConfigPreset(defaultPreset)
  );
  const [frequencyInput, setFrequencyInput] = useState(getFrequencyInputValue(stationConfig));

  const catchmentAreaTypes: SelectorItem[] = useMemo(() => {
    return [
      {
        value: oevGueteklassenCatchmentType.Enum.buffer,
        label: t("buffer"),
        icon: ICON_NAME.BULLSEYE,
      },
    ];
  }, [t]);
  const [catchmentArea, setCatchmentArea] = useState<SelectorItem | undefined>(catchmentAreaTypes[0]);

  dispatch(setMaskLayer(toolboxMaskLayerNames.pt));

  const {
    // ptModes,
    ptDays,
    ptStartTime,
    setPTStartTime,
    ptEndTime,
    setPTEndTime,
    ptDay,
    setPTDay,
    isPTValid,
    resetPTConfiguration,
  } = usePTTimeSelectorValues();

  const intervalLabels = useMemo(
    () => getIntervalLabels(stationConfig.time_frequency),
    [stationConfig.time_frequency]
  );
  const categoryIds = useMemo(() => getCategoryIds(stationConfig), [stationConfig]);
  const distanceKeys = useMemo(() => getDistanceKeys(stationConfig), [stationConfig]);
  const stationConfigValidation = useMemo(
    () => stationConfigSchema.safeParse(stationConfig),
    [stationConfig]
  );
  const isStationConfigValid = stationConfigValidation.success;

  const isValid = useMemo(() => {
    if (!referenceLayer || !isPTValid || !isStationConfigValid) {
      return false;
    }
    return true;
  }, [isPTValid, isStationConfigValid, referenceLayer]);

  const handlePresetChange = (item: SelectorItem[] | SelectorItem | undefined) => {
    const preset = item as SelectorItem;
    if (!preset?.value) return;
    const nextPreset = preset.value as OevConfigPresetKey;
    const config = getOevStationConfigPreset(nextPreset);
    setSelectedPreset(preset);
    setStationConfig(config);
    setFrequencyInput(getFrequencyInputValue(config));
  };

  const handleFrequencyBlur = () => {
    const parsed = parseFrequencyInput(frequencyInput);
    if (!parsed.length) return;
    const nextConfig = withFrequencies(stationConfig, parsed);
    setStationConfig(nextConfig);
    setFrequencyInput(getFrequencyInputValue(nextConfig));
  };

  const handleRun = async () => {
    const payload = {
      catchment_type: catchmentArea?.value,
      reference_area_layer_project_id: referenceLayer?.value,
      station_config: stationConfig,
      time_window: {
        weekday: ptDay?.value,
        from_time: ptStartTime,
        to_time: ptEndTime,
      },
    };

    try {
      setIsBusy(true);
      const parsedPayload = oevGueteklassenSchema.parse(payload);
      const response = await computeOevGueteKlassen(parsedPayload, projectId as string);
      const { job_id } = response;
      if (job_id) {
        toast.info(`"${t(jobTypeEnum.Enum.oev_gueteklasse)}" - ${t("job_started")}`);
        mutate();
        dispatch(setRunningJobIds([...runningJobIds, job_id]));
      }
    } catch (error) {
      toast.error(`"${t(jobTypeEnum.Enum.oev_gueteklasse)}" - ${t("job_failed")}`);
    } finally {
      setIsBusy(false);
      handleReset();
    }
  };

  const handleReset = () => {
    setReferenceLayer(undefined);
    setCatchmentArea(catchmentAreaTypes[0]);
    const preset = presets.find((option) => option.value === defaultPreset) || presets[1];
    const config = getOevStationConfigPreset(defaultPreset);
    setSelectedPreset(preset);
    setStationConfig(config);
    setFrequencyInput(getFrequencyInputValue(config));
    resetPTConfiguration();
  };

  return (
    <>
      <Container
        disablePadding={false}
        header={<ToolsHeader onBack={onBack} title={t("oev_gueteklasse_header")} />}
        close={onClose}
        body={
          <>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
              }}>
              {/* DESCRIPTION */}
              <Typography variant="body2" sx={{ fontStyle: "italic", marginBottom: theme.spacing(4) }}>
                {t("oev_gueteklasse_description")}
                <LearnMore docsPath="/toolbox/accessibility_indicators/oev_gueteklassen" />
              </Typography>

              {/* CALCULATION TIME */}
              <SectionHeader
                active={true}
                alwaysActive={true}
                label={t("calculation_time")}
                icon={ICON_NAME.CLOCK}
                disableAdvanceOptions={true}
              />
              <SectionOptions
                active={true}
                baseOptions={
                  <>
                    <PTTimeSelectors
                      ptStartTime={ptStartTime}
                      setPTStartTime={setPTStartTime}
                      ptEndTime={ptEndTime}
                      setPTEndTime={setPTEndTime}
                      ptDays={ptDays}
                      ptDay={ptDay}
                      setPTDay={setPTDay}
                      isPTValid={isPTValid}
                    />
                  </>
                }
              />

              {/* REFERENCE LAYER */}
              <SectionHeader
                active={true}
                alwaysActive={true}
                label={t("reference_layer")}
                icon={ICON_NAME.LAYERS}
                disableAdvanceOptions={true}
              />
              <SectionOptions
                active={true}
                baseOptions={
                  <>
                    <Selector
                      selectedItems={referenceLayer}
                      setSelectedItems={(item: SelectorItem[] | SelectorItem | undefined) => {
                        setReferenceLayer(item as SelectorItem);
                      }}
                      items={filteredLayers}
                      emptyMessage={t("no_polygon_layer_found")}
                      emptyMessageIcon={ICON_NAME.LAYERS}
                      label={t("select_reference_layer")}
                      placeholder={t("select_reference_layer_placeholder")}
                      tooltip={t("select_reference_layer_tooltip")}
                    />
                  </>
                }
              />

              {/* CONFIGURATION  */}
              <SectionHeader
                active={!!referenceLayer && isPTValid}
                alwaysActive={true}
                label={t("configuration")}
                icon={ICON_NAME.SETTINGS}
                disableAdvanceOptions={true}
              />

              <SectionOptions
                active={!!referenceLayer && isPTValid}
                baseOptions={
                  <>
                    <Selector
                      selectedItems={catchmentArea}
                      setSelectedItems={(item: SelectorItem[] | SelectorItem | undefined) => {
                        setCatchmentArea(item as SelectorItem);
                      }}
                      items={catchmentAreaTypes}
                      label={t("oev_gueteklassen_catchement_area")}
                      tooltip={t("oev_gueteklassen_catchment_area_tooltip")}
                    />

                    <Selector
                      selectedItems={selectedPreset}
                      setSelectedItems={handlePresetChange}
                      items={presets}
                      label="Preset"
                      tooltip="Start from a predefined configuration"
                    />

                    <TextField
                      size="small"
                      value={frequencyInput}
                      onChange={(event) => {
                        setFrequencyInput(event.target.value);
                      }}
                      onBlur={handleFrequencyBlur}
                      label="Frequency thresholds (minutes)"
                      placeholder="5, 10, 20, 40, 60, 120"
                    />

                    <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
                      Station Category Matrix
                    </Typography>
                    <Box sx={{ overflowX: "auto", border: `1px solid ${theme.palette.divider}` }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: 8 }}>Interval</th>
                            <th style={{ textAlign: "left", padding: 8 }}>A</th>
                            <th style={{ textAlign: "left", padding: 8 }}>B</th>
                            <th style={{ textAlign: "left", padding: 8 }}>C</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stationConfig.categories.map((row, rowIndex) => (
                            <tr key={`row-${rowIndex}`}>
                              <td style={{ padding: 8 }}>{intervalLabels[rowIndex] || `#${rowIndex + 1}`}</td>
                              {(["A", "B", "C"] as const).map((group) => (
                                <td key={`${rowIndex}-${group}`} style={{ padding: 8 }}>
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={row[group] ?? ""}
                                    inputProps={{ min: 1 }}
                                    onChange={(event) => {
                                      const value = Number(event.target.value);
                                      if (!Number.isFinite(value) || value <= 0) return;
                                      setStationConfig((current) =>
                                        updateCategoryCell(current, rowIndex, group, value)
                                      );
                                    }}
                                    sx={{ width: 88 }}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Box>

                    <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
                      Distance to Class Matrix
                    </Typography>
                    <Box sx={{ overflowX: "auto", border: `1px solid ${theme.palette.divider}` }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: 8 }}>Category</th>
                            {distanceKeys.map((distance) => (
                              <th key={`distance-${distance}`} style={{ textAlign: "left", padding: 8 }}>
                                {distance} m
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {categoryIds.map((categoryId) => (
                            <tr key={`category-${categoryId}`}>
                              <td style={{ padding: 8 }}>{categoryId}</td>
                              {distanceKeys.map((distance) => (
                                <td key={`${categoryId}-${distance}`} style={{ padding: 8 }}>
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={stationConfig.classification[categoryId]?.[distance] ?? ""}
                                    inputProps={{ min: 1, max: 6 }}
                                    onChange={(event) => {
                                      const value = Number(event.target.value);
                                      if (!Number.isFinite(value) || value < 1 || value > 6) return;
                                      setStationConfig((current) =>
                                        ensureClassificationCoverage(
                                          updateClassificationCell(current, categoryId, distance, String(value))
                                        )
                                      );
                                    }}
                                    sx={{ width: 88 }}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Box>

                    {!isStationConfigValid ? (
                      <Typography color="error" variant="caption">
                        {stationConfigValidation.error.issues[0]?.message}
                      </Typography>
                    ) : null}
                  </>
                }
              />
            </Box>
          </>
        }
        action={
          <ToolboxActionButtons
            runFunction={handleRun}
            runDisabled={!isValid}
            isBusy={isBusy}
            resetFunction={handleReset}
          />
        }
      />
      ;
    </>
  );
};

export default OevGueteklassen;
