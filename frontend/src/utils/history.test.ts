import { describe, expect, it } from "vitest";
import { createEmptyHistory, pushHistory, redoHistory, undoHistory } from "./history";
import { createShapeData } from "./shapeFactory";

describe("history", () => {
  it("undoes and redoes shape snapshots", () => {
    const empty = [] as ReturnType<typeof createShapeData>[];
    const one = [createShapeData("point", [[1, 2]], { node_id: "n1" })];
    const two = [...one, createShapeData("point", [[3, 4]], { node_id: "n2" })];

    let history = createEmptyHistory();
    history = pushHistory(history, empty);
    history = pushHistory(history, one);

    const undone = undoHistory(history, two);
    expect(undone.shapes?.map((shape) => shape.node_id)).toEqual(["n1"]);

    const redone = redoHistory(undone.history, undone.shapes ?? []);
    expect(redone.shapes?.map((shape) => shape.node_id)).toEqual(["n1", "n2"]);
  });
});
