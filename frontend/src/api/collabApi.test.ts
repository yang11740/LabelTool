import { describe, expect, it } from "vitest";
import { canEditTask, setStoredToken, type CollabUser, type TaskItem } from "./collabApi";

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 1,
    status: "in_progress",
    assignee_id: 1,
    locked_by: 1,
    image_id: 10,
    image_name: "001.jpg",
    image_width: 100,
    image_height: 200,
    dataset_id: 2,
    ...overrides,
  };
}

const user: CollabUser = { id: 1, username: "alice", role: "annotator" };

describe("collab task permissions", () => {
  it("allows only the lock holder to edit in-progress tasks", () => {
    expect(canEditTask(task(), user)).toBe(true);
    expect(canEditTask(task({ locked_by: 2 }), user)).toBe(false);
    expect(canEditTask(task({ status: "submitted" }), user)).toBe(false);
  });

  it("does not crash without browser localStorage", () => {
    setStoredToken("abc");
    setStoredToken("");
    expect(true).toBe(true);
  });
});
