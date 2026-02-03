# Workflow Execution - Implementation Plan

> **Created**: February 2, 2026  
> **Updated**: February 2, 2026 - Simplified to use temp file storage instead of DB changes
> **Goal**: Enable workflow execution via Windmill with temporary results and explicit save

---

## Overview

This plan implements the workflow execution engine discussed in README.md. 

**Key Design Decision**: Use a separate temporary file storage (`/data/temporary/`) instead of 
adding database columns. This is simpler, requires no migrations, and provides clear separation 
between workflow previews and permanent layers.

### Temporary Storage Structure

```
/data/temporary/
  {user_id}/
    {workflow_id}/
      {node_id}/
        data.parquet      # GeoParquet result
        tiles.pmtiles     # Pre-generated tiles for fast visualization
        metadata.json     # Name, geometry type, bbox, feature count, style
```

### Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Workflow Run   │────►│  /data/temporary │────►│  GeoAPI serves  │
│  (Windmill)     │     │  (parquet+tiles) │     │  temp endpoints │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                 │
                                 │ User clicks "Save"
                                 ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Layer record   │◄────│  Finalize API    │◄────│  Copy to        │
│  in PostgreSQL  │     │  (Core)          │     │  DuckLake       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## Phase 1: Backend - Temporary File Writer

**Goal**: Create utilities to write workflow results to temporary storage (no DB, no DuckLake).

### Task 1.1: Create TempLayerWriter utility

**File**: `packages/python/goatlib/src/goatlib/tools/temp_writer.py` (new)

```python
"""Write tool results to temporary storage for workflow preview."""

import json
from pathlib import Path
from datetime import datetime
import geopandas as gpd
from pydantic import BaseModel

TEMP_DATA_ROOT = Path("/data/temporary")


class TempLayerMetadata(BaseModel):
    """Metadata for a temporary layer."""
    layer_name: str
    geometry_type: str
    feature_count: int
    bbox: list[float]  # [minx, miny, maxx, maxy]
    created_at: str
    node_id: str
    process_id: str


class TempLayerWriter:
    """Write GeoDataFrame to temporary storage."""
    
    def __init__(self, user_id: str, workflow_id: str, node_id: str):
        self.user_id = user_id
        self.workflow_id = workflow_id
        self.node_id = node_id
        self.base_path = TEMP_DATA_ROOT / user_id / workflow_id / node_id
    
    def write(
        self,
        gdf: gpd.GeoDataFrame,
        layer_name: str,
        process_id: str,
    ) -> dict:
        """
        Write GeoDataFrame to temp storage.
        
        Creates:
        - data.parquet (GeoParquet)
        - tiles.pmtiles (for visualization)
        - metadata.json
        
        Returns dict with temp_layer_id and paths.
        """
        # Create directory
        self.base_path.mkdir(parents=True, exist_ok=True)
        
        # Write GeoParquet
        parquet_path = self.base_path / "data.parquet"
        gdf.to_parquet(parquet_path)
        
        # Generate PMTiles (using tippecanoe or similar)
        pmtiles_path = self.base_path / "tiles.pmtiles"
        self._generate_pmtiles(parquet_path, pmtiles_path)
        
        # Write metadata
        metadata = TempLayerMetadata(
            layer_name=layer_name,
            geometry_type=gdf.geometry.geom_type.iloc[0] if len(gdf) > 0 else "Unknown",
            feature_count=len(gdf),
            bbox=list(gdf.total_bounds),
            created_at=datetime.utcnow().isoformat(),
            node_id=self.node_id,
            process_id=process_id,
        )
        
        metadata_path = self.base_path / "metadata.json"
        metadata_path.write_text(metadata.model_dump_json(indent=2))
        
        return {
            "temp_layer_id": f"{self.user_id}/{self.workflow_id}/{self.node_id}",
            "parquet_path": str(parquet_path),
            "pmtiles_path": str(pmtiles_path),
            "metadata": metadata.model_dump(),
        }
    
    def _generate_pmtiles(self, parquet_path: Path, pmtiles_path: Path):
        """Generate PMTiles from GeoParquet."""
        # Use existing tile generation logic or tippecanoe
        # This may call goatlib.io.tiles or external tool
        pass
    
    @classmethod
    def cleanup_workflow(cls, user_id: str, workflow_id: str):
        """Delete all temp files for a workflow."""
        workflow_path = TEMP_DATA_ROOT / user_id / workflow_id
        if workflow_path.exists():
            import shutil
            shutil.rmtree(workflow_path)
    
    @classmethod
    def cleanup_user_old(cls, user_id: str, max_age_hours: int = 24):
        """Delete temp files older than max_age_hours."""
        user_path = TEMP_DATA_ROOT / user_id
        if not user_path.exists():
            return
        
        cutoff = datetime.utcnow().timestamp() - (max_age_hours * 3600)
        
        for workflow_dir in user_path.iterdir():
            if workflow_dir.is_dir() and workflow_dir.stat().st_mtime < cutoff:
                import shutil
                shutil.rmtree(workflow_dir)
```

