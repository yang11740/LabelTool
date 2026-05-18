// Types matching the updated desktop labelme ShapeDict in labelme/_label_file.py.

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

export type ReadingDirection = "RTL" | "LTR" | string;
export type ShapeColor = "black" | "red" | "other" | string;

export interface Edge {
  target: string;
  relation: string;
}

export interface Attributes {
  z_index: number;
  color: ShapeColor;
  vague: boolean;
  reading_direction: ReadingDirection;
  handwriting_style: string;
}

export interface ShapeData {
  label: string;
  points: [number, number][];
  shape_type: ShapeType;
  flags: Record<string, boolean>;
  description: string;
  group_id: number | string | null;
  mask: string | null;
  other_data: Record<string, unknown>;

  // Custom manuscript fields from the updated desktop version.
  node_id: string;
  type: string;
  transcription_raw: string;
  transcription_semantic: string;
  attributes: Attributes;
  edges: Edge[];
}

export interface AnnotationDocument {
  version?: string;
  flags?: Record<string, boolean>;
  shapes: ShapeData[];
  imagePath?: string;
  imageData?: string | null;
  imageHeight: number;
  imageWidth: number;
  other_data: Record<string, unknown>;
}

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
  "transcription_raw",
  "transcription_semantic",
  "transcription",
  "attributes",
  "edges",
]);

export const DEFAULT_ATTRIBUTES: Attributes = {
  z_index: 0,
  color: "black",
  vague: false,
  reading_direction: "RTL",
  handwriting_style: "",
};

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

function loadGroupId(rawGroup: unknown, errors: ValidationError[]): number | string | null {
  if (rawGroup === null || rawGroup === undefined) return null;
  if (isNumber(rawGroup) && Number.isInteger(rawGroup)) return rawGroup;
  if (isString(rawGroup) && /^G_\d+$/.test(rawGroup)) return rawGroup;
  errors.push({ field: "group_id", message: "group_id must be an integer, G_<integer>, or null" });
  return null;
}

function loadAttributes(rawAttr: unknown): Attributes {
  if (!isRecord(rawAttr)) return { ...DEFAULT_ATTRIBUTES };

  const z = rawAttr["z_index"];
  const color = rawAttr["color"];
  const vague = rawAttr["vague"];
  const readingDirection = rawAttr["reading_direction"];
  const handwritingStyle = rawAttr["handwriting_style"];

  return {
    z_index: isNumber(z) ? z : DEFAULT_ATTRIBUTES.z_index,
    color: isString(color) ? color : DEFAULT_ATTRIBUTES.color,
    vague: isBoolean(vague) ? vague : DEFAULT_ATTRIBUTES.vague,
    reading_direction: isString(readingDirection)
      ? readingDirection
      : DEFAULT_ATTRIBUTES.reading_direction,
    handwriting_style: isString(handwritingStyle)
      ? handwritingStyle
      : DEFAULT_ATTRIBUTES.handwriting_style,
  };
}

/**
 * Validate and normalize a raw JSON object into a ShapeData.
 *
 * This mirrors the updated desktop labelme._label_file._load_shape_json_obj,
 * including backward compatibility for old "transcription" values.
 */
export function loadShapeJsonObj(raw: RawRecord): { shape: ShapeData; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  let label = "";
  const rawLabel = raw["label"];
  if (isString(rawLabel)) {
    label = rawLabel;
  } else if (isString(raw["type"])) {
    label = raw["type"];
  } else {
    errors.push({ field: "label", message: "label is required and must be a string" });
  }

  let points: [number, number][] = [];
  const rawPoints = raw["points"];
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
    errors.push({ field: "points", message: "points must be a non-empty list of [x, y]" });
  } else {
    const parsed: [number, number][] = [];
    for (let i = 0; i < rawPoints.length; i += 1) {
      const pt = rawPoints[i];
      if (Array.isArray(pt) && pt.length === 2 && isNumber(pt[0]) && isNumber(pt[1])) {
        parsed.push([pt[0], pt[1]]);
      } else {
        errors.push({ field: "points", message: `points[${i}] must be [number, number]` });
      }
    }
    points = parsed;
  }

  let shapeType: ShapeType = "rectangle";
  const rawType = raw["shape_type"];
  if (isString(rawType) && (SHAPE_TYPES as readonly string[]).includes(rawType)) {
    shapeType = rawType as ShapeType;
  }

  const flags: Record<string, boolean> = {};
  const rawFlags = raw["flags"];
  if (isRecord(rawFlags)) {
    for (const [k, v] of Object.entries(rawFlags)) {
      if (isBoolean(v)) flags[k] = v;
    }
  }

  const description = isString(raw["description"]) ? raw["description"] : "";
  const groupId = loadGroupId(raw["group_id"], errors);
  const mask = raw["mask"] === null || raw["mask"] === undefined
    ? null
    : isString(raw["mask"])
      ? raw["mask"]
      : null;
  if (raw["mask"] !== null && raw["mask"] !== undefined && !isString(raw["mask"])) {
    errors.push({ field: "mask", message: "mask must be a base64-encoded string or null" });
  }

  const nodeId = isString(raw["node_id"]) ? raw["node_id"] : "";
  const typeVal = isString(raw["type"]) ? raw["type"] : label;

  const oldTranscription = isString(raw["transcription"]) ? raw["transcription"] : "";
  const transcriptionRaw = isString(raw["transcription_raw"]) ? raw["transcription_raw"] : "";
  const transcriptionSemantic = isString(raw["transcription_semantic"])
    ? raw["transcription_semantic"]
    : oldTranscription;

  const attributes = loadAttributes(raw["attributes"]);

  let edges: Edge[] = [];
  const rawEdges = raw["edges"];
  if (Array.isArray(rawEdges)) {
    edges = rawEdges
      .filter(isRecord)
      .map((e) => ({
        target: isString(e["target"]) ? e["target"] : "",
        relation: isString(e["relation"]) ? e["relation"] : "",
      }))
      .filter((e) => e.target !== "");
  }

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
      transcription_raw: transcriptionRaw,
      transcription_semantic: transcriptionSemantic,
      attributes,
      edges,
      other_data: otherData,
    },
    errors,
  };
}
