import { useEffect, useRef, useState } from "react";
import type { DragEvent, ReactNode, RefObject } from "react";
import { S } from "../styles";
import { api, ApiError } from "../api/client";
import type { CurrentUser, FocusList, FocusListSummary, FocusTask, ProjectTaskGroup } from "../api/types";
import type { TaskStatus } from "../domain/types";
import { STATUS_COLORS, STATUS_LABELS, STATUS_OPTIONS } from "../domain/types";
import { Badge, Btn, Card, ChevD, ChevR, Input, Label } from "../components/atoms";

/** Statuses shown in the browse panel by default — completed/abandoned work is hidden until asked for. */
const DEFAULT_VISIBLE_STATUSES: TaskStatus[] = ["not_started", "in_progress", "blocked"];

// Planner layout/filter prefs are per-browser conveniences, not shared data — plain localStorage,
// guarded so a private window or blocked storage never breaks the panel.
const LS_PANEL_WIDTH = "nigraan.planner.panelWidth";
const LS_PANEL_COLLAPSED = "nigraan.planner.panelCollapsed";
const LS_COLLAPSED = "nigraan.planner.collapsedProjects";
const LS_STATUS_FILTERS = "nigraan.planner.statusFilters";

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore — private browsing, quota, or storage disabled
  }
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || S.textMuted;
  const label = STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status;
  return <Badge color={color}>{label}</Badge>;
}

/** Whole days from today to `dateStr` (negative = in the past), comparing calendar dates only. */
function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dueLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

/** Red for overdue or due today, amber for the next couple of days, muted yellow further out. */
function dueColor(days: number): string {
  if (days <= 0) return "#ef4444";
  if (days <= 2) return "#f59e0b";
  return "#ca8a04";
}

/** Flags a Today/Release item whose PROJECT (not the task itself) has a release date that's close or passed. Silent when there's no target date or it's more than a week out. */
function DueBadge({ targetDate }: { targetDate: string | null }) {
  if (!targetDate) return null;
  const days = daysUntil(targetDate);
  if (days > 7) return null;
  return <Badge color={dueColor(days)}>{dueLabel(days)}</Badge>;
}

/** MIME type used for a task dragged in from the TaskBrowser panel (adds it to a list). */
const DRAG_TYPE_ADD = "application/json";
/** MIME type used for dragging an existing list item onto another one (reorders within the same list). */
const DRAG_TYPE_REORDER = "application/x-focus-reorder";

/** Wires up the native HTML5 drag-and-drop handlers a list container needs to accept a task dropped from the TaskBrowser panel. Ignores in-list reorder drags so the two gestures don't fight over the same drop. */
function useTaskDropZone(onDrop: (projectId: string, taskId: string) => void) {
  const [over, setOver] = useState(false);
  const handlers = {
    onDragEnter: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE_ADD)) return;
      e.preventDefault();
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE_ADD)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE_ADD)) return;
      e.preventDefault();
      setOver(false);
      const raw = e.dataTransfer.getData(DRAG_TYPE_ADD);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.projectId && parsed?.taskId) onDrop(parsed.projectId, parsed.taskId);
      } catch {
        // ignore malformed drag payload
      }
    },
  };
  return { over, handlers };
}

/** Data attribute rows tag themselves with so the container can find them for hit-testing during a reorder drag. Must match the literal `data-focus-item-id` JSX prop on FocusItemRow's root div. */
const REORDER_ROW_ATTR = "data-focus-item-id";

/**
 * Drag-to-reorder within a single Today/Release list. Each row is only a drag *source*
 * (draggable + dragstart/dragend); the *drop target* is the whole list container, which
 * tracks the cursor and geometrically finds the nearest row via getBoundingClientRect().
 * This is deliberate: with rows packed a few px apart, requiring the drop to land exactly
 * on a specific row's own box made most real drops silently rejected by the browser.
 */
