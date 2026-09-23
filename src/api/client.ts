import type { ProjectData } from "../domain/types";
import type {
  AdminProjectSummary,
  AdminUser,
  CurrentUser,
  FocusList,
  FocusListSummary,
  FocusSearchResult,
  ProjectDetail,
  ProjectMember,
  ProjectSummary,
  ProjectTaskGroup,
  Tag,
} from "./types";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore — no JSON body
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  setupStatus: () => request<{ needsSetup: boolean }>("/api/setup-status"),
  setup: (username: string, password: string, displayName: string) =>
    request<CurrentUser>("/api/setup", { method: "POST", body: JSON.stringify({ username, password, displayName }) }),

  login: (username: string, password: string) =>
    request<CurrentUser>("/api/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>("/api/logout", { method: "POST" }),
  me: () => request<CurrentUser>("/api/me"),
  listUsers: () => request<ProjectMember[]>("/api/users"),

  listProjects: () => request<ProjectSummary[]>("/api/projects"),
  createProject: (name: string) => request<ProjectSummary>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }),
  getProject: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  saveProject: (id: string, data: ProjectData) =>
    request<{ ok: true; updatedAt: string }>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify({ data }) }),
  deleteProject: (id: string) => request<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" }),
  updateProjectTags: (id: string, tags: string[]) =>
    request<{ ok: true; tags: string[] }>(`/api/projects/${id}/tags`, { method: "PATCH", body: JSON.stringify({ tags }) }),
  addMember: (id: string, username: string, newAccount?: { password: string; displayName: string }) =>
    request<ProjectMember>(`/api/projects/${id}/members`, { method: "POST", body: JSON.stringify({ username, ...newAccount }) }),
  removeMember: (id: string, userId: string) => request<{ ok: true }>(`/api/projects/${id}/members/${userId}`, { method: "DELETE" }),
  promoteMember: (id: string, userId: string) => request<{ ok: true }>(`/api/projects/${id}/members/${userId}/promote`, { method: "POST" }),
  demoteMember: (id: string, userId: string) => request<{ ok: true }>(`/api/projects/${id}/members/${userId}/demote`, { method: "POST" }),

  focus: {
    today: (date?: string) => request<FocusList>(`/api/focus/today${date ? `?date=${date}` : ""}`),
    listReleases: () => request<FocusListSummary[]>("/api/focus/lists"),
    createRelease: (title: string, targetDate: string | null) =>
      request<FocusList>("/api/focus/lists", { method: "POST", body: JSON.stringify({ title, targetDate }) }),
    getList: (id: string) => request<FocusList>(`/api/focus/lists/${id}`),
    updateRelease: (id: string, patch: { title?: string; targetDate?: string | null }) =>
      request<FocusList>(`/api/focus/lists/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    deleteRelease: (id: string) => request<{ ok: true }>(`/api/focus/lists/${id}`, { method: "DELETE" }),
    addItem: (listId: string, projectId: string, taskId: string) =>
      request<FocusList>(`/api/focus/lists/${listId}/items`, { method: "POST", body: JSON.stringify({ projectId, taskId }) }),
    removeItem: (listId: string, itemId: string) => request<FocusList>(`/api/focus/lists/${listId}/items/${itemId}`, { method: "DELETE" }),
    reorder: (listId: string, itemIds: string[]) =>
      request<FocusList>(`/api/focus/lists/${listId}/items/reorder`, { method: "POST", body: JSON.stringify({ itemIds }) }),
    toggleDone: (listId: string, itemId: string) => request<FocusList>(`/api/focus/lists/${listId}/items/${itemId}/toggle-done`, { method: "POST" }),
    searchTasks: (q: string) => request<FocusSearchResult[]>(`/api/focus/search-tasks?q=${encodeURIComponent(q)}`),
    allTasks: () => request<ProjectTaskGroup[]>("/api/focus/all-tasks"),
  },

  tags: {
    list: () => request<Tag[]>("/api/tags"),
    create: (name: string, color: string) => request<Tag>("/api/tags", { method: "POST", body: JSON.stringify({ name, color }) }),
    update: (id: string, patch: { name?: string; color?: string }) => request<Tag>(`/api/tags/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    delete: (id: string) => request<{ ok: true }>(`/api/tags/${id}`, { method: "DELETE" }),
  },

  admin: {
    listUsers: () => request<AdminUser[]>("/api/admin/users"),
    createUser: (username: string, password: string, displayName: string, isAdmin: boolean, canCreateProjects: boolean) =>
      request<AdminUser>("/api/admin/users", { method: "POST", body: JSON.stringify({ username, password, displayName, isAdmin, canCreateProjects }) }),
    updateUser: (id: string, patch: { isAdmin?: boolean; canCreateProjects?: boolean }) =>
      request<{ ok: true }>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    resetPassword: (id: string, password: string) =>
      request<{ ok: true }>(`/api/admin/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
    deleteUser: (id: string) => request<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" }),

    listProjects: () => request<AdminProjectSummary[]>("/api/admin/projects"),
    addOwner: (id: string, userId: string) => request<{ ok: true }>(`/api/admin/projects/${id}/owners`, { method: "POST", body: JSON.stringify({ userId }) }),
    demoteOwner: (id: string, userId: string) => request<{ ok: true }>(`/api/admin/projects/${id}/owners/${userId}/demote`, { method: "POST" }),
    deleteProject: (id: string) => request<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" }),
  },
};

export { ApiError };
