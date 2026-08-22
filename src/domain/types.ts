export type TaskStatus = "not_started" | "in_progress" | "done" | "blocked" | "not_pursuing";
export type TaskType = "definitive" | "research";

export interface Leave {
  start: string;
  end: string;
  name: string;
}

export interface TeamMember {
  id: string;
  name: string;
  color: string;
  leave: Leave[];
}

export interface Holiday {
  date: string;
  name: string;
}

export interface Milestone {
  id: string;
  name: string;
  color: string;
  createdBy?: string;
}

export interface Task {
  id: string;
  milestoneId: string;
  parentId: string | null;
  name: string;
  type: TaskType;
  estimateDays: number;
  /** The estimate given at creation, fixed forever after — used to detect and highlight scope overrun. */
  originalEstimateDays: number;
  assignedTo: string | null;
  status: TaskStatus;
  dependencies: string[];
  notes: string;
  actualStart: string | null;
  actualEnd: string | null;
  manualStartDate: string | null;
  pinned: boolean;
  autoSchedule: boolean;
}

export interface ComputedDates {
  startDate: string;
  endDate: string;
}

export interface ScheduledTask extends Task {
  computed: ComputedDates | null;
  isParent: boolean;
}

export interface BaselineTaskSnapshot {
  id: string;
  name: string;
  milestoneId: string;
  parentId: string | null;
  estimateDays: number;
  assignedTo: string | null;
  status: TaskStatus;
  dependencies: string[];
  computedStart: string | null;
  computedEnd: string | null;
  type: TaskType;
}

export interface Baseline {
  id: string;
  name: string;
  date: string;
  tasks: BaselineTaskSnapshot[];
}

export interface ProjectInfo {
  name: string;
  startDate: string;
  /** The committed release date, set by a PO/admin. Shown as a fixed vertical marker in the Timeline. */
  targetReleaseDate?: string;
  teamMembers: TeamMember[];
  holidays: Holiday[];
}

export interface ProjectData {
  project: ProjectInfo;
  milestones: Milestone[];
  tasks: Task[];
  baselines: Baseline[];
}

export const STATUS_OPTIONS: TaskStatus[] = ["not_started", "in_progress", "done", "blocked", "not_pursuing"];
export const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
  not_pursuing: "Not Pursuing",
};
export const STATUS_COLORS: Record<TaskStatus, string> = {
  not_started: "#3b82f6",
  in_progress: "#6366f1",
  done: "#16a34a",
  blocked: "#f87171",
  not_pursuing: "#9ca3af",
};
export const PIE_COLORS = [STATUS_COLORS.not_started, STATUS_COLORS.in_progress, STATUS_COLORS.done, STATUS_COLORS.blocked, STATUS_COLORS.not_pursuing];
export const MS_COLORS = ["#2563eb", "#0ea5e9", "#eab308", "#f59e0b", "#16a34a", "#0891b2", "#ca8a04", "#6366f1"];
export const MEM_COLORS = ["#2563eb", "#eab308", "#0ea5e9", "#f59e0b", "#16a34a", "#6366f1", "#ca8a04", "#0891b2"];
