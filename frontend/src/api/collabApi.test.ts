import { describe, expect, it } from "vitest";
import {
  canAssignTask,
  canEditTask,
  canRejectTask,
  canReleaseTask,
  canReviewTask,
  canStartTask,
  canSubmitTask,
  friendlyApiError,
  setStoredToken,
  taskActionLabel,
  type CollabUser,
  type TaskItem,
} from "./collabApi";

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 1,
    status: "assigned",
    assignee_id: 1,
    locked_by: null,
    image_id: 10,
    image_name: "001.jpg",
    image_width: 100,
    image_height: 200,
    dataset_id: 2,
    ...overrides,
  };
}

const annotator: CollabUser = { id: 1, username: "alice", role: "annotator" };
const otherAnnotator: CollabUser = { id: 4, username: "bob", role: "annotator" };
const admin: CollabUser = { id: 2, username: "admin", role: "admin" };
const reviewer: CollabUser = { id: 3, username: "reviewer", role: "reviewer" };

describe("collab task permissions", () => {
  it("allows admins to assign or cancel unlocked non-reviewed tasks", () => {
    expect(canAssignTask(task({ status: "unassigned", assignee_id: null }), admin)).toBe(true);
    expect(canAssignTask(task({ status: "assigned" }), admin)).toBe(true);
    expect(canAssignTask(task({ status: "submitted" }), admin)).toBe(true);
    expect(canAssignTask(task({ status: "rejected" }), admin)).toBe(true);
    expect(canAssignTask(task({ status: "in_progress", locked_by: 1 }), admin)).toBe(false);
    expect(canAssignTask(task({ status: "reviewed" }), admin)).toBe(false);
    expect(canAssignTask(task(), annotator)).toBe(false);
  });

  it("allows only the assigned annotator to start assigned, submitted, or rejected tasks", () => {
    expect(canStartTask(task(), annotator)).toBe(true);
    expect(canStartTask(task({ status: "submitted" }), annotator)).toBe(true);
    expect(canStartTask(task({ status: "submitted", locked_by: 1 }), annotator)).toBe(true);
    expect(canStartTask(task({ status: "rejected" }), annotator)).toBe(true);
    expect(canStartTask(task(), otherAnnotator)).toBe(false);
    expect(canStartTask(task({ assignee_id: null }), annotator)).toBe(false);
    expect(canStartTask(task({ status: "unassigned", assignee_id: null }), annotator)).toBe(false);
    expect(canStartTask(task({ status: "reviewed" }), annotator)).toBe(false);
    expect(canStartTask(task(), admin)).toBe(false);
    expect(canStartTask(task(), reviewer)).toBe(false);
  });

  it("allows only reviewers to review submitted tasks", () => {
    const submitted = task({ status: "submitted", locked_by: null });
    expect(canReviewTask(submitted, reviewer)).toBe(true);
    expect(canRejectTask(submitted, reviewer)).toBe(true);
    expect(canReviewTask(submitted, annotator)).toBe(false);
    expect(canReviewTask(submitted, admin)).toBe(false);
    expect(canReviewTask(task({ status: "assigned" }), reviewer)).toBe(false);
    expect(canReviewTask(task({ status: "reviewed" }), reviewer)).toBe(false);
  });

  it("allows only the lock holder to edit and submit in-progress tasks", () => {
    const inProgress = task({ status: "in_progress", locked_by: 1 });
    expect(canEditTask(inProgress, annotator)).toBe(true);
    expect(canReleaseTask(inProgress, annotator)).toBe(true);
    expect(canSubmitTask(inProgress, annotator)).toBe(true);
    expect(canEditTask(inProgress, otherAnnotator)).toBe(false);
    expect(canReleaseTask(inProgress, otherAnnotator)).toBe(false);
    expect(canEditTask(task({ status: "submitted", locked_by: null }), annotator)).toBe(false);
    expect(canEditTask(inProgress, admin)).toBe(false);
  });

  it("allows admin to release any locked task", () => {
    expect(canReleaseTask(task({ status: "in_progress", locked_by: 1 }), admin)).toBe(true);
    expect(canReleaseTask(task({ status: "assigned", locked_by: 1 }), admin)).toBe(true);
    expect(canReleaseTask(task({ status: "unassigned", locked_by: null }), admin)).toBe(false);
    expect(canReleaseTask(task({ status: "in_progress", locked_by: 1 }), annotator)).toBe(true);
  });

  it("returns role-aware task action labels", () => {
    expect(taskActionLabel(task(), annotator)).toBe("打开查看，可手动锁定");
    expect(taskActionLabel(task({ status: "submitted" }), annotator)).toBe("打开查看，可手动锁定");
    expect(taskActionLabel(task({ status: "in_progress", locked_by: 1 }), annotator)).toBe("已锁定，可编辑");
    expect(taskActionLabel(task(), admin)).toBe("查看/分配");
    expect(taskActionLabel(task(), reviewer)).toBe("只读查看");
  });

  it("maps API errors to friendly Chinese messages", () => {
    expect(friendlyApiError(new Error("403 Permission denied"))).toContain("无权执行");
    expect(friendlyApiError(new Error("409 Task is locked by another user"))).toContain("任务已被锁定");
    expect(friendlyApiError(new Error("401 Invalid or expired token"))).toContain("重新登录");
    expect(friendlyApiError(new Error("Task is not assigned to this user"))).toContain("没有分配给当前账号");
  });

  it("does not crash without browser localStorage", () => {
    setStoredToken("abc");
    setStoredToken("");
    expect(true).toBe(true);
  });
});
