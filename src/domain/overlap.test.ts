import { describe, expect, it } from "vitest";
import { hasOverlapWithOthers, overlaps, packLanes } from "./overlap";

describe("overlaps", () => {
  it("detects overlapping ranges", () => {
    expect(overlaps({ start: "2026-01-01", end: "2026-01-05" }, { start: "2026-01-03", end: "2026-01-08" })).toBe(true);
  });
  it("detects adjacent-but-touching ranges as overlapping (inclusive)", () => {
    expect(overlaps({ start: "2026-01-01", end: "2026-01-05" }, { start: "2026-01-05", end: "2026-01-08" })).toBe(true);
  });
  it("detects non-overlapping ranges", () => {
    expect(overlaps({ start: "2026-01-01", end: "2026-01-05" }, { start: "2026-01-06", end: "2026-01-08" })).toBe(false);
  });
});

describe("packLanes", () => {
  it("puts non-overlapping items in the same lane", () => {
    const items = [
      { start: "2026-01-01", end: "2026-01-05" },
      { start: "2026-01-06", end: "2026-01-08" },
    ];
    expect(packLanes(items)).toEqual([0, 0]);
  });

  it("puts overlapping items in different lanes", () => {
    const items = [
      { start: "2026-01-01", end: "2026-01-05" },
      { start: "2026-01-03", end: "2026-01-08" },
    ];
    const lanes = packLanes(items);
    expect(lanes[0]).not.toBe(lanes[1]);
  });

  it("reuses a freed lane instead of growing indefinitely", () => {
    const items = [
      { start: "2026-01-01", end: "2026-01-02" }, // lane 0
      { start: "2026-01-01", end: "2026-01-02" }, // overlaps first -> lane 1
      { start: "2026-01-03", end: "2026-01-04" }, // both prior lanes free by now -> lane 0
    ];
    const lanes = packLanes(items);
    expect(Math.max(...lanes)).toBe(1);
    expect(lanes[2]).toBe(0);
  });
});

describe("hasOverlapWithOthers", () => {
  it("flags only the items that actually overlap something", () => {
    const items = [
      { start: "2026-01-01", end: "2026-01-05" },
      { start: "2026-01-03", end: "2026-01-08" },
      { start: "2026-01-10", end: "2026-01-12" },
    ];
    expect(hasOverlapWithOthers(items)).toEqual([true, true, false]);
  });
});
