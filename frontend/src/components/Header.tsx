import {
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Save,
  Image,
  Trash2,
  MousePointer2,
  Undo2,
  Sun,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { DrawMode } from "./Canvas";

interface Props {
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
  hasImage: boolean;
  hasSelection: boolean;
  onSave: () => void;
  onExportImage: () => void;
  onDeleteShape: () => void;
  onDeleteFile: () => void;
  onPickFolder: () => void;
  onPrevImage: () => void;
  onNextImage: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onUndo: () => void;
  canUndo: boolean;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  imageName: string | null;
}

export default function Header({
  mode,
  onModeChange,
  hasImage,
  hasSelection,
  onSave,
  onExportImage,
  onDeleteShape,
  onDeleteFile,
  onPickFolder,
  onPrevImage,
  onNextImage,
  hasPrev,
  hasNext,
  onUndo,
  canUndo,
  scale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  imageName,
}: Props) {
  return (
    <header className="flex h-24 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6 shadow-xs">
      {/* ── Left: file operations ── */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" className="h-12 w-12" onClick={onPickFolder} title="打开目录">
          <FolderOpen size={30} />
        </Button>

        <Separator orientation="vertical" className="h-10 mx-1" />

        <Button
          variant="ghost"
          className="h-12 w-12"
          disabled={!hasPrev}
          onClick={onPrevImage}
          title="上一张"
        >
          <ChevronLeft size={32} />
        </Button>
        <Button
          variant="ghost"
          className="h-12 w-12"
          disabled={!hasNext}
          onClick={onNextImage}
          title="下一张"
        >
          <ChevronRight size={32} />
        </Button>

        <Separator orientation="vertical" className="h-10 mx-1" />

        <Button
          variant="ghost"
          size="lg"
          onClick={onSave}
          disabled={!hasImage}
          className="text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
        >
          <Save size={28} />
          保存
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={onExportImage}
          disabled={!hasImage}
          className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <Image size={28} />
          导出
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={onDeleteFile}
          disabled={!hasImage}
          className="text-red-400 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={28} />
          删除文件
        </Button>
      </div>

      {/* ── Center: edit tools ── */}
      <div className="flex flex-1 items-center justify-center gap-1">
        <button
          onClick={() => onModeChange("select")}
          className={cn(
            "flex items-center gap-3 rounded-md px-5 py-2 text-base font-medium transition-colors",
            mode === "select"
              ? "bg-indigo-500 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 border border-slate-200",
          )}
        >
          <MousePointer2 size={28} />
          编辑形状
        </button>

        <Button
          variant="ghost"
          size="lg"
          onClick={onDeleteShape}
          disabled={!hasSelection}
          className="text-base"
        >
          <Trash2 size={28} />
          删除形状
        </Button>

        <Button
          variant="ghost"
          size="lg"
          onClick={onUndo}
          disabled={!canUndo}
          className="text-base"
        >
          <Undo2 size={28} />
          撤销
        </Button>

        <Button
          variant="ghost"
          size="lg"
          disabled
          className="text-base"
        >
          <Sun size={28} />
          亮度
        </Button>
      </div>

      {/* ── Right: zoom + image info ── */}
      <div className="flex items-center gap-1">
        {imageName && (
          <span className="text-base text-slate-400 mr-4 max-w-[320px] truncate">
            {imageName}
          </span>
        )}

        <Button
          variant="ghost"
          className="h-12 w-12"
          onClick={onZoomOut}
          disabled={!hasImage}
          title="缩小"
        >
          <ZoomOut size={30} />
        </Button>

        <span className="font-mono text-base text-slate-500 w-24 text-center tabular-nums">
          {(scale * 100).toFixed(0)}%
        </span>

        <Button
          variant="ghost"
          className="h-12 w-12"
          onClick={onZoomIn}
          disabled={!hasImage}
          title="放大"
        >
          <ZoomIn size={30} />
        </Button>

        <Button
          variant="ghost"
          className="h-12 w-12"
          onClick={onZoomReset}
          disabled={!hasImage}
          title="适应窗口"
        >
          <Maximize size={30} />
        </Button>
      </div>
    </header>
  );
}
