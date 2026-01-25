# Workflows Feature - Implementation Guide

> **Status**: Planning Complete  
> **Last Updated**: January 25, 2026  
> **Related Features**: Layouts, GenericTool/Toolbox

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Model](#data-model)
4. [UI Specifications](#ui-specifications)
5. [Execution Logic](#execution-logic)
6. [API Endpoints](#api-endpoints)
7. [Implementation Phases](#implementation-phases)
8. [File Structure](#file-structure)
9. [Design Decisions](#design-decisions)
10. [Future Considerations](#future-considerations)

---

## Overview

Workflows allow users to chain multiple tools (processes) together in a visual DAG (Directed Acyclic Graph) editor. Users can drag and drop tools, connect them, configure parameters, and execute them sequentially.

### Key Features

- Visual workflow editor using ReactFlow (@xyflow/react - already installed)
- Drag-and-drop tools from a sidebar palette
- Connect tool outputs to tool inputs via edges
- Configure tool parameters in a side panel
- Execute workflows: "Run Node" or "Run to Here"
- Auto-save workflow changes
- Project layers displayed as read-only reference

### Similar To

- **Layouts**: Same project-scoped CRUD pattern, auto-save, similar panel structure
- **GenericTool**: Reuse OGC process descriptions for tool configuration forms

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WORKFLOW EDITOR                                 │
│  ┌─────────────┐    ┌─────────────────────────────┐    ┌─────────────────┐  │
│  │   Config    │    │      ReactFlow Canvas       │    │     Nodes       │  │
│  │   Panel     │    │                             │    │     Panel       │  │
│  │             │    │  [Dataset] ──▶ [Tool] ──▶ [Output]                 │  │
│  │ • Workflows │    │                             │    │ • Import        │  │
│  │ • Layers    │    │                             │    │ • Accessibility │  │
│  │   (view)    │    │                             │    │ • Geoanalysis   │  │
│  └─────────────┘    └─────────────────────────────┘    └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ (on Run)
                              ┌───────────────┐
                              │ Processes API │
                              │  (Sequential) │
                              └───────────────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │   Windmill    │
                              │   (per node)  │
                              └───────────────┘
```

### Why Application-Level Workflows (Not Windmill Flows)

1. **Full UI Control**: Custom ReactFlow editor with project-specific features
2. **Data Consistency**: Workflows stored in PostgreSQL alongside projects/layouts
3. **Existing Infrastructure**: Reuse Processes API for individual tool execution
4. **Flexibility**: Can migrate to Windmill Flows later if needed

---

## Data Model

### Backend (PostgreSQL)

**Table: `customer.workflow`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK to `project.id` (CASCADE delete) |
| `name` | TEXT | Workflow name |
| `description` | TEXT | Optional description |
| `is_default` | BOOLEAN | Default workflow for project |
| `config` | JSONB | ReactFlow nodes, edges, viewport |
| `thumbnail_url` | TEXT | Preview image URL |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Pydantic Schemas** (`apps/core/src/core/schemas/workflow.py`):

```python
class WorkflowBase(BaseModel):
    name: str
    description: str | None = None
    is_default: bool = False
    config: dict  # WorkflowConfig JSON

class WorkflowCreate(WorkflowBase):
    pass

class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_default: bool | None = None
    config: dict | None = None

class WorkflowRead(WorkflowBase):
    id: UUID
    project_id: UUID
    thumbnail_url: str | None
    created_at: datetime
    updated_at: datetime
```

### Frontend (TypeScript/Zod)

**File: `apps/web/lib/validations/workflow.ts`**

```typescript
import * as z from "zod";

// Node status during execution
export const nodeStatusSchema = z.enum([
  "idle",
  "pending",
  "running", 
  "completed",
  "error",
]);

// Dataset node - references a project layer
export const datasetNodeDataSchema = z.object({
  type: z.literal("dataset"),
  label: z.string(),
  layerProjectId: z.number().optional(),  // Project layer ID
  layerId: z.string().optional(),          // UUID for execution
  layerName: z.string().optional(),
  geometryType: z.string().optional(),
  filter: z.record(z.unknown()).optional(), // CQL filter
});

// Tool node - represents a process
export const toolNodeDataSchema = z.object({
  type: z.literal("tool"),
  processId: z.string(),                    // e.g., "buffer", "catchment_area"
  label: z.string(),
  config: z.record(z.unknown()),            // Tool parameters (excluding layer inputs)
  status: nodeStatusSchema.optional(),
  outputLayerId: z.string().optional(),     // Result layer UUID after execution
  outputLayerProjectId: z.number().optional(),
  jobId: z.string().optional(),             // Windmill job ID during execution
  error: z.string().optional(),
});

// Workflow node (ReactFlow compatible)
export const workflowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["dataset", "tool"]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.union([datasetNodeDataSchema, toolNodeDataSchema]),
  width: z.number().optional(),
  height: z.number().optional(),
  selected: z.boolean().optional(),
});

// Workflow edge (ReactFlow compatible)  
export const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),              // Source node ID
  target: z.string(),              // Target node ID
  sourceHandle: z.string().optional(), // Output handle ID
  targetHandle: z.string().optional(), // Input handle ID (e.g., "input_layer_id")
});

// Full workflow configuration
export const workflowConfigSchema = z.object({
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }).optional(),
});

// Workflow entity
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

export type NodeStatus = z.infer<typeof nodeStatusSchema>;
export type DatasetNodeData = z.infer<typeof datasetNodeDataSchema>;
export type ToolNodeData = z.infer<typeof toolNodeDataSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
```

---

## UI Specifications

### Layout Structure (3-Panel)

Based on mockups, the workflow editor has three panels:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Header: [Map] [Workflows*] [Layouts] [Dashboards]      [Share] [Save]   │
├────────────────┬───────────────────────────────────┬─────────────────────┤
│                │                                   │                     │
│  LEFT PANEL    │         CANVAS                    │    RIGHT PANEL      │
│  (280px)       │         (flex)                    │    (320px)          │
│                │                                   │                     │
│  ┌───────────┐ │  ┌─────────────────────────────┐  │  ┌───────────────┐  │
│  │Workflows  │ │  │ Toolbar:                    │  │  │ NODES | HIST  │  │
│  │+ Add      │ │  │ [🗑][📋][🔍][⊞][☁][⬇]      │  │  ├───────────────┤  │
│  │           │ │  │ [▶ RUN NODE] [▶▶ RUN TO HERE]│ │  │ Search        │  │
│  │• Blank    │ │  └─────────────────────────────┘  │  ├───────────────┤  │
│  │  Workflow │ │                                   │  │ Import        │  │
│  │           │ │      [Dataset] ──▶ [Tool]        │  │  + Add Dataset│  │
│  ├───────────┤ │                    │             │  ├───────────────┤  │
│  │Layers     │ │                    ▼             │  │ Accessibility │  │
│  │(read-only)│ │               [Output]           │  │  • Catchment  │  │
│  │           │ │                                   │  │  • Heatmap    │  │
│  │ Group 1   │ │                                   │  ├───────────────┤  │
│  │  • Layer  │ │  ┌─────────────────────────────┐  │  │ Geoanalysis   │  │
│  │  • Layer  │ │  │ + / - / Fit                 │  │  │ Geoprocessing │  │
│  │ Group 2   │ │  └─────────────────────────────┘  │  │ Data Mgmt     │  │
│  │  • Layer  │ │  [Show table] [Show map]          │  └───────────────┘  │
│  └───────────┘ │                                   │                     │
└────────────────┴───────────────────────────────────┴─────────────────────┘
```

### Left Panel: WorkflowsConfigPanel

**Sections:**

1. **Workflows List** (collapsible)
   - "+ Add Workflow" button → Creates blank workflow immediately (no template picker)
   - List of workflows with context menu (rename, duplicate, delete)
   - Selected workflow highlighted

2. **Layers** (collapsible, read-only)
   - Shows project layer tree (groups + layers)
   - Filter icons visible but non-interactive
   - Purpose: Reference for users to see available data

### Center: WorkflowCanvas

**Toolbar** (top of canvas):

| Icon | Action | Description |
|------|--------|-------------|
| 🗑 | Delete | Delete selected node(s) |
| 📋 | Duplicate | Duplicate selected node(s) |
| 🔍 | Filter | Open filter panel for selected dataset node |
| ⊞ | Auto-layout | Arrange nodes automatically |
| ☁ | Save | Manual save (auto-save enabled) |
| ⬇ | Export | Export workflow as JSON |
| ▶ RUN NODE | Execute | Run only the selected node |
| ▶▶ RUN TO HERE | Execute | Run from start up to selected node |

**Canvas Features:**

- ReactFlow canvas with zoom/pan
- Custom node types: `DatasetNode`, `ToolNode`
- Connection validation (geometry type compatibility)
- Minimap (optional)
- Background grid/dots

**Bottom Bar:**

- [Show table] - Show data table for selected node's output
- [Show map] - Toggle map view in a split pane

### Right Panel: WorkflowsNodesPanel

**Tabs:** NODES | HISTORY

**NODES Tab:**

- Search input
- Categorized blocks (same as toolbox):
  - **Import**: + Add Dataset (creates DatasetNode)
  - **Accessibility Indicators**: Catchment area, Heatmap variations, PT tools
  - **Data Management**: Join & Group
  - **Geoanalysis**: Buffer, aggregate, etc.
  - **Geoprocessing**: Clip, intersect, dissolve, etc.

**HISTORY Tab:**

- List of workflow executions
- Timestamp, status, duration

### Node Selection Panel (Replaces Right Panel)

When a node is selected, the right panel transforms:

**For Tool Nodes:**

```
┌─────────────────────────────────┐
│ < Catchment Area                │ (back button + title)
├─────────────────────────────────┤
│ [TOOL] [RESULT]                 │ (tabs)
├─────────────────────────────────┤
│ Description text...             │
├─────────────────────────────────┤
│ ⚙ Configuration                 │
│                                 │
│ [TIME] [DISTANCE]               │ (mode toggle)
│                                 │
│ Travel time limit (Min)         │
│ [15 min                      ]  │
│                                 │
│ Travel speed (Km/h)             │
│ [5 km/h                      ]  │
│                                 │
│ Number of breaks (Steps)        │
│ [5                           ]  │
│                                 │
│ ... more fields                 │
└─────────────────────────────────┘
```

**For Dataset Nodes:**

```
┌─────────────────────────────────┐
│ < Berliner Bezirksgrenzen       │
├─────────────────────────────────┤
│ [TOOL] [RESULT]                 │
├─────────────────────────────────┤
│ Dataset details                 │
│                                 │
│ Name                            │
│ xxxxxxxxx                       │
│                                 │
│ Source                          │
│ [dropdown or display]           │
│                                 │
│ Type                            │
│ Feature                         │
├─────────────────────────────────┤
│ 🔍 Filter                [🔵]   │
│                                 │
│ Filter 1                  ...   │
│ If [Field ▼] [Operator ▼] [Val] │
│                                 │
│ Filter 2                  ...   │
│ And [Field ▼] [Operator ▼] [Val]│
│                                 │
│ [+ Add Expression]              │
│ [Clear filter]                  │
└─────────────────────────────────┘
```

### Node Appearance

**Dataset Node:**

```
┌─────────────────────────────────┐
│ ≡  Berliner Bezirksgrenzen    ○ │ (drag handle, title, output handle)
└─────────────────────────────────┘
```

**Tool Node (Collapsed):**

```
┌─────────────────────────────────────────┐
│ ○  🏔 Catchment area                  ○ │
│    ─────────────────────────────        │
│    Routing type: Walk                   │
│    Travel time limit (Min): 15          │
│    Travel speed (Km/h): 5               │
│    Steps: 5                             │
│    Catchment area shape: Polygon        │
│    Polygon Difference: Enabled          │
└─────────────────────────────────────────┘
```

- Left handle(s): Input connections
- Right handle: Output connection
- Status indicator: Border color (idle=gray, running=blue, completed=green, error=red)
- Collapsed view shows key parameter summary

---

## Execution Logic

### Execution Modes

1. **Run Node**: Execute only the selected node
   - Requires all upstream nodes to have completed outputs
   - If upstream outputs missing, show error

2. **Run to Here**: Execute from first node up to selected node
   - Topological sort of all nodes leading to selected
   - Sequential execution via Processes API

### Execution Algorithm

```typescript
async function runToHere(
  workflow: Workflow,
  targetNodeId: string,
  projectId: string
): Promise<void> {
  const { nodes, edges } = workflow.config;
  
  // 1. Build dependency graph
  const graph = buildDependencyGraph(nodes, edges);
  
  // 2. Find all nodes that lead to target (including target)
  const nodesToRun = getUpstreamNodes(graph, targetNodeId);
  
  // 3. Topological sort
  const sortedNodes = topologicalSort(nodesToRun, edges);
  
  // 4. Filter out already-completed nodes with valid outputs
  const pendingNodes = sortedNodes.filter(node => {
    if (node.data.type === "dataset") {
      return !node.data.layerId;  // No layer selected
    }
    return !node.data.outputLayerId;  // No output yet
  });
  
  // 5. Execute sequentially
  for (const node of pendingNodes) {
    await executeNode(node, workflow, projectId);
  }
}

async function executeNode(
  node: WorkflowNode,
  workflow: Workflow,
  projectId: string
): Promise<void> {
  if (node.data.type === "dataset") {
    // Dataset nodes don't need execution, just validation
    if (!node.data.layerId) {
      throw new Error(`Dataset node "${node.data.label}" has no layer selected`);
    }
    return;
  }
  
  // Tool node
  const { edges } = workflow.config;
  
  // 1. Update status to "running"
  updateNodeStatus(node.id, "running");
  
  // 2. Gather input layer IDs from connected nodes
  const inputEdges = edges.filter(e => e.target === node.id);
  const inputs: Record<string, string> = {};
  
  for (const edge of inputEdges) {
    const sourceNode = workflow.config.nodes.find(n => n.id === edge.source);
    const layerId = sourceNode?.data.type === "dataset" 
      ? sourceNode.data.layerId 
      : sourceNode?.data.outputLayerId;
    
    if (!layerId) {
      throw new Error(`Missing input from node "${sourceNode?.data.label}"`);
    }
    
    const handleName = edge.targetHandle || "input_layer_id";
    inputs[handleName] = layerId;
    
    // Also include filter if present
    if (sourceNode?.data.type === "dataset" && sourceNode.data.filter) {
      inputs[`${handleName.replace("_id", "")}_filter`] = sourceNode.data.filter;
    }
  }
  
  // 3. Build execution payload
  const payload = {
    ...node.data.config,
    ...inputs,
    user_id: currentUserId,
    project_id: projectId,
    folder_id: workflowsFolderId,  // Special folder for workflow outputs
    result_layer_name: `${node.data.label} (${workflow.name})`,
  };
  
  // 4. Execute via Processes API
  try {
    const jobId = await executeProcess(node.data.processId, payload);
    updateNodeJobId(node.id, jobId);
    
    // 5. Poll for completion
    const result = await waitForJob(jobId);
    
    // 6. Update node with result
    updateNodeOutput(node.id, {
      status: "completed",
      outputLayerId: result.layer_id,
      outputLayerProjectId: result.layer_project_id,
    });
  } catch (error) {
    updateNodeStatus(node.id, "error", error.message);
    throw error;
  }
}
```

### Output Layer Management

- **Folder**: Create a "Workflows" system folder in the project
- **Naming**: `{NodeLabel} ({WorkflowName})`
- **Re-run Behavior**: Delete previous output layer, create new one
- **Intermediate Layers**: Kept unless workflow is re-run from that point

---

## API Endpoints

### Core API Routes

**Base URL**: `/api/v2/projects/{project_id}/workflow`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all workflows for project |
| GET | `/{workflow_id}` | Get specific workflow |
| POST | `/` | Create workflow |
| PUT | `/{workflow_id}` | Update workflow |
| DELETE | `/{workflow_id}` | Delete workflow |
| POST | `/{workflow_id}/duplicate` | Duplicate workflow |

### Frontend API Hooks

**File: `apps/web/lib/api/workflows.ts`**

```typescript
// Hooks
export const useWorkflows = (projectId?: string) => { ... };
export const useWorkflow = (projectId?: string, workflowId?: string) => { ... };

// Mutations
export const createWorkflow = async (projectId: string, workflow: WorkflowCreate) => { ... };
export const updateWorkflow = async (projectId: string, workflowId: string, workflow: WorkflowUpdate) => { ... };
export const deleteWorkflow = async (projectId: string, workflowId: string) => { ... };
export const duplicateWorkflow = async (projectId: string, workflowId: string, newName?: string) => { ... };
```

---

## Implementation Phases

### Phase 1: Data Layer (Backend + Types) - 1 week

- [ ] Create `Workflow` SQLAlchemy model (`apps/core/src/core/db/models/workflow.py`)
- [ ] Create Alembic migration
- [ ] Create Pydantic schemas (`apps/core/src/core/schemas/workflow.py`)
- [ ] Create CRUD class (`apps/core/src/core/crud/crud_workflow.py`)
- [ ] Create API endpoints (`apps/core/src/core/endpoints/v2/workflow.py`)
- [ ] Register routes in `apps/core/src/core/endpoints/v2/router.py`
- [ ] Create Zod validations (`apps/web/lib/validations/workflow.ts`)
- [ ] Create API hooks (`apps/web/lib/api/workflows.ts`)

### Phase 2: UI Shell - 1 week

- [ ] Add "Workflows" to header toggle (`apps/web/components/header/Header.tsx`)
- [ ] Create `WorkflowsLayout.tsx` main component
- [ ] Create `WorkflowsConfigPanel.tsx` (left panel - workflow list + layers)
- [ ] Create `WorkflowsNodesPanel.tsx` (right panel - tool blocks)
- [ ] Wire up mode switch in `apps/web/app/map/[projectId]/page.tsx`

### Phase 3: ReactFlow Canvas - 2 weeks

- [ ] Create `WorkflowCanvas.tsx` with ReactFlow setup
- [ ] Create `DatasetNode.tsx` custom node component
- [ ] Create `ToolNode.tsx` custom node component
- [ ] Implement edge connection logic with validation
- [ ] Implement node drag-and-drop from palette
- [ ] Create canvas toolbar (delete, duplicate, auto-layout)
- [ ] Implement auto-save on config changes

### Phase 4: Node Configuration - 2 weeks

- [ ] Create `DatasetNodeConfig.tsx` (layer selector + filter)
- [ ] Create `ToolNodeConfig.tsx` (reuse OGC process form rendering)
- [ ] Integrate with existing `ProcessedInputField.tsx` components
- [ ] Handle geometry type constraints for connections
- [ ] Show parameter summary on collapsed tool nodes

### Phase 5: Execution Engine - 2 weeks

- [ ] Implement topological sort algorithm
- [ ] Create `useWorkflowExecution` hook
- [ ] Implement "Run Node" functionality
- [ ] Implement "Run to Here" functionality
- [ ] Add status indicators on nodes (idle/running/completed/error)
- [ ] Create "Workflows" folder for output layers
- [ ] Handle re-run behavior (replace outputs)
- [ ] Add execution history tab

### Phase 6: Polish - 1 week

- [ ] Add i18n translations
- [ ] Add keyboard shortcuts
- [ ] Add undo/redo support
- [ ] Add copy/paste nodes
- [ ] Add minimap
- [ ] Add "Show table" / "Show map" toggle
- [ ] Performance optimization

---

## File Structure

```
apps/web/components/workflows/
├── README.md                          # This file
├── WorkflowsLayout.tsx                # Main container
├── panels/
│   ├── WorkflowsConfigPanel.tsx       # Left: workflow list + layers
│   └── WorkflowsNodesPanel.tsx        # Right: tool blocks palette
├── canvas/
│   ├── WorkflowCanvas.tsx             # ReactFlow canvas wrapper
│   ├── WorkflowToolbar.tsx            # Canvas toolbar
│   └── nodes/
│       ├── DatasetNode.tsx            # Dataset/layer node
│       ├── ToolNode.tsx               # Tool/process node
│       └── nodeTypes.ts               # Node type registry
├── config/
│   ├── DatasetNodeConfig.tsx          # Dataset configuration panel
│   ├── ToolNodeConfig.tsx             # Tool configuration panel
│   └── NodeConfigPanel.tsx            # Config panel wrapper
├── execution/
│   ├── useWorkflowExecution.ts        # Execution hook
│   ├── executionUtils.ts              # Topological sort, etc.
│   └── ExecutionHistory.tsx           # History tab content
└── constants.ts                       # Block categories, defaults
```

```
apps/core/src/core/
├── db/models/workflow.py              # SQLAlchemy model
├── schemas/workflow.py                # Pydantic schemas
├── crud/crud_workflow.py              # CRUD operations
└── endpoints/v2/workflow.py           # API routes
```

```
apps/web/lib/
├── validations/workflow.ts            # Zod schemas
└── api/workflows.ts                   # API hooks
```

---

## Design Decisions

### 1. Auto-save

**Decision**: Yes, auto-save on every change (debounced)

**Rationale**: Consistent with layouts, prevents data loss

**Implementation**: Debounced `updateWorkflow` call on config changes

### 2. Execution Mode

**Decision**: Two modes - "Run Node" and "Run to Here"

**Rationale**: Provides flexibility for debugging and iterative development

**"Run Node"**: Executes only selected node (upstream must be complete)  
**"Run to Here"**: Executes all upstream nodes + selected node

### 3. Layer Naming

**Decision**: Auto-generated names: `{NodeLabel} ({WorkflowName})`

**Rationale**: Keep it simple for MVP, can add custom naming later

### 4. Intermediate Results

**Decision**: Keep intermediate layers in project

**Rationale**: 
- Users may want to inspect intermediate results
- Re-running from a node replaces its output
- Layers stored in a "Workflows" folder for organization

### 5. Scheduling

**Decision**: Not in MVP, designed for future addition

**Rationale**: Focus on core workflow builder first

### 6. Templates

**Decision**: Not in MVP - "Add Workflow" creates blank workflow directly

**Rationale**: Reduce complexity, can add template gallery later

---

## Future Considerations

### Potential Enhancements

1. **Workflow Templates Gallery**: Predefined workflows for common use cases
2. **Scheduled Execution**: Cron-based workflow runs
3. **Workflow Sharing**: Share workflows between projects/users
4. **Parallel Execution**: Run independent branches concurrently
5. **Conditional Logic**: Branch based on intermediate results
6. **Loop Nodes**: Iterate over feature collections
7. **External Data Sources**: Fetch data from APIs as input
8. **Notifications**: Alert on completion/failure
9. **Version History**: Track workflow changes over time
10. **Export/Import**: Share workflows as JSON files

### Migration to Windmill Flows

If performance/scalability requires native Windmill workflows:

1. Generate Windmill Flow definitions from ReactFlow graph
2. Submit as flow execution instead of sequential scripts
3. Track flow steps instead of individual jobs
4. Would require changes to Windmill client and job tracking

---

## References

### Related Code

- **Layouts Pattern**: `apps/web/components/reports/ReportsLayout.tsx`
- **GenericTool**: `apps/web/components/map/panels/toolbox/generic/GenericTool.tsx`
- **OGC Utils**: `apps/web/lib/utils/ogc-utils.ts`
- **Processes API**: `apps/processes/src/processes/routers/processes.py`
- **Tool Registry**: `packages/python/goatlib/src/goatlib/tools/registry.py`

### External Dependencies

- **ReactFlow**: `@xyflow/react` (v12.10.0) - Already installed
- **dnd-kit**: `@dnd-kit/core` - Already installed (used for drag-drop)

### i18n Keys

Already added:
- `"workflows": "Workflows"` (en, de)

Need to add:
- Tool names (reuse from toolbox)
- UI labels for workflow editor
- Status messages
- Error messages
