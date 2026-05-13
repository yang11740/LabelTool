import { Crosshair, Maximize, Layers, Image } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface Props {
  mouseCoords: { x: number; y: number } | null;
  scale: number;
  shapeCount: number;
  imageName: string | null;
  imageSize: { width: number; height: number } | null;
}

export default function StatusBar({
  mouseCoords,
  scale,
  shapeCount,
  imageName,
  imageSize,
}: Props) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-slate-200 bg-slate-50 px-3 text-xs text-slate-500">
      <span className="flex items-center gap-1.5">
        <Crosshair size={12} className="text-slate-400" />
        {mouseCoords ? (
          <>
            <span className="font-mono text-slate-700">{mouseCoords.x.toFixed(0)}</span>
            <span className="text-slate-300">,</span>
            <span className="font-mono text-slate-700">{mouseCoords.y.toFixed(0)}</span>
          </>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </span>

      <Separator orientation="vertical" className="h-4" />

      <span className="flex items-center gap-1.5">
        <Maximize size={12} className="text-slate-400" />
        <span className="font-mono">{(scale * 100).toFixed(0)}%</span>
      </span>

      <Separator orientation="vertical" className="h-4" />

      <span className="flex items-center gap-1.5">
        <Layers size={12} className="text-slate-400" />
        <span className="font-mono">{shapeCount}</span>
        <span>标注</span>
      </span>

      <Separator orientation="vertical" className="h-4" />

      <span className="flex items-center gap-1.5">
        <Image size={12} className="text-slate-400" />
        {imageName ? (
          <>
            <span>{imageName}</span>
            {imageSize && (
              <span className="text-slate-400">
                ({imageSize.width}&times;{imageSize.height})
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-400">未加载图片</span>
        )}
      </span>
    </footer>
  );
}
