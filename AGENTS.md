# Agent Instructions

## Package Manager
No package manager workflow — vanilla Node.js + Electron, no build step.
- Server: `node server.js`
- Desktop app: `cd dashboard-app && npm start`
- Deploy: `bash setup.sh`

## Commit Attribution
AI commits MUST include:
```
Co-Authored-By: Qoder CLI <noreply@qoder.dev>
```

## Key Conventions
- **Source → Deploy**: Edit here, deploy to `~/.agents/scheduler/`
- **Deploy after edits**:
  ```bash
  cp server.js ~/.agents/scheduler/server.js
  cp public/index.html ~/.agents/scheduler/public/index.html
  cp -r public/css/ ~/.agents/scheduler/public/css/
  cp -r public/js/ ~/.agents/scheduler/public/js/
  cp config/services.json ~/.agents/scheduler/services.json
  pm2 restart scheduler
  ```
- **No build step**: CSS/JS in separate files under `public/css/` and `public/js/`
- **Config-driven services**: Add services via `config/services.json`, no code changes needed
- **Config hot-reloads**: `services.json` changes take effect in 10s, no restart required
- **SSE real-time**: `/api/events` pushes service/task/config events to clients
- **Legacy APIs exist**: `/api/services`, `/api/external-services`, `/api/webviews` — prefer unified APIs

## File-Scoped Commands
| Task | Command |
|------|---------|
| Start server | `node server.js` |
| Start desktop app | `cd dashboard-app && npm start` |
| Restart deployed server | `pm2 restart scheduler` |
| Deploy all files | `bash setup.sh` |
| Test API | `curl http://localhost:3777/api/overview` |
| Check PM2 status | `pm2 status` |
| Check service health | `curl http://localhost:3777/api/unified-services \| python3 -m json.tool` |
| Test SSE | `curl -N http://localhost:3777/api/events` |

## Critical Files
| File | Purpose |
|------|---------|
| `server.js` | Express backend — APIs, SSE, health checks, service actions, graceful shutdown |
| `public/index.html` | Frontend SPA entry — sidebar + 6 tab panels |
| `public/css/variables.css` | Design tokens — 60+ CSS custom properties, theme overrides |
| `public/css/main.css` | Main stylesheet — sidebar, responsive, animations, components |
| `public/js/state.js` | Central Store — pub/sub state management |
| `public/js/api.js` | API request layer — all fetch calls centralized |
| `public/js/app.js` | Bootstrap — init, SSE listener, polling fallback, theme toggle |
| `public/js/overview.js` | Overview tab — summary cards, category grid, mini webview panels |
| `public/js/services.js` | Services tab — unified service cards, logs, details |
| `public/js/webviews.js` | Webviews tab — `collectWebviewPages()` shared with overview |
| `public/js/search.js` | Ctrl+K command palette — fuzzy search across services/tasks/tabs |
| `public/js/sidebar.js` | Sidebar nav — tab switching, collapse, keyboard shortcuts |
| `config/services.json` | Unified service registry — PM2 + LaunchAgent + health + webview |
| `services/ecosystem.config.js` | PM2 process definitions (independent of services.json) |
| `dashboard-app/main.js` | Electron main process — pm2 resurrect on startup |
| `setup.sh` | One-click deploy script |

## Script Load Order (index.html)
1. `state.js` — Store (must be first, all modules depend on it)
2. `api.js` — API layer (depends on Store)
3. `components.js` — DOM helpers, showSkeleton (depends on Store)
4. `toast.js` — showToast (standalone)
5. `sidebar.js` — switchTab, toggleSidebar (depends on Store, uses switchTab to load data)
6. `overview.js` — loadOverview, renderOverview (depends on Api, components, webviews.collectWebviewPages at runtime)
7. `services.js` — loadUnifiedServices (depends on Api, components)
8. `tasks.js` — loadTasks (depends on Api, components)
9. `aicli.js` — loadAiCli (depends on Api, components)
10. `logs.js` — loadDashLogs (depends on Api, components)
11. `webviews.js` — loadWebViews, collectWebviewPages (depends on Api, components)
12. `app.js` — Bootstrap + SSE (must be last, calls loadOverview on init)
13. `search.js` — Command palette (standalone UI)

**Note**: `overview.js` loads before `webviews.js` but `collectWebviewPages` is only called at runtime (from `loadOverview()` triggered by `app.js`), so all scripts are available.

## API Surface
- `GET /api/overview` — summary stats, category health, issues list
- `GET /api/unified-services` — all services with status + health
- `POST /api/unified-services/:id/action` — start/stop/restart (dispatches by manager)
- `GET /api/unified-services/:id/logs` — unified logs (PM2 or file-based)
- `GET /api/unified-services/:id/details` — service details
- `GET /api/tasks` / `POST /api/tasks/:id/run|toggle` — scheduled tasks
- `GET /api/ai-cli-processes` — AI CLI process monitor
- `GET /api/events` — SSE real-time push (service-action, status-change, task-complete, config-reload)

## services.json Schema
- `manager`: `pm2` | `launchagent` — determines control API
- `healthCheck.type`: `http` | `port` | `process` | `launchagent`
- `webview`: optional, present = appears in page dashboard + overview mini panel
- `logPaths`: required for non-PM2 services to enable log viewing
- Categories: core / ai-cli / gateway / mcp / earn / network / monitor

## Gotchas
- Git commit messages: no ANSI escape codes (check with `git log -1 --format="%B" | xxd | head -3`)
- README images: use relative paths only (e.g. `docs/screenshots/xxx.png`)
- `tasks.json` is gitignored — template at `config/tasks.example.json`
- openclaw-gateway needs proxy: `GLOBAL_AGENT_HTTP_PROXY=http://127.0.0.1:7890`
- OpenClaw Gateway is dual-managed: PM2 (primary) + LaunchAgent (boot backup)
- `renderOverview(data, webviewData)` requires both params — webviewData from `Api.fetchWebViews()`
- New JS files must be added to both `index.html` script tags AND `setup.sh` mkdir/cp commands
