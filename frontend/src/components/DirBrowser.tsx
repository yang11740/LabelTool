import { useState, useCallback, useEffect } from "react";
import { scanDirectory, getImageUrl, readLabel, getWorkspace } from "@/api";
import { useToast } from "@/context/ToastContext";
import type { ImageInfo } from "@/api";
import type { ShapeData } from "@/types/labelFile";

interface LoadResult {
  imageSrc: string;
  imageFileName: string;
  imageWidth: number;
  imageHeight: number;
  shapes: ShapeData[];
  imagePath: string; // absolute path for API save
}

interface Props {
  onLoad: (result: LoadResult) => void;
}

export default function DirBrowser({ onLoad }: Props) {
  const [dirPath, setDirPath] = useState("");
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingImage, setLoadingImage] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    getWorkspace()
      .then((info) => {
        if (info.configured) setWorkspaceRoot(info.workspace_root);
      })
      .catch(() => {});
  }, []);

  const handleScan = useCallback(async () => {
    setLoading(true);
    setImages([]);
    try {
      // Pass the path even if empty — backend resolves to workspace root
      const list = await scanDirectory(dirPath.trim());
      setImages(list);
      if (list.length === 0) toast("info", "目录中没有图片文件");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [dirPath, toast]);

  const handleSelectImage = useCallback(
    async (info: ImageInfo) => {
      setLoadingImage(info.name);
      try {
        const url = getImageUrl(info.path);

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = "anonymous";
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("图片加载失败"));
          el.src = url;
        });

        let shapes: ShapeData[] = [];
        try {
          const label = await readLabel(info.path);
          shapes = label.shapes;
        } catch {
          // No label file yet — start with empty shapes
        }

        onLoad({
          imageSrc: url,
          imageFileName: info.name,
          imageWidth: img.width,
          imageHeight: img.height,
          shapes,
          imagePath: info.path,
        });
      } catch (e) {
        toast("error", (e as Error).message);
      } finally {
        setLoadingImage("");
      }
    },
    [onLoad, toast],
  );

  const placeholder = workspaceRoot
    ? `子目录（留空=根目录: ${workspaceRoot}）`
    : "输入图片目录绝对路径...";

  return (
    <div className="flex items-center gap-2">
      {workspaceRoot && (
        <span className="text-xs text-gray-400" title={workspaceRoot}>
          📁 {workspaceRoot.slice(workspaceRoot.replace(/\\/g, "/").lastIndexOf("/") + 1) ||
            workspaceRoot}
        </span>
      )}

      <input
        type="text"
        value={dirPath}
        onChange={(e) => setDirPath(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleScan()}
        placeholder={placeholder}
        className="w-44 rounded border px-2 py-1 text-xs"
      />
      <button
        onClick={handleScan}
        disabled={loading}
        className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "扫描中..." : "扫描"}
      </button>

      {images.length > 0 && (
        <select
          className="max-w-48 rounded border px-2 py-1 text-xs"
          value=""
          onChange={(e) => {
            const idx = Number(e.target.value);
            if (idx >= 0) handleSelectImage(images[idx]);
          }}
        >
          <option value="">-- 选择图片 ({images.length} 张) --</option>
          {images.map((img, i) => (
            <option key={img.path} value={i}>
              {img.has_label ? "📋 " : "🖼 "}
              {img.name}
            </option>
          ))}
        </select>
      )}

      {loadingImage && (
        <span className="text-xs text-blue-600">加载 {loadingImage}...</span>
      )}
    </div>
  );
}
