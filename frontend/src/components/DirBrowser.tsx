import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";
import {
  loadLocalWorkspaceImage,
  openLocalWorkspace,
  type LoadedLocalWorkspaceImage,
  type LocalWorkspaceImage,
} from "@/utils/localWorkspace";

interface Props {
  currentImageName: string | null;
  currentDirty: boolean;
  savedImage: LocalWorkspaceImage | null;
  onBeforeImageChange: () => Promise<boolean>;
  onLoad: (result: LoadedLocalWorkspaceImage) => void;
}

export default function DirBrowser({
  currentImageName,
  currentDirty,
  savedImage,
  onBeforeImageChange,
  onLoad,
}: Props) {
  const [images, setImages] = useState<LocalWorkspaceImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingImage, setLoadingImage] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const selectionRequestRef = useRef(0);
  const { toast } = useToast();

  useEffect(() => {
    if (!savedImage) return;
    setImages((prev) => prev.map((img) => (img.name === savedImage.name ? savedImage : img)));
  }, [savedImage]);

  const currentIndex = currentImageName
    ? images.findIndex((img) => img.name === currentImageName)
    : -1;

  const openImage = useCallback(
    async (image: LocalWorkspaceImage) => {
      if (!(await onBeforeImageChange())) return;
      const requestId = selectionRequestRef.current + 1;
      selectionRequestRef.current = requestId;
      setLoadingImage(image.name);
      try {
        const loaded = await loadLocalWorkspaceImage(image);
        if (selectionRequestRef.current !== requestId) return;
        onLoad(loaded);
      } catch (e) {
        if (selectionRequestRef.current === requestId) toast("error", (e as Error).message);
      } finally {
        if (selectionRequestRef.current === requestId) setLoadingImage("");
      }
    },
    [onBeforeImageChange, onLoad, toast],
  );

  const handleOpenFolder = useCallback(async () => {
    if (!(await onBeforeImageChange())) return;
    setLoading(true);
    try {
      const list = await openLocalWorkspace();
      setImages(list);
      setWorkspaceName(list[0]?.directoryHandle.name ?? "");
      if (list.length === 0) {
        toast("info", "该文件夹中没有可识别的图片");
      } else {
        toast("success", `已读取 ${list.length} 张图片`);
      }
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") toast("error", err.message);
    } finally {
      setLoading(false);
    }
  }, [onBeforeImageChange, toast]);

  const openOffset = useCallback(
    (offset: number) => {
      if (currentIndex < 0) return;
      const next = images[currentIndex + offset];
      if (next) void openImage(next);
    },
    [currentIndex, images, openImage],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "a" || event.key === "A" || event.key === "[") {
        event.preventDefault();
        openOffset(-1);
      } else if (event.key === "d" || event.key === "D" || event.key === "]") {
        event.preventDefault();
        openOffset(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openOffset]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleOpenFolder}
        disabled={loading}
        className="rounded border border-stone-900 bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
      >
        {loading ? "打开中..." : "打开文件夹"}
      </button>

      {workspaceName && (
        <span className="max-w-32 truncate text-xs text-stone-500" title={workspaceName}>
          {workspaceName}
        </span>
      )}

      {images.length > 0 && (
        <>
          <button
            className="rounded border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-700 disabled:opacity-40"
            disabled={currentIndex <= 0}
            onClick={() => openOffset(-1)}
            title="A / ["
          >
            上一张
          </button>
          <select
            className="max-w-64 rounded border border-stone-300 bg-white px-2 py-1.5 text-xs"
            value={currentIndex >= 0 ? String(currentIndex) : ""}
            onChange={(e) => {
              const idx = Number(e.target.value);
              if (idx >= 0) void openImage(images[idx]);
            }}
          >
            <option value="">选择图片 ({images.length})</option>
            {images.map((img, i) => (
              <option key={`${img.name}-${i}`} value={i}>
                {i === currentIndex ? "当前 " : ""}
                {i === currentIndex && currentDirty ? "[未保存] " : img.hasLabel ? "[JSON] " : "[new] "}
                {img.name}
              </option>
            ))}
          </select>
          <button
            className="rounded border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-700 disabled:opacity-40"
            disabled={currentIndex < 0 || currentIndex >= images.length - 1}
            onClick={() => openOffset(1)}
            title="D / ]"
          >
            下一张
          </button>
        </>
      )}

      {loadingImage && <span className="text-xs text-amber-800">加载 {loadingImage}...</span>}
    </div>
  );
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}
