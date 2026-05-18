import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Canvas from "./components/Canvas";
import type { CanvasHandle, DrawMode } from "./components/Canvas";
import DirBrowser from "./components/DirBrowser";
import PropertyPanel from "./components/PropertyPanel";
import ShapeList, { type ShapeFilter } from "./components/ShapeList";
import { saveLabel } from "./api";
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
  type FolderValidationSummary,
  type LoadedLocalWorkspaceImage,
  type LocalWorkspaceImage,
} from "./utils/localWorkspace";
import {
  addRelationEdge,
  buildReadOrderEdges,
  type AnnotationMode,
  type NodeIdStrategy,
} from "./utils/manuscriptTools";
import { replaceShapeNodeId } from "./utils/shapeFactory";
import { validateShapesForSave, type ValidationIssue } from "./utils/validation";
import type { ShapeData } from "./types/labelFile";

type SaveStatus = "saved" | "dirty" | "saving" | "error";

const TOOLS: { mode: DrawMode; label: string }[] = [
  { mode: "select", label: "选择" },
  { mode: "draw_rect", label: "矩形" },
  { mode: "draw_polygon", label: "多边形" },
  { mode: "draw_point", label: "点" },
  { mode: "draw_line", label: "线段" },
  { mode: "draw_circle", label: "圆" },
  { mode: "draw_linestrip", label: "折线" },
];

const RELATIONS = ["READS_AFTER", "ANNOTATES", "INSERTS_AT", "REPLACES", "OVERLAPS", "REPRESENTS"] as const;

