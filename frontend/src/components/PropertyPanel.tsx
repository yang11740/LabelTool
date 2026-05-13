import type { ShapeData } from "@/types/labelFile";

const NODE_TYPES = [
  "MAIN_TEXT",
  "INTERLINEAR_ANNOTATION",
  "SIDE_MARGINALIA",
  "ADD_TEXT",
  "DELETE_TEXT",
  "SYMBOL_PLACEHOLDER",
  "SALUTATION",
  "INCEPTION",
  "WISH_CLOSING",
  "SIGNATURE",
  "DATE_LINE",
  "COLUMN_SEPARATOR",
  "INK_BLOT",
  "PUNCTUATION_MARK",
  "EDIT_MARK:insertion_mark",
  "EDIT_MARK:inversion_mark",
  "EDIT_MARK:deletion_line",
  "EDIT_MARK:comment_mark",
] as const;

const RELATIONS = [
  "READS_AFTER",
  "ANNOTATES",
  "INSERTS_AT",
  "REPLACES",
  "OVERLAPS",
  "REPRESENTS",
] as const;

const Z_INDEX_OPTIONS = [
  { value: 0, label: "0 - 纸张/界格线" },
  { value: 1, label: "1 - 正文/夹注" },
  { value: 2, label: "2 - 批注/标点" },
  { value: 3, label: "3 - 增补/涂改" },
  { value: 4, label: "4 - 印章/墨渍" },
];

interface Props {
  shape: ShapeData | null;
  allNodeIds: string[];
  onShapeUpdate: (updated: ShapeData) => void;
}

export default function PropertyPanel({ shape, allNodeIds, onShapeUpdate }: Props) {
  if (!shape) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        点击画布上的图形或右侧列表项以查看属性
      </div>
    );
  }

  const update = (patch: Partial<ShapeData>) => {
    onShapeUpdate({ ...shape, ...patch });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-sm">
      <h3 className="font-semibold text-gray-700">手稿节点属性配置</h3>

      {/* ── row 1: Type + Group ID ── */}
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-0.5">
          <span className="text-xs text-gray-500">节点类型 (Type)</span>
          <select
            className="rounded border px-2 py-1 text-sm"
            value={shape.type || shape.label}
            onChange={(e) => update({ type: e.target.value, label: e.target.value })}
          >
            <option value="">-- 选择类型 --</option>
            {NODE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-24 flex-col gap-0.5">
          <span className="text-xs text-gray-500">组 ID</span>
          <input
            className="rounded border px-2 py-1 text-sm"
            type="number"
            value={shape.group_id ?? ""}
            onChange={(e) =>
              update({ group_id: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="划分句子"
          />
        </label>
      </div>

      {/* ── row 2: Node ID + Z-Index + Color ── */}
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-0.5">
          <span className="text-xs text-gray-500">节点 ID</span>
          <input
            className="rounded border px-2 py-1 text-sm"
            value={shape.node_id}
            onChange={(e) => update({ node_id: e.target.value })}
            placeholder="n_main_1"
          />
        </label>
        <label className="flex flex-1 flex-col gap-0.5">
          <span className="text-xs text-gray-500">图层 (Z-Index)</span>
          <select
            className="rounded border px-2 py-1 text-sm"
            value={shape.attributes.z_index}
            onChange={(e) =>
              update({
                attributes: {
                  ...shape.attributes,
                  z_index: Number(e.target.value),
                },
              })
            }
          >
            {Z_INDEX_OPTIONS.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-20 flex-col gap-0.5">
          <span className="text-xs text-gray-500">颜色</span>
          <select
            className="rounded border px-2 py-1 text-sm"
            value={shape.attributes.color}
            onChange={(e) =>
              update({
                attributes: {
                  ...shape.attributes,
                  color: e.target.value as ShapeData["attributes"]["color"],
                },
              })
            }
          >
            <option value="black">black</option>
            <option value="red">red</option>
            <option value="other">other</option>
          </select>
        </label>
      </div>

      {/* ── row 3: Transcription ── */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-gray-500">文本转写 (Transcription)</span>
        <textarea
          className="rounded border px-2 py-1 text-sm"
          rows={3}
          value={shape.transcription}
          onChange={(e) => update({ transcription: e.target.value })}
          placeholder="记录该区域的实际文字内容"
        />
      </label>

      {/* ── row 4: Edges ── */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-gray-500">逻辑边 (Edges)</span>
          <button
            className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-100"
            onClick={() =>
              update({
                edges: [...shape.edges, { target: "", relation: "READS_AFTER" }],
              })
            }
          >
            + 添加
          </button>
        </div>

        {shape.edges.length === 0 && (
          <p className="py-2 text-center text-xs text-gray-300">暂无逻辑边</p>
        )}

        {shape.edges.map((edge, i) => (
          <div key={i} className="mb-1 flex gap-1">
            <select
              className="flex-1 rounded border px-1 py-0.5 text-xs"
              value={edge.target}
              onChange={(e) => {
                const next = [...shape.edges];
                next[i] = { ...next[i], target: e.target.value };
                update({ edges: next });
              }}
            >
              <option value="">-- 目标节点 --</option>
              {allNodeIds
                .filter((id) => id !== shape.node_id)
                .map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
            </select>
            <select
              className="w-28 rounded border px-1 py-0.5 text-xs"
              value={edge.relation}
              onChange={(e) => {
                const nextEdges = [...shape.edges];
                nextEdges[i] = { ...nextEdges[i], relation: e.target.value };
                update({ edges: nextEdges });
              }}
            >
              {RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              className="rounded px-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => {
                const nextEdges = shape.edges.filter((_, idx) => idx !== i);
                update({ edges: nextEdges });
              }}
              title="删除此边"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* ── row 5: Description ── */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-gray-500">备注 (Description)</span>
        <textarea
          className="rounded border px-2 py-1 text-sm"
          rows={2}
          value={shape.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="额外备注信息"
        />
      </label>
    </div>
  );
}
