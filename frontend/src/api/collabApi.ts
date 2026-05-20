import type { ShapeData } from "@/types/labelFile";

const BASE = "/api";
const TOKEN_KEY = "labelme_web_token";

export type UserRole = "admin" | "annotator" | "reviewer";
export type TaskStatus = "unassigned" | "in_progress" | "submitted" | "reviewed" | "rejected";

export interface CollabUser {
  id: number;
  username: string;
  role: UserRole;
}

export interface Project {
  id: number;
  name: string;
  description: string;
}

export interface Dataset {
  id: number;
  project_id: number;
  name: string;
  description: string;
}

export interface UploadSummary {
  imported: number;
  skipped: number;
  errors: string[];
  images: ImageAsset[];
}

export interface ImageAsset {
  id: number;
  dataset_id: number;
  file_name: string;
  width: number;
  height: number;
}

export interface TaskItem {
  id: number;
  status: TaskStatus;
  assignee_id: number | null;
  locked_by: number | null;
  image_id: number;
  image_name: string;
  image_width: number;
  image_height: number;
  dataset_id: number;
}

export interface TaskAnnotation {
  shapes: ShapeData[];
  imageHeight: number;
  imageWidth: number;
  version_index: number;
}

export interface AnnotationVersion {
  version_index: number;
  content_json: { shapes: ShapeData[]; imageHeight: number; imageWidth: number };
  created_by: number | null;
  created_at: string | null;
}

export function getStoredToken(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setStoredToken(token: string): void {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function login(username: string, password: string): Promise<CollabUser> {
  const data = await apiJson<{ token: string; user: CollabUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setStoredToken(data.token);
  return data.user;
}

export async function logout(): Promise<void> {
  await apiJson("/auth/logout", { method: "POST" });
  setStoredToken("");
}

export async function getMe(): Promise<CollabUser> {
  return apiJson("/auth/me");
}

export async function createUser(username: string, password: string, role: UserRole): Promise<CollabUser> {
  return apiJson("/users", {
    method: "POST",
    body: JSON.stringify({ username, password, role }),
  });
}

export async function listProjects(): Promise<Project[]> {
  return apiJson("/projects");
}

export async function createProject(name: string, description = ""): Promise<Project> {
  return apiJson("/projects", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export async function listDatasets(projectId: number): Promise<Dataset[]> {
  return apiJson(`/projects/${projectId}/datasets`);
}

export async function createDataset(projectId: number, name: string, description = ""): Promise<Dataset> {
  return apiJson(`/projects/${projectId}/datasets`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export async function uploadImages(datasetId: number, files: File[]): Promise<UploadSummary> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return apiJson(`/datasets/${datasetId}/upload-images`, {
    method: "POST",
    body: form,
    skipJsonHeader: true,
  });
}

export async function listImages(datasetId: number): Promise<ImageAsset[]> {
  return apiJson(`/datasets/${datasetId}/images`);
}

export async function listTasks(datasetId: number, status = "", assignee = ""): Promise<TaskItem[]> {
  const query = new URLSearchParams({ dataset_id: String(datasetId) });
  if (status) query.set("status", status);
  if (assignee) query.set("assignee", assignee);
  return apiJson(`/tasks?${query.toString()}`);
}

export async function claimTask(taskId: number): Promise<TaskItem> {
  return apiJson(`/tasks/${taskId}/claim`, { method: "POST" });
}

export async function readTaskAnnotation(taskId: number): Promise<TaskAnnotation> {
  return apiJson(`/tasks/${taskId}/annotation`);
}

export async function saveTaskAnnotation(
  taskId: number,
  payload: { shapes: ShapeData[]; imageHeight: number; imageWidth: number },
): Promise<TaskAnnotation> {
  return apiJson(`/tasks/${taskId}/annotation`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function submitTask(taskId: number): Promise<TaskItem> {
  return apiJson(`/tasks/${taskId}/submit`, { method: "POST" });
}

export async function listTaskVersions(taskId: number): Promise<AnnotationVersion[]> {
  return apiJson(`/tasks/${taskId}/versions`);
}

export function collabImageUrl(imageId: number): string {
  const token = getStoredToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${BASE}/images/${imageId}/file${query}`;
}

export function canEditTask(task: TaskItem | null, user: CollabUser | null): boolean {
  return Boolean(task && user && task.locked_by === user.id && task.status === "in_progress");
}

type ApiInit = RequestInit & { skipJsonHeader?: boolean };

async function apiJson<T>(path: string, init: ApiInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (!init.skipJsonHeader) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...init.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}
