import type { ShapeData } from "@/types/labelFile";

export type ShapeFilter = "all" | "untranscribed" | "no_edges";

interface Props {
  shapes: ShapeData[];
  selectedId: string | null;
  filter: ShapeFilter;
  onFilterChange: (filter: ShapeFilter) => void;
  onSelectShape: (id: string) => void;
}

export default function ShapeList({ shapes, selectedId, filter, onFilterChange, onSelectShape }: Props) {
  const visibleShapes = shapes.filter((shape) => {
    if (filter === "untranscribed") return !shape.transcription_raw && !shape.transcription_semantic;
    if (filter === "no_edges") return shape.edges.length === 0;
    return true;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-stone-200 px-3 py-2">
        <h3 className="text-xs font-semibold text-stone-500">标注对象 ({visibleShapes.length}/{shapes.length})</h3>
        <select
          className="mt-2 w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value as ShapeFilter)}
        >
          <option value="all">全部对象</option>
          <option value="untranscribed">未转写</option>
          <option value="no_edges">无关系</option>
        </select>
      </div>

      {visibleShapes.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-xs text-stone-400">
          没有符合筛选条件的对象
        </div>
      ) : (
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
              {visibleShapes.map((shape) => (
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
      )}
    </div>
  );
}
