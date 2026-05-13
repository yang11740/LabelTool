import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { useToast } from "@/context/ToastContext";
import type { ShapeData } from "@/types/labelFile";
import { loadShapeJsonObj } from "@/types/labelFile";
import { FolderOpen, RefreshCw, CheckCircle, ChevronDown, ChevronRight, FolderUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface LoadResult {
  imageSrc: string;
  imageFileName: string;
  imageWidth: number;
  imageHeight: number;
  shapes: ShapeData[];
  imagePath: string;
}

export interface DirBrowserHandle {
  saveFile: (name: string, content: string) => Promise<void>;
  hasDirHandle: () => boolean;
}

interface ImageEntry {
  name: string;
  handle: FileSystemFileHandle;
  hasLabel: boolean;
}

const IMG_RE = /\.(jpe?g|png)$/i;

interface Props {
  onLoad: (result: LoadResult) => void;
}

const DirBrowser = forwardRef<DirBrowserHandle, Props>(function DirBrowser(
  { onLoad },
  ref,
) {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loadingImage, setLoadingImage] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const { toast } = useToast();

  // exposed for parent save
  useImperativeHandle(ref, () => ({
    async saveFile(name: string, content: string) {
      const dh = dirHandleRef.current;
      if (!dh) throw new Error("No directory selected");
      const fh = await dh.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(content);
      await w.close();
    },
    hasDirHandle: () => dirHandleRef.current !== null,
  }));

  // ── browser-native folder picker ──

  const handlePickFolder = useCallback(async () => {
    try {
      const dh = await window.showDirectoryPicker({ mode: "readwrite" });
      dirHandleRef.current = dh;

      const entries: ImageEntry[] = [];
      for await (const [name, handle] of dh.entries()) {
        if (handle.kind !== "file") continue;
        if (!IMG_RE.test(name)) continue;

        // check for matching label file
        const jsonName = name.replace(/\.[^.]+$/, "") + ".json";
        let hasLabel = false;
        try {
          await dh.getFileHandle(jsonName);
          hasLabel = true;
        } catch {
          // no label file
        }

        entries.push({ name, handle: handle as FileSystemFileHandle, hasLabel });
      }

      entries.sort((a, b) => a.name.localeCompare(b.name));
      setImages(entries);

      if (entries.length === 0) {
        toast("info", "目录中没有图片文件");
      }
    } catch (e) {
      // user cancelled or API not supported
      if ((e as DOMException).name === "AbortError") return;
      toast("error", `无法打开目录: ${(e as Error).message}`);
    }
  }, [toast]);

  // ── load image + label from handles ──

  const handleSelectImage = useCallback(
    async (entry: ImageEntry) => {
      setLoadingImage(entry.name);
      // IMPORTANT: capture directory handle synchronously BEFORE any await,
      // otherwise dirHandleRef.current could be overwritten by a new folder
      // pick while image loading is in flight (race condition).
      const dh = dirHandleRef.current;
      try {
        const file = await entry.handle.getFile();
        const blobUrl = URL.createObjectURL(file);

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("图片加载失败"));
          el.src = blobUrl;
        });

        // try loading matching label JSON
        const jsonName = entry.name.replace(/\.[^.]+$/, "") + ".json";
        let shapes: ShapeData[] = [];
        if (dh) {
          try {
            const jsonHandle = await dh.getFileHandle(jsonName);
            const jsonFile = await jsonHandle.getFile();
            const text = await jsonFile.text();
            const obj = JSON.parse(text);

            // validate: JSON's imagePath should reference the current image
            const jsonImagePath: unknown = obj.imagePath;
            if (
              typeof jsonImagePath === "string" &&
              jsonImagePath !== entry.name
            ) {
              toast(
                "info",
                `JSON 文件 (${jsonName}) 的 imagePath (${jsonImagePath}) 与当前图片 (${entry.name}) 不匹配，可能标注数据错位`,
              );
            }

            const rawShapes: Record<string, unknown>[] = obj.shapes ?? [];
            shapes = rawShapes.map((raw) => loadShapeJsonObj(raw).shape);
          } catch {
            // no label or invalid — start fresh
          }
        }

        onLoad({
          imageSrc: blobUrl,
          imageFileName: entry.name,
          imageWidth: img.width,
          imageHeight: img.height,
          shapes,
          imagePath: jsonName,
        });
      } catch (e) {
        toast("error", (e as Error).message);
        // Ensure shapes are cleared even when image loading fails,
        // preventing stale shapes from the previous image.
        onLoad({
          imageSrc: "",
          imageFileName: entry.name,
          imageWidth: 0,
          imageHeight: 0,
          shapes: [],
          imagePath: "",
        });
      } finally {
        setLoadingImage("");
      }
    },
    [onLoad, toast],
  );

  return (
    <div className="flex h-full flex-col">
      {/* panel header */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <FolderOpen size={14} className="text-slate-400" />
        <h3 className="text-xs font-semibold text-slate-600">Files</h3>
      </div>

      {/* folder picker button */}
      <div className="border-b border-slate-100 p-2">
        <Button
          size="sm"
          onClick={handlePickFolder}
          className="w-full"
        >
          <FolderUp size={14} />
          选择目录
        </Button>
      </div>

      {/* advanced: path input */}
      <div className="border-b border-slate-100">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] text-slate-400 hover:bg-slate-50 transition-colors"
        >
          {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          高级（手动输入路径）
        </button>
        {showAdvanced && (
          <PathInput onLoad={onLoad} toast={toast} />
        )}
      </div>

      {/* image list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {images.length === 0 && (
          <p className="p-4 text-center text-xs text-slate-400">
            点击上方按钮，选择图片所在的文件夹
          </p>
        )}

        {images.map((entry) => (
          <button
            key={entry.name}
            onClick={() => handleSelectImage(entry)}
            disabled={loadingImage === entry.name}
            className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-xs transition-colors hover:bg-indigo-50 ${
              loadingImage === entry.name ? "bg-indigo-50" : ""
            }`}
          >
            {entry.hasLabel ? (
              <CheckCircle size={14} className="shrink-0 text-emerald-500" />
            ) : (
              <div className="h-3.5 w-3.5 shrink-0 rounded-sm border border-slate-300" />
            )}
            <span className="truncate text-slate-700">{entry.name}</span>
            {loadingImage === entry.name && (
              <span className="ml-auto shrink-0 text-indigo-500">
                <RefreshCw size={12} className="animate-spin" />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

export default DirBrowser;

// ── advanced path-based input (folded by default) ──

function PathInput({
  onLoad,
  toast,
}: {
  onLoad: (result: LoadResult) => void;
  toast: (type: "success" | "error" | "info", msg: string) => void;
}) {
  const [dirPath, setDirPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [imgList, setImgList] = useState<{ name: string; path: string; hasLabel: boolean }[]>([]);
  const [loadingImg, setLoadingImg] = useState("");

  // We lazily import the backend API only when path mode is used
  const handleScan = useCallback(async () => {
    setLoading(true);
    setImgList([]);
    try {
      const { scanDirectory } = await import("@/api");
      const list = await scanDirectory(dirPath.trim());
      setImgList(list.map((img) => ({ name: img.name, path: img.path, hasLabel: img.has_label })));
      if (list.length === 0) toast("info", "目录中没有图片文件");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [dirPath, toast]);

  const handleSelect = useCallback(async (item: { name: string; path: string }) => {
    setLoadingImg(item.name);
    try {
      const { getImageUrl, readLabel } = await import("@/api");

      const url = getImageUrl(item.path);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("图片加载失败"));
        el.src = url;
      });

      let shapes: ShapeData[] = [];
      try {
        const label = await readLabel(item.path);
        shapes = label.shapes;
      } catch { /* no label file */ }

      onLoad({
        imageSrc: url,
        imageFileName: item.name,
        imageWidth: img.width,
        imageHeight: img.height,
        shapes,
        imagePath: item.path,
      });
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setLoadingImg("");
    }
  }, [onLoad, toast]);

  const placeholder = "输入图片目录绝对路径...";

  return (
    <div>
      <div className="flex gap-1.5 p-2">
        <Input
          type="text"
          value={dirPath}
          onChange={(e) => setDirPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleScan()}
          placeholder={placeholder}
          className="h-7 flex-1 text-xs"
        />
        <Button
          size="sm"
          onClick={handleScan}
          disabled={loading}
          className="h-7 text-xs"
        >
          {loading ? (
            <RefreshCw size={12} className="animate-spin" />
          ) : (
            <span>扫描</span>
          )}
        </Button>
      </div>
      {imgList.map((img) => (
        <button
          key={img.path}
          onClick={() => handleSelect(img)}
          disabled={loadingImg === img.name}
          className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-xs transition-colors hover:bg-indigo-50 ${
            loadingImg === img.name ? "bg-indigo-50" : ""
          }`}
        >
          {img.hasLabel ? (
            <CheckCircle size={14} className="shrink-0 text-emerald-500" />
          ) : (
            <div className="h-3.5 w-3.5 shrink-0 rounded-sm border border-slate-300" />
          )}
          <span className="truncate text-slate-700">{img.name}</span>
        </button>
      ))}
    </div>
  );
}