### Task 1.2: Add temp_mode to ToolInputBase

**File**: `packages/python/goatlib/src/goatlib/tools/schemas.py`

```python
# Add to ToolInputBase class
temp_mode: bool = Field(
    default=False,
    description="If True, write to temp storage instead of DuckLake (for workflow preview)",
    json_schema_extra=ui_field(section="output", field_order=95, hidden=True),
)
workflow_id: str | None = Field(
    default=None,
    description="Workflow ID (required when temp_mode=True)",
    json_schema_extra=ui_field(section="output", field_order=96, hidden=True),
)
node_id: str | None = Field(
    default=None,
    description="Node ID in workflow (required when temp_mode=True)",
    json_schema_extra=ui_field(section="output", field_order=97, hidden=True),
)
```

### Task 1.3: Modify BaseToolRunner to support temp_mode

**File**: `packages/python/goatlib/src/goatlib/tools/base.py`

```python
from goatlib.tools.temp_writer import TempLayerWriter

class BaseToolRunner:
    async def process(self, params: T) -> dict:
        # ... existing processing to get result GeoDataFrame ...
        
        if getattr(params, 'temp_mode', False):
            # Write to temp storage (no DB, no DuckLake)
            return await self._write_temp_result(params, result_gdf)
        else:
            # Existing flow: write to DuckLake + create DB records
            return await self._write_permanent_result(params, result_gdf)
    
    async def _write_temp_result(self, params: T, gdf: gpd.GeoDataFrame) -> dict:
        """Write result to temporary storage for workflow preview."""
        writer = TempLayerWriter(
            user_id=params.user_id,
            workflow_id=params.workflow_id,
            node_id=params.node_id,
        )
        
        result = writer.write(
            gdf=gdf,
            layer_name=params.result_layer_name or self.default_output_name,
            process_id=self.tool_class,
        )
        
        return {
            "status": "success",
            "temp_layer_id": result["temp_layer_id"],
            "metadata": result["metadata"],
        }
```

### Task 1.4: Create finalize endpoint (move temp → permanent)

**File**: `apps/geoapi/src/geoapi/endpoints/temp_layers.py` (new)

```python
"""Endpoints for temporary workflow layers."""

from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
import geopandas as gpd

router = APIRouter(prefix="/temp", tags=["Temporary Layers"])

TEMP_DATA_ROOT = Path("/data/temporary")


@router.post("/{user_id}/{workflow_id}/{node_id}/finalize")
async def finalize_temp_layer(
    user_id: str,
    workflow_id: str,
    node_id: str,
    project_id: str = Query(...),
    layer_name: str | None = Query(None),
):
    """
    Finalize a temporary layer: copy to DuckLake and create layer record.
    
    1. Read GeoParquet from temp storage
    2. Write to DuckLake (using existing io utilities)
    3. Create layer record in PostgreSQL (via Core API or direct)
    4. Delete temp files
    5. Return new layer_id
    """
    temp_path = TEMP_DATA_ROOT / user_id / workflow_id / node_id
    
    if not temp_path.exists():
        raise HTTPException(status_code=404, detail="Temporary layer not found")
    
    # Read parquet
    parquet_path = temp_path / "data.parquet"
    gdf = gpd.read_parquet(parquet_path)
    
    # Read metadata for layer name
    import json
    metadata_path = temp_path / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    
    final_name = layer_name or metadata.get("layer_name", "Workflow Result")
    
    # Write to DuckLake + create layer record
    # (Use existing tool infrastructure or direct DuckLake write)
    # ...
    
    # Cleanup temp files
    import shutil
    shutil.rmtree(temp_path)
    
    return {
        "layer_id": "new-layer-uuid",
        "layer_name": final_name,
    }
```

