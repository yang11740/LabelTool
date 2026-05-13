import { cn } from "@/lib/utils";
import type { DrawMode } from "./Canvas";
import {
  MousePointer2,
  Pentagon,
  Square,
  Circle,
  Crosshair,
  Minus,
  Route,
} from "lucide-react";

interface Props {
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
}

const TOOLS: { mode: DrawMode; icon: typeof Square; label: string }[] = [
  { mode: "select", icon: MousePointer2, label: "选择" },
  { mode: "draw_polygon", icon: Pentagon, label: "多边形" },
  { mode: "draw_rect", icon: Square, label: "矩形" },
  { mode: "draw_circle", icon: Circle, label: "圆形" },
  { mode: "draw_point", icon: Crosshair, label: "点" },
  { mode: "draw_line", icon: Minus, label: "直线" },
  { mode: "draw_polyline", icon: Route, label: "折线" },
];

export default function ToolPanel({ mode, onModeChange }: Props) {
  return (
    <aside className="flex w-32 shrink-0 flex-col items-center gap-2 border-r border-slate-200 bg-white py-6">
      {TOOLS.map(({ mode: toolMode, icon: Icon, label }) => (
        <button
          key={toolMode}
          onClick={() => onModeChange(toolMode)}
          title={label}
          className={cn(
            "flex flex-col items-center gap-1 rounded-md px-4 py-3 text-xl font-medium transition-colors w-24",
            mode === toolMode
              ? "bg-indigo-500 text-white shadow-xs"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
          )}
        >
          <Icon size={40} />
          <span className="leading-none">{label}</span>
        </button>
      ))}
    </aside>
  );
}
