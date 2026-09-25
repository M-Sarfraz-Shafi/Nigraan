# Nigraan

*Nigraan* (نگران) — Urdu for "overseer" or "caretaker."

A self-hosted project management and Gantt-scheduling app for small teams who want full control of their own data — no SaaS subscription, no third-party server, no per-seat pricing. One process, one SQLite file, your own machine.

![Demo: adding a task, extending it past its estimate, marking it done, and checking resource allocation](docs/screenshots/nigraan-demo.gif)

## Features

### Dashboard — a real project overview

- Task status broken down across all five states — Not Started, In Progress, Done, Blocked, Not Pursuing — in one pie chart
- **Schedule Health**: your committed target release date vs. the forecast computed live from the current schedule, with a plain-language "X work days ahead/behind" verdict
- At-a-glance counts for overdue, unassigned, and blocked tasks
- Per-milestone progress bars
- Time already invested in deprioritized work, so shelved effort isn't silently forgotten

### Timeline — an interactive Gantt chart

- Color-coded by status — subtasks render in a lighter tint of their status color, parent/summary rows in a darker one, so hierarchy and status both read at a glance
- Drag a bar to move it, drag its right edge to resize, drag the link handle to add a dependency
- Parent tasks roll up their subtasks into a single summary bar with a live done-count
- Any day worked beyond a task's original estimate shows up directly on the bar as a light-orange stripe — scope creep is visible without opening the task
- The committed target release date and the live forecast both appear as distinct markers on the calendar
- Opens landed on today, and scrolls freely both backward and forward — never boxed in by whatever the schedule happens to compute right now

### Tasks — a structured list view

- Milestones, parent tasks, and subtasks in one collapsible list
- Category (Definitive/Research), original estimate, current/actual days worked, assignee, status, and a comments/reason column
- Every task requires an estimate at creation — no silent defaults to paper over later

### Members & Resources

- Add a teammate by username, or create a brand-new account for them inline — no separate admin step required for day-to-day team changes
- Per-person allocation view flags anyone double-booked across overlapping tasks
- Leave tracked per person, factored directly into scheduling around it

### Roles built for real teams

- **Admin** — full access to every project without ever cluttering any of them as a "member"
- **Project Owner (PO)** — manages members, settings, and baselines for their project(s); a project can have multiple POs
- **Member** — works tasks, logs leave, and creates milestones, without touching project settings
- All account and project management happens through the UI — no server-side scripting required to onboard anyone

### Baselines

- Snapshot a project's plan at any point, then compare it against the live schedule later to see exactly what drifted and by how much

### Real-time collaboration

- WebSocket-backed presence indicators and "editing" badges show who's looking at what, live
- Full undo/redo history on every edit

### Today & Priorities — plan across every project

One screen (from the projects list) for deciding what to work on, without opening each project.

- **Today list**: a personal list per calendar day, created automatically the first time you open it. Drag in tasks from any project, tick them done, and reorder by dragging
- **Releases**: named lists with an optional target date that bundle tasks from several projects toward one deadline. Each shows done/total, a percent-complete badge, and a due or overdue label
- **All Tasks panel**: every task you can see, grouped by project, with a text filter and status filter chips (done and not-pursuing are hidden by default). The panel is collapsible and resizable
- Ticking a task done here updates the task in its own project, live for everyone viewing it
- Items whose project release date is within a week, or already past, get a due badge
- **Copy for standup**: copies today's plan as a plain-text checklist
- Lists only point at tasks, so no task data is duplicated. A task that is deleted, or that you lose access to, drops off the list

### Project tags

- One shared list of colored tags (name + color) that every project picks from. Rename or recolor a tag once and every project using it updates
- **Manage Tags** creates, renames, recolors, and deletes tags. It needs admin or project-creation rights, and deleting a tag removes it from every project
- Any project member can assign tags from the project card. Tags also show in the project sidebar
- Filter the projects list by one or more tags. Your filter is remembered in this browser

## Running it

```bash
npm install
npm --prefix server install
npm run build
npm run server
```

Then open `http://localhost:3001` — the first visitor sets up the admin account, no server access needed.

On Windows, double-click `run.bat` instead. It installs dependencies and builds only if they are missing, then starts the server. It doesn't rebuild once `dist/` exists, so run `npm run build` yourself after frontend changes.

### With Docker

Only Docker is needed, no Node install:

```bash
docker compose up -d --build
```

Then open `http://localhost:3001`. The database is kept in the `nigraan-data` volume, so it survives restarts and rebuilds. After pulling changes, run the same command again to rebuild. For a backup, run `docker compose exec nigraan node server/scripts/backup.js`. It writes to `/data/backups` inside the volume.

### Configuration

No `.env` is needed. These optional environment variables are available:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Server port |
| `PM_DB_PATH` | `server/data.db` | SQLite database file |
| `PM_COOKIE_SECURE` | off | Set to `1` in production over HTTPS to mark session cookies `Secure` |
| `PM_BACKUP_DIR` | `server/backups` | Output folder for `server/scripts/backup.js` |

For running it on a shared machine (LAN or beyond), see [progress.md](progress.md) for the full build history and architecture notes.

## Tech stack

React + TypeScript + Vite on the frontend; Node/Express + WebSocket on the backend; SQLite via Node's built-in `node:sqlite` (no native compile step) for storage.
