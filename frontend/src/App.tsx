import { useCallback, useEffect, useRef, useState } from "react";
import Canvas from "./components/Canvas";
import type { CanvasHandle, DrawMode } from "./components/Canvas";
import DirBrowser from "./components/DirBrowser";
import PropertyPanel from "./components/PropertyPanel";
import ShapeList from "./components/ShapeList";
import { saveLabel } from "./api";
import {
  canEditTask,
  claimTask,
  collabImageUrl,
  createDataset,
  createProject,
  createUser,
  getMe,
  getStoredToken,
  login,
  listDatasets,
  listProjects,
  listTasks,
  readTaskAnnotation,
  saveTaskAnnotation,
  submitTask,
  uploadImages,
  type CollabUser,
  type Dataset,
  type Project,
  type TaskItem,
  type UserRole,
  type UploadSummary,
} from "./api/collabApi";
import { useToast } from "./context/ToastContext";
import { buildLabelmeJson, downloadJson, exportStageImage } from "./utils/export";
import {
  createEmptyHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type HistoryState,
} from "./utils/history";
import {
  saveLocalWorkspaceAnnotation,
  type LoadedLocalWorkspaceImage,
  type LocalWorkspaceImage,
} from "./utils/localWorkspace";
import { replaceShapeNodeId } from "./utils/shapeFactory";
import { validateShapesForSave } from "./utils/validation";
import type { ShapeData } from "./types/labelFile";

type SaveStatus = "saved" | "dirty" | "saving" | "error";
type WorkspaceMode = "local" | "collab";

const TOOLS: { mode: DrawMode; label: string }[] = [
  { mode: "select", label: "选择" },
  { mode: "draw_rect", label: "矩形" },
  { mode: "draw_polygon", label: "多边形" },
  { mode: "draw_point", label: "点" },
  { mode: "draw_line", label: "线段" },
  { mode: "draw_circle", label: "圆" },
  { mode: "draw_linestrip", label: "折线" },
];

