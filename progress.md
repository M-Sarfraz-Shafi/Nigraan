# Progress Summary

_Last updated: 2026-08-20_

## Where we started

A 672-line single-file React prototype (`project-manager.jsx`) built in Claude Projects, persisted via a `window.storage` API that only exists inside that runtime — unrunnable as a standalone app. Strong scheduling core (topological sort, weekends/holidays/leave, drag Gantt, hierarchical tasks, baselines), but no real foundation.

## Phase 1 — Foundation (done)

- Scaffolded Vite + React + TypeScript, decomposed the monolith into `src/domain`, `src/store`, `src/views`, `src/components`.
- Persistence via Dexie (IndexedDB) initially, later fully replaced by the Phase 2 backend.
- Added vitest unit tests for `schedule()` (topological sort, holiday/weekend skipping, leave handling, cycle detection) — 23 tests, still passing.
- Added import/export JSON, undo/redo, cycle-detection guard on dependencies.

## UI/UX fixes along the way

- Full theme overhaul (blue/yellow) — fixed unreadable dark inputs left over from Vite's template CSS.
- Fixed a bug where `SettingsPanel`/`DashboardView` helper components defined inside render functions caused full remounts on every keystroke, dropping input focus after one character.
- Removed same-assignee task serialization (`mAvail`) and the project-start drag floor from the scheduler, per explicit request — tasks can now be dragged freely, including before the current date, and can run in parallel for one person.
- Built a richer Timeline view: bracket-shaped parent/summary bars, collapse/expand, group-drag (dragging a parent bar drags all its subtasks together), progress badges, overlap warnings.

## Phase 2 — Self-hosted backend (done, iterated heavily)

- Node + Express + WebSocket server, using Node's built-in `node:sqlite` (avoided `better-sqlite3` native-compile issues on this machine) and bcryptjs for password hashing.
- Session-based auth via signed HTTP-only cookies, server-side session table.
- Schema: `users`, `sessions`, `projects`, `project_members` (junction, now with `is_po`), `project_data` (JSON blob matching the frontend's `ProjectData` shape — deliberate, avoids rewriting scheduling logic).
- Realtime: presence list, "editing" badges, `data-changed` broadcast triggering refetch.
- CLI scripts (`create-user.js`, `delete-user.js`, `backup.js`) kept only as a fallback — all day-to-day admin is UI-driven per explicit requirement ("I dont want anyone going onto the server for managing things from script").

### Role model — final shape (implemented)

Merged the old "team member" / "collaborator" split into one **Member** concept. Three roles:

- **Admin** — global flag. Full access to every project without ever being a `project_members` row (not counted as a resource, doesn't appear in Members lists, isn't assignable to tasks). Can promote/demote any account to Project Owner on any project, create/delete users and projects, reset passwords.
- **Owner / PO** (`project_members.is_po = 1`) — per-project, multiple POs allowed on one project. Full project-level rights: settings, baselines, member management (add/remove, including creating brand-new accounts inline), data export/import, backups.
- **Member** (`project_members.is_po = 0`) — can edit tasks/subtasks, create milestones (tagged with creator), log their own leave. Cannot see Settings, Baselines, or manage members.

`canCreateProjects` is a separate global flag controlling only whether an account can start brand-new projects (and become their initial PO) — decoupled from per-project PO status, which admin can grant to any account regardless of this flag.

### Key fixes discovered during "use it extensively" validation

- **Cross-project import phantom members**: importing one project's JSON export into a different project let old team members and their leave/assignments leak in even though they weren't real members of the target project. Fixed with `reconcileTeamMembers()`, run on every save, syncing the JSON blob's `teamMembers` against real `project_members` rows and unassigning orphaned tasks.
- **Removal correctness**: both removal paths (removing a member from a project, and deleting a user account outright) correctly unassign that person's tasks project-wide.
- **Admin-as-accidental-member bug** (the one just fixed): admin creating a project was being inserted into `project_members` like a normal owner, which broke the "admin sees everything but is never physically in a project" rule and caused the reported bug where a PO couldn't manage members because the project actually belonged to admin. Fixed by special-casing `req.user.isAdmin` in `POST /api/projects` to skip the membership insert; added `POST /api/admin/projects/:id/owners` and `.../owners/:userId/demote` for admin to grant/revoke PO status on any project; removed the old single-owner "transfer project" flow entirely (superseded by multi-PO add/demote).

## Current state (verified)

Backend: typechecked (`tsc -b` clean), tested (23/23 vitest), linted (oxlint clean apart from one accepted warning), syntax-checked. Curl-verified end-to-end:

- Admin creates a project → not inserted as a member, role shows "admin".
- A `canCreateProjects` user has no access to an admin-created project until admin explicitly assigns PO.
- Once assigned PO, that user can add members themselves (the originally reported bug is fixed).
- Multiple POs on one project both show up correctly in admin's project list; demoting one leaves them as a plain member (loses add-member rights, keeps access).
- Deleting a PO's account no longer requires "transfer ownership first" — it just works, other members are unaffected.

Browser UI verification (logged in as `admin1`) confirmed: admin sees all projects with an "admin" badge without ever joining them; Admin → Users tab checkbox now reads "Project Owner (can create & own new projects)" with an explanatory note; Admin → Projects tab shows PO chips with demote buttons and an "add owner" dropdown excluding existing POs; a newly-promoted PO (Priya) gets full owner-level UI (Settings, Baselines, Members with add controls, her own "PO" badge).

**Members panel verification — now confirmed**: logged back in as `admin1`, opened "Reported Bug Project", opened the Members panel. Confirmed both:
- The note "You're viewing this as an admin — you have full access but aren't a member of this project, so you won't appear in this list or be assignable on tasks." renders.
- Admin does not appear in the member list — only Priya PO (`@po2`, PO badge) and Team Er (`@teamer`) are listed, with full add-member controls visible to admin.

This closes out the last open item from the admin/multi-PO re-architecture.

## Final verification suite (all clean)

- `npx tsc -b` — clean, no errors.
- `npx vitest run` — 23/23 tests passing.
- `npx oxlint src/` — clean, only the one pre-accepted `set-state-in-effect` warning in `useRemoteProjectStore.ts`.
- `node -c server/index.js` / `node -c server/db.js` — syntax OK.
- `npx vite build` — production build succeeds (648.74 kB / 187.36 kB gzip).

## Cleanup performed

- Stopped the dev server preview process and the backend Node server (was listening on port 3001).
- Deleted test `server/data.db`, `data.db-shm`, `data.db-wal`.
- Confirmed no leftover temp cookie files in `/tmp`.
- Restored `.claude/launch.json` dev port from `5181` back to `5173`.

## Next steps

The admin/multi-PO re-architecture is complete and fully verified. Suggested next steps for a future session:

1. Decide whether to layer on any of the "small incremental improvements" noted in the original plan (fit-to-view zoom, jump-to-today, keyboard shortcuts, search/filter bar, progress % rollup, effort-in-hours, split-task overlap warnings).
2. Consider whether Phase 3 (what-if scenarios / release intelligence) — explicitly deferred at the start of this project — should now be picked back up.
3. Production deployment planning: the app currently runs as two dev processes (Vite + Express) for local testing; decide on a real hosting target and follow the plan's deployment notes (serve `dist/` from Express, single `npm start`, daily SQLite backup script).