---

## Phase 2: Backend - Extend Existing GeoAPI Endpoints

**Goal**: Modify existing GeoAPI endpoints to serve from temp folder when query params are passed.

### Approach

Same endpoints, same UUID layer_id format, just add query parameters:

```
# Regular layer (from DuckLake)
GET /collections/{layer_id}/items
GET /user_{user_id}/{layer_id}/tiles/{z}/{x}/{y}.pbf

# Temp layer (from /data/temporary/) - same endpoint, add query params
GET /collections/{layer_id}/items?temp=true&workflow_id=xxx&node_id=yyy
GET /user_{user_id}/{layer_id}/tiles/{z}/{x}/{y}.pbf?temp=true&workflow_id=xxx&node_id=yyy
```

**Note**: The `layer_id` in temp mode can be any UUID (generated by workflow runner) - it's just used for caching/identification. The actual data location is determined by `workflow_id` + `node_id`.

### Task 2.1: Create temp layer resolver utility

**File**: `apps/geoapi/src/geoapi/core/temp_layer.py` (new)

```python
"""Utilities for resolving temporary workflow layers."""

from pathlib import Path
from typing import NamedTuple

TEMP_DATA_ROOT = Path("/data/temporary")


class TempLayerRef(NamedTuple):
    """Reference to a temporary layer."""
    user_id: str
    workflow_id: str
    node_id: str
    
    @property
    def base_path(self) -> Path:
        return TEMP_DATA_ROOT / self.user_id / self.workflow_id / self.node_id
    
    @property
    def parquet_path(self) -> Path:
        return self.base_path / "data.parquet"
    
    @property
    def pmtiles_path(self) -> Path:
        return self.base_path / "tiles.pmtiles"
    
    @property
    def metadata_path(self) -> Path:
        return self.base_path / "metadata.json"
    
    def exists(self) -> bool:
        return self.parquet_path.exists()


def get_temp_layer_ref(
    user_id: str,
    workflow_id: str | None,
    node_id: str | None,
) -> TempLayerRef | None:
    """
    Create TempLayerRef if workflow_id and node_id are provided.
    Returns None if not a temp layer request.
    """
    if not workflow_id or not node_id:
        return None
    
    return TempLayerRef(
        user_id=user_id,
        workflow_id=workflow_id,
        node_id=node_id,
    )
```

### Task 2.2: Modify tile serving to support temp layers

**File**: `apps/geoapi/src/geoapi/endpoints/tiles.py` (modify existing)

```python
from geoapi.core.temp_layer import get_temp_layer_ref

@router.get("/user_{user_id}/{layer_id}/tiles/{z}/{x}/{y}.pbf")
async def get_tile(
    user_id: str,
    layer_id: str,
    z: int,
    x: int,
    y: int,
    # New query params for temp layers
    temp: bool = Query(False),
    workflow_id: str | None = Query(None),
    node_id: str | None = Query(None),
    auth_user_id: str = Depends(get_user_id),
):
    # Check if this is a temp layer request
    if temp:
        temp_ref = get_temp_layer_ref(auth_user_id, workflow_id, node_id)
        
        if not temp_ref or not temp_ref.pmtiles_path.exists():
            raise HTTPException(status_code=404, detail="Temp tiles not found")
        
        # Serve from PMTiles file
        tile_data = read_pmtiles(temp_ref.pmtiles_path, z, x, y)
        return Response(content=tile_data, media_type="application/x-protobuf")
    
    # Regular flow: serve from existing tile storage
    # ... existing code ...
```

### Task 2.3: Modify features endpoint to support temp layers

**File**: `apps/geoapi/src/geoapi/endpoints/collections.py` (modify existing)