function useReorder(containerRef: RefObject<HTMLDivElement | null>, itemIds: string[], onReorder: (ids: string[]) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const findNearestRow = (clientY: number): string | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rows = container.querySelectorAll<HTMLElement>(`[${REORDER_ROW_ATTR}]`);
    let bestId: string | null = null;
    let bestDist = Infinity;
    rows.forEach((row) => {
      const id = row.getAttribute(REORDER_ROW_ATTR);
      if (!id || id === dragId) return;
      const rect = row.getBoundingClientRect();
      const dist = Math.abs(clientY - (rect.top + rect.height / 2));
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    });
    return bestId;
  };

  const commit = (targetId: string | null) => {
    if (dragId && targetId && dragId !== targetId) {
      const ids = [...itemIds];
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(targetId);
      if (from !== -1 && to !== -1) {
        ids.splice(from, 1);
        ids.splice(to, 0, dragId);
        onReorder(ids);
      }
    }
    setDragId(null);
    setOverId(null);
  };

  const getDragProps = (itemId: string) => ({
    rowId: itemId,
    draggable: true,
    isDragging: dragId === itemId,
    isDropTarget: overId === itemId,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE_REORDER, itemId);
      e.dataTransfer.effectAllowed = "move";
      setDragId(itemId);
    },
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
  });

  const containerHandlers = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE_REORDER)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const nearest = findNearestRow(e.clientY);
      if (nearest !== overId) setOverId(nearest);
    },
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE_REORDER)) return;
      e.preventDefault();
      commit(findNearestRow(e.clientY));
    },
  };

  return { getDragProps, containerHandlers };
}

/** Drives a mouse-draggable divider that resizes the panel it's attached to, measured from the right edge of `containerRef`. Remembers the chosen width per browser. */
function useResizableSplit(containerRef: RefObject<HTMLDivElement | null>, initial: number, min: number, max: number) {
  const [width, setWidth] = useState(() => {
    const saved = readLS(LS_PANEL_WIDTH, initial);
    return typeof saved === "number" && Number.isFinite(saved) ? Math.min(max, Math.max(min, saved)) : initial;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = rect.right - e.clientX;
      setWidth(Math.min(max, Math.max(min, next)));
    };
    const onUp = () => setDragging(false);
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, containerRef, min, max]);

  useEffect(() => {
    writeLS(LS_PANEL_WIDTH, width);
  }, [width]);

  return { width, dragging, startDrag: () => setDragging(true) };
}

/** Vertical drag handle between the tab content and the task browser panel. */
function ResizeHandle({ dragging, onStart }: { dragging: boolean; onStart: () => void }) {
  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault();
        onStart();
      }}
      title="Drag to resize"
      style={{
        alignSelf: "stretch",
        width: 14,
        marginInline: -4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "col-resize",
        flexShrink: 0,
        zIndex: 1,
      }}
    >
      <div style={{ width: 4, height: "100%", minHeight: 40, borderRadius: 3, background: dragging ? S.primary : S.borderLight, transition: dragging ? "none" : "background 0.12s" }} />
    </div>
  );
}

