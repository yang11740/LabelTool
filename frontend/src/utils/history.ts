import type { ShapeData } from "@/types/labelFile";
import { cloneShapes } from "./shapeFactory";

export interface HistoryState {
  undo: ShapeData[][];
  redo: ShapeData[][];
}

export interface HistoryStep {
  history: HistoryState;
  shapes: ShapeData[] | null;
}

const MAX_HISTORY = 50;

export const EMPTY_HISTORY: HistoryState = {
  undo: [],
  redo: [],
};

export function createEmptyHistory(): HistoryState {
  return { undo: [], redo: [] };
}

export function pushHistory(history: HistoryState, previousShapes: ShapeData[]): HistoryState {
  return {
    undo: [...history.undo.slice(-(MAX_HISTORY - 1)), cloneShapes(previousShapes)],
    redo: [],
  };
}

export function undoHistory(history: HistoryState, currentShapes: ShapeData[]): HistoryStep {
  const previous = history.undo.at(-1);
  if (!previous) return { history, shapes: null };
  return {
    history: {
      undo: history.undo.slice(0, -1),
      redo: [...history.redo, cloneShapes(currentShapes)],
    },
    shapes: cloneShapes(previous),
  };
}

export function redoHistory(history: HistoryState, currentShapes: ShapeData[]): HistoryStep {
  const next = history.redo.at(-1);
  if (!next) return { history, shapes: null };
  return {
    history: {
      undo: [...history.undo, cloneShapes(currentShapes)],
      redo: history.redo.slice(0, -1),
    },
    shapes: cloneShapes(next),
  };
}
