import { SHAPE_TYPES, type ShapeData } from "@/types/labelFile";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateShapesForSave(shapes: ShapeData[]): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  const duplicateIds = new Set<string>();

  shapes.forEach((shape, index) => {
    const label = shape.node_id || `#${index + 1}`;
    const nodeId = shape.node_id.trim();

    if (!nodeId) {
      errors.push(`第 ${index + 1} 个标注缺少 node_id`);
    } else if (ids.has(nodeId)) {
      duplicateIds.add(nodeId);
    } else {
      ids.add(nodeId);
    }

    if (!(SHAPE_TYPES as readonly string[]).includes(shape.shape_type)) {
      errors.push(`${label} 的 shape_type 非法：${shape.shape_type}`);
    }
    if (shape.points.length === 0) {
      errors.push(`${label} 缺少 points`);
    }
  });

  for (const id of duplicateIds) {
    errors.push(`node_id 重复：${id}`);
  }

  for (const shape of shapes) {
    for (const edge of shape.edges) {
      if (!edge.target.trim()) {
        errors.push(`${shape.node_id} 存在空的 edge.target`);
      } else if (!ids.has(edge.target)) {
        errors.push(`${shape.node_id} 指向不存在的 edge.target：${edge.target}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
