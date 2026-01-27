import * as z from "zod";

// ============================================================================
// Node Status
// ============================================================================

/**
 * Status of a workflow node during execution
 */
export const nodeStatusSchema = z.enum(["idle", "pending", "running", "completed", "error"]);

export type NodeStatus = z.infer<typeof nodeStatusSchema>;

// ============================================================================
// Dataset Node
// ============================================================================

/**
 * Data schema for a dataset node - represents a project layer input
 */
export const datasetNodeDataSchema = z.object({
  type: z.literal("dataset"),
  label: z.string(),
  // Project layer reference
  layerProjectId: z.number().optional(), // Project layer ID (integer)
  layerId: z.string().uuid().optional(), // Layer UUID for execution
  layerName: z.string().optional(),
  geometryType: z.string().optional(), // "point", "line", "polygon", etc.
  // Filter applied to the layer
  filter: z.record(z.unknown()).optional(), // CQL2-JSON filter
});

export type DatasetNodeData = z.infer<typeof datasetNodeDataSchema>;

// ============================================================================
// Tool Node
// ============================================================================

/**
 * Data schema for a tool node - represents a process/tool execution
 */
export const toolNodeDataSchema = z.object({
  type: z.literal("tool"),
  processId: z.string(), // e.g., "buffer", "catchment_area", "clip"
  label: z.string(),
  // Tool configuration (parameters excluding layer inputs)
  config: z.record(z.unknown()).default({}),
  // Execution state
  status: nodeStatusSchema.default("idle"),
  outputLayerId: z.string().uuid().optional(), // Result layer UUID after execution
  outputLayerProjectId: z.number().optional(), // Result layer project ID
  jobId: z.string().optional(), // Windmill job ID during execution
  error: z.string().optional(), // Error message if status is "error"
});

export type ToolNodeData = z.infer<typeof toolNodeDataSchema>;

// ============================================================================
// Text Annotation Node
// ============================================================================

/**
 * Data schema for a text annotation node - for notes and documentation on the canvas
 */
export const textAnnotationNodeDataSchema = z.object({
  type: z.literal("textAnnotation"),
  text: z.string().default("<p></p>"), // HTML content from TipTap
  backgroundColor: z.string().default("#FFF8E1"), // Default warm yellow
  width: z.number().default(400),
  height: z.number().default(200),
});

export type TextAnnotationNodeData = z.infer<typeof textAnnotationNodeDataSchema>;

// ============================================================================
// Workflow Node (ReactFlow compatible)
// ============================================================================

/**
 * Workflow node schema - compatible with ReactFlow's Node type
 */
export const workflowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["dataset", "tool", "textAnnotation"]),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.discriminatedUnion("type", [
    datasetNodeDataSchema,
    toolNodeDataSchema,
    textAnnotationNodeDataSchema,
  ]),
  // Optional ReactFlow properties
  width: z.number().optional(),
  height: z.number().optional(),
  selected: z.boolean().optional(),
  dragging: z.boolean().optional(),
  zIndex: z.number().optional(),
  style: z.record(z.unknown()).optional(),
});

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

// ============================================================================
// Workflow Edge (ReactFlow compatible)
// ============================================================================

/**
 * Workflow edge schema - compatible with ReactFlow's Edge type
 */
export const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(), // Source node ID
  target: z.string(), // Target node ID
  sourceHandle: z.string().optional(), // Output handle ID (usually just one per node)
  targetHandle: z.string().optional(), // Input handle ID (e.g., "input_layer_id", "clip_layer_id")
  // Optional styling
  animated: z.boolean().optional(),
  style: z.record(z.unknown()).optional(),
});

export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

// ============================================================================
// Workflow Config
// ============================================================================

/**
 * Full workflow configuration stored in the database
 */
export const workflowConfigSchema = z.object({
  nodes: z.array(workflowNodeSchema).default([]),
  edges: z.array(workflowEdgeSchema).default([]),
  viewport: z
    .object({
      x: z.number(),
      y: z.number(),
      zoom: z.number(),
    })
    .default({ x: 0, y: 0, zoom: 1 }),
});

export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;

// ============================================================================
// Workflow Entity
// ============================================================================

/**
 * Workflow entity as returned from the API
 */
export const workflowSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  is_default: z.boolean(),
  config: workflowConfigSchema,
  thumbnail_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Workflow = z.infer<typeof workflowSchema>;

// ============================================================================
// Create/Update Schemas
// ============================================================================

/**
 * Schema for creating a new workflow
 */
export const workflowCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  is_default: z.boolean().default(false),
  config: workflowConfigSchema,
});

export type WorkflowCreate = z.infer<typeof workflowCreateSchema>;

/**
 * Schema for updating an existing workflow
 */
export const workflowUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  is_default: z.boolean().optional(),
  config: workflowConfigSchema.optional(),
});

export type WorkflowUpdate = z.infer<typeof workflowUpdateSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty workflow config
 */
export const createEmptyWorkflowConfig = (): WorkflowConfig => ({
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});

/**
 * Create a new dataset node
 */
export const createDatasetNode = (
  id: string,
  position: { x: number; y: number },
  label: string = "Dataset"
): WorkflowNode => ({
  id,
  type: "dataset",
  position,
  zIndex: 1000, // Dataset nodes appear above text annotations
  data: {
    type: "dataset",
    label,
  },
});

/**
 * Create a new tool node
 */
export const createToolNode = (
  id: string,
  position: { x: number; y: number },
  processId: string,
  label: string
): WorkflowNode => ({
  id,
  type: "tool",
  position,
  zIndex: 1000, // Tool nodes appear above text annotations
  data: {
    type: "tool",
    processId,
    label,
    config: {},
    status: "idle",
  },
});

/**
 * Create a new text annotation node
 */
export const createTextAnnotationNode = (
  id: string,
  position: { x: number; y: number },
  width: number = 400,
  height: number = 200,
  text: string = "<h2>Header</h2><p>This is an example paragraph. You can write your text here. You can use <em>italic</em> or <strong>bold</strong> to highlight words.</p>",
  backgroundColor: string = "#FFF8E1"
): WorkflowNode => ({
  id,
  type: "textAnnotation",
  position,
  zIndex: 0, // Text annotations appear below other nodes (default is 0, others get higher when selected)
  data: {
    type: "textAnnotation",
    text,
    backgroundColor,
    width,
    height,
  },
});

/**
 * Check if a node is a dataset node
 */
export const isDatasetNode = (node: WorkflowNode): node is WorkflowNode & { data: DatasetNodeData } =>
  node.data.type === "dataset";

/**
 * Check if a node is a tool node
 */
export const isToolNode = (node: WorkflowNode): node is WorkflowNode & { data: ToolNodeData } =>
  node.data.type === "tool";

/**
 * Check if a node is a text annotation node
 */
export const isTextAnnotationNode = (
  node: WorkflowNode
): node is WorkflowNode & { data: TextAnnotationNodeData } => node.data.type === "textAnnotation";
