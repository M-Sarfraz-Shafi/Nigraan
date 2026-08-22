import { describe, expect, it } from "vitest";
import { schedule, wouldCreateCycle } from "./schedule";
import type { Task, TeamMember, Holiday } from "./types";

const PROJ_START = "2026-01-05"; // Monday

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    milestoneId: "m1",
    parentId: null,
    name: overrides.id,
    type: "definitive",
    estimateDays: 1,
    originalEstimateDays: 1,
    assignedTo: null,
    status: "not_started",
    dependencies: [],
    notes: "",
    actualStart: null,
    actualEnd: null,
    manualStartDate: null,
    pinned: false,
    autoSchedule: true,
    ...overrides,
  };
}

describe("schedule", () => {
  it("returns empty array with no tasks", () => {
    expect(schedule([], PROJ_START, [], [])).toEqual([]);
  });

  it("schedules a single task starting at project start", () => {
    const tasks = [makeTask({ id: "a", estimateDays: 3 })];
    const [a] = schedule(tasks, PROJ_START, [], []);
    expect(a.computed?.startDate).toBe("2026-01-05");
    expect(a.computed?.endDate).toBe("2026-01-07"); // Mon-Wed, 3 work days
  });

  it("schedules a linear dependency chain sequentially", () => {
    const tasks = [
      makeTask({ id: "a", estimateDays: 2 }),
      makeTask({ id: "b", estimateDays: 2, dependencies: ["a"] }),
    ];
    const [a, b] = schedule(tasks, PROJ_START, [], []);
    expect(a.computed?.endDate).toBe("2026-01-06"); // Mon-Tue
    expect(b.computed?.startDate).toBe("2026-01-07"); // Wed, day after a ends
    expect(b.computed?.endDate).toBe("2026-01-08");
  });

  it("resolves a diamond dependency (b and c depend on a, d depends on both)", () => {
    const tasks = [
      makeTask({ id: "a", estimateDays: 1 }),
      makeTask({ id: "b", estimateDays: 3, dependencies: ["a"] }),
      makeTask({ id: "c", estimateDays: 1, dependencies: ["a"] }),
      makeTask({ id: "d", estimateDays: 1, dependencies: ["b", "c"] }),
    ];
    const scheduled = schedule(tasks, PROJ_START, [], []);
    const byId = Object.fromEntries(scheduled.map((t) => [t.id, t]));
    // d must start after the later of b and c (b, being longer, determines it)
    expect(byId.d.computed?.startDate).toBe(byId.b.computed?.endDate ? nextWorkday(byId.b.computed.endDate) : null);
  });

  it("aggregates parent task dates from its children", () => {
    const tasks = [
      makeTask({ id: "parent", parentId: null }),
      makeTask({ id: "child1", parentId: "parent", estimateDays: 2 }),
      makeTask({ id: "child2", parentId: "parent", estimateDays: 3, dependencies: ["child1"] }),
    ];
    const scheduled = schedule(tasks, PROJ_START, [], []);
    const parent = scheduled.find((t) => t.id === "parent")!;
    const child1 = scheduled.find((t) => t.id === "child1")!;
    const child2 = scheduled.find((t) => t.id === "child2")!;
    expect(parent.isParent).toBe(true);
    expect(parent.computed?.startDate).toBe(child1.computed?.startDate);
    expect(parent.computed?.endDate).toBe(child2.computed?.endDate);
  });

  it("skips weekends when estimating work days", () => {
    // Friday start, 3-day estimate should skip Sat/Sun
    const tasks = [makeTask({ id: "a", estimateDays: 3, manualStartDate: "2026-01-09" })]; // Friday
    const [a] = schedule(tasks, PROJ_START, [], []);
    expect(a.computed?.startDate).toBe("2026-01-09"); // Fri
    expect(a.computed?.endDate).toBe("2026-01-13"); // Fri, Mon, Tue (skips weekend)
  });

  it("skips holidays when estimating work days", () => {
    const holidays: Holiday[] = [{ date: "2026-01-06", name: "Test Holiday" }]; // Tuesday
    const tasks = [makeTask({ id: "a", estimateDays: 2 })];
    const [a] = schedule(tasks, PROJ_START, [], holidays);
    expect(a.computed?.startDate).toBe("2026-01-05"); // Mon
    expect(a.computed?.endDate).toBe("2026-01-07"); // Mon + Wed (Tue is holiday)
  });

  it("skips assigned member's leave days", () => {
    const members: TeamMember[] = [
      { id: "m1", name: "Alice", color: "#000", leave: [{ start: "2026-01-06", end: "2026-01-06", name: "PTO" }] },
    ];
    const tasks = [makeTask({ id: "a", estimateDays: 2, assignedTo: "m1" })];
    const [a] = schedule(tasks, PROJ_START, members, []);
    expect(a.computed?.startDate).toBe("2026-01-05"); // Mon
    expect(a.computed?.endDate).toBe("2026-01-07"); // Mon + Wed (Tue is leave)
  });

  it("schedules two tasks assigned to the same member in parallel (no forced serialization)", () => {
    const members: TeamMember[] = [{ id: "m1", name: "Alice", color: "#000", leave: [] }];
    const tasks = [
      makeTask({ id: "a", estimateDays: 2, assignedTo: "m1" }),
      makeTask({ id: "b", estimateDays: 2, assignedTo: "m1" }),
    ];
    const scheduled = schedule(tasks, PROJ_START, members, []);
    const byId = Object.fromEntries(scheduled.map((t) => [t.id, t]));
    // Both start at the project start — same assignee does not push either one later
    expect(byId.a.computed?.startDate).toBe(PROJ_START);
    expect(byId.b.computed?.startDate).toBe(PROJ_START);
  });

  it("does not chain a sibling's schedule off another task sharing the same assignee", () => {
    const members: TeamMember[] = [{ id: "m1", name: "Alice", color: "#000", leave: [] }];
    const tasks = [
      makeTask({ id: "a", estimateDays: 10, assignedTo: "m1", manualStartDate: "2026-01-05" }),
      makeTask({ id: "b", estimateDays: 2, assignedTo: "m1", manualStartDate: "2026-01-06" }),
    ];
    const scheduled = schedule(tasks, PROJ_START, members, []);
    const byId = Object.fromEntries(scheduled.map((t) => [t.id, t]));
    // b's own manual date is respected even though it falls inside a's range
    expect(byId.b.computed?.startDate).toBe("2026-01-06");
  });

  it("lets a manual start date fall before the project start date", () => {
    const tasks = [makeTask({ id: "a", estimateDays: 2, manualStartDate: "2025-12-29" })]; // before PROJ_START
    const [a] = schedule(tasks, PROJ_START, [], []);
    expect(a.computed?.startDate).toBe("2025-12-29");
  });

  it("respects actual dates for done tasks instead of computing them", () => {
    const tasks = [
      makeTask({ id: "a", status: "done", actualStart: "2026-01-05", actualEnd: "2026-01-05" }),
    ];
    const [a] = schedule(tasks, PROJ_START, [], []);
    expect(a.computed).toEqual({ startDate: "2026-01-05", endDate: "2026-01-05" });
  });

  it("does not throw on a cyclic dependency graph (defensive termination)", () => {
    const tasks = [
      makeTask({ id: "a", dependencies: ["b"] }),
      makeTask({ id: "b", dependencies: ["a"] }),
    ];
    expect(() => schedule(tasks, PROJ_START, [], [])).not.toThrow();
  });
});

describe("wouldCreateCycle", () => {
  const tasks = [
    makeTask({ id: "a", dependencies: [] }),
    makeTask({ id: "b", dependencies: ["a"] }),
    makeTask({ id: "c", dependencies: ["b"] }),
  ];

  it("detects a direct self-dependency", () => {
    expect(wouldCreateCycle(tasks, "a", "a")).toBe(true);
  });

  it("detects a cycle created transitively (a depends on c, but c already depends on b depends on a)", () => {
    expect(wouldCreateCycle(tasks, "a", "c")).toBe(true);
  });

  it("allows a valid new dependency that doesn't create a cycle", () => {
    expect(wouldCreateCycle(tasks, "c", "a")).toBe(false);
  });
});

function nextWorkday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
