import type { ShapeData } from "@/types/labelFile";
import { Tag, GitBranch, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  { value: "0", label: "0 — 纸张/界格线" },
  { value: "1", label: "1 — 正文/夹注" },
  { value: "2", label: "2 — 批注/标点" },
  { value: "3", label: "3 — 增补/涂改" },
  { value: "4", label: "4 — 印章/墨渍" },
];

const COLOR_OPTIONS = [
  { value: "black", label: "black" },
  { value: "red", label: "red" },
  { value: "other", label: "other" },
];

interface Props {
  shape: ShapeData | null;
  allNodeIds: string[];
  onShapeUpdate: (updated: ShapeData) => void;
}

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: typeof Tag;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2 mt-4 first:mt-0">
      <Icon size={13} className="text-slate-400" />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
    </div>
  );
}

export default function PropertyPanel({ shape, allNodeIds, onShapeUpdate }: Props) {
  if (!shape) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-400">
        点击画布上的图形以查看属性
      </div>
    );
  }

  const update = (patch: Partial<ShapeData>) => {
    onShapeUpdate({ ...shape, ...patch });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <Tag size={14} className="text-slate-400" />
        <h3 className="text-xs font-semibold text-slate-600">Properties</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
        {/* ── Node Identity ── */}
        <SectionHeader icon={Tag} label="节点属性" />

        <label className="flex flex-col gap-1 mb-2.5">
          <span className="text-[11px] text-slate-500">节点类型</span>
          <Select
            value={shape.type || shape.label || ""}
            onValueChange={(v) => update({ type: v, label: v })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="— 选择类型 —" />
            </SelectTrigger>
            <SelectContent>
              {NODE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="flex gap-2 mb-2.5">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-slate-500">节点 ID</span>
            <Input
              className="h-7 text-xs"
              value={shape.node_id}
              onChange={(e) => update({ node_id: e.target.value })}
              placeholder="n_main_1"
            />
          </label>
          <label className="flex w-20 flex-col gap-1">
            <span className="text-[11px] text-slate-500">组 ID</span>
            <Input
              className="h-7 text-xs"
              type="number"
              value={shape.group_id ?? ""}
              onChange={(e) =>
                update({ group_id: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="—"
            />
          </label>
        </div>

        <div className="flex gap-2 mb-2.5">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-slate-500">图层</span>
            <Select
              value={String(shape.attributes.z_index)}
              onValueChange={(v) =>
                update({
                  attributes: { ...shape.attributes, z_index: Number(v) },
                })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Z_INDEX_OPTIONS.map((z) => (
                  <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex w-20 flex-col gap-1">
            <span className="text-[11px] text-slate-500">颜色</span>
            <Select
              value={shape.attributes.color}
              onValueChange={(v) =>
                update({
                  attributes: {
                    ...shape.attributes,
                    color: v as ShapeData["attributes"]["color"],
                  },
                })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        {/* ── Transcription ── */}
        <SectionHeader icon={FileText} label="文本转写" />
        <label className="flex flex-col gap-1 mb-2.5">
          <Textarea
            className="text-xs"
            rows={3}
            value={shape.transcription}
            onChange={(e) => update({ transcription: e.target.value })}
            placeholder="记录该区域的实际文字内容"
          />
        </label>

        {/* ── Edges ── */}
        <SectionHeader icon={GitBranch} label="逻辑边" />
        <div className="mb-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {shape.edges.length} 条边
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="h-6 text-[11px]"
              onClick={() =>
                update({
                  edges: [...shape.edges, { target: "", relation: "READS_AFTER" }],
                })
              }
            >
              + 添加
            </Button>
          </div>

          {shape.edges.length === 0 && (
            <p className="py-2 text-center text-[11px] text-slate-300">暂无逻辑边</p>
          )}

          {shape.edges.map((edge, i) => (
            <div key={i} className="mb-1.5 flex gap-1">
              <Select
                value={edge.target}
                onValueChange={(v) => {
                  const next = [...shape.edges];
                  next[i] = { ...next[i], target: v };
                  update({ edges: next });
                }}
              >
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue placeholder="— 目标节点 —" />
                </SelectTrigger>
                <SelectContent>
                  {allNodeIds
                    .filter((id) => id !== shape.node_id)
                    .map((id) => (
                      <SelectItem key={id} value={id}>{id}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select
                value={edge.relation}
                onValueChange={(v) => {
                  const nextEdges = [...shape.edges];
                  nextEdges[i] = { ...nextEdges[i], relation: v };
                  update({ edges: nextEdges });
                }}
              >
                <SelectTrigger className="h-7 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                className="shrink-0 rounded-md px-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                onClick={() => {
                  update({ edges: shape.edges.filter((_, idx) => idx !== i) });
                }}
                title="删除此边"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        {/* ── Description ── */}
        <SectionHeader icon={FileText} label="备注" />
        <label className="flex flex-col gap-1 mb-2.5">
          <Textarea
            className="text-xs"
            rows={2}
            value={shape.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="额外备注信息"
          />
        </label>
      </div>
    </div>
  );
}
