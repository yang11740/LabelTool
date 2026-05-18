import { describe, expect, it } from "vitest";
import { buildLabelmeJson } from "./export";
import type { ShapeData } from "@/types/labelFile";

function shape(overrides: Partial<ShapeData> = {}): ShapeData {
  return {
    label: "MAIN_TEXT",
    points: [
      [1, 2],
      [3, 4],
    ],
    shape_type: "rectangle",
    flags: {},
    description: "note",
    group_id: "G_1",
    mask: null,
    node_id: "n_1",
    type: "MAIN_TEXT",
    transcription_raw: "raw text",
    transcription_semantic: "semantic text",
    attributes: {
      z_index: 1,
      color: "black",
      vague: false,
      reading_direction: "RTL",
      handwriting_style: "regular",
    },
    edges: [{ target: "n_2", relation: "READS_AFTER" }],
    other_data: { custom_field: "kept" },
    ...overrides,
  };
}

describe("buildLabelmeJson", () => {
  it("exports compact desktop-compatible manuscript fields", () => {
    const json = buildLabelmeJson([shape()], "001.jpg", 100, 200) as {
      shapes: Array<Record<string, unknown>>;
      imageHeight: number;
      imageWidth: number;
    };

    expect(json.imageHeight).toBe(200);
    expect(json.imageWidth).toBe(100);
    expect(json).not.toHaveProperty("flags");
    expect(json).not.toHaveProperty("version");
    expect(json).not.toHaveProperty("imagePath");
    expect(json).not.toHaveProperty("imageData");
    expect(json.shapes).toHaveLength(1);
    expect(json.shapes[0]).toMatchObject({
      node_id: "n_1",
      group_id: "G_1",
      type: "MAIN_TEXT",
      shape_type: "rectangle",
      transcription_raw: "raw text",
      transcription_semantic: "semantic text",
      points: [
        [1, 2],
        [3, 4],
      ],
      attributes: {
        z_index: 1,
        color: "black",
        vague: false,
        reading_direction: "RTL",
        handwriting_style: "regular",
      },
      edges: [{ target: "n_2", relation: "READS_AFTER" }],
    });
    expect(json.shapes[0]).not.toHaveProperty("transcription");
    expect(json.shapes[0]).not.toHaveProperty("other_data");
    expect(json.shapes[0]).not.toHaveProperty("label");
    expect(json.shapes[0]).not.toHaveProperty("flags");
    expect(json.shapes[0]).not.toHaveProperty("description");
    expect(json.shapes[0]).not.toHaveProperty("mask");
    expect(json.shapes[0]).not.toHaveProperty("custom_field");
  });

  it("exports empty annotations", () => {
    const json = buildLabelmeJson([], "empty.jpg", 10, 20) as { shapes: unknown[] };

    expect(json.shapes).toEqual([]);
  });
});
