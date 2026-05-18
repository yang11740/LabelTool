import { describe, expect, it } from "vitest";
import { createShapeData } from "./shapeFactory";
import {
  addRelationEdge,
  buildReadOrderEdges,
  nextNodeIdForStrategy,
  sortShapesByVerticalManuscriptOrder,
} from "./manuscriptTools";

describe("manuscriptTools", () => {
  it("sorts vertical manuscript order from right to left and top to bottom", () => {
    const leftTop = createShapeData("rectangle", [[10, 10], [20, 20]], { node_id: "left_top" });
    const rightBottom = createShapeData("rectangle", [[100, 90], [110, 100]], { node_id: "right_bottom" });
    const rightTop = createShapeData("rectangle", [[100, 10], [110, 20]], { node_id: "right_top" });

    expect(sortShapesByVerticalManuscriptOrder([leftTop, rightBottom, rightTop]).map((s) => s.node_id)).toEqual([
      "right_top",
      "right_bottom",
      "left_top",
    ]);
  });

  it("generates READS_AFTER edges by vertical manuscript order", () => {
    const a = createShapeData("point", [[100, 10]], { node_id: "a" });
    const b = createShapeData("point", [[100, 90]], { node_id: "b" });
    const c = createShapeData("point", [[10, 10]], { node_id: "c" });

    const result = buildReadOrderEdges([c, b, a]);

    expect(result.find((s) => s.node_id === "a")?.edges).toEqual([{ target: "b", relation: "READS_AFTER" }]);
    expect(result.find((s) => s.node_id === "b")?.edges).toEqual([{ target: "c", relation: "READS_AFTER" }]);
    expect(result.find((s) => s.node_id === "c")?.edges).toEqual([]);
  });

  it("adds quick relation once", () => {
    const source = createShapeData("point", [[1, 2]], { node_id: "n1" });
    const target = createShapeData("point", [[3, 4]], { node_id: "n2" });

    const once = addRelationEdge([source, target], "n1", "n2", "READS_AFTER");
    const twice = addRelationEdge(once, "n1", "n2", "READS_AFTER");

    expect(twice.find((s) => s.node_id === "n1")?.edges).toEqual([{ target: "n2", relation: "READS_AFTER" }]);
  });

  it("generates node ids by strategy", () => {
    const existing = [
      createShapeData("point", [[100, 10]], { node_id: "n1" }),
      createShapeData("point", [[100, 40]], { node_id: "c1_l1" }),
    ];

    expect(nextNodeIdForStrategy(existing, "sequential", [[1, 1]], "point")).toBe("n2");
    expect(nextNodeIdForStrategy(existing, "column_line", [[100, 80]], "point")).toBe("c1_l2");
  });
});