```python
from geoapi.core.temp_layer import get_temp_layer_ref
import geopandas as gpd

@router.get("/collections/{layer_id}/items")
async def get_items(
    layer_id: str,
    limit: int = Query(100, le=10000),
    offset: int = Query(0),
    # New query params for temp layers
    temp: bool = Query(False),
    workflow_id: str | None = Query(None),
    node_id: str | None = Query(None),
    auth_user_id: str = Depends(get_user_id),
):
    # Check if this is a temp layer request
    if temp:
        temp_ref = get_temp_layer_ref(auth_user_id, workflow_id, node_id)
        
        if not temp_ref or not temp_ref.parquet_path.exists():
            raise HTTPException(status_code=404, detail="Temp layer not found")
        
        # Read from parquet
        gdf = gpd.read_parquet(temp_ref.parquet_path)
        subset = gdf.iloc[offset:offset + limit]
        
        return {
            "type": "FeatureCollection",
            "features": json.loads(subset.to_json())["features"],
            "numberMatched": len(gdf),
            "numberReturned": len(subset),
        }
    
    # Regular flow: query from DuckLake
    # ... existing code ...
```

### Task 2.4: Add cleanup and metadata endpoints

**File**: `apps/geoapi/src/geoapi/endpoints/temp_layers.py` (new)

```python
"""Endpoints for temporary workflow layer management."""

from fastapi import APIRouter, Query, Depends, HTTPException
from pathlib import Path
import shutil
import json

from geoapi.core.auth import get_user_id

router = APIRouter(prefix="/temp", tags=["Temporary Layers"])

TEMP_DATA_ROOT = Path("/data/temporary")


@router.delete("/{workflow_id}")
async def cleanup_workflow_temp(
    workflow_id: str,
    user_id: str = Depends(get_user_id),
):
    """Delete all temporary files for a workflow."""
    workflow_path = TEMP_DATA_ROOT / user_id / workflow_id
    
    if workflow_path.exists():
        shutil.rmtree(workflow_path)
    
    return {"status": "cleaned"}


@router.get("/{workflow_id}/{node_id}/metadata")
async def get_temp_metadata(
    workflow_id: str,
    node_id: str,
    user_id: str = Depends(get_user_id),
):
    """Get metadata for a temporary layer."""
    metadata_path = TEMP_DATA_ROOT / user_id / workflow_id / node_id / "metadata.json"
    
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Temp layer not found")
    
    return json.loads(metadata_path.read_text())
```

### Task 2.5: Register temp_layers router

**File**: `apps/geoapi/src/geoapi/main.py`

```python
from geoapi.endpoints import temp_layers

app.include_router(temp_layers.router)
```

---

## Phase 3: Backend - Workflow Runner Script

**Goal**: Create Windmill script that orchestrates workflow execution using temp mode.

### Task 3.1: Create workflow_runner.py

**File**: `packages/python/goatlib/src/goatlib/tools/workflow_runner.py` (new)

