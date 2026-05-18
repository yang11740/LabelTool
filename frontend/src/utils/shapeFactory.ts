import { DEFAULT_ATTRIBUTES } from "@/types/labelFile";
import type { ShapeData, ShapeType } from "@/types/labelFile";

export function createShapeData(
  shapeType: ShapeType,
  points: [number, number][],
  overrides: Partial<ShapeData> = {},
): ShapeData {
  const nodeId = overrides.node_id ?? "n1";
  const label = overrides.label || overrides.type || "";

  return {
    ...overrides,
    label,
    node_id: nodeId,
    type: overrides.type || label,
    points,
    shape_type: shapeType,
    description: overrides.description ?? "",
    group_id: overrides.group_id ?? null,
    mask: overrides.mask ?? null,
    transcription_raw: overrides.transcription_raw ?? "",
    transcription_semantic: overrides.transcription_semantic ?? "",
    attributes: {
      ...DEFAULT_ATTRIBUTES,
      ...overrides.attributes,
    },
    flags: {
      ...overrides.flags,
    },
    other_data: {
      ...overrides.other_data,
    },
    edges: overrides.edges ? [...overrides.edges] : [],
  };
}

export function nextNodeId(shapes: Pick<ShapeData, "node_id">[]): string {
  const used = new Set(shapes.map((shape) => shape.node_id));
  let index = 1;
  while (used.has(`n${index}`)) index += 1;
  return `n${index}`;
}

export function rectanglePoints(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): [number, number][] {
  return [
    [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
    [Math.max(p1.x, p2.x), Math.max(p1.y, p2.y)],
  ];
}

export function isMeaningfulShape(shapeType: ShapeType, points: [number, number][]): boolean {
  if (shapeType === "point") return points.length === 1;
  if (shapeType === "polygon") return points.length >= 3;
  if (shapeType === "linestrip") return points.length >= 2;
  if (shapeType === "rectangle") return points.length === 2 && distance(points[0], points[1]) >= 3;
  if (shapeType === "line") return points.length === 2 && distance(points[0], points[1]) >= 3;
  if (shapeType === "circle") return points.length === 2 && distance(points[0], points[1]) >= 3;
  return points.length > 0;
}

export function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function cloneShapes(shapes: ShapeData[]): ShapeData[] {
  return shapes.map((shape) => ({
    ...shape,
    points: shape.points.map((point) => [...point] as [number, number]),
    flags: { ...shape.flags },
    attributes: { ...shape.attributes },
    edges: shape.edges.map((edge) => ({ ...edge })),
    other_data: { ...shape.other_data },
  }));
}

export function translateShape(shape: ShapeData, dx: number, dy: number): ShapeData {
  return {
    ...shape,
    points: shape.points.map((point) => [point[0] + dx, point[1] + dy] as [number, number]),
  };
}

export function replaceShapeNodeId(shapes: ShapeData[], previousId: string, nextShape: ShapeData): ShapeData[] {
  return shapes.map((shape) => {
    if (shape.node_id === previousId) return nextShape;
    return {
      ...shape,
      edges: shape.edges.map((edge) =>
        edge.target === previousId ? { ...edge, target: nextShape.node_id } : edge,
      ),
    };
  });
}
