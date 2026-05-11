// Types matching the JSON shape format from labelme _label_file.py ShapeDict.
// Valid shape_type values (from shape.py).

export interface Point {
  x: number;
  y: number;
}
export const SHAPE_TYPES = [
  "polygon",
  "rectangle",
  "point",
  "line",
  "circle",
  "linestrip",
  "points",
  "mask",
] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];

export interface Edge {
  target: string;
  relation: string;
}

export interface Attributes {
  z_index: number;
  color: "black" | "red" | "other";
}

export interface ShapeData {
  label: string;
  points: [number, number][];
  shape_type: ShapeType;
  flags: Record<string, boolean>;
  description: string;
  group_id: number | null;
  mask: string | null; // base64-encoded PNG, or null
  other_data: Record<string, unknown>;

  // Custom manuscript fields
  node_id: string;
  type: string;
  transcription: string;
  attributes: Attributes;
  edges: Edge[];
}

// ── validation ──

const SHAPE_KEYS: ReadonlySet<string> = new Set([
  "label",
  "points",
  "group_id",
  "shape_type",
  "flags",
  "description",
  "mask",
  "node_id",
  "type",
  "transcription",
  "attributes",
  "edges",
]);

export interface ValidationError {
  field: string;
  message: string;
}

type RawRecord = Record<string, unknown>;

function isRecord(v: unknown): v is RawRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && !Number.isNaN(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

/**
 * Validate and normalize a raw JSON object into a ShapeData.
 *
 * Mirrors labelme._label_file._load_shape_json_obj.
 */
export function loadShapeJsonObj(raw: RawRecord): { shape: ShapeData; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  // ── label ──
  let label: string = "";
  const rawLabel = raw["label"];
  if (isString(rawLabel)) {
    label = rawLabel;
  } else if (isString(raw["type"])) {
    label = raw["type"];
  } else {
    errors.push({ field: "label", message: "label is required and must be a string" });
  }

  // ── points ──
  let points: [number, number][] = [];
  const rawPoints = raw["points"];
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
    errors.push({ field: "points", message: "points must be a non-empty list of [x, y]" });
  } else {
    const parsed: [number, number][] = [];
    for (let i = 0; i < rawPoints.length; i++) {
      const pt = rawPoints[i];
      if (
        Array.isArray(pt) &&
        pt.length === 2 &&
        isNumber(pt[0]) &&
        isNumber(pt[1])
      ) {
        parsed.push([pt[0], pt[1]]);
      } else {
        errors.push({ field: "points", message: `points[${i}] must be [number, number]` });
      }
    }
    points = parsed;
  }

  // ── shape_type ──
  let shapeType: ShapeType;
  const rawType = raw["shape_type"];
  if (isString(rawType) && (SHAPE_TYPES as readonly string[]).includes(rawType)) {
    shapeType = rawType as ShapeType;
  } else {
    // Original defaults to "polygon" when missing
    shapeType = "polygon";
  }

  // ── flags ──
  let flags: Record<string, boolean> = {};
  const rawFlags = raw["flags"];
  if (isRecord(rawFlags)) {
    for (const [k, v] of Object.entries(rawFlags)) {
      if (isString(k) && isBoolean(v)) {
        flags[k] = v;
      }
    }
  }

  // ── description ──
  let description = "";
  const rawDesc = raw["description"];
  if (isString(rawDesc)) {
    description = rawDesc;
  }

  // ── group_id ──
  let groupId: number | null = null;
  const rawGroup = raw["group_id"];
  if (rawGroup !== null && rawGroup !== undefined) {
    if (isNumber(rawGroup) && Number.isInteger(rawGroup)) {
      groupId = rawGroup;
    } else {
      errors.push({ field: "group_id", message: "group_id must be an integer or null" });
    }
  }

  // ── mask ──
  let mask: string | null = null;
  const rawMask = raw["mask"];
  if (rawMask !== null && rawMask !== undefined) {
    if (isString(rawMask)) {
      mask = rawMask;
    } else {
      errors.push({ field: "mask", message: "mask must be a base64-encoded string or null" });
    }
  }

  // ── manuscript fields ──
  const nodeId: string = isString(raw["node_id"]) ? raw["node_id"] : "";

  const typeVal: string = isString(raw["type"]) ? raw["type"] : label;

  const transcription = isString(raw["transcription"]) ? raw["transcription"] : "";

  // attributes: z_index and color
  let attributes: Attributes = { z_index: 0, color: "black" };
  const rawAttr = raw["attributes"];
  if (isRecord(rawAttr)) {
    const z = rawAttr["z_index"];
    const c = rawAttr["color"];
    attributes = {
      z_index: isNumber(z) ? z : 0,
      color: c === "black" || c === "red" || c === "other" ? c : "black",
    };
  }

  // edges
  let edges: Edge[] = [];
  const rawEdges = raw["edges"];
  if (Array.isArray(rawEdges)) {
    edges = rawEdges
      .filter(isRecord)
      .map((e: RawRecord) => ({
        target: isString(e["target"]) ? String(e["target"]) : "",
        relation: isString(e["relation"]) ? String(e["relation"]) : "",
      }))
      .filter((e) => e.target !== "");
  }

  // other_data: any keys not in SHAPE_KEYS
  const otherData: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (!SHAPE_KEYS.has(key)) {
      otherData[key] = raw[key];
    }
  }

  return {
    shape: {
      label,
      points,
      shape_type: shapeType,
      flags,
      description,
      group_id: groupId,
      mask,
      node_id: nodeId,
      type: typeVal,
      transcription,
      attributes,
      edges,
      other_data: otherData,
    },
    errors,
  };
}