```python
"""Workflow Runner - Executes workflow graphs in Windmill.

This script receives a workflow definition (nodes + edges) and executes
all tool nodes in topological order using @task decorators for tracking.
"""

from wmill import task
import wmill
from pydantic import BaseModel, Field


class WorkflowRunnerParams(BaseModel):
    """Parameters for workflow runner."""
    user_id: str
    project_id: str
    workflow_id: str
    folder_id: str
    nodes: list[dict]
    edges: list[dict]


@task()
def run_tool(node_id: str, process_id: str, inputs: dict) -> dict:
    """Run a single tool as a tracked sub-task."""
    result = wmill.run_script(f"f/goat/tools/{process_id}", args=inputs)
    return {"node_id": node_id, **result}


def topological_sort(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Sort nodes in execution order."""
    # Build adjacency list
    in_degree = {n["id"]: 0 for n in nodes}
    graph = {n["id"]: [] for n in nodes}
    
    for edge in edges:
        graph[edge["source"]].append(edge["target"])
        in_degree[edge["target"]] += 1
    
    # Kahn's algorithm
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    result = []
    
    while queue:
        node_id = queue.pop(0)
        node = next(n for n in nodes if n["id"] == node_id)
        result.append(node)
        
        for neighbor in graph[node_id]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    
    return result


def build_inputs(
    node: dict,
    edges: list[dict],
    all_nodes: list[dict],
    results: dict[str, dict],
) -> dict:
    """Build input dict for a tool node."""
    inputs = dict(node["data"].get("config", {}))
    
    for edge in edges:
        if edge["target"] != node["id"]:
            continue
        
        source_node = next(n for n in all_nodes if n["id"] == edge["source"])
        target_handle = edge.get("targetHandle", "input_layer_id")
        
        if source_node["data"]["type"] == "dataset":
            inputs[target_handle] = source_node["data"].get("layerId")
            # Include filter if present
            if source_node["data"].get("filter"):
                filter_key = target_handle.replace("_id", "_filter")
                inputs[filter_key] = source_node["data"]["filter"]
        else:
            # Reference previous tool's output
            prev_result = results.get(source_node["id"])
            if prev_result:
                inputs[target_handle] = prev_result["layer_id"]
    
    return inputs


def main(params: WorkflowRunnerParams) -> dict:
    """Execute workflow: run all tool nodes in topological order."""
    nodes = params.nodes
    edges = params.edges
    
    # Sort nodes by dependency
    sorted_nodes = topological_sort(nodes, edges)
    
    # Track results per node
    results = {}
    
    # Execute each tool node
    for node in sorted_nodes:
        if node["data"]["type"] != "tool":
            continue
        
        # Validate: all inputs must be available
        # (dataset nodes have layerId, tool nodes have results)
        
        # Build inputs
        inputs = build_inputs(node, edges, nodes, results)
        inputs["user_id"] = params.user_id
        inputs["project_id"] = params.project_id
        inputs["folder_id"] = params.folder_id
        inputs["temp_mode"] = True
        inputs["workflow_id"] = params.workflow_id
        inputs["node_id"] = node["id"]
        inputs["result_layer_name"] = node["data"].get("label", "Workflow Result")
        
        # Run as @task
        result = run_tool(
            node_id=node["id"],
            process_id=node["data"]["processId"],
            inputs=inputs
        )
        
        results[node["id"]] = result
    
    return results
```

### Task 3.2: Register workflow_runner in tool registry

**File**: `packages/python/goatlib/src/goatlib/tools/registry.py`

```python
# Add workflow_runner to the registry
# Note: This might need special handling since it's not a standard tool
```

### Task 3.3: Sync workflow_runner to Windmill

**File**: `scripts/windmill/sync-tools.sh`

Ensure `workflow_runner` is synced to `f/goat/workflow_runner` path.

---

## Phase 4: Backend - Workflow Execute Endpoint

**Goal**: API endpoint to trigger workflow execution.

### Task 4.1: Add execute endpoint to workflow router

**File**: `apps/core/src/core/endpoints/v2/workflow.py`

```python
from processes.services.windmill_client import WindmillClient

windmill_client = WindmillClient()


class WorkflowExecuteResponse(BaseModel):
    job_id: str


@router.post("/{workflow_id}/execute", response_model=WorkflowExecuteResponse)
async def execute_workflow(
    project_id: UUID,
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
) -> WorkflowExecuteResponse:
    """
    Execute a workflow via Windmill.
    
    1. Load workflow config
    2. Get folder_id from project
    3. Optionally cleanup previous temporary layers
    4. Submit workflow_runner to Windmill
    5. Return job_id
    """
    # Load workflow
    workflow = await crud_workflow.get(db, id=workflow_id)
    if not workflow or workflow.project_id != project_id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Get project folder
    project = await crud_project.get(db, id=project_id)
    folder_id = str(project.folder_id)
    
    # TODO: Cleanup previous temporary layers (optional enhancement)
    
    # Submit to Windmill
    job_id = await windmill_client.run_script_async(
        script_path="f/goat/workflow_runner",
        args={
            "user_id": str(user_id),
            "project_id": str(project_id),
            "workflow_id": str(workflow_id),
            "folder_id": folder_id,
            "nodes": workflow.config.get("nodes", []),
            "edges": workflow.config.get("edges", []),
        }
    )
    
    return WorkflowExecuteResponse(job_id=job_id)
```

