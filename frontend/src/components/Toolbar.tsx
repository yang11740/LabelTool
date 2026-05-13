import {
  Save,
  Image,
  Square,
  Pentagon,
  MousePointer2,
  Trash2,
} from "lucide-react";
import type { DrawMode } from "./Canvas";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface ToolbarProps {
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
  hasImage: boolean;
  hasSelection: boolean;
  onSave: () => void;
  onExportImage: () => void;
  onDelete: () => void;
}

export default function Toolbar({
  mode,
  onModeChange,
  hasImage,
  hasSelection,
  onSave,
  onExportImage,
  onDelete,
}: ToolbarProps) {
  if (!hasImage) return null;

  const ModeButton = ({
    value,
    icon: Icon,
    label,
  }: {
    value: DrawMode;
    icon: typeof Square;
    label: string;
  }) => (
    <button
      onClick={() => onModeChange(value)}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
        mode === value
          ? "bg-indigo-500 text-white shadow-xs"
          : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200",
      )}
    >
      <Icon size={15} />
      {label}
    </button>
  );

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 shadow-xs">
      {/* left: file ops */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSave}
          className="text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
        >
          <Save size={14} />
          保存
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onExportImage}
          className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <Image size={14} />
          导出图片
        </Button>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* center: drawing modes */}
      <div className="flex items-center gap-1">
        <ModeButton value="draw_rect" icon={Square} label="矩形" />
        <ModeButton value="draw_polygon" icon={Pentagon} label="多边形" />
        <ModeButton value="select" icon={MousePointer2} label="编辑" />
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* right: edit actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={!hasSelection}
          className="text-red-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={14} />
          删除
        </Button>
      </div>

      {/* mode hint — pushed right */}
      <div className="ml-auto text-xs text-slate-400">
        {mode === "draw_rect"
          ? "拖拽绘制矩形 · ESC 取消"
          : mode === "draw_polygon"
            ? "点击添加顶点 · Enter 闭合"
            : "点击选中 · 拖拽顶点 · Delete 删除"}
      </div>
    </header>
  );
}
