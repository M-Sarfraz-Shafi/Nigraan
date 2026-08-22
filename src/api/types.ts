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
  role: ProjectRole;
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

export type WsMessage =
  | { type: "presence"; users: PresenceUser[] }
  | { type: "data-changed"; by: string; at: string }
  | { type: "project-deleted" }
  | { type: "members-changed" };
