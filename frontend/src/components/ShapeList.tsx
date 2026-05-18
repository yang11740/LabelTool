import type { ShapeData } from "@/types/labelFile";

interface Props {
  shapes: ShapeData[];
  selectedId: string | null;
  onSelectShape: (id: string) => void;
}

export default function ShapeList({ shapes, selectedId, onSelectShape }: Props) {
  if (shapes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-stone-400">
        还没有标注对象
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <h3 className="shrink-0 border-b border-stone-200 px-3 py-2 text-xs font-semibold text-stone-500">
        标注对象 ({shapes.length})
      </h3>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[#fbf8f0] text-left text-stone-500">
            <tr>
              <th className="px-3 py-1.5 font-medium">node_id</th>
              <th className="px-3 py-1.5 font-medium">类型</th>
              <th className="px-3 py-1.5 font-medium">形状</th>
            </tr>
          </thead>
          <tbody>
            {shapes.map((shape) => (
              <tr
                key={shape.node_id}
                onClick={() => onSelectShape(shape.node_id)}
                className={`cursor-pointer border-t border-stone-200 transition-colors hover:bg-amber-50 ${
                  shape.node_id === selectedId ? "bg-amber-100 text-amber-900" : "text-stone-700"
                }`}
              >
                <td className="px-3 py-1.5 font-mono">{shape.node_id || "-"}</td>
                <td className="px-3 py-1.5">{shape.type || shape.label || "未设类型"}</td>
                <td className="px-3 py-1.5">{shape.shape_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