export default function App() {
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<DrawMode>("select");
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>("select");
  const [continuousAnnotation, setContinuousAnnotation] = useState(false);
  const [nodeIdStrategy, setNodeIdStrategy] = useState<NodeIdStrategy>("sequential");
  const [defaultNodeType, setDefaultNodeType] = useState("");
  const [relationType, setRelationType] = useState("READS_AFTER");
  const [shapeFilter, setShapeFilter] = useState<ShapeFilter>("all");
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [folderSummary, setFolderSummary] = useState<FolderValidationSummary | null>(null);
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

  const selectedShape = shapes.find((shape) => shape.node_id === selectedId) ?? null;
  const allNodeIds = shapes.map((shape) => shape.node_id).filter(Boolean);
  const previousShape = useMemo(() => (shapes.length > 0 ? shapes[shapes.length - 1] : null), [shapes]);

  const replaceShapes = useCallback((next: ShapeData[], isDirty = true) => {
    setShapes(next);
    setDirty(isDirty);
    setSaveStatus(isDirty ? "dirty" : "saved");
    if (isDirty) setValidationIssues([]);
  }, []);

  const commitShapes = useCallback(
    (next: ShapeData[], historyBase = shapes) => {
      setHistory((current) => pushHistory(current, historyBase));
      replaceShapes(next, true);
    },
    [replaceShapes, shapes],
  );

  const previewShapes = useCallback((next: ShapeData[]) => {
    setShapes(next);
    setDirty(true);
    setSaveStatus("dirty");
    setValidationIssues([]);
  }, []);

  const saveCurrentJson = useCallback(async (): Promise<boolean> => {
    if (!imageSrc || !imageSize) return true;

    const validation = validateShapesForSave(shapes);
    setValidationIssues(validation.issues);
    if (!validation.ok) {
      setSaveStatus("error");
      toast("error", `保存前校验失败：${validation.errors.slice(0, 3).join("；")}`);
      return false;
    }

    setSaveStatus("saving");
    try {
      if (currentLocalImage) {
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
      toast("success", "标注 JSON 已保存");
      return true;
    } catch (e) {
      setSaveStatus("error");
      toast("error", `保存失败：${(e as Error).message}`);
      return false;
    }
  }, [currentImagePath, currentLocalImage, imageFileName, imageSize, imageSrc, shapes, toast]);

  const confirmBeforeImageChange = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (window.confirm("当前图片有未保存修改。是否先保存再切换？")) {
      return saveCurrentJson();
    }
    if (window.confirm("是否放弃未保存修改并继续切换？")) {
      setDirty(false);
      setSaveStatus("saved");
      return true;
    }
    return false;
  }, [dirty, saveCurrentJson]);

  const handleLocalImageLoad = useCallback((result: LoadedLocalWorkspaceImage) => {
    setImageSrc((previous) => {
      if (previous?.startsWith("blob:") && previous !== result.imageSrc) {
        URL.revokeObjectURL(previous);
      }
      return result.imageSrc;
    });
    setImageFileName(result.imageFileName);
    setImageSize({ width: result.imageWidth, height: result.imageHeight });
    setShapes(result.shapes);
    setSelectedId(null);
    setMode("select");
    setAnnotationMode("select");
    setCurrentImagePath(null);
    setCurrentLocalImage(result.image);
    setCanvasKey(`${result.imageFileName}:${result.imageSrc}`);
    setHistory(createEmptyHistory());
    setValidationIssues([]);
    setDirty(false);
    setSaveStatus("saved");
  }, []);

  const handleShapeUpdate = useCallback(
    (updated: ShapeData) => {
      if (selectedId === null) return;
      const next =
        updated.node_id !== selectedId
          ? replaceShapeNodeId(shapes, selectedId, updated)
          : shapes.map((shape) => (shape.node_id === selectedId ? updated : shape));
      commitShapes(next);
      setSelectedId(updated.node_id);
      setDefaultNodeType(updated.type || updated.label);
    },
    [commitShapes, selectedId, shapes],
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedId === null) return;
    commitShapes(
      shapes
        .filter((shape) => shape.node_id !== selectedId)
        .map((shape) => ({
          ...shape,
          edges: shape.edges.filter((edge) => edge.target !== selectedId),
        })),
    );
    setSelectedId(null);
  }, [commitShapes, selectedId, shapes]);

  const handleUndo = useCallback(() => {
    const step = undoHistory(history, shapes);
    if (!step.shapes) return;
    setHistory(step.history);
    setShapes(step.shapes);
    setSelectedId(null);
    setDirty(true);
    setSaveStatus("dirty");
  }, [history, shapes]);

  const handleRedo = useCallback(() => {
    const step = redoHistory(history, shapes);
    if (!step.shapes) return;
    setHistory(step.history);
    setShapes(step.shapes);
    setSelectedId(null);
    setDirty(true);
    setSaveStatus("dirty");
  }, [history, shapes]);

  const handleQuickRelationTarget = useCallback(
    (targetId: string) => {
      if (!selectedId) {
        setSelectedId(targetId);
        toast("info", "已设为关系源节点，请再点击目标节点");
        return;
      }
      const next = addRelationEdge(shapes, selectedId, targetId, relationType);
      if (next === shapes) return;
      commitShapes(next);
      toast("success", `已创建 ${selectedId} -> ${targetId}`);
    },
    [commitShapes, relationType, selectedId, shapes, toast],
  );

  const handleAutoReadOrder = useCallback(() => {
    if (shapes.length < 2) return;
    commitShapes(buildReadOrderEdges(shapes, "READS_AFTER"));
    toast("success", "已按竖排顺序生成 READS_AFTER");
  }, [commitShapes, shapes, toast]);

  const handleCopyPreviousType = useCallback(() => {
    if (!selectedShape || !previousShape) return;
    handleShapeUpdate({
      ...selectedShape,
      label: previousShape.label,
      type: previousShape.type,
      attributes: { ...selectedShape.attributes, ...previousShape.attributes },
    });
  }, [handleShapeUpdate, previousShape, selectedShape]);

  const handleClearEdges = useCallback(() => {
    if (!selectedShape) return;
    handleShapeUpdate({ ...selectedShape, edges: [] });
  }, [handleShapeUpdate, selectedShape]);

  const handleSelectNextUntranscribed = useCallback(() => {
    const start = selectedId ? Math.max(0, shapes.findIndex((shape) => shape.node_id === selectedId) + 1) : 0;
    const ordered = [...shapes.slice(start), ...shapes.slice(0, start)];
    const next = ordered.find((shape) => !shape.transcription_raw && !shape.transcription_semantic);
    if (next) setSelectedId(next.node_id);
  }, [selectedId, shapes]);

  const handleValidationIssueClick = useCallback((issue: ValidationIssue) => {
    if (issue.node_id) setSelectedId(issue.node_id);
  }, []);

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
        setAnnotationMode("select");
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDeleteSelected, handleRedo, handleUndo, saveCurrentJson, selectedId]);

  return (
    <div className="flex h-screen flex-col bg-stone-100 text-stone-900">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-stone-300 bg-[#f7f2e8] px-4 py-2 shadow-sm">
        <div className="min-w-44">
          <h1 className="text-lg font-semibold">古文手稿标注台</h1>
          <p className="text-xs text-stone-500">Labelme Web - desktop schema aligned</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <DirBrowser
            currentImageName={imageSrc ? imageFileName : null}
            currentDirty={dirty}
            savedImage={savedImage}
            onBeforeImageChange={confirmBeforeImageChange}
            onLoad={handleLocalImageLoad}
            onFolderValidation={setFolderSummary}
          />

          {imageSrc && (
            <>
              <span className="rounded border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-600">
                {statusText(saveStatus)}
              </span>
              {TOOLS.map((tool) => (
                <button
                  key={tool.mode}
                  onClick={() => {
                    setMode(tool.mode);
                    setAnnotationMode(tool.mode === "select" ? "select" : "draw");
                  }}
                  className={`rounded border px-3 py-1.5 text-sm font-medium ${
                    mode === tool.mode && annotationMode !== "quick_relation"
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {tool.label}
                </button>
              ))}
              <label className="flex items-center gap-1 rounded border border-stone-300 bg-white px-2 py-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={continuousAnnotation}
                  onChange={(event) => setContinuousAnnotation(event.target.checked)}
                />
                连续标注
              </label>
              <select
                value={nodeIdStrategy}
                onChange={(event) => setNodeIdStrategy(event.target.value as NodeIdStrategy)}
                className="rounded border border-stone-300 bg-white px-2 py-1.5 text-xs"
                title="node_id 生成策略"
              >
                <option value="sequential">n1/n2</option>
                <option value="column_line">c1_l1</option>
              </select>
              <select
                value={relationType}
                onChange={(event) => setRelationType(event.target.value)}
                className="rounded border border-stone-300 bg-white px-2 py-1.5 text-xs"
              >
                {RELATIONS.map((relation) => (
                  <option key={relation} value={relation}>
                    {relation}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setMode("select");
                  setAnnotationMode(annotationMode === "quick_relation" ? "select" : "quick_relation");
                }}
                className={`rounded border px-3 py-1.5 text-sm font-medium ${
                  annotationMode === "quick_relation"
                    ? "border-blue-800 bg-blue-800 text-white"
                    : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                快速关系
              </button>
              <button
                onClick={handleAutoReadOrder}
                className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                自动阅读顺序
              </button>
              <button
                onClick={handleUndo}
                className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={history.undo.length === 0}
                title="Ctrl/Cmd+Z"
              >
                撤销
              </button>
              <button
                onClick={handleRedo}
                className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={history.redo.length === 0}
                title="Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y"
              >
                重做
              </button>
              <button
                onClick={handleDeleteSelected}
                className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={selectedId === null}
                title="Delete / Backspace"
              >
                删除
              </button>
              <button
                onClick={() => canvasRef.current?.fitToScreen()}
                className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                适配
              </button>
              <button
                onClick={() => canvasRef.current?.resetZoom()}
                className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                100%
              </button>
              <button
                onClick={handleExportImage}
                className="rounded border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
              >
                导出视图
              </button>
              <button
                onClick={() => void saveCurrentJson()}
                className="rounded border border-amber-800 bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-50"
                disabled={saveStatus === "saving"}
              >
                保存 JSON
              </button>
            </>
          )}
        </div>
      </header>

      {(validationIssues.length > 0 || folderSummary) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {validationIssues.length > 0 && (
            <>
              <span className="font-semibold">校验问题：</span>
              {validationIssues.slice(0, 5).map((issue, index) => (
                <button
                  key={`${issue.message}-${index}`}
                  onClick={() => handleValidationIssueClick(issue)}
                  className="rounded border border-amber-300 bg-white px-2 py-1 text-left hover:bg-amber-100"
                >
                  {issue.message}
                </button>
              ))}
            </>
          )}
          {folderSummary && (
            <span>
              文件夹检查：合法 {folderSummary.valid}，缺失 {folderSummary.missing}，错误 {folderSummary.invalid}
            </span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 overflow-hidden border-r border-stone-300 bg-[#fbf8f0]">
          <ShapeList
            shapes={shapes}
            selectedId={selectedId}
            filter={shapeFilter}
            onFilterChange={setShapeFilter}
            onSelectShape={setSelectedId}
          />
        </aside>

        <main className="flex flex-1 items-start justify-center overflow-hidden bg-[#d8d1c4] p-2">
          {imageSrc ? (
            <Canvas
              key={canvasKey}
              ref={canvasRef}
              shapes={shapes}
              selectedId={selectedId}
              mode={mode}
              imageSrc={imageSrc}
              imageSize={imageSize}
              onShapesChange={(next, historyBase) => commitShapes(next, historyBase)}
              onShapesPreview={previewShapes}
              onSelectShape={setSelectedId}
              onModeChange={setMode}
              annotationMode={annotationMode}
              continuousAnnotation={continuousAnnotation}
              nodeIdStrategy={nodeIdStrategy}
              defaultNodeType={defaultNodeType}
              onDefaultNodeTypeChange={setDefaultNodeType}
              onQuickRelationTarget={handleQuickRelationTarget}
            />
          ) : (
            <div className="flex max-w-md flex-col items-center justify-center gap-3 self-center rounded border border-dashed border-stone-400 bg-[#f7f2e8] p-8 text-center text-stone-600">
              <p className="text-lg font-semibold text-stone-800">打开手稿图片文件夹</p>
              <p className="text-sm">
                点击右上角“打开文件夹”，选择包含手稿图片和同名 labelme JSON 的本地目录。
                Web 端会读取新版桌面字段，并在保存时写回同名 JSON。
              </p>
            </div>
          )}
        </main>

        <aside className="w-80 shrink-0 overflow-hidden border-l border-stone-300 bg-stone-50">
          <PropertyPanel
            shape={selectedShape}
            allNodeIds={allNodeIds}
            relationType={relationType}
            onRelationTypeChange={setRelationType}
            onShapeUpdate={handleShapeUpdate}
            onCopyPreviousType={handleCopyPreviousType}
            onClearEdges={handleClearEdges}
            onSelectNextUntranscribed={handleSelectNextUntranscribed}
          />
        </aside>
      </div>
    </div>
  );
}

function statusText(status: SaveStatus): string {
  if (status === "saving") return "保存中";
  if (status === "dirty") return "未保存";
  if (status === "error") return "需要处理";
  return "已保存";
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}
