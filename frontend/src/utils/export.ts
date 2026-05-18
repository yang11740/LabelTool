import type Konva from "konva";
import type { ShapeData } from "@/types/labelFile";

const APP_VERSION = "6.1.0";

/** Build a standard labelme JSON object from the current annotation state. */
export function buildLabelmeJson(
  shapes: ShapeData[],
  imageFileName: string,
  imageWidth: number,
  imageHeight: number,
): object {
  return {
    version: APP_VERSION,
    flags: {},
    shapes: shapes.map((s) => ({
      node_id: s.node_id,
      group_id: s.group_id,
      type: s.type || s.label,
      shape_type: s.shape_type,
      transcription_raw: s.transcription_raw,
      transcription_semantic: s.transcription_semantic,
      points: s.points,
      attributes: {
        z_index: s.attributes.z_index,
        color: s.attributes.color,
        vague: s.attributes.vague,
        reading_direction: s.attributes.reading_direction,
        handwriting_style: s.attributes.handwriting_style,
      },
      edges: s.edges,
    })),
    imagePath: imageFileName,
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
