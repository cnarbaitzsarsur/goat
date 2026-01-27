import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch } from "@/lib/store";
import { selectEdges, selectNodes, selectSelectedWorkflowId } from "@/lib/store/workflow/selectors";
import { setEdges, setNodes } from "@/lib/store/workflow/slice";

interface HistoryState {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY_SIZE = 50;

/**
 * Hook to manage undo/redo history for workflow canvas
 * Tracks changes to nodes and edges and provides undo/redo functionality
 */
export function useWorkflowHistory() {
  const dispatch = useDispatch<AppDispatch>();
  const nodes = useSelector(selectNodes);
  const edges = useSelector(selectEdges);
  const selectedWorkflowId = useSelector(selectSelectedWorkflowId);

  // History stacks
  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  // Track if we're currently applying an undo/redo to avoid recording it
  const isUndoRedoRef = useRef(false);
  // Track previous state for comparison
  const prevStateRef = useRef<HistoryState | null>(null);
  // Debounce timer for batching rapid changes
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset history when workflow changes
  useEffect(() => {
    setPast([]);
    setFuture([]);
    prevStateRef.current = null;
  }, [selectedWorkflowId]);

  // Track changes and push to history
  useEffect(() => {
    // Skip if we're applying undo/redo
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce to batch rapid changes (e.g., dragging)
    debounceTimerRef.current = setTimeout(() => {
      const currentState: HistoryState = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      };

      // Skip if state hasn't actually changed
      if (prevStateRef.current) {
        const nodesChanged =
          JSON.stringify(prevStateRef.current.nodes) !== JSON.stringify(currentState.nodes);
        const edgesChanged =
          JSON.stringify(prevStateRef.current.edges) !== JSON.stringify(currentState.edges);

        if (!nodesChanged && !edgesChanged) {
          return;
        }

        // Push previous state to history
        setPast((prev) => {
          const newPast = [...prev, prevStateRef.current!];
          // Limit history size
          if (newPast.length > MAX_HISTORY_SIZE) {
            return newPast.slice(-MAX_HISTORY_SIZE);
          }
          return newPast;
        });

        // Clear future on new change
        setFuture([]);
      }

      prevStateRef.current = currentState;
    }, 300); // 300ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [nodes, edges]);

  // Undo action
  const undo = useCallback(() => {
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const current: HistoryState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };

    // Mark that we're doing undo/redo to skip history recording
    isUndoRedoRef.current = true;

    // Update Redux state
    dispatch(setNodes(previous.nodes));
    dispatch(setEdges(previous.edges));

    // Update history stacks
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [current, ...prev]);

    // Update prev state ref
    prevStateRef.current = previous;
  }, [past, nodes, edges, dispatch]);

  // Redo action
  const redo = useCallback(() => {
    if (future.length === 0) return;

    const next = future[0];
    const current: HistoryState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };

    // Mark that we're doing undo/redo to skip history recording
    isUndoRedoRef.current = true;

    // Update Redux state
    dispatch(setNodes(next.nodes));
    dispatch(setEdges(next.edges));

    // Update history stacks
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, current]);

    // Update prev state ref
    prevStateRef.current = next;
  }, [future, nodes, edges, dispatch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Ctrl/Cmd + Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y for redo
      if ((e.ctrlKey || e.metaKey) && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    historyLength: past.length,
    futureLength: future.length,
  };
}