### Task 4.2: Add workflow job status endpoint (optional)

**File**: `apps/core/src/core/endpoints/v2/workflow.py`

```python
@router.get("/{workflow_id}/jobs")
async def list_workflow_jobs(
    project_id: UUID,
    workflow_id: UUID,
    user_id: UUID = Depends(get_user_id),
) -> list[dict]:
    """
    List all Windmill jobs for this workflow.
    """
    jobs = await windmill_client.list_jobs_filtered(
        user_id=str(user_id),
        script_path_start="f/goat/workflow_runner",
    )
    
    # Filter by workflow_id in args
    return [
        j for j in jobs 
        if j.get("args", {}).get("workflow_id") == str(workflow_id)
    ]
```

---

## Phase 5: Frontend - Execution UI

**Goal**: Run button, status polling, save functionality.

### Task 5.1: Add execute API function

**File**: `apps/web/lib/api/workflows.ts`

```typescript
export async function executeWorkflow(
  projectId: string,
  workflowId: string
): Promise<{ job_id: string }> {
  const response = await apiRequestAuth(
    `${CORE_API_URL}/projects/${projectId}/workflows/${workflowId}/execute`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw new Error("Failed to execute workflow");
  }
  return response.json();
}

export async function finalizeTempLayer(
  userId: string,
  workflowId: string,
  nodeId: string,
  projectId: string,
  layerName?: string
): Promise<{ layer_id: string }> {
  const params = new URLSearchParams({ project_id: projectId });
  if (layerName) params.set("layer_name", layerName);
  
  const response = await apiRequestAuth(
    `${GEOAPI_URL}/temp/${userId}/${workflowId}/${nodeId}/finalize?${params}`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw new Error("Failed to finalize layer");
  }
  return response.json();
}
```

### Task 5.2: Create useWorkflowExecution hook

**File**: `apps/web/hooks/workflows/useWorkflowExecution.ts` (new)

```typescript
import { useState, useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { executeWorkflow } from "@/lib/api/workflows";
import { useJobs } from "@/lib/api/processes";
import { setRunningJobIds } from "@/lib/store/jobs/slice";

interface WorkflowExecutionState {
  isExecuting: boolean;
  jobId: string | null;
  error: string | null;
  nodeStatuses: Record<string, "idle" | "running" | "completed" | "error">;
}

export function useWorkflowExecution(projectId: string, workflowId: string) {
  const dispatch = useDispatch();
  const runningJobIds = useSelector((state) => state.jobs.runningJobIds);
  const { jobs, mutate: mutateJobs } = useJobs({ read: false });
  
  const [state, setState] = useState<WorkflowExecutionState>({
    isExecuting: false,
    jobId: null,
    error: null,
    nodeStatuses: {},
  });

  // Execute workflow
  const execute = useCallback(async () => {
    setState(s => ({ ...s, isExecuting: true, error: null }));
    
    try {
      const { job_id } = await executeWorkflow(projectId, workflowId);
      setState(s => ({ ...s, jobId: job_id }));
      
      // Add to running jobs for polling
      dispatch(setRunningJobIds([...runningJobIds, job_id]));
      
      // Trigger immediate fetch
      mutateJobs();
    } catch (error) {
      setState(s => ({ 
        ...s, 
        isExecuting: false, 
        error: error instanceof Error ? error.message : "Execution failed" 
      }));
    }
  }, [projectId, workflowId, dispatch, runningJobIds, mutateJobs]);

  // Watch job status
  useEffect(() => {
    if (!state.jobId || !jobs?.jobs) return;
    
    const job = jobs.jobs.find(j => j.jobID === state.jobId);
    if (!job) return;
    
    // Update node statuses from workflow_as_code_status
    if (job.workflow_as_code_status) {
      const { running = [], completed = [] } = job.workflow_as_code_status;
      const newStatuses: Record<string, string> = {};
      
      // Extract node IDs from task names (run_tool_xxx format)
      running.forEach(taskName => {
        // Parse node_id from task result or name
        // This depends on how we structure the task naming
      });
      
      completed.forEach(taskName => {
        // Similar parsing
      });
      
      setState(s => ({ ...s, nodeStatuses: newStatuses }));
    }
    
    // Check for completion
    if (job.status === "successful" || job.status === "failed") {
      setState(s => ({ 
        ...s, 
        isExecuting: false,
        error: job.status === "failed" ? job.message : null,
      }));
      
      // Remove from running jobs
      dispatch(setRunningJobIds(runningJobIds.filter(id => id !== state.jobId)));
    }
  }, [jobs, state.jobId, dispatch, runningJobIds]);

  return {
    ...state,
    execute,
  };
}
```

