import type { ShapeData } from "@/types/labelFile";

interface Props {
  shapes: ShapeData[];
  selectedId: string | null;
  onSelectShape: (id: string) => void;
}

export default function ShapeList({ shapes, selectedId, onSelectShape }: Props) {
  if (shapes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-gray-400">
        暂无标注
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <h3 className="shrink-0 px-3 py-2 text-xs font-semibold text-gray-500">
        标注列表 ({shapes.length})
      </h3>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-1 font-medium">节点 ID</th>
              <th className="px-3 py-1 font-medium">类型</th>
              <th className="px-3 py-1 font-medium">图层</th>
            </tr>
          </thead>
          <tbody>
            {shapes.map((s) => (
              <tr
                key={s.node_id}
                onClick={() => onSelectShape(s.node_id)}
                className={`cursor-pointer border-t transition-colors hover:bg-blue-50 ${
                  s.node_id === selectedId
                    ? "bg-blue-100 text-blue-800"
                    : "text-gray-700"
                }`}
              >
                <td className="px-3 py-1.5 font-mono">{s.node_id || "—"}</td>
                <td className="px-3 py-1.5">{s.type || s.label || "—"}</td>
                <td className="px-3 py-1.5">{s.attributes.z_index}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
