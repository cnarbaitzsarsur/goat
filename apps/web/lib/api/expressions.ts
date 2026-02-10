import useSWR from "swr";

import { apiRequestAuth, fetcher } from "@/lib/api/fetcher";
import { GEOAPI_BASE_URL, PROCESSES_BASE_URL } from "@/lib/constants";

// Types
export interface ValidationError {
  message: string;
  code: string;
  position?: number | null;
  suggestion?: string | null;
}

export interface ValidateExpressionRequest {
  expression: string;
  column_names: string[];
  column_types?: Record<string, string> | null;
  geometry_column?: string | null;
}

export interface ValidateExpressionResponse {
  valid: boolean;
  expression: string;
  errors: ValidationError[];
  warnings: string[];
  referenced_columns: string[];
  used_functions: string[];
}

export interface PreviewRow {
  row_number: number;
  result: string | number | boolean | null;
  context: Record<string, unknown>;
}

export interface PreviewExpressionRequest {
  expression: string;
  where_clause?: string | null;
  limit?: number;
}

export interface PreviewExpressionResponse {
  success: boolean;
  expression: string;
  result_type?: string | null;
  rows: PreviewRow[];
  column_names: string[];
  error?: string | null;
}

export interface FunctionParameter {
  name: string;
  type: string;
  description_key: string;
  optional: boolean;
}

export interface FunctionDoc {
  name: string;
  category: string;
  syntax: string;
  example: string;
  description_key: string;
  parameters: FunctionParameter[];
}

export interface FunctionListResponse {
  functions: Record<string, FunctionDoc[]>;
  total: number;
}

// API functions
const EXPRESSIONS_API_URL = `${GEOAPI_BASE_URL}/expressions`;

/**
 * Validate an expression with explicit column names
 */
export async function validateExpression(
  request: ValidateExpressionRequest
): Promise<ValidateExpressionResponse> {
  const response = await apiRequestAuth(`${EXPRESSIONS_API_URL}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to validate expression");
  }

  return response.json();
}

/**
 * Validate an expression for a specific collection (layer)
 */
export async function validateExpressionForCollection(
  collectionId: string,
  expression: string
): Promise<ValidateExpressionResponse> {
  const response = await apiRequestAuth(`${EXPRESSIONS_API_URL}/validate/${collectionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expression }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to validate expression");
  }

  return response.json();
}

/**
 * Preview an expression result for a collection
 */
export async function previewExpression(
  collectionId: string,
  request: PreviewExpressionRequest
): Promise<PreviewExpressionResponse> {
  const response = await apiRequestAuth(`${EXPRESSIONS_API_URL}/preview/${collectionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to preview expression");
  }

  return response.json();
}

/**
 * Hook to fetch all available functions
 */
export function useExpressionFunctions(enabled: boolean = true) {
  const { data, isLoading, error } = useSWR<FunctionListResponse>(
    enabled ? `${EXPRESSIONS_API_URL}/functions` : null,
    fetcher
  );

  return {
    functions: data?.functions,
    total: data?.total,
    isLoading,
    isError: error,
  };
}

/**
 * Hook to fetch functions by category
 */
export function useExpressionFunctionsByCategory(category: string) {
  const { data, isLoading, error } = useSWR<FunctionDoc[]>(
    category ? [`${EXPRESSIONS_API_URL}/functions/${category}`] : null,
    fetcher
  );

  return {
    functions: data,
    isLoading,
    isError: error,
  };
}

// API URL for processes (aggregation stats)
const PROCESSES_API_URL = `${PROCESSES_BASE_URL}/processes`;

export interface ExpressionPreviewResult {
  value: number | null;
  total_count: number;
  error?: string;
  items?: Array<{ grouped_value: string | number | null; operation_value: number }>;
}

/**
 * Preview an expression result using the aggregation-stats endpoint.
 * This shows how the expression will be computed when used in widgets.
 */
export async function previewExpressionAsAggregation(
  collectionId: string,
  expression: string,
  groupByColumn?: string | null,
  limit: number = 10
): Promise<ExpressionPreviewResult> {
  const inputs: Record<string, unknown> = {
    collection: collectionId,
    operation: "expression",
    operation_column: expression,
    limit: limit,
  };

  if (groupByColumn) {
    inputs.group_by_column = groupByColumn;
  }

  const response = await apiRequestAuth(`${PROCESSES_API_URL}/aggregation-stats/execution`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.detail || error.detail || "Failed to preview expression");
  }

  const result = await response.json();
  return {
    value: result.items?.[0]?.operation_value ?? null,
    total_count: result.total_count || 0,
    items: result.items || [],
  };
}

// --- Custom SQL API types and functions ---

export interface ValidateSqlRequest {
  sql_query: string;
  table_schemas: Record<string, Record<string, string>>;
}

export interface ValidateSqlResponse {
  valid: boolean;
  errors: string[];
  columns: Record<string, string>;
}

export interface PreviewSqlRequest {
  sql_query: string;
  layers: Record<string, string>; // alias -> layer_id
  limit?: number;
}

export interface PreviewSqlRow {
  values: Record<string, unknown>;
}

export interface PreviewSqlResponse {
  success: boolean;
  columns: Array<{ name: string; type: string }>;
  rows: PreviewSqlRow[];
  total_count?: number | null;
  error?: string | null;
}

/**
 * Validate a SQL SELECT statement against table schemas.
 * Uses the processes service (same pattern as aggregation-stats).
 */
export async function validateSql(request: ValidateSqlRequest): Promise<ValidateSqlResponse> {
  const response = await apiRequestAuth(`${PROCESSES_API_URL}/validate-sql/execution`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: {
        sql_query: request.sql_query,
        table_schemas: request.table_schemas,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.detail || error.detail || "Failed to validate SQL");
  }

  return response.json();
}

/**
 * Preview SQL query results against actual layer data.
 * Uses the processes service (same pattern as aggregation-stats).
 */
export async function previewSql(request: PreviewSqlRequest): Promise<PreviewSqlResponse> {
  const response = await apiRequestAuth(`${PROCESSES_API_URL}/preview-sql/execution`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: {
        sql_query: request.sql_query,
        layers: request.layers,
        limit: request.limit ?? 10,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.detail || error.detail || "Failed to preview SQL");
  }

  return response.json();
}

// Category display names and icons for UI
export const FUNCTION_CATEGORIES = {
  math: { labelKey: "category_math", icon: "calculator" },
  string: { labelKey: "category_string", icon: "text_fields" },
  date: { labelKey: "category_date", icon: "calendar_today" },
  aggregate: { labelKey: "category_aggregate", icon: "functions" },
  window: { labelKey: "category_window", icon: "view_column" },
  conditional: { labelKey: "category_conditional", icon: "call_split" },
} as const;

export type FunctionCategory = keyof typeof FUNCTION_CATEGORIES;
