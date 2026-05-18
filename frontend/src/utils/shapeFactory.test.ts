import { describe, expect, it } from "vitest";
import { createShapeData, isMeaningfulShape, nextNodeId, rectanglePoints } from "./shapeFactory";

describe("shapeFactory", () => {
  it("creates desktop-compatible shapes for every MVP draw type", () => {
    const cases = [
      { type: "rectangle" as const, points: [[1, 2], [10, 20]] as [number, number][] },
      { type: "polygon" as const, points: [[1, 2], [10, 2], [10, 20]] as [number, number][] },
      { type: "point" as const, points: [[1, 2]] as [number, number][] },
      { type: "line" as const, points: [[1, 2], [10, 20]] as [number, number][] },
      { type: "circle" as const, points: [[5, 5], [10, 5]] as [number, number][] },
      { type: "linestrip" as const, points: [[1, 2], [10, 2], [10, 20]] as [number, number][] },
    ];

    for (const item of cases) {
      const shape = createShapeData(item.type, item.points);
      expect(shape.shape_type).toBe(item.type);
      expect(shape.points).toEqual(item.points);
      expect(shape.node_id).toMatch(/^n\d+$/);
      expect(shape.transcription_raw).toBe("");
      expect(shape.transcription_semantic).toBe("");
      expect(shape.attributes.reading_direction).toBe("RTL");
      expect(shape.edges).toEqual([]);
      expect(shape.other_data).toEqual({});
    }
  });

  it("normalizes rectangle points", () => {
    expect(rectanglePoints({ x: 10, y: 20 }, { x: 1, y: 2 })).toEqual([
      [1, 2],
      [10, 20],
    ]);
  });

  it("rejects incomplete shapes", () => {
    expect(isMeaningfulShape("polygon", [[1, 2]])).toBe(false);
    expect(isMeaningfulShape("linestrip", [[1, 2]])).toBe(false);
    expect(isMeaningfulShape("line", [[1, 2], [1, 2]])).toBe(false);
    expect(isMeaningfulShape("point", [[1, 2]])).toBe(true);
  });

  it("generates the next short node id", () => {
    expect(nextNodeId([{ node_id: "n1" }, { node_id: "n3" }])).toBe("n2");
  });
});
