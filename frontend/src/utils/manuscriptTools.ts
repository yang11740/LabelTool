import type { ShapeData, ShapeType } from "@/types/labelFile";

export type AnnotationMode = "select" | "draw" | "quick_relation";
export type NodeIdStrategy = "sequential" | "column_line";

export function shapeCenter(shape: Pick<ShapeData, "points" | "shape_type">): { x: number; y: number } {
  if (shape.points.length === 0) return { x: 0, y: 0 };
  if (shape.shape_type === "circle" && shape.points.length >= 2) {
    return { x: shape.points[0][0], y: shape.points[0][1] };
  }
  return {
    x: shape.points.reduce((sum, point) => sum + point[0], 0) / shape.points.length,
    y: shape.points.reduce((sum, point) => sum + point[1], 0) / shape.points.length,
  };
}

export function sortShapesByVerticalManuscriptOrder(shapes: ShapeData[]): ShapeData[] {
  return [...shapes].sort((a, b) => {
    const ca = shapeCenter(a);
    const cb = shapeCenter(b);
    const dx = cb.x - ca.x;
    if (Math.abs(dx) > 24) return dx;
    return ca.y - cb.y;
  });
}

export function buildReadOrderEdges(shapes: ShapeData[], relation = "READS_AFTER"): ShapeData[] {
  const ordered = sortShapesByVerticalManuscriptOrder(shapes).filter((shape) => shape.node_id.trim());
  const nextById = new Map<string, string>();
  ordered.forEach((shape, index) => {
    const next = ordered[index + 1];
    if (next) nextById.set(shape.node_id, next.node_id);
  });

  return shapes.map((shape) => {
    const target = nextById.get(shape.node_id);
    const cleanedEdges = shape.edges.filter((edge) => edge.relation !== relation);
    if (!target) return { ...shape, edges: cleanedEdges };
    return {
      ...shape,
      edges: [...cleanedEdges, { target, relation }],
    };
  });
}

export function addRelationEdge(
  shapes: ShapeData[],
  sourceId: string,
  targetId: string,
  relation: string,
): ShapeData[] {
  if (!sourceId || !targetId || sourceId === targetId) return shapes;
  return shapes.map((shape) => {
    if (shape.node_id !== sourceId) return shape;
    if (shape.edges.some((edge) => edge.target === targetId && edge.relation === relation)) return shape;
    return {
      ...shape,
      edges: [...shape.edges, { target: targetId, relation }],
    };
  });
}

export function nextNodeIdForStrategy(
  shapes: Pick<ShapeData, "node_id" | "points" | "shape_type">[],
  strategy: NodeIdStrategy,
  points: [number, number][],
  shapeType: ShapeType,
): string {
  if (strategy === "column_line") {
    return nextColumnLineId(shapes, points, shapeType);
  }
  return nextSequentialId(shapes);
}

export function nextSequentialId(shapes: Pick<ShapeData, "node_id">[]): string {
  const used = new Set(shapes.map((shape) => shape.node_id));
  let index = 1;
  while (used.has(`n${index}`)) index += 1;
  return `n${index}`;
}

export function nextColumnLineId(
  shapes: Pick<ShapeData, "node_id" | "points" | "shape_type">[],
  points: [number, number][],
  shapeType: ShapeType,
): string {
  const used = new Set(shapes.map((shape) => shape.node_id));
  const probe = shapeCenter({ points, shape_type: shapeType });
  const orderedColumns = uniqueColumns(
    shapes
      .filter((shape) => shape.node_id.trim())
      .map((shape) => shapeCenter(shape).x)
      .concat(probe.x),
  );
  const columnIndex = Math.max(1, orderedColumns.findIndex((x) => Math.abs(x - probe.x) <= 24) + 1);
  const prefix = `c${columnIndex}_l`;
  let lineIndex = 1;
  while (used.has(`${prefix}${lineIndex}`)) lineIndex += 1;
  return `${prefix}${lineIndex}`;
}

function uniqueColumns(xs: number[]): number[] {
  const sorted = [...xs].sort((a, b) => b - a);
  const columns: number[] = [];
  for (const x of sorted) {
    if (!columns.some((existing) => Math.abs(existing - x) <= 24)) columns.push(x);
  }
  return columns;
}
