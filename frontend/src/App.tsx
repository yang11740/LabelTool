import { useState, useCallback, useRef } from "react";
import Canvas from "./components/Canvas";
import type { CanvasHandle, DrawMode } from "./components/Canvas";
import PropertyPanel from "./components/PropertyPanel";
import ShapeList from "./components/ShapeList";
import DirBrowser from "./components/DirBrowser";
import { buildLabelmeJson, downloadJson, exportStageImage } from "./utils/export";
import { saveLabel } from "./api";
import { useToast } from "./context/ToastContext";
import type { ShapeData } from "./types/labelFile";

export default function App() {
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<DrawMode>("draw_rect");

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>("image.jpg");
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const [currentImagePath, setCurrentImagePath] = useState<string | null>(null);

  const canvasRef = useRef<CanvasHandle>(null);
  const { toast } = useToast();

  // ── API-based loading (DirBrowser) ──

  const handleDirLoad = useCallback(
    (result: {
      imageSrc: string;
      imageFileName: string;
      imageWidth: number;
      imageHeight: number;
      shapes: ShapeData[];
      imagePath: string;
    }) => {
      setImageSrc(result.imageSrc);
      setImageFileName(result.imageFileName);
      setImageSize({ width: result.imageWidth, height: result.imageHeight });
      setShapes(result.shapes);
      setSelectedId(null);
      setMode("select");
      setCurrentImagePath(result.imagePath);
    },
    [],
  );

  const handleSelectShape = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setMode("select");
  }, []);

  const handleShapeUpdate = useCallback((updated: ShapeData) => {
    setShapes((prev) =>
      prev.map((s) => (s.node_id === updated.node_id ? updated : s)),
    );
  }, []);

  // ── export / save ──

  const handleExportImage = useCallback(() => {
    const stage = canvasRef.current?.getStage();
    if (!stage) return;
    const name = imageFileName.replace(/\.[^.]+$/, "") + "_visual.png";
    exportStageImage(stage, name);
  }, [imageFileName]);

  const handleSaveJson = useCallback(async () => {
    if (!imageSrc || !imageSize) return;

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
    } else {
      const base64 = imageSrc.includes("base64,")
        ? imageSrc.split("base64,")[1]
        : imageSrc;
      const json = buildLabelmeJson(
        shapes,
        base64,
        imageFileName,
        imageSize.width,
        imageSize.height,
      );
      const name = imageFileName.replace(/\.[^.]+$/, "") + ".json";
      downloadJson(json, name);
    }
  }, [shapes, imageSrc, imageFileName, imageSize, currentImagePath, toast]);

  // ── ──

  const selectedShape = shapes.find((s) => s.node_id === selectedId) ?? null;
  const allNodeIds = shapes.map((s) => s.node_id).filter(Boolean);

  return (
    <div className="flex h-screen flex-col">
      {/* toolbar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-white px-4 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-800">手稿识别标注工具</h1>

        <div className="flex items-center gap-3">
          <DirBrowser onLoad={handleDirLoad} />

          {imageSrc && (
            <>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => setMode("draw_rect")}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  mode === "draw_rect"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                矩形
              </button>
              <button
                onClick={() => setMode("draw_polygon")}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  mode === "draw_polygon"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                多边形
              </button>
              <button
                onClick={() => setMode("select")}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  mode === "select"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                编辑
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleExportImage}
                className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              >
                导出图片
              </button>
              <button
                onClick={handleSaveJson}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                保存 JSON
              </button>
            </>
          )}
        </div>

        <span className="hidden text-xs text-gray-400 lg:block">
          {mode === "draw_rect"
            ? "拖拽绘制矩形 · 从左上角拖到右下角 · ESC 取消"
            : mode === "draw_polygon"
              ? "点击添加顶点 · Enter 闭合 · ESC 撤销上一点"
              : "点击图形选中 · 拖拽顶点塑形 · ESC 取消选中"}
        </span>
      </header>

      {/* body: 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 shrink-0 overflow-hidden border-r bg-white">
          <ShapeList
            shapes={shapes}
            selectedId={selectedId}
            onSelectShape={handleSelectShape}
          />
        </aside>

        <main className="flex flex-1 items-start justify-center overflow-auto bg-gray-300 p-2">
          {imageSrc ? (
            <Canvas
              ref={canvasRef}
              shapes={shapes}
              selectedId={selectedId}
              mode={mode}
              imageSrc={imageSrc}
              imageSize={imageSize}
              onShapesChange={setShapes}
              onSelectShape={handleSelectShape}
              onModeChange={setMode}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 self-center text-gray-500">
              <p className="text-3xl">📷</p>
              <p className="text-sm">输入本地图片目录路径，点击"扫描"开始标注</p>
              <p className="text-xs text-gray-400">
                支持 JPEG / PNG 格式 · 标签文件与图片同目录
              </p>
            </div>
          )}
        </main>

        <aside className="w-64 shrink-0 overflow-hidden border-l bg-white">
          <PropertyPanel
            shape={selectedShape}
            allNodeIds={allNodeIds}
            onShapeUpdate={handleShapeUpdate}
          />
        </aside>
      </div>
    </div>
  );
}
