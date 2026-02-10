/**
 * Hook for validating workflow connections based on data types
 *
 * Uses cached process descriptions to validate that source output types
 * are compatible with target input types.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";

import { apiRequestAuth } from "@/lib/api/fetcher";
import { PROCESSES_BASE_URL } from "@/lib/constants";
import {
  type DataTypeInfo,
  extractInputDataType,
  extractOutputDataType,
  isConnectionValid,
} from "@/lib/utils/ogc-utils";
import type { WorkflowNode } from "@/lib/validations/workflow";

import type { OGCProcessDescription } from "@/types/map/ogc-processes";

const PROCESSES_API_URL = `${PROCESSES_BASE_URL}/processes`;

/**
 * Fetch multiple process descriptions in parallel
 */
async function fetchProcessDescriptions(
  processIds: string[],
  language: string
): Promise<Map<string, OGCProcessDescription>> {
  const results = new Map<string, OGCProcessDescription>();

  await Promise.all(
    processIds.map(async (processId) => {
      try {
        const response = await apiRequestAuth(`${PROCESSES_API_URL}/${processId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Accept-Language": language,
          },
        });

        if (response.ok) {
          const data = await response.json();
          results.set(processId, data);
        }
      } catch {
        // Ignore errors for individual processes
      }
    })
  );

  return results;
}

/**
 * Hook to get cached process descriptions for workflow nodes
 */
export function useWorkflowProcessDescriptions(nodes: WorkflowNode[]) {
  const { i18n } = useTranslation();
  const language = i18n.language || "en";

  // Get unique process IDs from tool nodes
  const processIds = Array.from(
    new Set(
      nodes
        .filter((node) => node.data.type === "tool")
        .map((node) => (node.data as { processId: string }).processId)
    )
  );

  const { data: processMap } = useSWR(
    processIds.length > 0 ? ["workflow-processes", processIds.join(","), language] : null,
    () => fetchProcessDescriptions(processIds, language),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  return processMap ?? new Map<string, OGCProcessDescription>();
}

/**
 * Get the output data type for a node
 */
function getNodeOutputType(
  node: WorkflowNode | undefined,
  processMap: Map<string, OGCProcessDescription>
): DataTypeInfo {
  if (!node) {
    return { dataType: undefined };
  }

  // Dataset nodes - output type depends on the layer type
  if (node.data.type === "dataset") {
    // If layerType is explicitly set, use it
    if (node.data.layerType === "table") {
      return { dataType: "table" };
    }
    // If no geometry type, it's likely a table
    if (node.data.layerId && !node.data.geometryType) {
      return { dataType: "table" };
    }
    return { dataType: "vector" };
  }

  // Export nodes don't produce output
  if (node.data.type === "export") {
    return { dataType: undefined };
  }

  // Tool nodes - get from process description
  if (node.data.type === "tool") {
    const process = processMap.get(node.data.processId);
    if (process?.outputs?.result) {
      return extractOutputDataType(process.outputs.result);
    }
    // All tools output vector data — default to vector even if process
    // description hasn't loaded yet (prevents connection rejection during loading)
    return { dataType: "vector" };
  }

  return { dataType: undefined };
}

/**
 * Get the input data type for a specific input handle on a node
 */
function getNodeInputType(
  node: WorkflowNode | undefined,
  inputHandle: string | null | undefined,
  processMap: Map<string, OGCProcessDescription>
): DataTypeInfo {
  if (!node) {
    return { dataType: undefined };
  }

  // Dataset nodes don't have inputs
  if (node.data.type === "dataset") {
    return { dataType: undefined };
  }

  // Export nodes accept any data (vector or table)
  if (node.data.type === "export") {
    return { dataType: undefined };
  }

  // Tool nodes - get from process description
  if (node.data.type === "tool") {
    const process = processMap.get(node.data.processId);
    if (process?.inputs && inputHandle) {
      const input = process.inputs[inputHandle];
      if (input) {
        return extractInputDataType(input);
      }
    }
  }

  return { dataType: undefined };
}

/**
 * Hook that provides a connection validation function
 *
 * Returns a function that can be used as ReactFlow's isValidConnection prop
 */
export function useConnectionValidator(
  nodes: WorkflowNode[],
  processMap: Map<string, OGCProcessDescription>
) {
  const validateConnection = useCallback(
    (connection: {
      source: string | null;
      target: string | null;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }) => {
      const { source, target, targetHandle } = connection;

      // Basic validation - need source and target
      if (!source || !target) {
        return false;
      }

      // Find the nodes
      const sourceNode = nodes.find((n) => n.id === source);
      const targetNode = nodes.find((n) => n.id === target);

      if (!sourceNode || !targetNode) {
        return false;
      }

      // Get output type from source node
      const outputType = getNodeOutputType(sourceNode, processMap);

      // Get input type from target node (using specific handle)
      const inputType = getNodeInputType(targetNode, targetHandle, processMap);

      // Validate the connection
      return isConnectionValid(outputType, inputType);
    },
    [nodes, processMap]
  );

  return validateConnection;
}

export type { DataTypeInfo };
