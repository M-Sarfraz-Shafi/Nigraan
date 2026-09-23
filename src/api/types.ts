import type { ProjectData } from "../domain/types";

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  canCreateProjects: boolean;
}

export type ProjectRole = "admin" | "owner" | "member";

export interface ProjectSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  /** IDs into the shared Tag list (see `Tag`) — resolve against `api.tags.list()` to get name/color. */
  tags: string[];
  role: ProjectRole;
}

/** A reusable label in the shared, cross-project tag list (managed from "Manage Tags"). */
export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface ProjectMember {
  id: string;
  username: string;
  displayName: string;
  isPo?: boolean;
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMember[];
  data: ProjectData;
  dataUpdatedAt: string;
}

export interface PresenceUser {
  userId: string;
  username: string;
  displayName: string;
  editingTaskId: string | null;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  canCreateProjects: boolean;
  createdAt: string;
}

export interface AdminProjectOwner {
  id: string;
  displayName: string;
}

export interface AdminProjectSummary {
  id: string;
  name: string;
  ownerId: string;
  createdByName: string;
  createdAt: string;
  memberCount: number;
  owners: AdminProjectOwner[];
}

export interface FocusTask {
  itemId: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  status: string;
  milestoneName: string | null;
  estimateDays: number;
  addedAt: string;
  /** The task's project's own committed release date (ProjectInfo.targetReleaseDate), if set. */
  projectTargetDate: string | null;
}

export interface FocusList {
  id: string;
  kind: "day" | "release";
  title: string;
  targetDate: string | null;
  createdAt: string;
  items: FocusTask[];
}

export interface FocusListSummary {
  id: string;
  title: string;
  targetDate: string | null;
  createdAt: string;
  itemCount: number;
  doneCount: number;
}

export interface FocusSearchResult {
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  status: string;
  milestoneName: string | null;
}

export interface BrowseTask {
  taskId: string;
  taskName: string;
  status: string;
  milestoneName: string | null;
}

export interface ProjectTaskGroup {
  projectId: string;
  projectName: string;
  tasks: BrowseTask[];
}

export type WsMessage =
  | { type: "presence"; users: PresenceUser[] }
  | { type: "data-changed"; by: string; at: string }
  | { type: "project-deleted" }
  | { type: "members-changed" };
