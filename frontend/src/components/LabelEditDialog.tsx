import { useState, useEffect } from "react";
import type { ShapeData } from "@/types/labelFile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

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

const RELATIONS = [
  "READS_AFTER",
  "ANNOTATES",
  "INSERTS_AT",
  "REPLACES",
  "OVERLAPS",
  "REPRESENTS",
] as const;

interface Props {
  shape: ShapeData;
  allNodeIds: string[];
  onSave: (updated: ShapeData) => void;
  onClose: () => void;
}

export default function LabelEditDialog({ shape, allNodeIds, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<ShapeData>({ ...shape });

  useEffect(() => {
    setDraft({ ...shape });
  }, [shape]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const update = (patch: Partial<ShapeData>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[420px] max-h-[85vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-700">
            {shape.node_id ? "编辑标注" : "新建标注"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Node type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-600">节点类型</label>
            <Select
              value={draft.type || draft.label || ""}
              onValueChange={(v) => update({ type: v, label: v })}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="— 选择类型 —" />
              </SelectTrigger>
              <SelectContent>
                {NODE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Node ID + Group ID */}
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-600">节点 ID</label>
              <Input
                className="h-9 text-sm"
                value={draft.node_id}
                onChange={(e) => update({ node_id: e.target.value })}
                placeholder="n_main_1"
              />
            </div>
            <div className="flex w-24 flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-600">组 ID</label>
              <Input
                className="h-9 text-sm"
                type="number"
                value={draft.group_id ?? ""}
                onChange={(e) =>
                  update({ group_id: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="—"
              />
            </div>
          </div>

          {/* Z-index + Color */}
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-600">图层</label>
              <Select
                value={String(draft.attributes.z_index)}
                onValueChange={(v) =>
                  update({ attributes: { ...draft.attributes, z_index: Number(v) } })
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Z_INDEX_OPTIONS.map((z) => (
                    <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-24 flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-600">颜色</label>
              <Select
                value={draft.attributes.color}
                onValueChange={(v) =>
                  update({
                    attributes: {
                      ...draft.attributes,
                      color: v as ShapeData["attributes"]["color"],
                    },
                  })
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Transcription */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-600">文本转写</label>
            <Textarea
              className="text-sm"
              rows={3}
              value={draft.transcription}
              onChange={(e) => update({ transcription: e.target.value })}
              placeholder="记录该区域的实际文字内容"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-600">备注</label>
            <Textarea
              className="text-sm"
              rows={2}
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="额外备注信息"
            />
          </div>

          {/* Edges */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-600">
                逻辑边
                <span className="ml-1 text-slate-400 font-normal">
                  ({draft.edges.length} 条)
                </span>
              </label>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  update({
                    edges: [...draft.edges, { target: "", relation: "READS_AFTER" }],
                  })
                }
              >
                + 添加
              </Button>
            </div>

            {draft.edges.length === 0 && (
              <p className="py-2 text-center text-xs text-slate-300">暂无逻辑边</p>
            )}

            {draft.edges.map((edge, i) => (
              <div key={i} className="flex gap-1.5">
                <Select
                  value={edge.target}
                  onValueChange={(v) => {
                    const next = [...draft.edges];
                    next[i] = { ...next[i], target: v };
                    update({ edges: next });
                  }}
                >
                  <SelectTrigger className="h-8 flex-1 text-sm">
                    <SelectValue placeholder="— 目标节点 —" />
                  </SelectTrigger>
                  <SelectContent>
                    {allNodeIds
                      .filter((id) => id !== draft.node_id)
                      .map((id) => (
                        <SelectItem key={id} value={id}>{id}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={edge.relation}
                  onValueChange={(v) => {
                    const nextEdges = [...draft.edges];
                    nextEdges[i] = { ...nextEdges[i], relation: v };
                    update({ edges: nextEdges });
                  }}
                >
                  <SelectTrigger className="h-8 w-28 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  className="shrink-0 rounded-md px-1.5 text-sm text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  onClick={() => {
                    update({ edges: draft.edges.filter((_, idx) => idx !== i) });
                  }}
                  title="删除此边"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave}>
            保存标注
          </Button>
        </div>
      </div>
    </div>
  );
}
