import { loadShapeJsonObj } from "@/types/labelFile";
import type { ShapeData } from "@/types/labelFile";
import { buildLabelmeJson } from "./export";
import { nextNodeId } from "./shapeFactory";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "bmp", "tif", "tiff", "gif", "webp"]);

export interface LocalWorkspaceImage {
  name: string;
  baseName: string;
  hasLabel: boolean;
  directoryHandle: FileSystemDirectoryHandle;
  imageFileHandle: FileSystemFileHandle;
  jsonFileHandle: FileSystemFileHandle | null;
}

export interface LoadedLocalWorkspaceImage {
  imageSrc: string;
  imageFileName: string;
  imageWidth: number;
  imageHeight: number;
  shapes: ShapeData[];
  image: LocalWorkspaceImage;
}

export async function openLocalWorkspace(): Promise<LocalWorkspaceImage[]> {
  if (!window.showDirectoryPicker) {
    throw new Error("当前浏览器不支持本地文件夹选择，请使用 Chrome 或 Edge 的 localhost 页面。");
  }
  return readWorkspaceImages(await window.showDirectoryPicker());
}

export async function readWorkspaceImages(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<LocalWorkspaceImage[]> {
  const files = new Map<string, FileSystemFileHandle>();

  for await (const [, handle] of directoryHandle.entries()) {
    if (isFileHandle(handle)) files.set(handle.name, handle);
  }

  return [...files.values()]
    .filter((handle) => isImageName(handle.name))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
    .map((imageFileHandle) => {
      const baseName = stripExtension(imageFileHandle.name);
      const jsonFileHandle = files.get(`${baseName}.json`) ?? null;
      return {
        name: imageFileHandle.name,
        baseName,
        hasLabel: Boolean(jsonFileHandle),
        directoryHandle,
        imageFileHandle,
        jsonFileHandle,
      };
    });
}

export async function loadLocalWorkspaceImage(
  image: LocalWorkspaceImage,
): Promise<LoadedLocalWorkspaceImage> {
  const imageFile = await image.imageFileHandle.getFile();
  const imageSrc = URL.createObjectURL(imageFile);
  const imageElement = await loadImageElement(imageSrc);
  const shapes = image.jsonFileHandle ? await readShapesFromJsonHandle(image.jsonFileHandle) : [];

  return {
    imageSrc,
    imageFileName: image.name,
    imageWidth: imageElement.width,
    imageHeight: imageElement.height,
    shapes: ensureUniqueNodeIds(shapes, image.baseName),
    image,
  };
}

export async function saveLocalWorkspaceAnnotation(
  image: LocalWorkspaceImage,
  shapes: ShapeData[],
  imageWidth: number,
  imageHeight: number,
): Promise<LocalWorkspaceImage> {
  const json = buildLabelmeJson(shapes, image.name, imageWidth, imageHeight);
  const jsonFileHandle =
    image.jsonFileHandle ??
    (await image.directoryHandle.getFileHandle(`${image.baseName}.json`, { create: true }));
  const writable = await jsonFileHandle.createWritable();
  await writable.write(JSON.stringify(json, null, 2));
  await writable.close();

  return {
    ...image,
    hasLabel: true,
    jsonFileHandle,
  };
}

export async function readShapesFromJsonHandle(
  jsonFileHandle: FileSystemFileHandle,
): Promise<ShapeData[]> {
  const file = await jsonFileHandle.getFile();
  const text = await file.text();
  const parsed = JSON.parse(text) as { shapes?: unknown };
  if (!Array.isArray(parsed.shapes)) return [];

  return parsed.shapes
    .filter((shape): shape is Record<string, unknown> => {
      return typeof shape === "object" && shape !== null && !Array.isArray(shape);
    })
    .map((shape) => loadShapeJsonObj(shape).shape);
}

export function ensureUniqueNodeIds(shapes: ShapeData[], _baseName: string): ShapeData[] {
  const seen = new Set<string>();

  return shapes.map((shape, index) => {
    let nodeId = shape.node_id.trim();
    if (!nodeId || seen.has(nodeId)) {
      nodeId = nextNodeId([...shapes.slice(0, index), ...[...seen].map((id) => ({ node_id: id }))]);
    }
    seen.add(nodeId);
    return { ...shape, node_id: nodeId };
  });
}

function isImageName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  return Boolean(ext && IMAGE_EXTENSIONS.has(ext));
}

function isFileHandle(handle: FileSystemHandle): handle is FileSystemFileHandle {
  return handle.kind === "file";
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("图片加载失败"));
    el.src = src;
  });
}
