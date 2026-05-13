import { useState, useCallback, useRef, type SetStateAction } from "react";
import Canvas from "./components/Canvas";
import type { CanvasHandle, DrawMode } from "./components/Canvas";
import Header from "./components/Header";
import ToolPanel from "./components/ToolPanel";
import RightPanel from "./components/RightPanel";
import type { ImageEntry } from "./components/RightPanel";
import LabelEditDialog from "./components/LabelEditDialog";
import { buildLabelmeJson, downloadJson, exportStageImage } from "./utils/export";
import { saveLabel } from "./api";
import { useToast } from "./context/ToastContext";
import type { ShapeData } from "./types/labelFile";
import { loadShapeJsonObj } from "./types/labelFile";

const IMG_RE = /\.(jpe?g|png)$/i;

export default function App() {
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const shapesRef = useRef<ShapeData[]>([]);
  // Keep shapesRef in sync so callbacks that read it always see the latest
  shapesRef.current = shapes;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<DrawMode>("select");

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>("image.jpg");
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [currentImagePath, setCurrentImagePath] = useState<string | null>(null);
  const [imageLoadId, setImageLoadId] = useState(0);

  // Directory / image list state
  const [imageEntries, setImageEntries] = useState<ImageEntry[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(-1);
  const [loadingImage, setLoadingImage] = useState<string | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const pathImagesRef = useRef<ImageEntry[]>([]); // backend path-based entries

  // Label editor
  const [editingShape, setEditingShape] = useState<ShapeData | null>(null);

  // Undo history
  const [shapeHistory, setShapeHistory] = useState<ShapeData[][]>([]);

  const canvasRef = useRef<CanvasHandle>(null);
  const { toast } = useToast();

  const hasImage = imageSrc !== null;
  const hasSelection = selectedId !== null;

  // Unified image list (browser-native or backend path-based)
  const allEntries = imageEntries.length > 0 ? imageEntries : pathImagesRef.current;

  // ── push undo before mutation ──

  const pushUndo = useCallback((currentShapes: ShapeData[]) => {
    setShapeHistory((prev) => [...prev.slice(-49), currentShapes]);
  }, []);

  const handleUndo = useCallback(() => {
    setShapeHistory((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      setShapes(restored);
      return prev.slice(0, -1);
    });
  }, []);

  // ── image loading ──

  const loadImageEntry = useCallback(
    async (
      entry: ImageEntry,
      dh: FileSystemDirectoryHandle | null,
    ) => {
      setLoadingImage(entry.name);
      try {
        let src: string;
        if (dh && entry.handle) {
          const file = await entry.handle.getFile();
          src = URL.createObjectURL(file);
        } else {
          // backend path-based
          const { getImageUrl } = await import("./api");
          src = getImageUrl(entry.path);
        }

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          if (!dh) el.crossOrigin = "anonymous";
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("图片加载失败"));
          el.src = src;
        });

        // Load shapes from matching label JSON
        let loadedShapes: ShapeData[] = [];
        const jsonName = entry.name.replace(/\.[^.]+$/, "") + ".json";

        if (dh) {
          // Browser-native: try to read JSON from same directory
          try {
            const jsonHandle = await dh.getFileHandle(jsonName);
            const jsonFile = await jsonHandle.getFile();
            const text = await jsonFile.text();
            const obj = JSON.parse(text);
            const rawShapes: Record<string, unknown>[] = obj.shapes ?? [];
            loadedShapes = rawShapes.map((raw) => loadShapeJsonObj(raw).shape);
          } catch { /* no label file */ }
        } else {
          // Backend path-based
          try {
            const { readLabel } = await import("./api");
            const label = await readLabel(entry.path);
            loadedShapes = label.shapes;
          } catch { /* no label file */ }
        }

        setImageSrc(src);
        setImageFileName(entry.name);
        setImageSize({ width: img.width, height: img.height });
        setShapes(loadedShapes);
        setSelectedId(null);
        setMode("select");
        setCurrentImagePath(dh ? jsonName : entry.path);
        setImageLoadId((prev) => prev + 1);
        setShapeHistory([]);
      } catch (e) {
        toast("error", (e as Error).message);
      } finally {
        setLoadingImage(null);
      }
    },
    [toast],
  );

  // ── navigation ──

  const navigateToIndex = useCallback(
    async (index: number) => {
      const entries = allEntries;
      if (index < 0 || index >= entries.length) return;
      setCurrentImageIndex(index);
      await loadImageEntry(entries[index], dirHandleRef.current);
    },
    [allEntries, loadImageEntry],
  );

  const handlePrevImage = useCallback(() => {
    if (currentImageIndex > 0) navigateToIndex(currentImageIndex - 1);
  }, [currentImageIndex, navigateToIndex]);

  const handleNextImage = useCallback(() => {
    if (currentImageIndex < allEntries.length - 1) navigateToIndex(currentImageIndex + 1);
  }, [currentImageIndex, allEntries.length, navigateToIndex]);

  // ── folder picker (browser-native) ──

  const handlePickFolder = useCallback(async () => {
    try {
      const dh = await window.showDirectoryPicker({ mode: "readwrite" });
      dirHandleRef.current = dh;
      pathImagesRef.current = [];

      const entries: ImageEntry[] = [];
      for await (const [name, handle] of dh.entries()) {
        if (handle.kind !== "file") continue;
        if (!IMG_RE.test(name)) continue;
        const jsonName = name.replace(/\.[^.]+$/, "") + ".json";
        let hasLabel = false;
        try { await dh.getFileHandle(jsonName); hasLabel = true; } catch { /* no label */ }
        entries.push({ name, handle: handle as FileSystemFileHandle, path: name, hasLabel });
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      setImageEntries(entries);

      if (entries.length === 0) {
        toast("info", "目录中没有图片文件");
        return;
      }

      // Load first image
      setCurrentImageIndex(0);
      await loadImageEntry(entries[0], dh);
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
      toast("error", `无法打开目录: ${(e as Error).message}`);
    }
  }, [loadImageEntry, toast]);

  // ── backend path scan ──

  const handlePathScan = useCallback(
    async (dirPath: string): Promise<ImageEntry[]> => {
      const { scanDirectory } = await import("./api");
      const list = await scanDirectory(dirPath.trim());
      const entries: ImageEntry[] = list.map((img) => ({
        name: img.name,
        path: img.path,
        hasLabel: img.has_label,
      }));
      dirHandleRef.current = null;
      pathImagesRef.current = entries;
      setImageEntries([]);
      if (entries.length === 0) {
        toast("info", "目录中没有图片文件");
      }
      return entries;
    },
    [toast],
  );

  const handleSelectPathImage = useCallback(
    async (entry: ImageEntry) => {
      const idx = pathImagesRef.current.findIndex((e) => e.path === entry.path);
      setCurrentImageIndex(idx);
      await loadImageEntry(entry, null);
    },
    [loadImageEntry],
  );

  const handleSelectImage = useCallback(
    async (entry: ImageEntry) => {
      const idx = imageEntries.findIndex((e) => e.name === entry.name);
      setCurrentImageIndex(idx);
      await loadImageEntry(entry, dirHandleRef.current);
    },
    [imageEntries, loadImageEntry],
  );

  // ── shape mutations ──

  const handleShapesChange = useCallback(
    (updater: SetStateAction<ShapeData[]>) => {
      setShapes((prev) => {
        pushUndo(prev);
        return typeof updater === "function" ? updater(prev) : updater;
      });
    },
    [pushUndo],
  );

  const handleSelectShape = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setMode("select");
  }, []);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    setShapes((prev) => {
      pushUndo(prev);
      return prev.filter((s) => s.node_id !== selectedId);
    });
    setSelectedId(null);
  }, [selectedId, pushUndo]);

  // Track the original shape ID for the save lookup, since the user may
  // edit the node_id field inside the dialog — we must match by the
  // identity the shape had when the dialog opened, not the new value.
  const editingShapeIdRef = useRef<string>("");

  // ── label editor ──

  const handleShapeCreated = useCallback(
    (shape: ShapeData) => {
      editingShapeIdRef.current = shape.node_id;
      setEditingShape(shape);
    },
    [],
  );

  const handleEditShape = useCallback((shape: ShapeData) => {
    editingShapeIdRef.current = shape.node_id;
    setEditingShape(shape);
  }, []);

  const handleSaveEditedShape = useCallback(
    (updated: ShapeData) => {
      const originalId = editingShapeIdRef.current;
      pushUndo(shapesRef.current);
      setShapes((prev) =>
        prev.map((s) => (s.node_id === originalId ? updated : s)),
      );
      setEditingShape(null);
    },
    [pushUndo],
  );

  // ── save / export ──

  const handleExportImage = useCallback(() => {
    const stage = canvasRef.current?.getStage();
    if (!stage) return;
    const name = imageFileName.replace(/\.[^.]+$/, "") + "_visual.png";
    exportStageImage(stage, name);
  }, [imageFileName]);

  const handleSaveJson = useCallback(async () => {
    if (!imageSrc || !imageSize) return;

    // 1. browser-native: save via File System Access API
    if (dirHandleRef.current) {
      try {
        const jsonObj = buildLabelmeJson(
          shapes, "",
          imageFileName, imageSize.width, imageSize.height,
        );
        const jsonStr = JSON.stringify(jsonObj, null, 2);
        const jsonName = imageFileName.replace(/\.[^.]+$/, "") + ".json";
        const fh = await dirHandleRef.current.getFileHandle(jsonName, { create: true });
        const w = await fh.createWritable();
        await w.write(jsonStr);
        await w.close();

        // Update hasLabel status
        setImageEntries((prev) =>
          prev.map((e) => (e.name === imageFileName ? { ...e, hasLabel: true } : e)),
        );
        toast("success", "已保存");
      } catch (e) {
        toast("error", `保存失败: ${(e as Error).message}`);
      }
      return;
    }

    // 2. backend API path-based save
    if (currentImagePath) {
      try {
        await saveLabel(currentImagePath, {
          shapes,
          imagePath: imageFileName,
          imageHeight: imageSize.height,
          imageWidth: imageSize.width,
          flags: {},
        });
        toast("success", "已保存");
      } catch (e) {
        toast("error", `保存失败: ${(e as Error).message}`);
      }
      return;
    }

    // 3. fallback: download JSON
    const base64 = imageSrc.includes("base64,") ? imageSrc.split("base64,")[1] : imageSrc;
    const json = buildLabelmeJson(shapes, base64, imageFileName, imageSize.width, imageSize.height);
    downloadJson(json, imageFileName.replace(/\.[^.]+$/, "") + ".json");
  }, [shapes, imageSrc, imageFileName, imageSize, currentImagePath, toast]);

  // ── zoom ──

  const handleZoomIn = useCallback(() => {
    const c = canvasRef.current;
    if (c) c.setScale(c.getScale() * 1.15);
  }, []);

  const handleZoomOut = useCallback(() => {
    const c = canvasRef.current;
    if (c) c.setScale(c.getScale() / 1.15);
  }, []);

  const handleZoomReset = useCallback(() => {
    canvasRef.current?.fitToContainer();
  }, []);

  // ── derived ──

  const scale = canvasRef.current?.getScale() ?? 1;
  const hasPrev = currentImageIndex > 0;
  const hasNext = currentImageIndex < allEntries.length - 1;

  return (
    <div className="flex h-screen flex-col bg-slate-50 overflow-hidden">
      {/* ── Header (48px) ── */}
      <Header
        mode={mode}
        onModeChange={setMode}
        hasImage={hasImage}
        hasSelection={hasSelection}
        onSave={handleSaveJson}
        onExportImage={handleExportImage}
        onDeleteShape={handleDelete}
        onDeleteFile={handleDelete}
        onPickFolder={handlePickFolder}
        onPrevImage={handlePrevImage}
        onNextImage={handleNextImage}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onUndo={handleUndo}
        canUndo={shapeHistory.length > 0}
        scale={scale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        imageName={hasImage ? imageFileName : null}
      />

      {/* ── Body: ToolPanel + Canvas + RightPanel ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left toolbar (64px) */}
        <ToolPanel mode={mode} onModeChange={setMode} />

        {/* Center canvas area */}
        <main className="flex flex-1 items-start justify-center overflow-auto bg-slate-200 p-2">
          {hasImage ? (
            <Canvas
              key={imageLoadId}
              ref={canvasRef}
              shapes={shapes}
              selectedId={selectedId}
              mode={mode}
              imageSrc={imageSrc}
              imageSize={imageSize}
              onShapesChange={handleShapesChange}
              onSelectShape={handleSelectShape}
              onModeChange={setMode}
              onSave={handleSaveJson}
              onShapeCreated={handleShapeCreated}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 self-center text-slate-400">
              <span className="text-4xl opacity-20">📂</span>
              <p className="text-sm">点击「打开目录」开始标注</p>
              <p className="text-xs text-slate-400">支持 JPEG / PNG · 标注文件与图片同目录</p>
            </div>
          )}
        </main>

        {/* Right panel (288px) */}
        <RightPanel
          imageEntries={allEntries}
          currentImageName={imageFileName}
          shapes={shapes}
          selectedId={selectedId}
          onSelectShape={handleSelectShape}
          onEditShape={handleEditShape}
          onSelectImage={handleSelectImage}
          onPickFolder={handlePickFolder}
          onPathScan={handlePathScan}
          onSelectPathImage={handleSelectPathImage}
          loadingImage={loadingImage}
        />
      </div>

      {/* Label editor dialog */}
      {editingShape && (
        <LabelEditDialog
          shape={editingShape}
          allNodeIds={shapes.map((s) => s.node_id).filter(Boolean)}
          onSave={handleSaveEditedShape}
          onClose={() => setEditingShape(null)}
        />
      )}
    </div>
  );
}
