import type { ShapeData } from "@/types/labelFile";

const BASE = "/api";
const TOKEN_KEY = "labelme_web_token";

export type UserRole = "admin" | "annotator" | "reviewer";
export type TaskStatus = "unassigned" | "assigned" | "in_progress" | "submitted" | "reviewed" | "rejected";

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

export async function listUsers(): Promise<CollabUser[]> {
  return apiJson("/users");
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

export async function deleteProject(projectId: number): Promise<void> {
  await apiJson(`/projects/${projectId}`, { method: "DELETE" });
}

export async function deleteDataset(datasetId: number): Promise<void> {
  await apiJson(`/datasets/${datasetId}`, { method: "DELETE" });
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

export async function assignTask(taskId: number, assigneeId: number | null): Promise<TaskItem> {
  return apiJson(`/tasks/${taskId}/assign`, {
    method: "POST",
    body: JSON.stringify({ assignee_id: assigneeId }),
  });
}

export async function bulkAssignTasks(taskIds: number[], assigneeId: number | null): Promise<TaskItem[]> {
  return apiJson("/tasks/bulk-assign", {
    method: "POST",
    body: JSON.stringify({ task_ids: taskIds, assignee_id: assigneeId }),
  });
}

export async function claimTask(taskId: number): Promise<TaskItem> {
  return startTask(taskId);
}

export async function startTask(taskId: number): Promise<TaskItem> {
  return apiJson(`/tasks/${taskId}/start`, { method: "POST" });
}

export async function releaseTask(taskId: number): Promise<TaskItem> {
  return apiJson(`/tasks/${taskId}/release`, { method: "POST" });
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

export async function reviewTask(taskId: number): Promise<TaskItem> {
  return apiJson(`/tasks/${taskId}/review`, { method: "POST" });
}

export async function rejectTask(taskId: number): Promise<TaskItem> {
  return apiJson(`/tasks/${taskId}/reject`, { method: "POST" });
}

export async function listTaskVersions(taskId: number): Promise<AnnotationVersion[]> {
  return apiJson(`/tasks/${taskId}/versions`);
}

export function collabImageUrl(imageId: number): string {
  const token = getStoredToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${BASE}/images/${imageId}/file${query}`;
}

export function canAssignTask(task: TaskItem | null, user: CollabUser | null): boolean {
  return Boolean(task && user?.role === "admin" && !task.locked_by && task.status !== "reviewed");
}

export function canStartTask(task: TaskItem | null, user: CollabUser | null): boolean {
  return Boolean(
    task &&
      user?.role === "annotator" &&
      task.assignee_id === user.id &&
      (task.locked_by === null || task.locked_by === user.id) &&
      (task.status === "assigned" || task.status === "submitted" || task.status === "rejected"),
  );
}

export function canEditTask(task: TaskItem | null, user: CollabUser | null): boolean {
  return Boolean(task && user?.role === "annotator" && task.locked_by === user.id && task.status === "in_progress");
}

export function canReleaseTask(task: TaskItem | null, user: CollabUser | null): boolean {
  return Boolean(
    task &&
    task.locked_by !== null &&
    (
      (user?.role === "annotator" && task.locked_by === user.id && task.status === "in_progress") ||
      user?.role === "admin"
    ),
  );
}

export function canSubmitTask(task: TaskItem | null, user: CollabUser | null): boolean {
  return canEditTask(task, user);
}

export function canReviewTask(task: TaskItem | null, user: CollabUser | null): boolean {
  return Boolean(task && user?.role === "reviewer" && task.status === "submitted");
}

export function canRejectTask(task: TaskItem | null, user: CollabUser | null): boolean {
  return canReviewTask(task, user);
}

export function taskActionLabel(task: TaskItem, user: CollabUser | null): string {
  if (!user) return "只读查看";
  if (canEditTask(task, user)) return "已锁定，可编辑";
  if (canStartTask(task, user)) return "打开查看，可手动锁定";
  if (user.role === "admin" && task.locked_by !== null) return "管理员可解锁";
  if (user.role === "annotator" && task.assignee_id === user.id) return "打开查看";
  if (user.role === "admin") return "查看/分配";
  return "只读查看";
}

export function taskStatusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    unassigned: "未分配",
    assigned: "已分配",
    in_progress: "标注中",
    submitted: "已提交",
    reviewed: "已审核",
    rejected: "已打回",
  };
  return labels[status] ?? status;
}

export function friendlyApiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("403") || message.includes("Permission denied") || message.includes("Role required")) {
    return "当前账号角色无权执行此操作，请切换到有权限的账号。";
  }
  if (message.includes("401") || message.includes("Authentication required") || message.includes("Invalid or expired token")) {
    return "登录状态已失效，请重新登录。";
  }
  if (message.includes("not assigned")) {
    return "该任务没有分配给当前账号，不能开始标注。";
  }
  if (message.includes("409") || message.includes("locked")) {
    return "任务已被锁定或当前状态不允许该操作。";
  }
  if (message.includes("Username already exists")) {
    return "用户名已存在，请换一个用户名。";
  }
  return message;
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
    throw new Error(`${res.status} ${detail || res.statusText}`);
  }
  return res.json();
}
