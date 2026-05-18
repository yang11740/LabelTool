import { describe, expect, it } from "vitest";
import { createShapeData } from "./shapeFactory";
import { validateShapesForSave } from "./validation";

describe("validateShapesForSave", () => {
  it("rejects duplicate ids, empty ids, missing points, and bad edge targets", () => {
    const valid = createShapeData("point", [[1, 2]], { node_id: "n1" });
    const duplicate = createShapeData("point", [[3, 4]], { node_id: "n1" });
    const emptyId = createShapeData("point", [[5, 6]], { node_id: "" });
    const emptyPoints = createShapeData("point", [], { node_id: "n3" });
    const badEdge = createShapeData("point", [[7, 8]], {
      node_id: "n4",
      edges: [{ target: "missing", relation: "READS_AFTER" }],
    });

    const result = validateShapesForSave([valid, duplicate, emptyId, emptyPoints, badEdge]);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("node_id 重复：n1");
    expect(result.errors.join("\n")).toContain("缺少 node_id");
    expect(result.errors.join("\n")).toContain("n3 缺少 points");
    expect(result.errors.join("\n")).toContain("n4 指向不存在的 edge.target：missing");
  });

  it("accepts valid linked shapes", () => {
    const n1 = createShapeData("rectangle", [[1, 2], [3, 4]], {
      node_id: "n1",
      edges: [{ target: "n2", relation: "READS_AFTER" }],
    });
    const n2 = createShapeData("point", [[5, 6]], { node_id: "n2" });

    expect(validateShapesForSave([n1, n2])).toEqual({ ok: true, errors: [] });
  });
});
