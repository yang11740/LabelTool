import type { ShapeData } from "@/types/labelFile";

const BASE = "/api";

// ── types ──

export interface ImageInfo {
  name: string;
  path: string;
  has_label: boolean;
}

export interface LabelReadResponse {
  version?: string;
  flags?: Record<string, boolean>;
  shapes: ShapeData[];
  imagePath?: string;
  imageData?: string | null;
  imageHeight: number;
  imageWidth: number;
}

export interface LabelSaveRequest {
  shapes: ShapeData[];
  imageHeight: number;
  imageWidth: number;
  version?: string;
  flags?: Record<string, boolean>;
  imagePath?: string;
  imageData?: string | null;
}

// ── API helpers ──

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface WorkspaceInfo {
  workspace_root: string;
  configured: boolean;
}

// ── endpoints ──

export async function getWorkspace(): Promise<WorkspaceInfo> {
  return apiGet<WorkspaceInfo>(`${BASE}/workspace`);
}

export async function scanDirectory(dirPath: string): Promise<ImageInfo[]> {
  const data = await apiGet<{ images: ImageInfo[] }>(
    `${BASE}/dir?path=${encodeURIComponent(dirPath)}`,
  );
  return data.images;
}

export function getImageUrl(imagePath: string): string {
  return `${BASE}/image?path=${encodeURIComponent(imagePath)}`;
}

export async function readLabel(imagePath: string): Promise<LabelReadResponse> {
  return apiGet<LabelReadResponse>(
    `${BASE}/label?path=${encodeURIComponent(imagePath)}`,
  );
}

export async function saveLabel(
  imagePath: string,
  payload: LabelSaveRequest,
): Promise<void> {
  const res = await fetch(
    `${BASE}/label?path=${encodeURIComponent(imagePath)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
}