### Task 5.3: Add Run button to WorkflowToolbar

**File**: `apps/web/components/workflows/canvas/WorkflowToolbar.tsx`

```typescript
// Add to toolbar
<Tooltip title={t("run_workflow")}>
  <span>
    <IconButton
      onClick={handleRunWorkflow}
      disabled={isExecuting || !hasToolNodes}
      color={isExecuting ? "primary" : "default"}
    >
      {isExecuting ? <CircularProgress size={20} /> : <PlayArrowIcon />}
    </IconButton>
  </span>
</Tooltip>
```

### Task 5.4: Update node components to show execution status

**File**: `apps/web/components/workflows/nodes/ToolNode.tsx`

```typescript
// Add visual indicator based on execution status
const statusColors = {
  idle: "default",
  running: "primary",
  completed: "success",
  error: "error",
};

// Add pulsing border or spinner for running state
// Add checkmark icon for completed
// Add error icon for error state
```

### Task 5.5: Add Save button to ToolNodeSettings

**File**: `apps/web/components/workflows/panels/ToolNodeSettings.tsx`

```typescript
// In Actions section, add Save button when node has temp_layer_id
{node.data.tempLayerId && (
  <Button
    variant="outlined"
    startIcon={<Icon iconName={ICON_NAME.LAYERS} style={{ fontSize: 16 }} />}
    onClick={handleSaveToProject}
    disabled={isSaving}
  >
    {t("save_to_project")}
  </Button>
)}
```

### Task 5.6: Add translations

**Files**: 
- `apps/web/i18n/locales/en/common.json`
- `apps/web/i18n/locales/de/common.json`

```json
{
  "run_workflow": "Run Workflow",
  "workflow_running": "Workflow is running...",
  "workflow_completed": "Workflow completed successfully",
  "workflow_failed": "Workflow execution failed",
  "save_to_project": "Save to Project",
  "layer_saved": "Layer saved to project"
}
```

---

## Phase 6: Testing & Polish

### Task 6.1: Test temp file flow

1. Run a tool with `temp_mode: true`
2. Verify GeoParquet + PMTiles written to `/data/temporary/`
3. Verify NO layer record created in PostgreSQL
4. Call finalize endpoint
5. Verify layer copied to DuckLake and record created
6. Verify temp files deleted

### Task 6.2: Test workflow execution

1. Create workflow with Dataset → Buffer
2. Click Run
3. Verify job is created in Windmill
4. Verify polling shows progress
5. Verify result in `/data/temporary/`
6. Click Save
7. Verify layer appears in project

### Task 6.3: Test multi-node workflow

1. Create workflow: Dataset → Buffer → Clip
2. Run workflow
3. Verify both tools execute in order
4. Verify intermediate results in temp storage

### Task 6.4: Test browser close scenario

1. Start long-running workflow
2. Close browser
3. Reopen workflow
4. Verify job status is recovered from Windmill
5. Verify temp results are still accessible

---

## Summary

| Phase                            | Tasks        | Estimated Time |
| -------------------------------- | ------------ | -------------- |
| Phase 1: Temp File Writer        | 4 tasks      | 1.5 days       |
| Phase 2: Extend GeoAPI Endpoints | 5 tasks      | 1 day          |
| Phase 3: Workflow Runner Script  | 3 tasks      | 1 day          |
| Phase 4: Execute Endpoint        | 2 tasks      | 0.5 days       |
| Phase 5: Frontend Execution UI   | 6 tasks      | 2 days         |
| Phase 6: Testing & Polish        | 4 tasks      | 1 day          |
| **Total**                        | **24 tasks** | **~7 days**    |

---

## Dependencies

