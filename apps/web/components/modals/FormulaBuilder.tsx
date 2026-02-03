"use client";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ICON_NAME, Icon } from "@p4b/ui/components/Icon";

import type { ExpressionPreviewResult, FunctionDoc, ValidateExpressionResponse } from "@/lib/api/expressions";
import {
  FUNCTION_CATEGORIES,
  previewExpressionAsAggregation,
  useExpressionFunctions,
  validateExpression,
} from "@/lib/api/expressions";

// Operators definition for the formula builder
const OPERATORS = [
  { symbol: "+", label: "Add", syntax: " + " },
  { symbol: "-", label: "Subtract", syntax: " - " },
  { symbol: "*", label: "Multiply", syntax: " * " },
  { symbol: "/", label: "Divide", syntax: " / " },
  { symbol: "%", label: "Modulo", syntax: " % " },
] as const;

// Common SQL aggregate functions for GROUP BY validation
const AGGREGATE_FUNCTIONS = [
  "SUM",
  "AVG",
  "COUNT",
  "MIN",
  "MAX",
  "MEDIAN",
  "STDDEV",
  "STDDEV_POP",
  "STDDEV_SAMP",
  "VARIANCE",
  "VAR_POP",
  "VAR_SAMP",
  "FIRST",
  "LAST",
  "LIST",
  "STRING_AGG",
  "GROUP_CONCAT",
  "BIT_AND",
  "BIT_OR",
  "BIT_XOR",
  "BOOL_AND",
  "BOOL_OR",
  "ARBITRARY",
  "ANY_VALUE",
];

// Field type for the formula builder
export interface FormulaField {
  name: string;
  type: string;
}

// Convert database type to JSON type for type validation
// Handles both raw database types (BIGINT, VARCHAR, etc.) and
// already-normalized types (number, string, integer)
function databaseTypeToJsonType(dbType: string): string {
  const normalizedType = dbType.toLowerCase();

  // Already normalized types (from useLayerFields hook)
  if (normalizedType === "number" || normalizedType === "integer") {
    return "integer"; // Use "integer" which maps to NUMERIC in validator
  }
  if (normalizedType === "string") {
    return "string";
  }
  if (normalizedType === "boolean") {
    return "boolean";
  }
  if (normalizedType === "geometry") {
    return "geometry";
  }

  // Raw database types
  if (
    normalizedType.includes("int") ||
    normalizedType.includes("bigint") ||
    normalizedType.includes("smallint")
  ) {
    return "integer";
  }
  if (
    normalizedType.includes("float") ||
    normalizedType.includes("double") ||
    normalizedType.includes("decimal") ||
    normalizedType.includes("numeric") ||
    normalizedType.includes("real")
  ) {
    return "number";
  }
  if (normalizedType.includes("bool")) {
    return "boolean";
  }
  if (normalizedType.includes("geom") || normalizedType.includes("geography")) {
    return "geometry";
  }
  return "string";
}

// Get icon for field type
function getFieldTypeIcon(type: string): ICON_NAME {
  const normalizedType = type.toLowerCase();
  if (
    normalizedType.includes("int") ||
    normalizedType.includes("double") ||
    normalizedType.includes("float") ||
    normalizedType === "number"
  ) {
    return ICON_NAME.NUMBER;
  }
  if (normalizedType.includes("varchar") || normalizedType.includes("text") || normalizedType === "string") {
    return ICON_NAME.TEXT;
  }
  if (
    normalizedType.includes("date") ||
    normalizedType.includes("time") ||
    normalizedType.includes("timestamp")
  ) {
    return ICON_NAME.CLOCK;
  }
  if (
    normalizedType.includes("geom") ||
    normalizedType.includes("point") ||
    normalizedType.includes("polygon") ||
    normalizedType.includes("line")
  ) {
    return ICON_NAME.MAP;
  }
  if (normalizedType === "boolean" || normalizedType === "bool") {
    return ICON_NAME.CIRCLECHECK;
  }
  return ICON_NAME.DATABASE;
}

// Main FormulaBuilder props
export interface FormulaBuilderProps {
  open: boolean;
  onClose: () => void;
  onApply: (expression: string, groupByColumn?: string) => void;
  initialExpression?: string;
  initialGroupByColumn?: string;
  fields: FormulaField[];
  collectionId?: string; // For preview functionality
  title?: string;
  showGroupBy?: boolean;
}

