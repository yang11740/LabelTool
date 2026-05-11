import { useRef, useState } from "react";
import { loadShapeJsonObj } from "@/types/labelFile";
import type { ShapeData } from "@/types/labelFile";

interface UploadResult {
  image: HTMLImageElement;
  imageFileName: string;
  shapes: ShapeData[];
}

interface Props {
  onLoad: (result: UploadResult) => void;
}

export default function UploadPanel({ onLoad }: Props) {
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const imageRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  const tryLoad = (imgFile: File | null, jsonFile: File | null) => {
    if (!imgFile || !jsonFile) return;

    setError("");
    setStatus("加载中...");

    // read image
    const imgReader = new FileReader();
    imgReader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // read JSON after image is ready
        const jsonReader = new FileReader();
        jsonReader.onload = () => {
          try {
            const raw = JSON.parse(jsonReader.result as string);
            const shapeList: ShapeData[] = [];

            if (!Array.isArray(raw.shapes)) {
              setError("JSON 文件缺少 shapes 字段");
              setStatus("");
              return;
            }

            for (const s of raw.shapes) {
              const { shape, errors } = loadShapeJsonObj(s);
              if (errors.length > 0) {
                console.warn("Shape validation warnings:", errors);
              }
              shapeList.push(shape);
            }

            setStatus(`已加载: ${imgFile.name} (${shapeList.length} 个标注)`);
            onLoad({
              image: img,
              imageFileName: imgFile.name,
              shapes: shapeList,
            });
          } catch (e) {
            setError(`JSON 解析失败: ${(e as Error).message}`);
            setStatus("");
          }
        };
        jsonReader.readAsText(jsonFile);
      };
      img.onerror = () => {
        setError("图片加载失败");
        setStatus("");
      };
      img.src = imgReader.result as string;
    };
    imgReader.readAsDataURL(imgFile);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const imgFile = e.target.files?.[0] ?? null;
    const jsonFile = jsonRef.current?.files?.[0] ?? null;
    if (imgFile) setStatus(`图片已选择: ${imgFile.name}`);
    tryLoad(imgFile, jsonFile);
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const jsonFile = e.target.files?.[0] ?? null;
    const imgFile = imageRef.current?.files?.[0] ?? null;
    if (jsonFile) setStatus(`JSON 已选择: ${jsonFile.name}`);
    tryLoad(imgFile, jsonFile);
  };

  return (
    <div className="flex items-center gap-2">
      <label className="flex cursor-pointer items-center gap-1 rounded bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50">
        📷 图片
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          className="hidden"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-1 rounded bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50">
        📋 JSON
        <input
          ref={jsonRef}
          type="file"
          accept=".json"
          onChange={handleJsonChange}
          className="hidden"
        />
      </label>

      {status && <span className="text-xs text-green-700">{status}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
