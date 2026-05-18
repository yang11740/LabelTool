import { describe, expect, it } from "vitest";
import { loadShapeJsonObj } from "./labelFile";

describe("loadShapeJsonObj", () => {
  it("loads the updated manuscript shape fields", () => {
    const { shape, errors } = loadShapeJsonObj({
      label: "MAIN_TEXT",
      points: [
        [1, 2],
        [3, 4],
      ],
      shape_type: "polygon",
      group_id: "G_1",
      flags: { checked: true },
      description: "note",
      node_id: "n_1",
      type: "MAIN_TEXT",
      transcription_raw: "原文",
      transcription_semantic: "语义",
      attributes: {
        z_index: 2,
        color: "red",
        vague: true,
        reading_direction: "LTR",
        handwriting_style: "行书",
      },
      edges: [{ target: "n_2", relation: "READS_AFTER" }],
      custom_field: "kept",
    });

    expect(errors).toEqual([]);
    expect(shape.transcription_raw).toBe("原文");
    expect(shape.transcription_semantic).toBe("语义");
    expect(shape.attributes).toMatchObject({
      z_index: 2,
      color: "red",
      vague: true,
      reading_direction: "LTR",
      handwriting_style: "行书",
    });
    expect(shape.group_id).toBe("G_1");
    expect(shape.edges).toEqual([{ target: "n_2", relation: "READS_AFTER" }]);
    expect(shape.other_data).toEqual({ custom_field: "kept" });
  });

  it("migrates old transcription and defaults missing shape_type to rectangle", () => {
    const { shape, errors } = loadShapeJsonObj({
      label: "MAIN_TEXT",
      points: [
        [1, 2],
        [3, 4],
      ],
      transcription: "旧转写",
      group_id: 7,
    });

    expect(errors).toEqual([]);
    expect(shape.shape_type).toBe("rectangle");
    expect(shape.transcription_raw).toBe("");
    expect(shape.transcription_semantic).toBe("旧转写");
    expect(shape.group_id).toBe(7);
  });

  it("reports invalid group_id strings", () => {
    const { shape, errors } = loadShapeJsonObj({
      label: "MAIN_TEXT",
      points: [
        [1, 2],
        [3, 4],
      ],
      group_id: "bad",
    });

    expect(shape.group_id).toBeNull();
    expect(errors).toContainEqual({
      field: "group_id",
      message: "group_id must be an integer, G_<integer>, or null",
    });
  });
});
