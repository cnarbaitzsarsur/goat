import { useMemo } from "react";

import { useLayerUniqueValues } from "@/lib/api/layers";
import { normalizeValue } from "@/lib/utils/normalize-value";

export const MAX_FILTER_VALUES = 20;

interface UseFilterValuesParams {
  layerId?: string;
  fieldName?: string;
  customOrder?: string[];
  cqlFilter?: object;
}

export const useFilterValues = ({ layerId, fieldName, customOrder, cqlFilter }: UseFilterValuesParams) => {
  // Stringify cqlFilter for stable comparison in useMemo dependency
  const cqlFilterString = cqlFilter ? JSON.stringify(cqlFilter) : undefined;

  const queryParams = useMemo(
    () => ({
      size: 100,
      page: 1,
      order: "descendent" as const,
      ...(cqlFilterString ? { query: cqlFilterString } : {}),
    }),
    [cqlFilterString]
  );

  const { data, isLoading } = useLayerUniqueValues(
    layerId || "",
    fieldName || "",
    layerId && fieldName ? queryParams : undefined
  );

  // Check if there are more values than the limit
  const totalValuesCount = data?.items?.length || 0;
  const hasMoreThanLimit = totalValuesCount > MAX_FILTER_VALUES;

  const allValues = useMemo(() => {
    const dataValues = data?.items?.map((item) => item.value) || [];

    // Build normalized lookup for matching (handles "12" vs "12.0" format differences)
    const normalizedDataValues = new Map(dataValues.map((v) => [normalizeValue(v), v]));

    // Apply custom order if provided
    let orderedValues: string[];
    if (customOrder === undefined) {
      // No custom order set - show all values in default order
      orderedValues = dataValues;
    } else if (customOrder.length === 0) {
      // Empty array means user explicitly removed all - show nothing
      orderedValues = [];
    } else {
      // Custom order set - filter and order by it
      // Only show values that are in customOrder AND exist in data (using normalized comparison)
      // Map back to the actual data values to maintain consistent formatting
      orderedValues = customOrder
        .map((v) => normalizedDataValues.get(normalizeValue(v)))
        .filter((v): v is string => v !== undefined);
    }

    // Limit to MAX_FILTER_VALUES
    return orderedValues.slice(0, MAX_FILTER_VALUES);
  }, [data?.items, customOrder]);

  return {
    allValues,
    isLoading,
    totalValuesCount,
    hasMoreThanLimit,
  };
};
