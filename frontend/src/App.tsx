import { useCallback, useEffect, useRef, useState } from "react";
import Canvas from "./components/Canvas";
import type { CanvasHandle, DrawMode } from "./components/Canvas";
import DirBrowser from "./components/DirBrowser";
import PropertyPanel from "./components/PropertyPanel";
import ShapeList from "./components/ShapeList";
import { saveLabel } from "./api";
import {
  assignTask,
  bulkAssignTasks,
  canAssignTask,
  canEditTask,
  canRejectTask,
  canReleaseTask,
  canReviewTask,
  canStartTask,
  canSubmitTask,
  collabImageUrl,
  createDataset,
  createProject,
  createUser,
  deleteDataset,
  deleteProject,
  friendlyApiError,
  getMe,
  getStoredToken,
  listDatasets,
  listProjects,
  listTasks,
  listUsers,
  login,
  logout,
  readTaskAnnotation,
  rejectTask,
  releaseTask,
  reviewTask,
  saveTaskAnnotation,
  setStoredToken,
  startTask,
  submitTask,
  taskActionLabel,
  taskStatusLabel,
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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("collab");
  const [user, setUser] = useState<CollabUser | null>(null);
  const [users, setUsers] = useState<CollabUser[]>([]);
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

  const resetCollabState = useCallback(() => {
    setUsers([]);
    setProjects([]);
    setDatasets([]);
    setTasks([]);
    setSelectedProject(null);
    setSelectedDataset(null);
    setUploadSummary(null);
    setTaskStatusFilter("");
    setTaskAssigneeFilter("");
    resetEditor();
  }, [resetEditor]);

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

  const previewShapes = useCallback(
    (next: ShapeData[]) => {
      if (readOnly) return;
      setShapes(next);
      setDirty(true);
      setSaveStatus("dirty");
    },
    [readOnly],
  );

  const refreshProjects = useCallback(async () => {
    setProjects(await listProjects());
  }, []);

  const refreshUsers = useCallback(async (currentUser = user) => {
    if (currentUser?.role === "admin") setUsers(await listUsers());
    else setUsers([]);
  }, [user]);

  const refreshDatasets = useCallback(async (project: Project) => {
    setDatasets(await listDatasets(project.id));
  }, []);

  const refreshTasks = useCallback(
    async (dataset: Dataset, status = taskStatusFilter, assignee = taskAssigneeFilter) => {
      setTasks(await listTasks(dataset.id, status, assignee));
    },
    [taskAssigneeFilter, taskStatusFilter],
  );

  useEffect(() => {
    if (workspaceMode !== "collab" || !user) return;
    void refreshProjects();
    void refreshUsers(user);
  }, [refreshProjects, refreshUsers, user, workspaceMode]);

  useEffect(() => {
    if (!getStoredToken()) return;
    getMe()
      .then((restored) => {
        setUser(restored);
        setWorkspaceMode("collab");
      })
      .catch(() => {
        setStoredToken("");
        setUser(null);
      });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      setStoredToken("");
    }
    setUser(null);
    resetCollabState();
    setWorkspaceMode("collab");
    toast("success", "已退出登录");
  }, [resetCollabState, toast]);

  const saveCurrentJson = useCallback(async (): Promise<boolean> => {
    if (!imageSrc || !imageSize) return true;
    if (readOnly) {
      toast("error", "当前为只读查看。请先点击“开始标注”锁定任务后再保存。");
      return false;
    }

    const validation = validateShapesForSave(shapes);
    if (!validation.ok) {
      setSaveStatus("error");
      toast("error", `保存校验失败：${validation.errors.slice(0, 3).join("；")}`);
      return false;
    }

    setSaveStatus("saving");
    try {
      if (workspaceMode === "collab" && currentTask) {
        await saveTaskAnnotation(currentTask.id, {
          shapes,
          imageHeight: imageSize.height,
          imageWidth: imageSize.width,
        });
      } else if (currentLocalImage) {
        const saved = await saveLocalWorkspaceAnnotation(currentLocalImage, shapes, imageSize.width, imageSize.height);
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
      toast("error", friendlyApiError(e));
      return false;
    }
  }, [currentImagePath, currentLocalImage, currentTask, imageFileName, imageSize, imageSrc, readOnly, shapes, toast, workspaceMode]);

  const confirmBeforeImageChange = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (window.confirm("当前图片有未保存修改，是否先保存再切换？")) return saveCurrentJson();
    if (window.confirm("是否放弃未保存修改并继续切换？")) {
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

  const openTask = useCallback(
    async (task: TaskItem) => {
      if (!(await confirmBeforeImageChange())) return;
      try {
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
        setCanvasKey(`task:${task.id}:${annotation.version_index}:${task.locked_by ?? "readonly"}`);
        setHistory(createEmptyHistory());
        setDirty(false);
        setSaveStatus("saved");
      } catch (e) {
        toast("error", friendlyApiError(e));
      }
    },
    [confirmBeforeImageChange, toast],
  );

  const handleStartTask = useCallback(
    async (task: TaskItem) => {
      if (!user || !canStartTask(task, user)) {
        await openTask(task);
        return;
      }
      try {
        const started = await startTask(task.id);
        setTasks((current) => current.map((item) => (item.id === started.id ? started : item)));
        await openTask(started);
      } catch (e) {
        toast("error", friendlyApiError(e));
      }
    },
    [openTask, toast, user],
  );

  const handleReleaseTask = useCallback(async () => {
    if (!currentTask || !user || !canReleaseTask(currentTask, user)) return;
    if (dirty) {
      const saved = await saveCurrentJson();
      if (!saved) return;
    }
    try {
      const released = await releaseTask(currentTask.id);
      setCurrentTask(released);
      setTasks((current) => current.map((item) => (item.id === released.id ? released : item)));
      setCanvasKey(`task:${released.id}:${released.locked_by ?? "readonly"}`);
      setMode("select");
      toast("success", "已解锁，当前任务回到只读查看");
    } catch (e) {
      toast("error", friendlyApiError(e));
    }
  }, [currentTask, dirty, saveCurrentJson, toast, user]);

  const handleAssignTasks = useCallback(
    async (taskIds: number[], assigneeId: number | null) => {
      if (!selectedDataset || taskIds.length === 0) return;
      try {
        const updated = taskIds.length === 1
          ? [await assignTask(taskIds[0], assigneeId)]
          : await bulkAssignTasks(taskIds, assigneeId);
        const byId = new Map(updated.map((task) => [task.id, task]));
        setTasks((current) => current.map((task) => byId.get(task.id) ?? task));
        setCurrentTask((current) => current ? byId.get(current.id) ?? current : current);
        await refreshTasks(selectedDataset);
        toast("success", assigneeId === null ? "已取消分配" : `已分配 ${updated.length} 个任务`);
      } catch (e) {
        toast("error", friendlyApiError(e));
      }
    },
    [refreshTasks, selectedDataset, toast],
  );

  const handleSubmitTask = useCallback(async () => {
    if (!currentTask || !user || !canSubmitTask(currentTask, user)) return;
    const saved = await saveCurrentJson();
    if (!saved) return;
    try {
      const submitted = await submitTask(currentTask.id);
      setCurrentTask(submitted);
      setTasks((current) => current.map((item) => (item.id === submitted.id ? submitted : item)));
      setCanvasKey(`task:${submitted.id}:${submitted.locked_by ?? "readonly"}`);
      toast("success", "任务已提交");
    } catch (e) {
      toast("error", friendlyApiError(e));
    }
  }, [currentTask, saveCurrentJson, toast, user]);

  const handleReviewTask = useCallback(async () => {
    if (!currentTask || !user || !canReviewTask(currentTask, user)) return;
    try {
      const reviewed = await reviewTask(currentTask.id);
      setCurrentTask(reviewed);
      setTasks((current) => current.map((item) => (item.id === reviewed.id ? reviewed : item)));
      toast("success", "任务已审核通过");
    } catch (e) {
      toast("error", friendlyApiError(e));
    }
  }, [currentTask, toast, user]);

  const handleRejectTask = useCallback(async () => {
    if (!currentTask || !user || !canRejectTask(currentTask, user)) return;
    try {
      const rejected = await rejectTask(currentTask.id);
      setCurrentTask(rejected);
      setTasks((current) => current.map((item) => (item.id === rejected.id ? rejected : item)));
      toast("success", "任务已打回");
    } catch (e) {
      toast("error", friendlyApiError(e));
    }
  }, [currentTask, toast, user]);

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
          <p className="text-xs text-stone-500">Labelme Web-v3 collaboration</p>
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

          {user && workspaceMode === "collab" && (
            <span className="rounded border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-700">
              {user.username} / {user.role}
            </span>
          )}
          {user && workspaceMode === "collab" && (
            <button onClick={() => void handleLogout()} className={plainButton()}>
              退出登录
            </button>
          )}

          {imageSrc && (
            <>
              <span className="rounded border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-600">
                {readOnly ? "只读查看" : statusText(saveStatus)}
              </span>
              {workspaceMode === "collab" && currentTask && user?.role === "annotator" && canStartTask(currentTask, user) && (
                <button onClick={() => void handleStartTask(currentTask)} className={primaryButton()}>
                  锁定编辑
                </button>
              )}
              {workspaceMode === "collab" && currentTask && canReleaseTask(currentTask, user) && (
                <button onClick={() => void handleReleaseTask()} className={plainButton()} disabled={saveStatus === "saving"}>
                  解锁
                </button>
              )}
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
              {workspaceMode === "collab" && currentTask && user?.role === "annotator" && (
                <button
                  onClick={() => void handleSubmitTask()}
                  className={primaryButton()}
                  disabled={!canSubmitTask(currentTask, user) || saveStatus === "saving"}
                >
                  提交任务
                </button>
              )}
              {workspaceMode === "collab" && currentTask && user?.role === "reviewer" && canReviewTask(currentTask, user) && (
                <>
                  <button onClick={() => void handleReviewTask()} className={greenButton()}>
                    审核通过
                  </button>
                  <button onClick={() => void handleRejectTask()} className={dangerButton()}>
                    打回重做
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </header>

      {workspaceMode === "collab" && (
        <CollabPanel
          user={user}
          users={users}
          projects={projects}
          datasets={datasets}
          tasks={tasks}
          selectedProject={selectedProject}
          selectedDataset={selectedDataset}
          currentTask={currentTask}
          uploadSummary={uploadSummary}
          taskStatusFilter={taskStatusFilter}
          taskAssigneeFilter={taskAssigneeFilter}
          onLogin={async (username, password) => {
            try {
              const loggedIn = await login(username, password);
              setUser(loggedIn);
              setWorkspaceMode("collab");
              await refreshProjects();
              await refreshUsers(loggedIn);
              toast("success", "登录成功");
            } catch (e) {
              toast("error", friendlyApiError(e));
            }
          }}
          onCreateUser={async (username, password, role) => {
            try {
              await createUser(username, password, role);
              await refreshUsers();
              toast("success", "用户创建成功");
            } catch (e) {
              toast("error", friendlyApiError(e));
              throw e;
            }
          }}
          onCreateProject={async (name) => {
            try {
              const project = await createProject(name);
              await refreshProjects();
              setSelectedProject(project);
              await refreshDatasets(project);
            } catch (e) {
              toast("error", friendlyApiError(e));
            }
          }}
          onSelectProject={async (project) => {
            setSelectedProject(project);
            setSelectedDataset(null);
            setTasks([]);
            await refreshDatasets(project);
          }}
          onCreateDataset={async (name) => {
            if (!selectedProject) return;
            try {
              const dataset = await createDataset(selectedProject.id, name);
              await refreshDatasets(selectedProject);
              setSelectedDataset(dataset);
              await refreshTasks(dataset);
            } catch (e) {
              toast("error", friendlyApiError(e));
            }
          }}
          onSelectDataset={async (dataset) => {
            setSelectedDataset(dataset);
            await refreshTasks(dataset);
          }}
          onUploadImages={async (files) => {
            if (!selectedDataset) return;
            try {
              const summary = await uploadImages(selectedDataset.id, files);
              setUploadSummary(summary);
              await refreshTasks(selectedDataset);
            } catch (e) {
              toast("error", friendlyApiError(e));
            }
          }}
          onTaskFilterChange={async (status, assignee) => {
            setTaskStatusFilter(status);
            setTaskAssigneeFilter(assignee);
            if (selectedDataset) setTasks(await listTasks(selectedDataset.id, status, assignee));
          }}
          onAssignTasks={handleAssignTasks}
          onOpenTask={openTask}
          onStartTask={handleStartTask}
          onDeleteProject={async (project) => {
            if (!window.confirm(`确定删除项目 "${project.name}" 及其所有数据集和图片？此操作不可恢复。`)) return;
            try {
              await deleteProject(project.id);
              toast("success", "项目已删除");
              setSelectedProject(null);
              setSelectedDataset(null);
              resetEditor();
              await refreshProjects();
            } catch (e) {
              toast("error", friendlyApiError(e));
            }
          }}
          onDeleteDataset={async (dataset) => {
            if (!window.confirm(`确定删除数据集 "${dataset.name}" 及其所有图片？此操作不可恢复。`)) return;
            try {
              await deleteDataset(dataset.id);
              toast("success", "数据集已删除");
              setSelectedDataset(null);
              setTasks([]);
              resetEditor();
              await refreshDatasets(selectedProject!);
            } catch (e) {
              toast("error", friendlyApiError(e));
            }
          }}
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
              <p className="text-lg font-semibold text-stone-800">请选择图片或协作任务</p>
              <p className="text-sm">单机模式可直接打开本地文件夹；协作模式由管理员上传图片并分配任务。</p>
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
  users,
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
  onAssignTasks,
  onOpenTask,
  onStartTask,
  onDeleteProject,
  onDeleteDataset,
}: {
  user: CollabUser | null;
  users: CollabUser[];
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
  onAssignTasks: (taskIds: number[], assigneeId: number | null) => Promise<void>;
  onOpenTask: (task: TaskItem) => Promise<void>;
  onStartTask: (task: TaskItem) => Promise<void>;
  onDeleteProject: (project: Project) => Promise<void>;
  onDeleteDataset: (dataset: Dataset) => Promise<void>;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("annotator");
  const [projectName, setProjectName] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState("");

  const annotators = users.filter((item) => item.role === "annotator");

  useEffect(() => {
    setSelectedTaskIds([]);
  }, [selectedDataset?.id]);

  if (!user) {
    return (
      <section className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-300 bg-stone-50 px-4 py-2">
        <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass()} placeholder="用户名" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass()} placeholder="密码" type="password" />
        <button onClick={() => void onLogin(username, password)} className={primaryButton()}>
          登录协作平台
        </button>
        <span className="text-xs text-stone-500">数据库为空时，第一个成功登录的用户会自动成为管理员。</span>
      </section>
    );
  }

  return (
    <section className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-300 bg-stone-50 px-4 py-2 text-sm">
      {user.role === "admin" && (
        <>
          <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
            管理员负责上传图片、创建用户和分配任务；标注请使用 annotator 账号。
          </span>
          <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className={inputClass()} placeholder="新用户名" />
          <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass()} placeholder="新用户密码" type="password" />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} className={inputClass("w-32")}>
            <option value="annotator">annotator</option>
            <option value="reviewer">reviewer</option>
            <option value="admin">admin</option>
          </select>
          <button
            onClick={async () => {
              if (!newUsername || !newPassword) return;
              await onCreateUser(newUsername, newPassword, newRole);
              setNewUsername("");
              setNewPassword("");
              setNewRole("annotator");
            }}
            className={plainButton()}
          >
            创建用户
          </button>
        </>
      )}

      <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputClass()} placeholder="项目名称" />
      <button onClick={() => projectName && void onCreateProject(projectName)} className={plainButton()}>
        创建项目
      </button>
      <select
        value={selectedProject?.id ?? ""}
        onChange={(e) => {
          const project = projects.find((item) => item.id === Number(e.target.value));
          if (project) void onSelectProject(project);
        }}
        className={inputClass()}
      >
        <option value="">选择项目</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      {user.role === "admin" && selectedProject && (
        <button onClick={() => void onDeleteProject(selectedProject)} className={dangerButton()}>
          删除项目
        </button>
      )}

      {selectedProject && (
        <>
          <input value={datasetName} onChange={(e) => setDatasetName(e.target.value)} className={inputClass()} placeholder="数据集名称" />
          <button onClick={() => datasetName && void onCreateDataset(datasetName)} className={plainButton()}>
            创建数据集
          </button>
          <select
            value={selectedDataset?.id ?? ""}
            onChange={(e) => {
              const dataset = datasets.find((item) => item.id === Number(e.target.value));
              if (dataset) void onSelectDataset(dataset);
            }}
            className={inputClass()}
          >
            <option value="">选择数据集</option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name}
              </option>
            ))}
          </select>
          {user.role === "admin" && selectedDataset && (
            <button onClick={() => void onDeleteDataset(selectedDataset)} className={dangerButton()}>
              删除数据集
            </button>
          )}
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
          {uploadSummary && (
            <span>
              上传 {uploadSummary.imported}，跳过 {uploadSummary.skipped}，错误 {uploadSummary.errors.length}
            </span>
          )}
          <select value={taskStatusFilter} onChange={(e) => void onTaskFilterChange(e.target.value, taskAssigneeFilter)} className={inputClass("w-32")}>
            <option value="">全部状态</option>
            <option value="unassigned">未分配</option>
            <option value="assigned">已分配</option>
            <option value="in_progress">标注中</option>
            <option value="submitted">已提交</option>
            <option value="reviewed">已审核</option>
            <option value="rejected">已打回</option>
          </select>
          <select value={taskAssigneeFilter} onChange={(e) => void onTaskFilterChange(taskStatusFilter, e.target.value)} className={inputClass("w-32")}>
            <option value="">全部分配</option>
            <option value="me">我的任务</option>
          </select>
          <span>任务 {tasks.length}</span>

          {user.role === "admin" && (
            <>
              <select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)} className={inputClass("w-40")}>
                <option value="">取消分配</option>
                {annotators.map((annotator) => (
                  <option key={annotator.id} value={annotator.id}>
                    {annotator.username}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const taskIds = [...selectedTaskIds];
                  void onAssignTasks(taskIds, bulkAssignee ? Number(bulkAssignee) : null).then(() => setSelectedTaskIds([]));
                }}
                className={plainButton()}
                disabled={selectedTaskIds.length === 0}
              >
                分配选中任务
              </button>
            </>
          )}

          <div className="flex max-w-full flex-wrap gap-1">
            {tasks.slice(0, 24).map((task) => (
              <TaskButton
                key={task.id}
                task={task}
                user={user}
                users={users}
                active={currentTask?.id === task.id}
                selected={selectedTaskIds.includes(task.id)}
                onSelect={(checked) => {
                  setSelectedTaskIds((current) => checked ? [...current, task.id] : current.filter((id) => id !== task.id));
                }}
                onAssign={(assigneeId) => void onAssignTasks([task.id], assigneeId)}
                onOpenTask={onOpenTask}
                onStartTask={onStartTask}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function TaskButton({
  task,
  user,
  users,
  active,
  selected,
  onSelect,
  onAssign,
  onOpenTask,
  onStartTask,
}: {
  task: TaskItem;
  user: CollabUser;
  users: CollabUser[];
  active: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onAssign: (assigneeId: number | null) => void;
  onOpenTask: (task: TaskItem) => Promise<void>;
  onStartTask: (task: TaskItem) => Promise<void>;
}) {
  const assigneeName = users.find((item) => item.id === task.assignee_id)?.username ?? (task.assignee_id ? `用户 ${task.assignee_id}` : "未分配");
  const lockText = task.locked_by
    ? task.locked_by === user.id
      ? "我已锁定"
      : `锁定人 ${task.locked_by}`
    : "未锁定";

  return (
    <div
      className={`min-w-44 rounded border p-2 text-xs ${
        active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"
      }`}
      title={`${task.image_name} / ${taskStatusLabel(task.status)} / ${assigneeName} / ${lockText}`}
    >
      <div className="flex items-start gap-2">
        {user.role === "admin" && canAssignTask(task, user) && (
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} />
        )}
        <button className="min-w-0 flex-1 text-left" onClick={() => void onOpenTask(task)}>
          <span className="block max-w-36 truncate font-medium">{task.image_name}</span>
          <span className="block opacity-80">{taskStatusLabel(task.status)} / {lockText}</span>
          <span className="block opacity-80">分配：{assigneeName}</span>
          <span className="block font-medium">{taskActionLabel(task, user)}</span>
        </button>
      </div>
      {user.role === "admin" && canAssignTask(task, user) && (
        <select
          value={task.assignee_id ?? ""}
          onChange={(e) => onAssign(e.target.value ? Number(e.target.value) : null)}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-1 py-1 text-stone-700"
        >
          <option value="">未分配</option>
          {users.filter((item) => item.role === "annotator").map((annotator) => (
            <option key={annotator.id} value={annotator.id}>
              {annotator.username}
            </option>
          ))}
        </select>
      )}
      {canStartTask(task, user) && (
        <button onClick={() => void onStartTask(task)} className="mt-1 w-full rounded border border-amber-800 bg-amber-800 px-2 py-1 font-medium text-white hover:bg-amber-900">
          开始标注
        </button>
      )}
    </div>
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