```
Phase 1 (Temp File Writer)
    │
    ├──► Phase 2 (Extend GeoAPI Endpoints)
    │         │
    │         └──► Phase 3 (Workflow Runner)
    │                   │
    │                   └──► Phase 4 (Execute Endpoint)
    │                             │
    │                             └──► Phase 5 (Frontend UI)
    │                                       │
    └─────────────────────────────────────┴──► Phase 6 (Testing)
```

Phase 1 is the foundation - all other phases depend on it.
Phase 2 can start immediately after Phase 1.
Phases 3 and 4 can be worked on in parallel.
Phase 5 requires Phase 4 to be complete.

---

## Files to Create/Modify

### New Files
- `packages/python/goatlib/src/goatlib/tools/temp_writer.py` - TempLayerWriter utility
- `apps/geoapi/src/geoapi/core/temp_layer.py` - Temp layer resolver utility
- `apps/geoapi/src/geoapi/endpoints/temp_layers.py` - Cleanup + metadata endpoints
- `packages/python/goatlib/src/goatlib/tools/workflow_runner.py` - Windmill workflow script
- `apps/web/hooks/workflows/useWorkflowExecution.ts` - Execution hook

### Modified Files
- `packages/python/goatlib/src/goatlib/tools/schemas.py` - Add temp_mode, workflow_id, node_id
- `packages/python/goatlib/src/goatlib/tools/base.py` - Add _write_temp_result()
- `apps/geoapi/src/geoapi/endpoints/tiles.py` - Support temp layer IDs
- `apps/geoapi/src/geoapi/endpoints/collections.py` - Support temp layer IDs
- `apps/geoapi/src/geoapi/main.py` - Register temp_layers router
- `apps/core/src/core/endpoints/v2/workflow.py` - Add execute endpoint
- `apps/web/lib/api/workflows.ts` - Add executeWorkflow, finalizeTempLayer
- `apps/web/components/workflows/canvas/WorkflowToolbar.tsx` - Add Run button
- `apps/web/components/workflows/nodes/ToolNode.tsx` - Add status indicator
- `apps/web/components/workflows/panels/ToolNodeSettings.tsx` - Add Save button
- `apps/web/i18n/locales/en/common.json` - Add translations
- `apps/web/i18n/locales/de/common.json` - Add translations

---

## Query Parameter Approach

**Same endpoints, same UUID layer_id, just add query params**:

```typescript
// Regular layer
GET /user_{user_id}/{layer_id}/tiles/{z}/{x}/{y}.pbf
GET /collections/{layer_id}/items

// Temp layer - same endpoint, add query params
GET /user_{user_id}/{layer_id}/tiles/{z}/{x}/{y}.pbf?temp=true&workflow_id=xxx&node_id=yyy
GET /collections/{layer_id}/items?temp=true&workflow_id=xxx&node_id=yyy
```

**Frontend usage**:
```typescript
// Generate a UUID for the temp layer (for caching purposes)
const tempLayerId = crypto.randomUUID();

// Tile URL with query params
const tileUrl = `${GEOAPI_URL}/user_${userId}/${tempLayerId}/tiles/{z}/{x}/{y}.pbf?temp=true&workflow_id=${workflowId}&node_id=${nodeId}`;

// Features URL with query params  
const featuresUrl = `${GEOAPI_URL}/collections/${tempLayerId}/items?temp=true&workflow_id=${workflowId}&node_id=${nodeId}`;
```

**Note**: The `layer_id` can be any UUID - it's used for MapLibre source caching. The actual data is resolved from `workflow_id` + `node_id`.

---

## Key Benefits of This Approach

| Benefit                  | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| **No DB migrations**     | No `is_temporary` column needed                             |
| **No DuckLake for temp** | Results go to simple files until saved                      |
| **Easy cleanup**         | Just delete `/data/temporary/{user}/{workflow}/` folder     |
| **Clear separation**     | Temp results vs permanent layers are in different locations |
| **Simpler mental model** | Files are temp → finalize copies to permanent storage       |
| **Faster iteration**     | No DB overhead during workflow development                  |
| **Same endpoints**       | Just add query params, no new URL patterns                  |
| **Standard UUIDs**       | layer_id format unchanged                                   |