function StatusFilterChips({ active, onToggle }: { active: Set<TaskStatus>; onToggle: (s: TaskStatus) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
      {STATUS_OPTIONS.map((s) => {
        const on = active.has(s);
        const color = STATUS_COLORS[s];
        return (
          <button
            key={s}
            onClick={() => onToggle(s)}
            title={on ? `Hide ${STATUS_LABELS[s]} tasks` : `Show ${STATUS_LABELS[s]} tasks`}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 20,
              border: `1px solid ${on ? color : S.borderLight}`,
              background: on ? color + "18" : "#fff",
              color: on ? color : S.textMuted,
              cursor: "pointer",
            }}
          >
            {STATUS_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

function TaskBrowser({ width, panelCollapsed, onTogglePanel }: { width: number; panelCollapsed: boolean; onTogglePanel: () => void }) {
  const [groups, setGroups] = useState<ProjectTaskGroup[] | null>(null);
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => readLS<Record<string, boolean>>(LS_COLLAPSED, {}));
  const [activeStatuses, setActiveStatuses] = useState<Set<TaskStatus>>(() => {
    const saved = readLS<TaskStatus[] | null>(LS_STATUS_FILTERS, null);
    const valid = Array.isArray(saved) && saved.every((s) => (STATUS_OPTIONS as string[]).includes(s));
    return new Set(valid ? saved! : DEFAULT_VISIBLE_STATUSES);
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.focus.allTasks().then(setGroups).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    writeLS(LS_COLLAPSED, collapsed);
  }, [collapsed]);

  useEffect(() => {
    writeLS(LS_STATUS_FILTERS, Array.from(activeStatuses));
  }, [activeStatuses]);

  const toggleStatus = (s: TaskStatus) =>
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const needle = q.trim().toLowerCase();
  const visible = (groups || [])
    .map((g) => ({
      ...g,
      tasks: g.tasks.filter((t) => activeStatuses.has(t.status as TaskStatus) && (!needle || t.taskName.toLowerCase().includes(needle))),
    }))
    .filter((g) => g.tasks.length > 0);

  const allCollapsed = visible.length > 0 && visible.every((g) => collapsed[g.projectId]);
  const toggleAllCollapsed = () =>
    setCollapsed((c) => {
      const next = { ...c };
      for (const g of visible) next[g.projectId] = !allCollapsed;
      return next;
    });

  if (panelCollapsed) {
    return (
      <button
        onClick={onTogglePanel}
        title="Expand task browser"
        style={{
          alignSelf: "stretch",
          width: 36,
          flexShrink: 0,
          border: `1px solid ${S.border}`,
          borderRadius: 12,
          background: "#fff",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          paddingTop: 14,
        }}
      >
        <span style={{ color: S.textMuted, fontSize: 13 }}>«</span>
        <span style={{ writingMode: "vertical-rl", fontSize: 12, fontWeight: 700, color: S.text, letterSpacing: "0.4px" }}>All Tasks</span>
      </button>
    );
  }

  return (
    <Card style={{ padding: 14, position: "sticky", top: 20, width, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.text }}>All tasks</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {visible.length > 0 && (
            <button
              onClick={toggleAllCollapsed}
              style={{ fontSize: 10.5, fontWeight: 600, color: S.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
          <button
            onClick={onTogglePanel}
            title="Collapse panel"
            style={{ fontSize: 13, color: S.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
          >
            »
          </button>
        </div>
      </div>
      <p style={{ fontSize: 11, color: S.textMuted, margin: "0 0 10px" }}>Drag a task onto Today or a release, on the left.</p>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tasks..." style={{ marginBottom: 10 }} />
      <StatusFilterChips active={activeStatuses} onToggle={toggleStatus} />
      {error && <p style={{ color: "#ef4444", fontSize: 12 }}>{error}</p>}
      {groups === null && <p style={{ color: S.textMuted, fontSize: 12 }}>Loading…</p>}
      {groups && visible.length === 0 && <p style={{ color: S.textMuted, fontSize: 12 }}>No tasks match the current filters.</p>}
      <div style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
        {visible.map((g) => {
          const isCollapsed = !!collapsed[g.projectId];
          return (
            <div key={g.projectId} style={{ marginBottom: 10 }}>
              <div
                onClick={() => setCollapsed((c) => ({ ...c, [g.projectId]: !c[g.projectId] }))}
                title={isCollapsed ? "Expand" : "Collapse"}
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "4px 2px" }}
              >
                <span style={{ color: S.textMuted, display: "flex" }}>{isCollapsed ? <ChevR /> : <ChevD />}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: S.text, flex: 1 }}>{g.projectName}</span>
                <span style={{ fontSize: 11, color: S.textMuted }}>{g.tasks.length}</span>
              </div>
              {!isCollapsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 19 }}>
                  {g.tasks.map((t) => (
                    <div
                      key={t.taskId}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/json", JSON.stringify({ projectId: g.projectId, taskId: t.taskId }));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      title="Drag onto Today or a release"
                      style={{
                        fontSize: 12,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: `1px solid ${S.borderLight}`,
                        background: "#fff",
                        color: S.text,
                        cursor: "grab",
                      }}
                    >
                      {t.taskName}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        {t.milestoneName && <span style={{ fontSize: 10, color: S.textMuted }}>{t.milestoneName}</span>}
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: STATUS_COLORS[t.status as TaskStatus] || S.textMuted }}>
                          {STATUS_LABELS[t.status as TaskStatus] || t.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FocusItemRow({
  item,
  onToggle,
  onRemove,
  dragProps,
}: {
  item: FocusTask;
  onToggle: () => void;
  onRemove: () => void;
  dragProps: ReturnType<ReturnType<typeof useReorder>["getDragProps"]>;
}) {
  return (
    <div
      data-focus-item-id={dragProps.rowId}
      draggable={dragProps.draggable}
      onDragStart={dragProps.onDragStart}
      onDragEnd={dragProps.onDragEnd}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        border: `1px solid ${S.borderLight}`,
        borderTop: dragProps.isDropTarget ? `2px solid ${S.primary}` : `2px solid transparent`,
        borderRadius: 8,
        background: "#fff",
        opacity: dragProps.isDragging ? 0.5 : 1,
      }}
    >
      <span title="Drag to reorder" style={{ cursor: "grab", color: S.textMuted, fontSize: 13, lineHeight: 1, flexShrink: 0 }}>
        ⠿
      </span>
      <input type="checkbox" checked={item.status === "done"} onChange={onToggle} style={{ cursor: "pointer" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: item.status === "done" ? S.textMuted : S.text, textDecoration: item.status === "done" ? "line-through" : "none" }}>
          {item.taskName}
        </div>
        {item.milestoneName && <div style={{ fontSize: 11, color: S.textMuted }}>{item.milestoneName}</div>}
      </div>
      <Badge color={S.primary}>{item.projectName}</Badge>
      {item.status !== "done" && <DueBadge targetDate={item.projectTargetDate} />}
      <StatusBadge status={item.status} />
      <button onClick={onRemove} title="Remove from this list" style={{ border: "none", background: "none", cursor: "pointer", color: S.textMuted, fontSize: 15, padding: 2 }}>
        ×
      </button>
    </div>
  );
}

/**
 * The list-items container both tabs drop onto — dashed + tinted while a task is dragged in
 * from the browse panel. Also the drop target for in-list reordering (see useReorder above),
 * so it carries a ref the reorder hook uses for hit-testing and merges both handler sets.
 */
function DropList({
  isOver,
  addHandlers,
  reorderHandlers,
  containerRef,
  children,
}: {
  isOver: boolean;
  addHandlers: ReturnType<typeof useTaskDropZone>["handlers"];
  reorderHandlers: ReturnType<typeof useReorder>["containerHandlers"];
  containerRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div
      ref={containerRef}
      onDragEnter={addHandlers.onDragEnter}
      onDragLeave={addHandlers.onDragLeave}
      onDragOver={(e) => {
        addHandlers.onDragOver(e);
        reorderHandlers.onDragOver(e);
      }}
      onDrop={(e) => {
        addHandlers.onDrop(e);
        reorderHandlers.onDrop(e);
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginBottom: 12,
        padding: 8,
        borderRadius: 8,
        border: `1px dashed ${isOver ? S.primary : "transparent"}`,
        background: isOver ? S.primaryLight : "transparent",
        transition: "background 0.1s, border-color 0.1s",
      }}
    >
      {children}
    </div>
  );
}

/** Plain-text rendering of a Today list, formatted for pasting into a standup update or chat message. */
function formatTodayAsText(list: FocusList): string {
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const lines = [`Today's plan — ${dateLabel}`, ""];
  if (list.items.length === 0) {
    lines.push("(nothing planned)");
  } else {
    for (const item of list.items) {
      lines.push(`${item.status === "done" ? "[x]" : "[ ]"} ${item.taskName} (${item.projectName})`);
    }
  }
  return lines.join("\n");
}

function CopyTodayButton({ list }: { list: FocusList }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatTodayAsText(list));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied/unavailable — nothing useful to do beyond leaving the button unchanged
    }
  };

  return (
    <button
      onClick={copy}
      title="Copy today's plan as plain text, formatted for a standup update"
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 6,
        border: `1px solid ${S.border}`,
        background: "#fff",
        color: copied ? "#16a34a" : S.textSec,
        cursor: "pointer",
      }}
    >
      {copied ? "Copied ✓" : "Copy as text"}
    </button>
  );
}

function TodayTab() {
  const [list, setList] = useState<FocusList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = () => api.focus.today().then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drop = useTaskDropZone((projectId, taskId) => {
    if (list) api.focus.addItem(list.id, projectId, taskId).then(setList).catch((e) => setError(e.message));
  });
  const reorder = useReorder(
    listRef,
    list?.items.map((i) => i.itemId) || [],
    (ids) => list && api.focus.reorder(list.id, ids).then(setList).catch((e) => setError(e.message)),
  );

  if (error) return <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>;
  if (!list) return <p style={{ color: S.textMuted }}>Loading…</p>;

  const done = list.items.filter((i) => i.status === "done").length;

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: S.text, margin: 0 }}>What am I working on today?</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: S.textMuted }}>
            {done}/{list.items.length} done
          </span>
          <CopyTodayButton list={list} />
        </div>
      </div>
      <DropList isOver={drop.over} addHandlers={drop.handlers} reorderHandlers={reorder.containerHandlers} containerRef={listRef}>
        {list.items.length === 0 && <p style={{ fontSize: 13, color: S.textMuted, margin: 0 }}>Nothing picked yet — drag a task here from the panel on the right.</p>}
        {list.items.map((item) => (
          <FocusItemRow
            key={item.itemId}
            item={item}
            onToggle={() => api.focus.toggleDone(list.id, item.itemId).then(setList).catch((e) => setError(e.message))}
            onRemove={() => api.focus.removeItem(list.id, item.itemId).then(setList).catch((e) => setError(e.message))}
            dragProps={reorder.getDragProps(item.itemId)}
          />
        ))}
      </DropList>
    </Card>
  );
}

function ReleaseDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [list, setList] = useState<FocusList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const load = () =>
    api.focus
      .getList(id)
      .then((l) => {
        setList(l);
        setTitle(l.title);
        setTargetDate(l.targetDate || "");
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const drop = useTaskDropZone((projectId, taskId) => {
    if (list) api.focus.addItem(list.id, projectId, taskId).then(setList).catch((e) => setError(e.message));
  });
  const reorder = useReorder(
    listRef,
    list?.items.map((i) => i.itemId) || [],
    (ids) => list && api.focus.reorder(list.id, ids).then(setList).catch((e) => setError(e.message)),
  );

  if (error) return <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>;
  if (!list) return <p style={{ color: S.textMuted }}>Loading…</p>;

  const done = list.items.filter((i) => i.status === "done").length;
  const pct = list.items.length ? Math.round((done / list.items.length) * 100) : 0;
  const dueDays = targetDate ? daysUntil(targetDate) : null;

  const saveMeta = async () => {
    try {
      const updated = await api.focus.updateRelease(list.id, { title: title.trim() || list.title, targetDate: targetDate || null });
      setList(updated);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save changes");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete release "${list.title}"? This only removes the release list, not the tasks in it.`)) return;
    try {
      await api.focus.deleteRelease(list.id);
      onChanged();
      onBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete release");
    }
  };

  return (
    <Card style={{ padding: 20 }}>
      <button onClick={onBack} style={{ fontSize: 12, color: S.textSec, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 12 }}>
        ← All releases
      </button>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveMeta} />
        </div>
        <div style={{ width: 160 }}>
          <Label>Target date</Label>
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} onBlur={saveMeta} />
        </div>
        <Btn variant="danger" onClick={remove}>
          Delete
        </Btn>
      </div>

      {dueDays !== null && (
        <p style={{ fontSize: 12, color: dueColor(dueDays), margin: "0 0 8px", fontWeight: dueDays <= 2 ? 600 : 400 }}>{dueLabel(dueDays)}</p>
      )}

      <div style={{ height: 6, background: S.borderLight, borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: S.primary, transition: "width 0.2s" }} />
      </div>

      <DropList isOver={drop.over} addHandlers={drop.handlers} reorderHandlers={reorder.containerHandlers} containerRef={listRef}>
        {list.items.length === 0 && <p style={{ fontSize: 13, color: S.textMuted, margin: 0 }}>No tasks attached yet — drag some in from the panel on the right.</p>}
        {list.items.map((item) => (
          <FocusItemRow
            key={item.itemId}
            item={item}
            onToggle={() => api.focus.toggleDone(list.id, item.itemId).then(setList).catch((e) => setError(e.message))}
            onRemove={() => api.focus.removeItem(list.id, item.itemId).then(setList).catch((e) => setError(e.message))}
            dragProps={reorder.getDragProps(item.itemId)}
          />
        ))}
      </DropList>
    </Card>
  );
}

function ReleasesTab() {
  const [releases, setReleases] = useState<FocusListSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => api.focus.listReleases().then(setReleases).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!title.trim()) return;
    try {
      await api.focus.createRelease(title.trim(), targetDate || null);
      setTitle("");
      setTargetDate("");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create release");
    }
  };

  if (selected) return <ReleaseDetail id={selected} onBack={() => setSelected(null)} onChanged={load} />;

  return (
    <>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <Label>New release</Label>
        <div style={{ display: "flex", gap: 8 }}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="e.g. This week's release" />
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={{ width: 160 }} />
          <Btn onClick={create}>Create</Btn>
        </div>
      </Card>

      {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
      {releases === null && <p style={{ color: S.textMuted }}>Loading…</p>}
      {releases && releases.length === 0 && (
        <Card style={{ padding: 40, textAlign: "center" }}>
          <p style={{ color: S.textMuted, fontSize: 13 }}>No releases yet — bundle tasks from multiple projects toward a shared deadline above.</p>
        </Card>
      )}
      {releases && releases.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {releases.map((r) => {
            const dueDays = r.targetDate ? daysUntil(r.targetDate) : null;
            const allDone = r.itemCount > 0 && r.doneCount === r.itemCount;
            return (
              <Card key={r.id} style={{ padding: "14px 18px", cursor: "pointer" }}>
                <div onClick={() => setSelected(r.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: S.text }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: S.textMuted, marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
                      <span>
                        {r.targetDate ? `Due ${r.targetDate}` : "No target date"} · {r.doneCount}/{r.itemCount} done
                      </span>
                      {dueDays !== null && !allDone && <Badge color={dueColor(dueDays)}>{dueLabel(dueDays)}</Badge>}
                    </div>
                  </div>
                  <Badge color={allDone ? "#16a34a" : S.primary}>{r.itemCount ? Math.round((r.doneCount / r.itemCount) * 100) : 0}%</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

export function PlannerScreen({ onBack }: { user: CurrentUser; onBack: () => void }) {
  const [tab, setTab] = useState<"today" | "releases">("today");
  const splitRef = useRef<HTMLDivElement>(null);
  const split = useResizableSplit(splitRef, 300, 220, 560);
  const [panelCollapsed, setPanelCollapsed] = useState(() => readLS(LS_PANEL_COLLAPSED, false));

  const togglePanel = () =>
    setPanelCollapsed((c) => {
      const next = !c;
      writeLS(LS_PANEL_COLLAPSED, next);
      return next;
    });

  return (
    <div style={{ minHeight: "100vh", background: S.bg, padding: "40px 20px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <button onClick={onBack} style={{ fontSize: 12, color: S.textSec, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 6 }}>
          ← Projects
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: S.text, margin: "0 0 16px" }}>Today & Priorities</h1>

        <div ref={splitRef} style={{ display: "flex", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <Btn variant={tab === "today" ? "primary" : "secondary"} onClick={() => setTab("today")}>
                Today
              </Btn>
              <Btn variant={tab === "releases" ? "primary" : "secondary"} onClick={() => setTab("releases")}>
                Releases
              </Btn>
            </div>
            {tab === "today" ? <TodayTab /> : <ReleasesTab />}
          </div>
          {!panelCollapsed && <ResizeHandle dragging={split.dragging} onStart={split.startDrag} />}
          {panelCollapsed && <div style={{ width: 10, flexShrink: 0 }} />}
          <TaskBrowser width={split.width} panelCollapsed={panelCollapsed} onTogglePanel={togglePanel} />
        </div>
      </div>
    </div>
  );
}
