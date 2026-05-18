import { SHAPE_TYPES, type ShapeData } from "@/types/labelFile";

export interface ValidationIssue {
  message: string;
  node_id?: string;
  imageName?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  issues: ValidationIssue[];
}

export function validateShapesForSave(shapes: ShapeData[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const duplicateIds = new Set<string>();

  shapes.forEach((shape, index) => {
    const label = shape.node_id || `#${index + 1}`;
    const nodeId = shape.node_id.trim();

    if (!nodeId) {
      issues.push({ message: `第 ${index + 1} 个标注缺少 node_id` });
    } else if (ids.has(nodeId)) {
      duplicateIds.add(nodeId);
    } else {
      ids.add(nodeId);
    }

    if (!(SHAPE_TYPES as readonly string[]).includes(shape.shape_type)) {
      issues.push({ message: `${label} 的 shape_type 非法：${shape.shape_type}`, node_id: shape.node_id });
    }
    if (shape.points.length === 0) {
      issues.push({ message: `${label} 缺少 points`, node_id: shape.node_id });
    }
  });

  for (const id of duplicateIds) {
    issues.push({ message: `node_id 重复：${id}`, node_id: id });
  }

  for (const shape of shapes) {
    for (const edge of shape.edges) {
      if (!edge.target.trim()) {
        issues.push({ message: `${shape.node_id} 存在空的 edge.target`, node_id: shape.node_id });
      } else if (!ids.has(edge.target)) {
        issues.push({
          message: `${shape.node_id} 指向不存在的 edge.target：${edge.target}`,
          node_id: shape.node_id,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    errors: issues.map((issue) => issue.message),
    issues,
  };
}