export default function FormulaBuilder({
  open,
  onClose,
  onApply,
  initialExpression = "",
  initialGroupByColumn = "",
  fields,
  collectionId,
  title,
  showGroupBy = true,
}: FormulaBuilderProps) {
  const { t } = useTranslation("common");
  const inputRef = useRef<HTMLInputElement>(null);

  // State
  const [expression, setExpression] = useState(initialExpression);
  const [functionSearch, setFunctionSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("fields");
  const [selectedFunction, setSelectedFunction] = useState<FunctionDoc | null>(null);
  const [validation, setValidation] = useState<ValidateExpressionResponse | null>(null);
  const [preview, setPreview] = useState<ExpressionPreviewResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const [groupByColumn, setGroupByColumn] = useState<string>("");
  const [hoveredOperator, setHoveredOperator] = useState<(typeof OPERATORS)[number] | null>(null);
  const [hoveredField, setHoveredField] = useState<FormulaField | null>(null);

  // Fetch functions only when dialog is open
  const {
    functions: allFunctions,
    isLoading: functionsLoading,
    isError: functionsError,
  } = useExpressionFunctions(open);

  // Non-geometry fields for Group By
  const nonGeomFields = useMemo(() => {
    return fields.filter((f) => !f.type.toLowerCase().includes("geom"));
  }, [fields]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setExpression(initialExpression);
      setValidation(null);
      setPreview(null);
      setSelectedFunction(null);
      setActiveTab(0);
      setGroupByColumn(initialGroupByColumn);
    }
  }, [open, initialExpression, initialGroupByColumn]);

  // Filter functions by search (across all categories) and also filter fields
  const filteredFunctionsByCategory = useMemo(() => {
    if (!allFunctions) return {};

    const result: Record<string, FunctionDoc[]> = {};
    const search = functionSearch.toLowerCase();

    for (const [category, functions] of Object.entries(allFunctions)) {
      const filtered = search
        ? functions.filter(
            (f) => f.name.toLowerCase().includes(search) || f.syntax.toLowerCase().includes(search)
          )
        : functions;

      if (filtered.length > 0) {
        result[category] = filtered;
      }
    }

    return result;
  }, [allFunctions, functionSearch]);

  // Filter fields by search
  const filteredFields = useMemo(() => {
    if (!functionSearch) return fields;
    const search = functionSearch.toLowerCase();
    return fields.filter((f) => f.name.toLowerCase().includes(search));
  }, [fields, functionSearch]);

  // Column names for validation
  const columnNames = useMemo(() => fields.map((f) => f.name), [fields]);

  // Get items for selected category
  const categoryItems = useMemo(() => {
    if (!allFunctions) return [];

    switch (selectedCategory) {
      case "fields":
        return filteredFields.map((f) => ({ type: "field" as const, data: f }));
      case "operators":
        return OPERATORS.map((op) => ({ type: "operator" as const, data: op }));
      default:
        // Function categories
        const funcs = filteredFunctionsByCategory[selectedCategory] || [];
        return funcs.map((f) => ({ type: "function" as const, data: f }));
    }
  }, [selectedCategory, filteredFields, filteredFunctionsByCategory, allFunctions]);

  // Category list for sidebar
  const categories = useMemo(() => {
    const cats = [
      { key: "fields", label: t("fields"), count: fields.length },
      { key: "operators", label: t("operators"), count: OPERATORS.length },
    ];
    // Add function categories
    Object.entries(FUNCTION_CATEGORIES).forEach(([key, { labelKey }]) => {
      const count = allFunctions?.[key]?.length || 0;
      if (count > 0) {
        cats.push({ key, label: t(labelKey), count });
      }
    });
    return cats;
  }, [fields.length, allFunctions, t]);

  // Insert text at cursor position
  const insertAtCursor = useCallback(
    (text: string) => {
      const before = expression.slice(0, cursorPosition);
      const after = expression.slice(cursorPosition);
      const newExpression = before + text + after;
      setExpression(newExpression);
      // Move cursor to end of inserted text
      const newPosition = cursorPosition + text.length;
      setCursorPosition(newPosition);
      // Focus and set selection
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newPosition, newPosition);
        }
      }, 0);
    },
    [expression, cursorPosition]
  );

  // Insert field reference
  const insertField = useCallback(
    (fieldName: string) => {
      insertAtCursor(fieldName);
    },
    [insertAtCursor]
  );

  // Smart insert function - wraps the entire expression if it's a simple field
  const smartInsertFunction = useCallback(
    (func: FunctionDoc) => {
      // Check if current expression is just a single field name (no spaces, no operators)
      const trimmedExpression = expression.trim();
      const isSimpleField = fields.some((f) => f.name === trimmedExpression);

      if (isSimpleField) {
        // Wrap the entire field with the function
        // Replace (args) in syntax with (fieldName)
        const wrappedExpression = func.syntax.replace(/\([^)]*\)/, `(${trimmedExpression})`);
        setExpression(wrappedExpression);

        // Position cursor at the end
        const newPosition = wrappedExpression.length;
        setCursorPosition(newPosition);

        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(newPosition, newPosition);
          }
        }, 0);
        setSelectedFunction(func);
        return;
      }

      // Default: just insert the syntax normally at cursor
      insertAtCursor(func.syntax);
      setSelectedFunction(func);
    },
    [expression, fields, insertAtCursor]
  );

  // Insert operator at cursor position
  const insertOperator = useCallback(
    (syntax: string) => {
      insertAtCursor(syntax);
    },
    [insertAtCursor]
  );

  // Check if expression contains aggregate functions
  const hasAggregateFunction = useCallback((expr: string) => {
    const upperExpr = expr.toUpperCase();
    return AGGREGATE_FUNCTIONS.some((fn) => {
      // Match function name followed by opening parenthesis (with optional whitespace)
      const regex = new RegExp(`\\b${fn}\\s*\\(`, "i");
      return regex.test(upperExpr);
    });
  }, []);

  // Validate expression
  const handleValidate = useCallback(async () => {
    if (!expression.trim()) {
      setValidation(null);
      return;
    }

    // When GROUP BY is selected, first check that expression uses aggregate functions
    if (groupByColumn && !hasAggregateFunction(expression)) {
      setValidation({
        valid: false,
        expression,
        errors: [
          {
            message: t("group_by_requires_aggregate"),
            code: "MISSING_AGGREGATE",
          },
        ],
        warnings: [],
        referenced_columns: [],
        used_functions: [],
      });
      return;
    }

    // Always validate the expression syntax via API
    setIsValidating(true);
    try {
      // Build column_types map from fields
      const columnTypes: Record<string, string> = {};
      for (const field of fields) {
        columnTypes[field.name] = databaseTypeToJsonType(field.type);
      }

      const result = await validateExpression({
        expression,
        column_names: columnNames,
        column_types: columnTypes,
        geometry_column: fields.find((f) => f.type.toLowerCase().includes("geom"))?.name || null,
      });
      setValidation(result);
    } catch (error) {
      setValidation({
        valid: false,
        expression,
        errors: [{ message: String(error), code: "API_ERROR" }],
        warnings: [],
        referenced_columns: [],
        used_functions: [],
      });
    } finally {
      setIsValidating(false);
    }
  }, [expression, columnNames, fields, groupByColumn, hasAggregateFunction, t]);

  // Preview expression using aggregation-stats endpoint
  const handlePreview = useCallback(async () => {
    if (!expression.trim() || !collectionId) {
      setPreview(null);
      return;
    }

    setIsPreviewing(true);
    try {
      const result = await previewExpressionAsAggregation(
        collectionId,
        expression,
        groupByColumn || null,
        10
      );
      setPreview(result);
    } catch (error) {
      setPreview({
        value: null,
        total_count: 0,
        error: String(error),
      });
    } finally {
      setIsPreviewing(false);
    }
  }, [expression, collectionId, groupByColumn]);

  // Debounced validation - re-run when expression or groupByColumn changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (expression.trim()) {
        handleValidate();
      } else {
        setValidation(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [expression, groupByColumn, handleValidate]);

  // Auto-preview when switching to Preview tab or when groupByColumn changes
  useEffect(() => {
    if (activeTab === 1 && expression.trim() && collectionId && validation?.valid !== false) {
      handlePreview();
    }
  }, [activeTab, expression, collectionId, validation?.valid, groupByColumn, handlePreview]);

  // Handle apply
  const handleApply = () => {
    if (validation?.valid || !validation) {
      onApply(expression, groupByColumn || undefined);
      onClose();
    }
  };

  // Handle cursor position tracking
  const handleInputSelect = useCallback(() => {
    const target = inputRef.current;
    if (target) {
      setCursorPosition(target.selectionStart || 0);
    }
  }, []);

  // Validation status icon
  const ValidationIndicator = () => {
    if (isValidating) {
      return <CircularProgress size={16} />;
    }
    if (!expression.trim()) {
      return null;
    }
    if (validation?.valid) {
      return (
        <Tooltip title={t("expression_valid")}>
          <Icon iconName={ICON_NAME.CIRCLECHECK} fontSize="small" htmlColor="#4caf50" />
        </Tooltip>
      );
    }
    if (validation?.valid === false) {
      return (
        <Tooltip title={validation.errors[0]?.message || t("expression_invalid")}>
          <Icon iconName={ICON_NAME.XCLOSE} fontSize="small" htmlColor="#f44336" />
        </Tooltip>
      );
    }
    return null;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: "85vh",
          minHeight: 600,
        },
      }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Icon iconName={ICON_NAME.CODE} />
            <Typography variant="h6">{title || t("formula_builder")}</Typography>
          </Stack>
          <IconButton onClick={onClose} size="small">
            <Icon iconName={ICON_NAME.CLOSE} fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2, pb: 2, overflow: "hidden" }}>
        <Stack spacing={2}>
          {/* Expression Input with inline validation */}
          <Box sx={{ position: "relative" }}>
            <TextField
              inputRef={inputRef}
              fullWidth
              multiline
              rows={3}
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              onSelect={handleInputSelect}
              onClick={handleInputSelect}
              placeholder={t("enter_expression_placeholder")}
              sx={{
                "& .MuiInputBase-input": {
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                },
              }}
              error={validation?.valid === false}
            />
            {/* Validation indicator in top-right corner */}
            <Box
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                display: "flex",
                alignItems: "center",
              }}>
              <ValidationIndicator />
            </Box>
          </Box>

          {/* Error message below editor (only when there's an error) */}
          {validation?.valid === false && !isValidating && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {validation.errors.map((err, i) => (
                <Box key={i}>
                  <Typography variant="caption">{err.message}</Typography>
                  {err.suggestion && (
                    <Typography variant="caption" color="primary" sx={{ display: "block" }}>
                      {err.suggestion}
                    </Typography>
                  )}
                </Box>
              ))}
            </Alert>
          )}

          {/* Tabs: Build / Preview */}
          <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
            <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
              <Tab label={t("build")} />
              <Tab label={t("preview")} />
            </Tabs>
          </Box>

          {/* BUILD TAB */}
          {activeTab === 0 && (
            <Stack spacing={2}>
              {/* Main row: Fields & Functions on left, Function Help on right */}
              <Stack direction="row" spacing={2} sx={{ height: 320, minHeight: 320 }}>
                {/* Three-column layout: Categories | Items | Help */}
                {/* Left: Categories */}
                <Paper
                  variant="outlined"
                  sx={{ width: 120, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <Box sx={{ flex: 1, overflow: "auto" }}>
                    <List dense disablePadding>
                      {categories.map((cat) => (
                        <ListItem key={cat.key} disablePadding>
                          <ListItemButton
                            selected={selectedCategory === cat.key}
                            onClick={() => {
                              setSelectedCategory(cat.key);
                              // Clear hover states when switching categories
                              setHoveredField(null);
                              setHoveredOperator(null);
                              setSelectedFunction(null);
                            }}
                            sx={{
                              py: 0.75,
                              px: 1.5,
                              borderLeft: 3,
                              borderColor: selectedCategory === cat.key ? "primary.main" : "transparent",
                              bgcolor: selectedCategory === cat.key ? "action.selected" : "transparent",
                            }}>
                            <ListItemText
                              primary={
                                <Typography
                                  variant="body2"
                                  fontWeight={selectedCategory === cat.key ? "medium" : "normal"}>
                                  {cat.label}
                                </Typography>
                              }
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                </Paper>

                {/* Middle: Items for selected category */}
                <Paper
                  variant="outlined"
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    maxHeight: 320,
                  }}>
                  <Box sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: "divider" }}>
                    <OutlinedInput
                      size="small"
                      fullWidth
                      placeholder={t("search_items")}
                      value={functionSearch}
                      onChange={(e) => setFunctionSearch(e.target.value)}
                      sx={{ fontSize: "0.875rem" }}
                      startAdornment={
                        <InputAdornment position="start" sx={{ mr: 1 }}>
                          <Icon
                            iconName={ICON_NAME.SEARCH}
                            fontSize="inherit"
                            sx={{ fontSize: "0.875rem" }}
                          />
                        </InputAdornment>
                      }
                    />
                  </Box>
                  <Box sx={{ flex: 1, overflow: "auto" }}>
                    {functionsLoading ? (
                      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                        <CircularProgress size={24} />
                      </Box>
                    ) : functionsError ? (
                      <Box sx={{ textAlign: "center", py: 2 }}>
                        <Typography variant="body2" color="error">
                          {t("error_loading_functions")}
                        </Typography>
                      </Box>
                    ) : categoryItems.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                        {t("no_items_found")}
                      </Typography>
                    ) : (
                      <List dense disablePadding>
                        {categoryItems.map((item) => {
                          if (item.type === "field") {
                            const field = item.data as FormulaField;
                            return (
                              <ListItem key={field.name} disablePadding>
                                <ListItemButton
                                  onClick={() => insertField(field.name)}
                                  onMouseEnter={() => setHoveredField(field)}
                                  onMouseLeave={() => setHoveredField(null)}
                                  sx={{ py: 0.5, px: 1.5 }}
                                  dense>
                                  <ListItemIcon sx={{ minWidth: 24 }}>
                                    <Icon
                                      iconName={getFieldTypeIcon(field.type)}
                                      sx={{ fontSize: "1rem" }}
                                      color="action"
                                    />
                                  </ListItemIcon>
                                  <ListItemText
                                    primary={
                                      <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                                        {field.name}
                                      </Typography>
                                    }
                                  />
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontSize: "0.75rem",
                                      color: "text.disabled",
                                      fontFamily: "monospace",
                                    }}>
                                    ↵
                                  </Typography>
                                </ListItemButton>
                              </ListItem>
                            );
                          }

                          if (item.type === "operator") {
                            const op = item.data as (typeof OPERATORS)[number];
                            return (
                              <ListItem key={op.symbol} disablePadding>
                                <ListItemButton
                                  onClick={() => insertOperator(op.syntax)}
                                  onMouseEnter={() => setHoveredOperator(op)}
                                  onMouseLeave={() => setHoveredOperator(null)}
                                  sx={{ py: 0.5, px: 1.5 }}
                                  dense>
                                  <ListItemIcon sx={{ minWidth: 24 }}>
                                    <Typography
                                      variant="body2"
                                      fontFamily="monospace"
                                      fontSize="0.8rem"
                                      fontWeight="bold"
                                      color="action">
                                      {op.symbol}
                                    </Typography>
                                  </ListItemIcon>
                                  <ListItemText
                                    primary={
                                      <Typography variant="body2" fontSize="0.8rem">
                                        {op.label}
                                      </Typography>
                                    }
                                  />
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontSize: "0.75rem",
                                      color: "text.disabled",
                                      fontFamily: "monospace",
                                    }}>
                                    ↵
                                  </Typography>
                                </ListItemButton>
                              </ListItem>
                            );
                          }

                          // Function
                          const func = item.data as FunctionDoc;
                          return (
                            <ListItem key={func.name} disablePadding>
                              <ListItemButton
                                onClick={() => smartInsertFunction(func)}
                                onMouseEnter={() => setSelectedFunction(func)}
                                onMouseLeave={() => setSelectedFunction(null)}
                                sx={{ py: 0.5, px: 1.5 }}
                                dense>
                                <ListItemText
                                  primary={
                                    <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                                      {func.name}
                                    </Typography>
                                  }
                                />
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontSize: "0.75rem",
                                    color: "text.disabled",
                                    fontFamily: "monospace",
                                  }}>
                                  ↵
                                </Typography>
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </List>
                    )}
                  </Box>
                </Paper>

                {/* Right: Help Panel */}
                <Paper
                  variant="outlined"
                  sx={{ width: 280, p: 1.5, display: "flex", flexDirection: "column" }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Icon iconName={ICON_NAME.INFO} fontSize="small" color="primary" />
                    <Typography variant="subtitle2">{t("help")}</Typography>
                  </Stack>
                  <Divider sx={{ mb: 1 }} />
                  <Box sx={{ flex: 1, overflow: "auto" }}>
                    {/* Field Help */}
                    {hoveredField ? (
                      <>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                          <Icon
                            iconName={getFieldTypeIcon(hoveredField.type)}
                            fontSize="small"
                            color="primary"
                          />
                          <Typography variant="body2" fontWeight="bold" fontFamily="monospace">
                            {hoveredField.name}
                          </Typography>
                        </Stack>
                        <Chip
                          label={hoveredField.type.toUpperCase()}
                          size="small"
                          sx={{ mb: 1.5, height: 20, fontSize: "0.7rem" }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {t("field_help_description", { field: hoveredField.name, type: hoveredField.type })}
                        </Typography>
                      </>
                    ) : hoveredOperator ? (
                      /* Operator Help */
                      <>
                        <Typography
                          variant="body2"
                          fontWeight="bold"
                          fontFamily="monospace"
                          fontSize="1.25rem"
                          sx={{ mb: 1 }}>
                          {hoveredOperator.symbol}
                        </Typography>
                        <Typography variant="body2" fontWeight="medium" sx={{ mb: 1 }}>
                          {hoveredOperator.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t(`operator_${hoveredOperator.symbol}_desc`, {
                            defaultValue: t("operator_description", { symbol: hoveredOperator.symbol }),
                          })}
                        </Typography>
                      </>
                    ) : selectedFunction ? (
                      /* Function Help */
                      <>
                        {/* Function name and category */}
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          sx={{ mb: 0.5 }}>
                          <Typography variant="body2" fontWeight="bold" color="primary.main">
                            {selectedFunction.name.toUpperCase()}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              bgcolor: "action.hover",
                              px: 0.75,
                              py: 0.25,
                              borderRadius: 0.5,
                              textTransform: "capitalize",
                            }}>
                            {t(`category_${selectedFunction.category}`, {
                              defaultValue: selectedFunction.category,
                            })}
                          </Typography>
                        </Stack>

                        {/* Syntax */}
                        <Box
                          sx={{
                            mb: 1,
                            p: 0.75,
                            bgcolor: "action.hover",
                            borderRadius: 0.5,
                            border: 1,
                            borderColor: "divider",
                          }}>
                          <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                            {selectedFunction.syntax}
                          </Typography>
                        </Box>

                        {/* Description */}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mb: 1.5 }}>
                          {t(`func_${selectedFunction.name}_desc`, {
                            defaultValue: t(selectedFunction.description_key, {
                              defaultValue: selectedFunction.description_key,
                            }),
                          })}
                        </Typography>

                        {/* Parameters */}
                        {selectedFunction.parameters.length > 0 && (
                          <Box sx={{ mb: 1.5 }}>
                            <Typography
                              variant="caption"
                              fontWeight="bold"
                              sx={{ display: "block", mb: 0.5 }}>
                              {t("parameters")}:
                            </Typography>
                            {selectedFunction.parameters.map((param, idx) => (
                              <Stack key={idx} direction="row" spacing={0.5} sx={{ mb: 0.25 }}>
                                <Typography variant="caption" fontFamily="monospace" color="primary.main">
                                  {param.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  ({param.type.toLowerCase()}){param.optional ? ` - ${t("optional")}` : ""}
                                </Typography>
                              </Stack>
                            ))}
                          </Box>
                        )}

                        {/* Example */}
                        <Box sx={{ bgcolor: "action.hover", p: 1, borderRadius: 1 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight="bold">
                            {t("example")}:
                          </Typography>
                          <Typography
                            variant="body2"
                            fontFamily="monospace"
                            fontSize="0.75rem"
                            sx={{ mt: 0.25 }}>
                            {selectedFunction.example}
                          </Typography>
                        </Box>
                      </>
                    ) : (
                      <Box sx={{ textAlign: "center", py: 4 }}>
                        <Icon
                          iconName={ICON_NAME.INFO}
                          fontSize="large"
                          sx={{ color: "action.disabled", mb: 1 }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {t("hover_for_help")}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Paper>
              </Stack>

              {/* Group By Panel - single select */}
              {showGroupBy && (
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{ minWidth: 150, flexShrink: 0 }}>
                      <Icon iconName={ICON_NAME.AGGREGATE} fontSize="small" color="primary" />
                      <Typography variant="subtitle2">{t("group_by")}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        ({t("optional")})
                      </Typography>
                    </Stack>
                    <FormControl fullWidth size="small">
                      <Select
                        displayEmpty
                        value={groupByColumn}
                        onChange={(e) => setGroupByColumn(e.target.value as string)}
                        MenuProps={{
                          PaperProps: {
                            sx: { maxHeight: 300 },
                          },
                        }}
                        renderValue={(selected) => {
                          if (!selected) {
                            return (
                              <Typography variant="body2" color="text.secondary">
                                {t("select_column")}
                              </Typography>
                            );
                          }
                          return (
                            <Typography variant="body2" fontFamily="monospace">
                              {selected}
                            </Typography>
                          );
                        }}>
                        <MenuItem value="">
                          <Typography variant="body2" color="text.secondary">
                            {t("none")}
                          </Typography>
                        </MenuItem>
                        {nonGeomFields.map((field) => (
                          <MenuItem key={field.name} value={field.name}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Icon iconName={getFieldTypeIcon(field.type)} fontSize="inherit" />
                              <Typography variant="body2" fontFamily="monospace">
                                {field.name}
                              </Typography>
                            </Stack>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {groupByColumn && (
                      <IconButton size="small" onClick={() => setGroupByColumn("")} sx={{ flexShrink: 0 }}>
                        <Icon iconName={ICON_NAME.XCLOSE} fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </Paper>
              )}
            </Stack>
          )}

          {/* PREVIEW TAB (auto-runs) */}
          {activeTab === 1 && (
            <Box sx={{ minHeight: 300 }}>
              {isPreviewing && (
                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 8 }}>
                  <CircularProgress />
                </Box>
              )}

              {!isPreviewing && preview && (
                <>
                  {!preview.error ? (
                    <Stack spacing={2}>
                      {/* Summary info */}
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "right" }}>
                        {t("total_rows")}: {preview.total_count}
                      </Typography>

                      {/* Results display */}
                      {groupByColumn && preview.items && preview.items.length > 0 ? (
                        /* Grouped results - show as simple list */
                        <Paper variant="outlined" sx={{ p: 2 }}>
                          <Typography variant="subtitle2" sx={{ mb: 2 }}>
                            {t("result")} {t("grouped_by")} {groupByColumn}
                          </Typography>
                          <Stack spacing={1}>
                            {preview.items.slice(0, 10).map((item, idx) => (
                              <Stack
                                key={idx}
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                                sx={{
                                  py: 0.5,
                                  px: 1,
                                  bgcolor: idx % 2 === 0 ? "action.hover" : "transparent",
                                  borderRadius: 1,
                                }}>
                                <Typography variant="body2" color="text.secondary">
                                  {item.grouped_value !== null ? String(item.grouped_value) : "NULL"}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                  color="primary.main">
                                  {item.operation_value !== null ? String(item.operation_value) : "NULL"}
                                </Typography>
                              </Stack>
                            ))}
                          </Stack>
                        </Paper>
                      ) : (
                        /* Single aggregated result */
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 4,
                            textAlign: "center",
                            bgcolor: "action.hover",
                          }}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mb: 1 }}>
                            {t("result")}
                          </Typography>
                          <Typography
                            variant="h3"
                            fontFamily="monospace"
                            fontWeight="bold"
                            color="primary.main">
                            {preview.value !== null ? String(preview.value) : "NULL"}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 1 }}>
                            {t("aggregated_over_rows", { count: preview.total_count })}
                          </Typography>
                        </Paper>
                      )}
                    </Stack>
                  ) : (
                    <Alert severity="error">
                      <Typography variant="body2">{preview.error}</Typography>
                    </Alert>
                  )}
                </>
              )}

              {!isPreviewing && !preview && !expression.trim() && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    py: 8,
                  }}>
                  <Icon iconName={ICON_NAME.CODE} sx={{ fontSize: 48, color: "action.disabled", mb: 2 }} />
                  <Typography variant="body1" color="text.secondary">
                    {t("enter_expression_to_preview")}
                  </Typography>
                </Box>
              )}

              {!isPreviewing && !preview && expression.trim() && validation?.valid === false && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    py: 8,
                  }}>
                  <Icon iconName={ICON_NAME.XCLOSE} sx={{ fontSize: 48, color: "error.main", mb: 2 }} />
                  <Typography variant="body1" color="text.secondary">
                    {t("fix_expression_errors_to_preview")}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
        }}>
        <Stack direction="row" spacing={2}>
          <Button onClick={onClose} color="inherit" variant="outlined">
            {t("cancel")}
          </Button>
          <Button onClick={handleApply} variant="contained" disabled={validation?.valid === false}>
            {t("apply")}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
