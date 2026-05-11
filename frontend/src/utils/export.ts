import type Konva from "konva";
import type { ShapeData } from "@/types/labelFile";

const APP_VERSION = "6.1.0";

/** Build a standard labelme JSON object from the current annotation state. */
export function buildLabelmeJson(
  shapes: ShapeData[],
  imageBase64: string,
  imageFileName: string,
  imageWidth: number,
  imageHeight: number,
): object {
  return {
    version: APP_VERSION,
    flags: {},
    shapes: shapes.map((s) => ({
      label: s.type || s.label,
      points: s.points,
      group_id: s.group_id,
      description: s.description,
      shape_type: s.shape_type,
      flags: s.flags,
      mask: s.mask,
      node_id: s.node_id,
      type: s.type || s.label,
      transcription: s.transcription,
      attributes: {
        z_index: s.attributes.z_index,
        color: s.attributes.color,
      },
      edges: s.edges,
      other_data: s.other_data,
    })),
    imagePath: imageFileName,
    imageData: imageBase64,
    imageHeight,
    imageWidth,
  };
}

/** Trigger a JSON download in the browser. */
export function downloadJson(obj: object, fileName: string): void {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  triggerDownload(blob, fileName);
}

/**
 * Capture the Konva stage contents (background image + annotations)
 * and trigger a PNG download.
 */
export function exportStageImage(
  stageNode: Konva.Stage,
  fileName: string,
): void {
  // Use toBlob to avoid huge data URLs for large canvases.
  stageNode.toBlob({
    mimeType: "image/png",
    pixelRatio: 2, // 2x for retina-quality export
    callback(blob) {
      if (!blob) return;
      triggerDownload(blob, fileName);
    },
  });
}

// ── internal ──

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
