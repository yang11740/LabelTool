import { describe, expect, it } from "vitest";
import { ensureUniqueNodeIds } from "./localWorkspace";
import type { ShapeData } from "@/types/labelFile";

function shape(node_id: string): ShapeData {
  return {
    label: "MAIN_TEXT",
    points: [[1, 2]],
    shape_type: "point",
    flags: {},
    description: "",
    group_id: null,
    mask: null,
    other_data: {},
    node_id,
    type: "MAIN_TEXT",
    transcription_raw: "",
    transcription_semantic: "",
    attributes: {
      z_index: 0,
      color: "black",
      vague: false,
      reading_direction: "RTL",
      handwriting_style: "",
    },
    edges: [],
  };
}

describe("ensureUniqueNodeIds", () => {
  it("fills empty node ids and deduplicates repeated ids per image", () => {
    const result = ensureUniqueNodeIds([shape(""), shape("n1"), shape("n1")], "page 001");

    expect(result.map((s) => s.node_id)).toEqual(["n1", "n2", "n3"]);
  });
});
