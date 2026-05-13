import { useCallback, useState } from "react";
import type { ShapeData } from "@/types/labelFile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  FolderOpen,
  RefreshCw,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  FolderUp,
  Layers,
  Tag,
} from "lucide-react";

export interface ImageEntry {
  name: string;
  handle?: FileSystemFileHandle;
  path: string;
  hasLabel: boolean;
}

export interface RightPanelProps {
  imageEntries: ImageEntry[];
  currentImageName: string | null;
  shapes: ShapeData[];
  selectedId: string | null;
  onSelectShape: (id: string) => void;
  onEditShape: (shape: ShapeData) => void;
  onSelectImage: (entry: ImageEntry) => void;
  onPickFolder: () => void;
  onPathScan: (dirPath: string) => Promise<ImageEntry[]>;
  onSelectPathImage: (entry: ImageEntry) => void;
  loadingImage: string | null;
}

const COLOR_MAP: Record<string, string> = {
  black: "#1a1a1a",
  red: "#dc2626",
  other: "#7c3aed",
};

export default function RightPanel({
  imageEntries,
  currentImageName,
  shapes,
  selectedId,
  onSelectShape,
  onEditShape,
  onSelectImage,
  onPickFolder,
  onPathScan,
  onSelectPathImage,
  loadingImage,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<"files" | "annotations">("files");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dirPath, setDirPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [pathImages, setPathImages] = useState<ImageEntry[]>([]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setPathImages([]);
    try {
      const list = await onPathScan(dirPath.trim());
      setPathImages(list);
    } catch {
      // error handled by parent
    } finally {
      setScanning(false);
    }
  }, [dirPath, onPathScan]);

  // Collect unique label types from all shapes for the upper panel
  const labelTypes = Array.from(
    new Set(shapes.map((s) => s.type || s.label).filter(Boolean)),
  ).sort();

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white">
      {/* ── Upper: Labels panel ── */}
      <div className="h-[35%] flex flex-col overflow-hidden border-b border-slate-200">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
          <Tag size={20} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-600">标签总览</h3>
          <span className="ml-auto text-sm text-slate-400">
            {labelTypes.length} 类
          </span>
        </div>
        <ScrollArea className="flex-1">
          {labelTypes.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">
              暂无标签数据
            </p>
          ) : (
            <div className="p-2 space-y-0.5">
              {labelTypes.map((label) => {
                const count = shapes.filter(
                  (s) => (s.type || s.label) === label,
                ).length;
                return (
                  <div
                    key={label}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-400" />
                    <span className="flex-1 truncate text-slate-600">{label}</span>
                    <span className="text-sm text-slate-400">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Lower: Tabbed panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab headers */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            onClick={() => setActiveTab("files")}
            className={cn(
              "flex-1 px-3 py-2.5 text-sm font-medium transition-colors border-b-2",
              activeTab === "files"
                ? "border-indigo-500 text-indigo-600 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <FolderOpen size={18} className="inline mr-1.5" />
            文件列表
          </button>
          <button
            onClick={() => setActiveTab("annotations")}
            className={cn(
              "flex-1 px-3 py-2.5 text-sm font-medium transition-colors border-b-2",
              activeTab === "annotations"
                ? "border-indigo-500 text-indigo-600 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <Layers size={18} className="inline mr-1.5" />
            标注列表
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "files" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Folder picker + Advanced */}
            <div className="shrink-0 border-b border-slate-100 p-2 space-y-1.5">
              <Button
                size="default"
                onClick={onPickFolder}
                className="w-full"
              >
                <FolderUp size={20} />
                选择目录
              </Button>

              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center gap-1 px-1 py-1 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showAdvanced ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                高级（手动输入路径）
              </button>

              {showAdvanced && (
                <div className="flex gap-1.5">
                  <Input
                    type="text"
                    value={dirPath}
                    onChange={(e) => setDirPath(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScan()}
                    placeholder="输入图片目录绝对路径..."
                    className="h-8 flex-1 text-sm"
                  />
                  <Button
                    size="default"
                    onClick={handleScan}
                    disabled={scanning}
                    className="h-8 text-sm"
                  >
                    {scanning ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      "扫描"
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Path-based image list */}
            {pathImages.length > 0 && (
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {pathImages.map((entry) => (
                  <ImageRow
                    key={entry.path}
                    entry={entry}
                    isCurrent={entry.name === currentImageName}
                    isLoading={loadingImage === entry.name}
                    onSelect={() => onSelectPathImage(entry)}
                  />
                ))}
              </div>
            )}

            {/* Browser-native image list */}
            {pathImages.length === 0 && (
              <ScrollArea className="flex-1">
                {imageEntries.length === 0 ? (
                  <p className="p-4 text-center text-sm text-slate-400">
                    点击上方按钮，选择图片所在的文件夹
                  </p>
                ) : (
                  imageEntries.map((entry) => (
                    <ImageRow
                      key={entry.name}
                      entry={entry}
                      isCurrent={entry.name === currentImageName}
                      isLoading={loadingImage === entry.name}
                      onSelect={() => onSelectImage(entry)}
                    />
                  ))
                )}
              </ScrollArea>
            )}
          </div>
        ) : (
          /* Annotations tab */
          <div className="flex-1 flex flex-col overflow-hidden">
            {shapes.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-slate-400">
                <Layers size={28} className="opacity-30" />
                <span>暂无标注</span>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                {shapes.map((s) => {
                  const color = COLOR_MAP[s.attributes.color] ?? COLOR_MAP.black;
                  const tag = s.type || s.label || "";
                  const isSelected = s.node_id === selectedId;

                  return (
                    <button
                      key={s.node_id}
                      onClick={() => onSelectShape(s.node_id)}
                      onDoubleClick={() => onEditShape(s)}
                      className={cn(
                        "flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm transition-colors hover:bg-indigo-50",
                        isSelected && "bg-indigo-50 ring-1 ring-inset ring-indigo-200",
                      )}
                    >
                      <div
                        className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/20"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-slate-700 truncate">
                          {s.node_id || "—"}
                        </div>
                        {tag && (
                          <div className="truncate text-slate-400 text-sm">{tag}</div>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-slate-400 text-sm">
                        {s.attributes.z_index}
                      </span>
                    </button>
                  );
                })}
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function ImageRow({
  entry,
  isCurrent,
  isLoading,
  onSelect,
}: {
  entry: ImageEntry;
  isCurrent: boolean;
  isLoading: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={isLoading}
      className={cn(
        "flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm transition-colors hover:bg-indigo-50",
        isCurrent && "bg-indigo-50",
        isLoading && "bg-indigo-50",
      )}
    >
      {entry.hasLabel ? (
        <CheckCircle size={20} className="shrink-0 text-emerald-500" />
      ) : (
        <div className="h-4 w-4 shrink-0 rounded-sm border border-slate-300" />
      )}
      <span
        className={cn(
          "truncate",
          isCurrent ? "font-medium text-indigo-600" : "text-slate-700",
        )}
      >
        {entry.name}
      </span>
      {isLoading && (
        <RefreshCw size={18} className="ml-auto shrink-0 animate-spin text-indigo-500" />
      )}
    </button>
  );
}
