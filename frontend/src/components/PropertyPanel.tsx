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
  "PREPRINTED_TEXT",
  "RED_SEAL_STAMP",
] as const;

const RELATIONS = ["READS_AFTER", "ANNOTATES", "INSERTS_AT", "REPLACES", "OVERLAPS", "REPRESENTS"] as const;

const Z_INDEX_OPTIONS = [
  { value: 0, label: "0 - 正文基底" },
  { value: 1, label: "1 - 旁注/批注" },
  { value: 2, label: "2 - 涂改/增删" },
  { value: 3, label: "3 - 印章/符号" },
  { value: 4, label: "4 - 浮层标记" },
];

interface Props {
  shape: ShapeData | null;
  allNodeIds: string[];
  onShapeUpdate: (updated: ShapeData) => void;
}

export default function PropertyPanel({ shape, allNodeIds, onShapeUpdate }: Props) {
  if (!shape) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-400">
        选择一个标注对象后，可编辑节点类型、转写文本、属性和关系。
      </div>
    );
  }

  const update = (patch: Partial<ShapeData>) => onShapeUpdate({ ...shape, ...patch });
  const updateAttributes = (patch: Partial<ShapeData["attributes"]>) => {
    update({ attributes: { ...shape.attributes, ...patch } });
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-stone-50 p-4 text-sm text-stone-800">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Manuscript Node</p>
        <h3 className="mt-1 text-base font-semibold text-stone-900">节点属性</h3>
      </div>

      <section className="space-y-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">节点类型</span>
          <select
            className="rounded border border-stone-300 bg-white px-2 py-1.5"
            value={shape.type || shape.label}
            onChange={(e) => update({ type: e.target.value, label: e.target.value })}
          >
            <option value="">未设类型</option>
            {NODE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-stone-500">node_id</span>
            <input
              className="rounded border border-stone-300 bg-white px-2 py-1.5"
              value={shape.node_id}
              onChange={(e) => update({ node_id: e.target.value })}
              placeholder="n1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-stone-500">group_id</span>
            <input
              className="rounded border border-stone-300 bg-white px-2 py-1.5"
              value={shape.group_id ?? ""}
              onChange={(e) => update({ group_id: e.target.value || null })}
              placeholder="G_1"
            />
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-stone-500">层级</span>
            <select
              className="rounded border border-stone-300 bg-white px-2 py-1.5"
              value={shape.attributes.z_index}
              onChange={(e) => updateAttributes({ z_index: Number(e.target.value) })}
            >
              {Z_INDEX_OPTIONS.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-stone-500">墨色</span>
            <select
              className="rounded border border-stone-300 bg-white px-2 py-1.5"
              value={shape.attributes.color}
              onChange={(e) => updateAttributes({ color: e.target.value })}
            >
              <option value="black">black</option>
              <option value="red">red</option>
              <option value="other">other</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-stone-500">阅读方向</span>
            <select
              className="rounded border border-stone-300 bg-white px-2 py-1.5"
              value={shape.attributes.reading_direction}
              onChange={(e) => updateAttributes({ reading_direction: e.target.value })}
            >
              <option value="RTL">RTL</option>
              <option value="LTR">LTR</option>
            </select>
          </label>
          <label className="flex items-end gap-2 rounded border border-stone-200 bg-white px-2 py-1.5">
            <input
              type="checkbox"
              checked={shape.attributes.vague}
              onChange={(e) => updateAttributes({ vague: e.target.checked })}
            />
            <span className="text-xs text-stone-600">存疑/残缺</span>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">书写风格</span>
          <input
            className="rounded border border-stone-300 bg-white px-2 py-1.5"
            value={shape.attributes.handwriting_style}
            onChange={(e) => updateAttributes({ handwriting_style: e.target.value })}
            placeholder="行书、草书、楷书..."
          />
        </label>
      </section>

      <section className="space-y-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">原始转写 transcription_raw</span>
          <textarea
            className="min-h-20 rounded border border-stone-300 bg-white px-2 py-1.5"
            value={shape.transcription_raw}
            onChange={(e) => update({ transcription_raw: e.target.value })}
            placeholder="保留异体字、残缺、涂改等原貌信息"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">语义转写 transcription_semantic</span>
          <textarea
            className="min-h-20 rounded border border-stone-300 bg-white px-2 py-1.5"
            value={shape.transcription_semantic}
            onChange={(e) => update({ transcription_semantic: e.target.value })}
            placeholder="整理后的可读文本"
          />
        </label>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-stone-500">关系边 edges</span>
          <button
            className="rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 hover:bg-stone-100"
            onClick={() => update({ edges: [...shape.edges, { target: "", relation: "READS_AFTER" }] })}
          >
            添加关系
          </button>
        </div>

        {shape.edges.length === 0 && (
          <p className="rounded border border-dashed border-stone-300 py-3 text-center text-xs text-stone-400">
            暂无关系
          </p>
        )}

        {shape.edges.map((edge, i) => (
          <div key={`${edge.target}-${i}`} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-1">
            <select
              className="min-w-0 rounded border border-stone-300 bg-white px-1 py-1 text-xs"
              value={edge.target}
              onChange={(e) => {
                const next = [...shape.edges];
                next[i] = { ...next[i], target: e.target.value };
                update({ edges: next });
              }}
            >
              <option value="">选择目标节点</option>
              {allNodeIds
                .filter((id) => id !== shape.node_id)
                .map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
            </select>
            <select
              className="min-w-0 rounded border border-stone-300 bg-white px-1 py-1 text-xs"
              value={edge.relation}
              onChange={(e) => {
                const next = [...shape.edges];
                next[i] = { ...next[i], relation: e.target.value };
                update({ edges: next });
              }}
            >
              {RELATIONS.map((relation) => (
                <option key={relation} value={relation}>
                  {relation}
                </option>
              ))}
            </select>
            <button
              className="rounded px-2 text-xs text-red-500 hover:bg-red-50"
              onClick={() => update({ edges: shape.edges.filter((_, idx) => idx !== i) })}
              title="删除关系"
            >
              删除
            </button>
          </div>
        ))}
      </section>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-stone-500">说明 description</span>
        <textarea
          className="min-h-16 rounded border border-stone-300 bg-white px-2 py-1.5"
          value={shape.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="补充标注说明..."
        />
      </label>
    </div>
  );
}