export default function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("local");
  const [user, setUser] = useState<CollabUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [currentTask, setCurrentTask] = useState<TaskItem | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [taskStatusFilter, setTaskStatusFilter] = useState("");
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState("");

  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<DrawMode>("select");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState("image.jpg");
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [currentImagePath, setCurrentImagePath] = useState<string | null>(null);
  const [currentLocalImage, setCurrentLocalImage] = useState<LocalWorkspaceImage | null>(null);
  const [savedImage, setSavedImage] = useState<LocalWorkspaceImage | null>(null);
  const [canvasKey, setCanvasKey] = useState("empty");
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [history, setHistory] = useState<HistoryState>(() => createEmptyHistory());

  const canvasRef = useRef<CanvasHandle>(null);
  const { toast } = useToast();
  const readOnly = workspaceMode === "collab" && currentTask !== null && !canEditTask(currentTask, user);

  const resetEditor = useCallback(() => {
    setShapes([]);
    setSelectedId(null);
    setMode("select");
    setImageSrc(null);
    setImageSize(null);
    setCurrentImagePath(null);
    setCurrentLocalImage(null);
    setCurrentTask(null);
    setCanvasKey("empty");
    setHistory(createEmptyHistory());
    setDirty(false);
    setSaveStatus("saved");
  }, []);

  const replaceShapes = useCallback((next: ShapeData[], isDirty = true) => {
    setShapes(next);
    setDirty(isDirty);
    setSaveStatus(isDirty ? "dirty" : "saved");
  }, []);

  const commitShapes = useCallback(
    (next: ShapeData[], historyBase = shapes) => {
      if (readOnly) return;
      setHistory((current) => pushHistory(current, historyBase));
      replaceShapes(next, true);
    },
    [readOnly, replaceShapes, shapes],
  );

  const previewShapes = useCallback((next: ShapeData[]) => {
    if (readOnly) return;
    setShapes(next);
    setDirty(true);
    setSaveStatus("dirty");
  }, [readOnly]);

  const refreshProjects = useCallback(async () => {
    setProjects(await listProjects());
  }, []);

  const refreshDatasets = useCallback(async (project: Project) => {
    setDatasets(await listDatasets(project.id));
  }, []);

  const refreshTasks = useCallback(async (dataset: Dataset) => {
    setTasks(await listTasks(dataset.id));
  }, []);

  useEffect(() => {
    if (workspaceMode === "collab" && user) void refreshProjects();
  }, [refreshProjects, user, workspaceMode]);

  useEffect(() => {
    if (!getStoredToken()) return;
    getMe()
      .then(setUser)
      .catch(() => undefined);
  }, []);

  const saveCurrentJson = useCallback(async (): Promise<boolean> => {
    if (!imageSrc || !imageSize) return true;
    if (readOnly) {
      toast("error", "当前任务未由你锁定，不能保存");
      return false;
    }

    const validation = validateShapesForSave(shapes);
    if (!validation.ok) {
      setSaveStatus("error");
      toast("error", `保存前校验失败：${validation.errors.slice(0, 3).join("；")}`);
      return false;
    }

    setSaveStatus("saving");
    try {
      if (workspaceMode === "collab" && currentTask && user) {
        await saveTaskAnnotation(currentTask.id, {
          shapes,
          imageHeight: imageSize.height,
          imageWidth: imageSize.width,
        });
      } else if (currentLocalImage) {
        const saved = await saveLocalWorkspaceAnnotation(
          currentLocalImage,
          shapes,
          imageSize.width,
          imageSize.height,
        );
        setCurrentLocalImage(saved);
        setSavedImage(saved);
      } else if (currentImagePath) {
        await saveLabel(currentImagePath, {
          shapes,
          imageHeight: imageSize.height,
          imageWidth: imageSize.width,
        });
      } else {
        const json = buildLabelmeJson(shapes, imageFileName, imageSize.width, imageSize.height);
        downloadJson(json, imageFileName.replace(/\.[^.]+$/, "") + ".json");
      }

      setDirty(false);
      setSaveStatus("saved");
      toast("success", "JSON 已保存");
      return true;
    } catch (e) {
      setSaveStatus("error");
      toast("error", `保存失败：${(e as Error).message}`);
      return false;
    }
  }, [currentImagePath, currentLocalImage, currentTask, imageFileName, imageSize, imageSrc, readOnly, shapes, toast, user, workspaceMode]);

  const confirmBeforeImageChange = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (window.confirm("当前标注有未保存修改，是否保存后继续？")) return saveCurrentJson();
    if (window.confirm("是否放弃当前未保存修改？")) {
      setDirty(false);
      setSaveStatus("saved");
      return true;
    }
    return false;
  }, [dirty, saveCurrentJson]);

  const handleLocalImageLoad = useCallback((result: LoadedLocalWorkspaceImage) => {
    setWorkspaceMode("local");
    setImageSrc((previous) => {
      if (previous?.startsWith("blob:") && previous !== result.imageSrc) URL.revokeObjectURL(previous);
      return result.imageSrc;
    });
    setImageFileName(result.imageFileName);
    setImageSize({ width: result.imageWidth, height: result.imageHeight });
    setShapes(result.shapes);
    setSelectedId(null);
    setMode("select");
    setCurrentImagePath(null);
    setCurrentLocalImage(result.image);
    setCurrentTask(null);
    setCanvasKey(`${result.imageFileName}:${result.imageSrc}`);
    setHistory(createEmptyHistory());
    setDirty(false);
    setSaveStatus("saved");
  }, []);

  const openTask = useCallback(async (task: TaskItem) => {
    if (!(await confirmBeforeImageChange())) return;
    const annotation = await readTaskAnnotation(task.id);
    setWorkspaceMode("collab");
    setCurrentTask(task);
    setCurrentLocalImage(null);
    setCurrentImagePath(null);
    setImageSrc(collabImageUrl(task.image_id));
    setImageFileName(task.image_name);
    setImageSize({ width: annotation.imageWidth || task.image_width, height: annotation.imageHeight || task.image_height });
    setShapes(annotation.shapes);
    setSelectedId(null);
    setMode("select");
    setCanvasKey(`task:${task.id}:${annotation.version_index}`);
    setHistory(createEmptyHistory());
    setDirty(false);
    setSaveStatus("saved");
  }, [confirmBeforeImageChange]);

  const handleClaimTask = useCallback(async (task: TaskItem) => {
    if (!user) return;
    try {
      const claimed = await claimTask(task.id);
      setTasks((current) => current.map((item) => (item.id === claimed.id ? claimed : item)));
      await openTask(claimed);
    } catch (e) {
      toast("error", `领取失败：${(e as Error).message}`);
    }
  }, [openTask, toast, user]);

  const handleSubmitTask = useCallback(async () => {
    if (!currentTask || !user) return;
    const saved = await saveCurrentJson();
    if (!saved) return;
    const submitted = await submitTask(currentTask.id);
    setCurrentTask(submitted);
    setTasks((current) => current.map((item) => (item.id === submitted.id ? submitted : item)));
    toast("success", "任务已提交");
  }, [currentTask, saveCurrentJson, toast, user]);

  const handleShapeUpdate = useCallback(
    (updated: ShapeData) => {
      if (selectedId === null || readOnly) return;
      const next =
        updated.node_id !== selectedId
          ? replaceShapeNodeId(shapes, selectedId, updated)
          : shapes.map((shape) => (shape.node_id === selectedId ? updated : shape));
      commitShapes(next);
      setSelectedId(updated.node_id);
    },
    [commitShapes, readOnly, selectedId, shapes],
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedId === null || readOnly) return;
    commitShapes(
      shapes
        .filter((shape) => shape.node_id !== selectedId)
        .map((shape) => ({
          ...shape,
          edges: shape.edges.filter((edge) => edge.target !== selectedId),
        })),
    );
    setSelectedId(null);
  }, [commitShapes, readOnly, selectedId, shapes]);

  const handleUndo = useCallback(() => {
    if (readOnly) return;
    const step = undoHistory(history, shapes);
    if (!step.shapes) return;
    setHistory(step.history);
    setShapes(step.shapes);
    setSelectedId(null);
    setDirty(true);
    setSaveStatus("dirty");
  }, [history, readOnly, shapes]);

  const handleRedo = useCallback(() => {
    if (readOnly) return;
    const step = redoHistory(history, shapes);
    if (!step.shapes) return;
    setHistory(step.history);
    setShapes(step.shapes);
    setSelectedId(null);
    setDirty(true);
    setSaveStatus("dirty");
  }, [history, readOnly, shapes]);

  const handleExportImage = useCallback(() => {
    const stage = canvasRef.current?.getStage();
    if (!stage) return;
    exportStageImage(stage, imageFileName.replace(/\.[^.]+$/, "") + "_visual.png");
  }, [imageFileName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        void saveCurrentJson();
      } else if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
      } else if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        handleRedo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!canvasRef.current?.deleteSelectedVertex()) handleDeleteSelected();
      } else if (event.key === "Escape" && selectedId !== null) {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDeleteSelected, handleRedo, handleUndo, saveCurrentJson, selectedId]);

  const selectedShape = shapes.find((shape) => shape.node_id === selectedId) ?? null;
  const allNodeIds = shapes.map((shape) => shape.node_id).filter(Boolean);

  return (
    <div className="flex h-screen flex-col bg-stone-100 text-stone-900">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-stone-300 bg-[#f7f2e8] px-4 py-2 shadow-sm">
        <div className="min-w-48">
          <h1 className="text-lg font-semibold">古文手稿协作标注台</h1>
          <p className="text-xs text-stone-500">Labelme Web-v3 collaboration preview</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => {
              setWorkspaceMode("local");
              setCurrentTask(null);
            }}
            className={modeButton(workspaceMode === "local")}
          >
            单机模式
          </button>
          <button
            onClick={() => {
              setWorkspaceMode("collab");
              resetEditor();
            }}
            className={modeButton(workspaceMode === "collab")}
          >
            协作模式
          </button>

          {workspaceMode === "local" && (
            <DirBrowser
              currentImageName={imageSrc ? imageFileName : null}
              currentDirty={dirty}
              savedImage={savedImage}
              onBeforeImageChange={confirmBeforeImageChange}
              onLoad={handleLocalImageLoad}
            />
          )}

          {imageSrc && (
            <>
              <span className="rounded border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-600">
                {readOnly ? "只读" : statusText(saveStatus)}
              </span>
              {!readOnly &&
                TOOLS.map((tool) => (
                  <button key={tool.mode} onClick={() => setMode(tool.mode)} className={modeButton(mode === tool.mode)}>
                    {tool.label}
                  </button>
                ))}
              <button onClick={handleUndo} className={plainButton()} disabled={readOnly || history.undo.length === 0}>
                撤销
              </button>
              <button onClick={handleRedo} className={plainButton()} disabled={readOnly || history.redo.length === 0}>
                重做
              </button>
              <button onClick={handleDeleteSelected} className={dangerButton()} disabled={readOnly || selectedId === null}>
                删除
              </button>
              <button onClick={() => canvasRef.current?.fitToScreen()} className={plainButton()}>
                适配
              </button>
              <button onClick={() => canvasRef.current?.resetZoom()} className={plainButton()}>
                100%
              </button>
              <button onClick={handleExportImage} className={greenButton()}>
                导出视图
              </button>
              <button onClick={() => void saveCurrentJson()} className={primaryButton()} disabled={readOnly || saveStatus === "saving"}>
                保存 JSON
              </button>
              {workspaceMode === "collab" && currentTask && (
                <button onClick={() => void handleSubmitTask()} className={primaryButton()} disabled={readOnly || saveStatus === "saving"}>
                  提交任务
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {workspaceMode === "collab" && (
        <CollabPanel
          user={user}
          projects={projects}
          datasets={datasets}
          tasks={tasks}
          selectedProject={selectedProject}
          selectedDataset={selectedDataset}
          currentTask={currentTask}
          uploadSummary={uploadSummary}
          taskStatusFilter={taskStatusFilter}
          taskAssigneeFilter={taskAssigneeFilter}
          onLogin={async (username, password) => setUser(await login(username, password))}
          onCreateUser={async (username, password, role) => {
            await createUser(username, password, role);
            toast("success", "用户已创建");
          }}
          onCreateProject={async (name) => {
            const project = await createProject(name);
            await refreshProjects();
            setSelectedProject(project);
            await refreshDatasets(project);
          }}
          onSelectProject={async (project) => {
            setSelectedProject(project);
            setSelectedDataset(null);
            setTasks([]);
            await refreshDatasets(project);
          }}
          onCreateDataset={async (name) => {
            if (!selectedProject) return;
            const dataset = await createDataset(selectedProject.id, name);
            await refreshDatasets(selectedProject);
            setSelectedDataset(dataset);
            await refreshTasks(dataset);
          }}
          onSelectDataset={async (dataset) => {
            setSelectedDataset(dataset);
            await refreshTasks(dataset);
          }}
          onUploadImages={async (files) => {
            if (!selectedDataset) return;
            const summary = await uploadImages(selectedDataset.id, files);
            setUploadSummary(summary);
            await refreshTasks(selectedDataset);
          }}
          onTaskFilterChange={async (status, assignee) => {
            setTaskStatusFilter(status);
            setTaskAssigneeFilter(assignee);
            if (selectedDataset) setTasks(await listTasks(selectedDataset.id, status, assignee));
          }}
          onClaimTask={handleClaimTask}
          onOpenTask={openTask}
        />
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 overflow-hidden border-r border-stone-300 bg-[#fbf8f0]">
          <ShapeList shapes={shapes} selectedId={selectedId} onSelectShape={setSelectedId} />
        </aside>

        <main className="flex flex-1 items-start justify-center overflow-hidden bg-[#d8d1c4] p-2">
          {imageSrc ? (
            <Canvas
              key={canvasKey}
              ref={canvasRef}
              shapes={shapes}
              selectedId={selectedId}
              mode={readOnly ? "select" : mode}
              imageSrc={imageSrc}
              imageSize={imageSize}
              onShapesChange={(next, historyBase) => commitShapes(next, historyBase)}
              onShapesPreview={previewShapes}
              onSelectShape={setSelectedId}
              onModeChange={setMode}
              readOnly={readOnly}
            />
          ) : (
            <div className="flex max-w-md flex-col items-center justify-center gap-3 self-center rounded border border-dashed border-stone-400 bg-[#f7f2e8] p-8 text-center text-stone-600">
              <p className="text-lg font-semibold text-stone-800">选择本地文件夹或进入协作任务</p>
              <p className="text-sm">单机模式继续直接读写同名 JSON；协作模式会从后端任务和数据库加载图片与标注。</p>
            </div>
          )}
        </main>

        <aside className="w-80 shrink-0 overflow-hidden border-l border-stone-300 bg-stone-50">
          <PropertyPanel shape={selectedShape} allNodeIds={allNodeIds} onShapeUpdate={handleShapeUpdate} />
        </aside>
      </div>
    </div>
  );
}

function CollabPanel({
  user,
  projects,
  datasets,
  tasks,
  selectedProject,
  selectedDataset,
  currentTask,
  uploadSummary,
  taskStatusFilter,
  taskAssigneeFilter,
  onLogin,
  onCreateUser,
  onCreateProject,
  onSelectProject,
  onCreateDataset,
  onSelectDataset,
  onUploadImages,
  onTaskFilterChange,
  onClaimTask,
  onOpenTask,
}: {
  user: CollabUser | null;
  projects: Project[];
  datasets: Dataset[];
  tasks: TaskItem[];
  selectedProject: Project | null;
  selectedDataset: Dataset | null;
  currentTask: TaskItem | null;
  uploadSummary: UploadSummary | null;
  taskStatusFilter: string;
  taskAssigneeFilter: string;
  onLogin: (username: string, password: string) => Promise<void>;
  onCreateUser: (username: string, password: string, role: UserRole) => Promise<void>;
  onCreateProject: (name: string) => Promise<void>;
  onSelectProject: (project: Project) => Promise<void>;
  onCreateDataset: (name: string) => Promise<void>;
  onSelectDataset: (dataset: Dataset) => Promise<void>;
  onUploadImages: (files: File[]) => Promise<void>;
  onTaskFilterChange: (status: string, assignee: string) => Promise<void>;
  onClaimTask: (task: TaskItem) => Promise<void>;
  onOpenTask: (task: TaskItem) => Promise<void>;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("annotator");
  const [projectName, setProjectName] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  if (!user) {
    return (
      <section className="flex shrink-0 items-center gap-2 border-b border-stone-300 bg-stone-50 px-4 py-2">
        <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass()} placeholder="用户名" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass()} placeholder="密码" type="password" />
        <button onClick={() => void onLogin(username, password)} className={primaryButton()}>
          登录协作平台
        </button>
        <span className="text-xs text-stone-500">首次登录会创建第一个管理员账号。</span>
      </section>
    );
  }

  return (
    <section className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-300 bg-stone-50 px-4 py-2 text-sm">
      <span className="font-medium">{user.username} / {user.role}</span>
      {user.role === "admin" && (
        <>
          <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className={inputClass()} placeholder="新用户名" />
          <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass()} placeholder="新用户密码" type="password" />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} className={inputClass("w-32")}>
            <option value="annotator">annotator</option>
            <option value="reviewer">reviewer</option>
            <option value="admin">admin</option>
          </select>
          <button onClick={() => newUsername && newPassword && void onCreateUser(newUsername, newPassword, newRole)} className={plainButton()}>
            创建用户
          </button>
        </>
      )}
      <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputClass()} placeholder="新项目名" />
      <button onClick={() => projectName && void onCreateProject(projectName)} className={plainButton()}>
        创建项目
      </button>
      <select value={selectedProject?.id ?? ""} onChange={(e) => {
        const project = projects.find((item) => item.id === Number(e.target.value));
        if (project) void onSelectProject(project);
      }} className={inputClass()}>
        <option value="">选择项目</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      {selectedProject && (
        <>
          <input value={datasetName} onChange={(e) => setDatasetName(e.target.value)} className={inputClass()} placeholder="新数据集名" />
          <button onClick={() => datasetName && void onCreateDataset(datasetName)} className={plainButton()}>
            创建数据集
          </button>
          <select value={selectedDataset?.id ?? ""} onChange={(e) => {
            const dataset = datasets.find((item) => item.id === Number(e.target.value));
            if (dataset) void onSelectDataset(dataset);
          }} className={inputClass()}>
            <option value="">选择数据集</option>
            {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
          </select>
        </>
      )}
      {selectedDataset && (
        <>
          {user.role === "admin" && (
            <>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setSelectedFiles(Array.from(e.target.files ?? []))}
                className={inputClass("w-72")}
              />
              <button onClick={() => selectedFiles.length > 0 && void onUploadImages(selectedFiles)} className={plainButton()}>
                上传图片
              </button>
            </>
          )}
          {uploadSummary && <span>上传 {uploadSummary.imported}，跳过 {uploadSummary.skipped}，错误 {uploadSummary.errors.length}</span>}
          <select value={taskStatusFilter} onChange={(e) => void onTaskFilterChange(e.target.value, taskAssigneeFilter)} className={inputClass("w-32")}>
            <option value="">全部状态</option>
            <option value="unassigned">未领取</option>
            <option value="in_progress">进行中</option>
            <option value="submitted">已提交</option>
            <option value="reviewed">已审核</option>
            <option value="rejected">已打回</option>
          </select>
          <select value={taskAssigneeFilter} onChange={(e) => void onTaskFilterChange(taskStatusFilter, e.target.value)} className={inputClass("w-28")}>
            <option value="">全部人</option>
            <option value="me">我的</option>
          </select>
          <span>任务 {tasks.length}</span>
          <select value={currentTask?.id ?? ""} onChange={(e) => {
            const task = tasks.find((item) => item.id === Number(e.target.value));
            if (task) void onOpenTask(task);
          }} className={inputClass("w-56")}>
            <option value="">打开任务</option>
            {tasks.map((task) => <option key={task.id} value={task.id}>{task.image_name} / {task.status}</option>)}
          </select>
          {tasks.slice(0, 3).map((task) => (
            <button key={task.id} onClick={() => void onClaimTask(task)} className={plainButton()}>
              领取 {task.image_name}
            </button>
          ))}
        </>
      )}
    </section>
  );
}

function statusText(status: SaveStatus): string {
  if (status === "saving") return "保存中";
  if (status === "dirty") return "未保存";
  if (status === "error") return "保存失败";
  return "已保存";
}

function modeButton(active: boolean): string {
  return `rounded border px-3 py-1.5 text-sm font-medium ${
    active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
  }`;
}

function plainButton(): string {
  return "rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50";
}

function primaryButton(): string {
  return "rounded border border-amber-800 bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-50";
}

function greenButton(): string {
  return "rounded border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800";
}

function dangerButton(): string {
  return "rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";
}

function inputClass(extra = "w-40"): string {
  return `${extra} rounded border border-stone-300 bg-white px-2 py-1.5 text-sm`;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}
