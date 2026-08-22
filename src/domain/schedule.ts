import { addD, addWD, fmtDate, isOff, toDate } from "./dates";
import type { ComputedDates, ScheduledTask, Task, TeamMember, Holiday } from "./types";

/**
 * Computes start/end dates for every task given dependencies, assignee availability,
 * weekends, holidays, and per-member leave. Deterministic: same inputs -> same output,
 * so every client can recompute locally without a server round-trip.
 */
export function schedule(
  tasks: Task[],
  projStart: string | null | undefined,
  members: TeamMember[],
  holidays: Holiday[],
): ScheduledTask[] {
  if (!tasks.length || !projStart) return [];
  const start = toDate(projStart);
  if (!start) return tasks as ScheduledTask[];

  const chOf: Record<string, string[]> = {};
  tasks.forEach((t) => {
    if (t.parentId) {
      if (!chOf[t.parentId]) chOf[t.parentId] = [];
      chOf[t.parentId].push(t.id);
    }
  });
  const isPar = (id: string) => !!(chOf[id] && chOf[id].length);
  const leafs = new Set(tasks.filter((t) => !isPar(t.id)).map((t) => t.id));
  const tm: Record<string, Task> = Object.fromEntries(tasks.map((t) => [t.id, { ...t }]));
  const mm: Record<string, TeamMember> = Object.fromEntries(members.map((m) => [m.id, m]));

  const vis = new Set<string>();
  const ord: string[] = [];
  const tmp = new Set<string>();
  const visit = (id: string) => {
    if (tmp.has(id) || vis.has(id)) return;
    tmp.add(id);
    const t = tm[id];
    (t.dependencies || []).forEach((d) => {
      if (leafs.has(d)) visit(d);
      if (chOf[d]) chOf[d].forEach((c) => { if (leafs.has(c)) visit(c); });
    });
    if (t.parentId && tm[t.parentId]) {
      (tm[t.parentId].dependencies || []).forEach((d) => {
        if (chOf[d]) chOf[d].forEach((c) => { if (leafs.has(c)) visit(c); });
        else if (leafs.has(d)) visit(d);
      });
    }
    tmp.delete(id);
    vis.add(id);
    ord.push(id);
  };
  leafs.forEach((id) => visit(id));

  // Note: tasks are scheduled independently per assignee — one person can be
  // scheduled on multiple tasks at once. Overlap is surfaced in the Resources
  // view rather than prevented here.
  const comp: Record<string, ComputedDates> = {};

  ord.forEach((id) => {
    const t = tm[id];
    const mem = t.assignedTo ? mm[t.assignedTo] : null;

    if (t.status === "done" && t.actualStart && t.actualEnd) {
      comp[id] = { startDate: t.actualStart, endDate: t.actualEnd };
      return;
    }

    // Raw mode: no auto-scheduling, just use manual dates or today + estimate
    if (t.autoSchedule === false) {
      const s = t.manualStartDate ? toDate(t.manualStartDate)! : new Date(start);
      const est = t.estimateDays || 1;
      const end = addD(s, est - 1);
      comp[id] = { startDate: fmtDate(s), endDate: fmtDate(end) };
      return;
    }

    let ear = t.manualStartDate ? toDate(t.manualStartDate)! : new Date(start);
    const resDep = (did: string): Date | null => {
      if (comp[did]) return toDate(comp[did].endDate);
      if (chOf[did]) {
        let l: Date | null = null;
        chOf[did].forEach((c) => {
          if (comp[c]) {
            const e = toDate(comp[c].endDate)!;
            if (!l || e > l) l = e;
          }
        });
        return l;
      }
      return null;
    };
    (t.dependencies || []).forEach((d) => {
      const e = resDep(d);
      if (e) {
        const n = addD(e, 1);
        if (n > ear) ear = n;
      }
    });
    if (t.parentId && tm[t.parentId]) {
      (tm[t.parentId].dependencies || []).forEach((d) => {
        const e = resDep(d);
        if (e) {
          const n = addD(e, 1);
          if (n > ear) ear = n;
        }
      });
    }
    while (isOff(ear, holidays, mem)) ear = addD(ear, 1);
    const est = t.estimateDays || 1;
    const end = addWD(ear, est, holidays, mem)!;
    comp[id] = { startDate: fmtDate(ear), endDate: fmtDate(end) };
  });

  const pComp: Record<string, ComputedDates> = {};
  Object.keys(chOf).forEach((pid) => {
    let mS: Date | null = null;
    let mE: Date | null = null;
    chOf[pid].forEach((c) => {
      if (comp[c]) {
        const s = toDate(comp[c].startDate)!;
        const e = toDate(comp[c].endDate)!;
        if (!mS || s < mS) mS = s;
        if (!mE || e > mE) mE = e;
      }
    });
    if (mS && mE) pComp[pid] = { startDate: fmtDate(mS), endDate: fmtDate(mE) };
  });

  return tasks.map((t) => ({
    ...t,
    computed: comp[t.id] || pComp[t.id] || null,
    isParent: isPar(t.id),
  }));
}

/**
 * True if adding `newDepId` as a dependency of `taskId` would create a cycle.
 * Walks the dependency graph as-if the edge already existed.
 */
export function wouldCreateCycle(tasks: Task[], taskId: string, newDepId: string): boolean {
  if (taskId === newDepId) return true;
  const depsOf: Record<string, string[]> = Object.fromEntries(
    tasks.map((t) => [t.id, t.id === taskId ? [...(t.dependencies || []), newDepId] : t.dependencies || []]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const d of depsOf[id] || []) {
      if (hasCycle(d)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return hasCycle(taskId);
}
