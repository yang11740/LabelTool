import type { ShapeData } from "@/types/labelFile";
import { Layers } from "lucide-react";

interface Props {
  shapes: ShapeData[];
  selectedId: string | null;
  onSelectShape: (id: string) => void;
}

const COLOR_MAP: Record<string, string> = {
  black: "#1a1a1a",
  red: "#dc2626",
  other: "#7c3aed",
};

export default function ShapeList({ shapes, selectedId, onSelectShape }: Props) {
  if (shapes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-400">
        <Layers size={20} className="opacity-30" />
        <span>暂无标注</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <Layers size={14} className="text-slate-400" />
        <h3 className="text-xs font-semibold text-slate-600">
          Annotations ({shapes.length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {shapes.map((s) => {
          const color = COLOR_MAP[s.attributes.color] ?? COLOR_MAP.black;
          const tag = s.type || s.label || "";
          const isSelected = s.node_id === selectedId;

          return (
            <button
              key={s.node_id}
              onClick={() => onSelectShape(s.node_id)}
              className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-xs transition-colors hover:bg-indigo-50 ${
                isSelected ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200" : ""
              }`}
            >
              {/* color swatch */}
              <div
                className="h-3 w-3 shrink-0 rounded-sm border border-black/20"
                style={{ backgroundColor: color }}
              />

              <div className="min-w-0 flex-1">
                <div className="font-mono text-slate-700 truncate">
                  {s.node_id || "—"}
                </div>
                {tag && (
                  <div className="truncate text-slate-400">{tag}</div>
                )}
              </div>

              <span className="shrink-0 font-mono text-slate-300">
                {s.attributes.z_index}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
