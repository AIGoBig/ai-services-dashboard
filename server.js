const express = require('express');
const schedule = require('node-schedule');
const { exec } = require('child_process');
const net = require('net');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const HOME = os.homedir();
const app = express();
const PORT = process.env.DASHBOARD_PORT || 3777;
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const LOGS_DIR = path.join(__dirname, 'logs');
const SERVICES_DIR = path.join(HOME, '.agents/services/logs');

// Auto-detect PATH: Homebrew ARM vs Intel + system paths + Homebrew Python
function buildPath() {
  const brewPrefix = fs.existsSync('/opt/homebrew/bin/brew') ? '/opt/homebrew'
    : fs.existsSync('/usr/local/bin/brew') ? '/usr/local' : null;
  const npmGlobal = path.join(HOME, '.npm-global/bin');
  const paths = [npmGlobal];
  if (brewPrefix) {
    paths.push(`${brewPrefix}/bin`);
    try {
      const optDir = `${brewPrefix}/opt`;
      for (const e of fs.readdirSync(optDir)) {
        if (e.startsWith('python@')) {
          const libexecBin = `${optDir}/${e}/libexec/bin`;
          if (fs.existsSync(libexecBin)) paths.push(libexecBin);
        }
      }
    } catch (_) {}
  }
  paths.push('/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin');
  return paths.filter(Boolean).join(':');
}
const SYSTEM_PATH = buildPath();

// === Async File Reads with Cache ===
const fileCache = new Map();
async function readJSONCached(filePath, ttlMs = 10000) {
  const now = Date.now();
  const cached = fileCache.get(filePath);
  if (cached && (now - cached.time) < ttlMs) return cached.data;
  const content = await fs.promises.readFile(filePath, 'utf8');
  const data = JSON.parse(content);
  fileCache.set(filePath, { data, time: now });
  return data;
}

// === Unified service registry ===
const UNIFIED_SERVICES_FILE = path.join(__dirname, 'services.json');
let serviceRegistry = { services: [], categories: {} };
let registryInitialized = false;

async function loadServiceRegistry() {
  try {
    if (fs.existsSync(UNIFIED_SERVICES_FILE)) {
      const data = await readJSONCached(UNIFIED_SERVICES_FILE);
      if (registryInitialized) {
        const prev = serviceRegistry;
        if (JSON.stringify(prev.services) !== JSON.stringify(data.services)) {
          broadcast('config-reload', { source: 'services.json' });
          addLog('info', 'system', '配置热更新: services.json 已变更');
        }
      }
      serviceRegistry = data;
      registryInitialized = true;
    }
  } catch (_) {}
  return serviceRegistry;
}

// Legacy config loading (kept for backward compat)
const DEFAULT_PORTS = { scheduler: 3777, gemini: 52019, 'xiaohongshu-mcp': 18060, 'openclaw-gateway': 18789, 'agent-browser': 54247 };
const PORTS_FILE = path.join(__dirname, 'service-ports.json');
const EXT_SERVICES_FILE = path.join(__dirname, 'external-services.json');
const WEBVIEWS_FILE = path.join(__dirname, 'config', 'webviews.json');

// Initial sync loads for startup
const SERVICE_PORTS = fs.existsSync(PORTS_FILE)
  ? { ...DEFAULT_PORTS, ...JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8')) }
  : DEFAULT_PORTS;
const externalServiceDefs = fs.existsSync(EXT_SERVICES_FILE)
  ? JSON.parse(fs.readFileSync(EXT_SERVICES_FILE, 'utf8'))
  : [];
const webViewDefs = fs.existsSync(WEBVIEWS_FILE)
  ? JSON.parse(fs.readFileSync(WEBVIEWS_FILE, 'utf8'))
  : [];

// Async loaders for hot paths
async function loadExternalServices() {
  try {
    if (fs.existsSync(EXT_SERVICES_FILE)) return await readJSONCached(EXT_SERVICES_FILE);
  } catch (_) {}
  return externalServiceDefs;
}

async function loadWebviewsConfig() {
  try {
    if (fs.existsSync(WEBVIEWS_FILE)) return await readJSONCached(WEBVIEWS_FILE);
  } catch (_) {}
  return webViewDefs;
}

async function loadServicePorts() {
  try {
    if (fs.existsSync(PORTS_FILE)) {
      const ports = await readJSONCached(PORTS_FILE);
      return { ...DEFAULT_PORTS, ...ports };
    }
  } catch (_) {}
  return SERVICE_PORTS;
}

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// === SSE Infrastructure ===
const sseClients = new Set();

function broadcast(eventType, data) {
  const msg = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch (_) { sseClients.delete(client); }
  }
}

// === Dashboard Event Log ===
const dashLog = [];
const DASH_LOG_MAX = 300;
const DASH_LOG_FILE = path.join(LOGS_DIR, 'dashboard-events.jsonl');

function addLog(type, source, message, detail) {
  const entry = { time: new Date().toISOString(), type, source, message, detail: detail || '' };
  dashLog.unshift(entry);
  if (dashLog.length > DASH_LOG_MAX) dashLog.length = DASH_LOG_MAX;
  fs.promises.appendFile(DASH_LOG_FILE, JSON.stringify(entry) + '\n').catch(() => {});
  broadcast('log-entry', entry);
}

function loadPersistedLogs() {
  try {
    if (!fs.existsSync(DASH_LOG_FILE)) return;
    const lines = fs.readFileSync(DASH_LOG_FILE, 'utf8').trim().split('\n').slice(-DASH_LOG_MAX);
    for (const line of lines.reverse()) {
      try { dashLog.push(JSON.parse(line)); } catch (_) {}
    }
  } catch (_) {}
}

loadPersistedLogs();
addLog('info', 'system', 'Dashboard 服务启动', `端口 ${PORT}`);

// Initialize service registry asynchronously
loadServiceRegistry().catch(() => {});

const defaultTasks = [
  {
    id: 'skills-daily-commit',
    name: 'Skills 每日自动提交',
    schedule: '0 23 * * *',
    command: path.join(HOME, '.agents/scripts/skills-daily-commit.sh'),
    enabled: true,
    description: '每天 23:00 自动提交 skills 仓库的变更到 GitHub'
  }
];

function loadTasks() {
  if (fs.existsSync(TASKS_FILE)) {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  }
  fs.writeFileSync(TASKS_FILE, JSON.stringify(defaultTasks, null, 2));
  return defaultTasks;
}

function saveTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
  fileCache.delete(TASKS_FILE);
}

const tasks = loadTasks();
const scheduledJobs = {};
const executionHistory = {};

function logFile(taskId) {
  return path.join(LOGS_DIR, `${taskId}.log`);
}

function runTask(taskId, manual = false) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const logPath = logFile(taskId);
  const timestamp = new Date().toISOString();
  const prefix = manual ? '[手动执行]' : '[定时执行]';
  const entry = { time: timestamp, type: manual ? 'manual' : 'scheduled', status: 'running', output: '' };
  if (!executionHistory[taskId]) executionHistory[taskId] = [];
  executionHistory[taskId].unshift(entry);
  if (executionHistory[taskId].length > 50) executionHistory[taskId].pop();
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  logStream.write(`\n=== ${prefix} ${timestamp} ===\n`);
  const child = exec(task.command, { env: { ...process.env, PATH: SYSTEM_PATH } });
  let output = '';
  child.stdout.on('data', (data) => { output += data; logStream.write(data); });
  child.stderr.on('data', (data) => { output += data; logStream.write(data); });
  child.on('close', (code) => {
    entry.status = code === 0 ? 'success' : 'failed';
    entry.output = output;
    entry.exitCode = code;
    logStream.write(`=== 退出码: ${code} ===\n`);
    logStream.end();
    addLog(code === 0 ? 'info' : 'error', 'task',
      `${prefix} ${task.name} ${code === 0 ? '成功' : '失败'}`, `退出码: ${code}`);
    broadcast('task-complete', { id: taskId, name: task.name, status: entry.status, exitCode: code });
  });
}

function scheduleTask(task) {
  if (scheduledJobs[task.id]) scheduledJobs[task.id].cancel();
  if (task.enabled) {
    scheduledJobs[task.id] = schedule.scheduleJob(task.schedule, () => runTask(task.id));
  }
}

tasks.forEach(scheduleTask);

// === Health check functions ===
function checkPort(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { resolve(false); });
    socket.connect(port, host);
  });
}

function checkHttp(url, timeout = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
      res.resume();
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => { resolve(false); });
  });
}

function pm2Exec(cmd) {
  const pm2Path = process.env.PM2_PATH || 'pm2';
  return new Promise((resolve, reject) => {
    exec(`${pm2Path} ${cmd}`, { env: { ...process.env, PATH: SYSTEM_PATH } }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

function getLaunchAgentStatus(label) {
  return new Promise((resolve) => {
    exec(`launchctl list ${label} 2>/dev/null`, { env: { ...process.env, PATH: SYSTEM_PATH } }, (err, stdout) => {
      if (err) return resolve({ running: false, pid: null, exitStatus: null });
      const pidMatch = stdout.match(/"PID"\s*=\s*(\d+)/);
      const statusMatch = stdout.match(/"LastExitStatus"\s*=\s*(\d+)/);
      resolve({
        running: !!pidMatch,
        pid: pidMatch ? parseInt(pidMatch[1]) : null,
        exitStatus: statusMatch ? parseInt(statusMatch[1]) : null
      });
    });
  });
}

function getProcessInfo(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve({ command: '', memory: 0, cpu: 0 });
    exec(`ps -p ${pid} -o rss=,pcpu=,command= 2>/dev/null`, (err, stdout) => {
      if (err || !stdout.trim()) return resolve({ command: '', memory: 0, cpu: 0 });
      const parts = stdout.trim().split(/\s+/);
      const rss = parseInt(parts[0]) || 0;
      const cpu = parseFloat(parts[1]) || 0;
      const command = parts.slice(2).join(' ');
      resolve({ command, memory: rss * 1024, cpu });
    });
  });
}

// === Build unified service status ===
async function buildUnifiedServices() {
  const registry = await loadServiceRegistry();
  const defs = registry.services || [];
  const categories = registry.categories || {};
  const results = [];

  // Get PM2 status in one call
  let pm2Map = {};
  try {
    const stdout = await pm2Exec('jlist');
    const list = JSON.parse(stdout);
    for (const p of list) pm2Map[p.name] = p;
  } catch (_) {}

  for (const svc of defs) {
    const info = {
      ...svc,
      status: 'unknown',
      healthy: false,
      pid: null,
      cpu: 0,
      memory: 0,
      uptime: null,
      restarts: 0,
      webviewHealthy: false
    };

    // PM2 managed
    if (svc.manager === 'pm2') {
      const p = pm2Map[svc.id];
      if (p) {
        info.status = p.pm2_env.status;
        info.pid = p.pid;
        info.cpu = p.monit ? p.monit.cpu : 0;
        info.memory = p.monit ? p.monit.memory : 0;
        info.uptime = p.pm2_env.pm_uptime;
        info.restarts = p.pm2_env.restart_time;
      } else {
        info.status = 'stopped';
      }
    }

    // LaunchAgent managed
    if (svc.manager === 'launchagent' && svc.launchagentLabel) {
      const laStatus = await getLaunchAgentStatus(svc.launchagentLabel);
      info.running = laStatus.running;
      info.pid = laStatus.pid;
      info.status = laStatus.running ? 'online' : 'stopped';
      if (laStatus.pid) {
        const procInfo = await getProcessInfo(laStatus.pid);
        info.cpu = procInfo.cpu;
        info.memory = procInfo.memory;
        info.command = procInfo.command;
      }
    }

    // Health checks
    if (svc.healthCheck) {
      const hc = svc.healthCheck;
      if (hc.type === 'http' && hc.url) {
        info.healthy = await checkHttp(hc.url, hc.timeout || 3000);
      } else if (hc.type === 'port' && svc.port) {
        info.healthy = await checkPort('localhost', svc.port, hc.timeout || 3000);
      } else if (hc.type === 'process') {
        info.healthy = info.status === 'online';
      } else if (hc.type === 'launchagent') {
        info.healthy = info.status === 'online';
      }
    } else if (svc.port) {
      // Fallback: port check if no healthCheck defined
      info.healthy = await checkPort('localhost', svc.port);
    }

    // Webview health
    if (svc.webview && svc.webview.url) {
      try {
        const wvUrl = new URL(svc.webview.url);
        const wvPort = parseInt(wvUrl.port);
        if (wvPort) info.webviewHealthy = await checkPort('localhost', wvPort);
      } catch (_) {}
    }

    // Extra ports
    if (svc.extraPorts && svc.extraPorts.length > 0) {
      info.extraPortStatus = {};
      for (const ep of svc.extraPorts) {
        info.extraPortStatus[ep] = await checkPort('localhost', ep);
      }
    }

    results.push(info);
  }

  return { services: results, categories };
}

// === Lightweight Rate Limiting ===
const rateLimitMap = new Map();
function rateLimit(maxRequests = 60, windowMs = 60000) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { count: 0, start: now };
    if (now - record.start > windowMs) { record.count = 0; record.start = now; }
    record.count++;
    rateLimitMap.set(key, record);
    if (record.count > maxRequests) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/', rateLimit());

// === Request Validation Middleware ===
function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const val = req.body[field];
      if (rules.required && (val === undefined || val === null)) errors.push(`${field} is required`);
      if (rules.enum && val && !rules.enum.includes(val)) errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    next();
  };
}

// === SSE Endpoint ===
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// === Task APIs ===
app.get('/api/tasks', (req, res) => {
  const result = tasks.map(t => {
    const job = scheduledJobs[t.id];
    const history = executionHistory[t.id] || [];
    const lastRun = history[0] || null;
    return { ...t, nextRun: job && job.nextInvocation ? job.nextInvocation().toISOString() : null, lastRun: lastRun ? { time: lastRun.time, status: lastRun.status } : null, historyCount: history.length };
  });
  res.json(result);
});

app.post('/api/tasks/:id/run', validateBody({}), (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  addLog('info', 'task', `手动执行: ${task.name}`);
  runTask(task.id, true);
  broadcast('task-run', { id: task.id, name: task.name });
  res.json({ message: 'Task started', id: task.id });
});

app.post('/api/tasks/:id/toggle', validateBody({}), (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  task.enabled = !task.enabled;
  saveTasks(tasks);
  scheduleTask(task);
  addLog('info', 'task', `${task.name} ${task.enabled ? '已启用' : '已暂停'}`);
  broadcast('task-toggle', { id: task.id, name: task.name, enabled: task.enabled });
  res.json({ enabled: task.enabled });
});

app.get('/api/tasks/:id/logs', (req, res) => {
  const logPath = logFile(req.params.id);
  if (!fs.existsSync(logPath)) return res.json({ logs: '' });
  const logs = fs.readFileSync(logPath, 'utf8');
  res.json({ logs: logs.split('\n').slice(-200).join('\n') });
});

app.get('/api/tasks/:id/history', (req, res) => {
  const history = executionHistory[req.params.id] || [];
  res.json(history.map(h => ({ time: h.time, type: h.type, status: h.status, exitCode: h.exitCode })));
});

// === Unified Service APIs ===
app.get('/api/overview', async (req, res) => {
  try {
    const { services, categories } = await buildUnifiedServices();
    const summary = {
      total: services.length,
      online: services.filter(s => s.status === 'online').length,
      offline: services.filter(s => s.status === 'stopped' || s.status === 'waiting restart').length,
      unhealthy: services.filter(s => s.status === 'online' && !s.healthy).length,
      byCategory: {},
      issues: services
        .filter(s => s.status !== 'online' || !s.healthy)
        .map(s => ({ id: s.id, name: s.name, status: s.status, healthy: s.healthy, category: s.category, manager: s.manager }))
    };
    for (const s of services) {
      const cat = s.category || 'other';
      if (!summary.byCategory[cat]) summary.byCategory[cat] = { total: 0, online: 0, label: (categories[cat] || {}).label || cat, color: (categories[cat] || {}).color || '#888' };
      summary.byCategory[cat].total++;
      if (s.status === 'online') summary.byCategory[cat].online++;
    }
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/unified-services', async (req, res) => {
  try {
    const result = await buildUnifiedServices();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/unified-services/:id/action', validateBody({ action: { required: true, enum: ['start', 'stop', 'restart'] } }), async (req, res) => {
  const registry = await loadServiceRegistry();
  const svc = registry.services.find(s => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  const action = req.body.action;
  try {
    if (svc.manager === 'pm2') {
      const pm2Action = action === 'restart' ? 'restart' : action;
      await pm2Exec(`${pm2Action} ${svc.id}`);
    } else if (svc.manager === 'launchagent' && svc.launchagentLabel) {
      if (action === 'restart') {
        // Unload then load
        const plistPath = path.join(HOME, `Library/LaunchAgents/${svc.launchagentLabel}.plist`);
        exec(`launchctl unload ${plistPath} 2>&1`, { env: { ...process.env, PATH: SYSTEM_PATH } });
        await new Promise(r => setTimeout(r, 1000));
        exec(`launchctl load ${plistPath} 2>&1`, { env: { ...process.env, PATH: SYSTEM_PATH } });
      } else {
        const laAction = action === 'start' ? 'load' : 'unload';
        const plistPath = path.join(HOME, `Library/LaunchAgents/${svc.launchagentLabel}.plist`);
        exec(`launchctl ${laAction} ${plistPath} 2>&1`, { env: { ...process.env, PATH: SYSTEM_PATH } });
      }
    }
    addLog('info', 'service', `${action}: ${svc.name}`);
    broadcast('service-action', { id: svc.id, name: svc.name, action });
    res.json({ message: `${action}ed ${svc.name}`, id: svc.id });
  } catch (e) {
    addLog('error', 'service', `${action} 失败: ${svc.name}`, e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/unified-services/:id/logs', async (req, res) => {
  const registry = await loadServiceRegistry();
  const svc = registry.services.find(s => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: 'Service not found' });
  const type = req.query.type || 'out';
  const lines = parseInt(req.query.lines) || 100;

  if (svc.manager === 'pm2') {
    const logPath = path.join(SERVICES_DIR, `${svc.id}-${type}.log`);
    if (!fs.existsSync(logPath)) return res.json({ logs: '', exists: false });
    const content = fs.readFileSync(logPath, 'utf8');
    const allLines = content.split('\n');
    return res.json({ logs: allLines.slice(-lines).join('\n'), exists: true, totalLines: allLines.length });
  } else if (svc.logPaths) {
    const logPath = type === 'err' ? svc.logPaths.stderr : svc.logPaths.stdout;
    if (!logPath || !fs.existsSync(logPath)) return res.json({ logs: '', exists: false, path: logPath });
    const content = fs.readFileSync(logPath, 'utf8');
    const allLines = content.split('\n');
    return res.json({ logs: allLines.slice(-lines).join('\n'), exists: true, totalLines: allLines.length, path: logPath });
  }
  res.json({ logs: '', exists: false });
});

app.get('/api/unified-services/:id/details', async (req, res) => {
  const registry = await loadServiceRegistry();
  const svc = registry.services.find(s => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: 'Service not found' });

  const details = { ...svc, pid: null, status: 'unknown' };

  if (svc.manager === 'pm2') {
    try {
      const stdout = await pm2Exec('jlist');
      const list = JSON.parse(stdout);
      const d = list.find(p => p.name === svc.id);
      if (d) {
        const env = d.pm2_env || {};
        details.pid = d.pid;
        details.status = env.status;
        details.uptime = env.pm_uptime;
        details.restarts = env.restart_time;
        details.createdAt = env.created_at;
        details.execPath = env.pm_exec_path;
        details.cwd = env.pm_cwd;
        details.nodeVersion = env.node_version;
        details.outLogPath = env.pm_out_log_path;
        details.errLogPath = env.pm_err_log_path;
      }
    } catch (_) {}
  } else if (svc.manager === 'launchagent' && svc.launchagentLabel) {
    const laStatus = await getLaunchAgentStatus(svc.launchagentLabel);
    details.running = laStatus.running;
    details.pid = laStatus.pid;
    details.status = laStatus.running ? 'online' : 'stopped';
    details.exitStatus = laStatus.exitStatus;
  }

  res.json(details);
});

// === Legacy Service APIs (backward compat) ===
app.get('/api/services', (req, res) => {
  const pm2Path = process.env.PM2_PATH || 'pm2';
  exec(`${pm2Path} jlist`, { env: { ...process.env, PATH: SYSTEM_PATH } }, (err, stdout) => {
    if (err) return res.json({ error: 'pm2 not available', services: [] });
    try {
      const list = JSON.parse(stdout);
      const services = list.map(p => ({
        name: p.name, pid: p.pid, status: p.pm2_env.status, uptime: p.pm2_env.pm_uptime,
        restarts: p.pm2_env.restart_time, cpu: p.monit ? p.monit.cpu : 0, memory: p.monit ? p.monit.memory : 0, pmId: p.pm_id
      }));
      res.json({ services });
    } catch (e) { res.json({ error: 'parse error', services: [] }); }
  });
});

app.get('/api/services/:name/details', async (req, res) => {
  try {
    const stdout = await pm2Exec('jlist');
    const list = JSON.parse(stdout);
    const d = list.find(p => p.name === req.params.name);
    if (!d) return res.status(404).json({ error: 'Service not found' });
    const env = d.pm2_env || {};
    res.json({
      name: d.name, pmId: d.pm_id, pid: d.pid, status: env.status, uptime: env.pm_uptime,
      restarts: env.restart_time, createdAt: env.created_at, execPath: env.pm_exec_path,
      cwd: env.pm_cwd, args: env.args, nodeVersion: env.node_version, version: env.version,
      instances: env.instances, execMode: env.exec_mode, outLogPath: env.pm_out_log_path,
      errLogPath: env.pm_err_log_path, pidPath: env.pm_pid_path, unstableRestarts: env.unstable_restarts, exitCode: env.exit_code
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/services/:name/logs', (req, res) => {
  const name = req.params.name;
  const type = req.query.type || 'out';
  const lines = parseInt(req.query.lines) || 100;
  const logPath = path.join(SERVICES_DIR, `${name}-${type}.log`);
  if (!fs.existsSync(logPath)) return res.json({ logs: '', path: logPath, exists: false });
  const content = fs.readFileSync(logPath, 'utf8');
  const allLines = content.split('\n');
  res.json({ logs: allLines.slice(-lines).join('\n'), path: logPath, exists: true, totalLines: allLines.length });
});

app.post('/api/services/:name/restart', async (req, res) => {
  try { await pm2Exec(`restart ${req.params.name}`); addLog('info', 'service', `重启: ${req.params.name}`); res.json({ message: 'Restarted', name: req.params.name }); }
  catch (e) { addLog('error', 'service', `重启失败: ${req.params.name}`, e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/services/:name/stop', async (req, res) => {
  try { await pm2Exec(`stop ${req.params.name}`); addLog('warn', 'service', `停止: ${req.params.name}`); res.json({ message: 'Stopped', name: req.params.name }); }
  catch (e) { addLog('error', 'service', `停止失败: ${req.params.name}`, e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/services/:name/start', async (req, res) => {
  try { await pm2Exec(`start ${req.params.name}`); addLog('info', 'service', `启动: ${req.params.name}`); res.json({ message: 'Started', name: req.params.name }); }
  catch (e) { addLog('error', 'service', `启动失败: ${req.params.name}`, e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/services/:name/delete', async (req, res) => {
  try { await pm2Exec(`delete ${req.params.name}`); addLog('warn', 'service', `删除: ${req.params.name}`); res.json({ message: 'Deleted', name: req.params.name }); }
  catch (e) { addLog('error', 'service', `删除失败: ${req.params.name}`, e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/health', async (req, res) => {
  const ports = await loadServicePorts();
  const results = {};
  for (const [name, port] of Object.entries(ports)) {
    results[name] = { port, healthy: await checkPort('localhost', port) };
  }
  res.json(results);
});

app.get('/api/external-services', async (req, res) => {
  const svcDefs = await loadExternalServices();
  const results = [];
  for (const svc of svcDefs) {
    const info = { ...svc, healthy: false, running: false, pid: null, memory: 0, cpu: 0, command: '' };
    if (svc.port) info.healthy = await checkPort('localhost', svc.port);
    if (svc.type === 'launchagent' && svc.launchagentLabel) {
      const laStatus = await getLaunchAgentStatus(svc.launchagentLabel);
      info.running = laStatus.running;
      info.pid = laStatus.pid;
      if (laStatus.pid) {
        const procInfo = await getProcessInfo(laStatus.pid);
        info.memory = procInfo.memory;
        info.cpu = procInfo.cpu;
        info.command = procInfo.command;
      }
    }
    if (svc.extraPorts && svc.extraPorts.length > 0) {
      info.extraPortStatus = {};
      for (const ep of svc.extraPorts) info.extraPortStatus[ep] = await checkPort('localhost', ep);
    }
    results.push(info);
  }
  res.json(results);
});

app.post('/api/external-services/:id/toggle', async (req, res) => {
  const svcDefs = await loadExternalServices();
  const svc = svcDefs.find(s => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: 'External service not found' });
  if (svc.type !== 'launchagent' || !svc.launchagentLabel) {
    return res.status(400).json({ error: 'Only LaunchAgent services can be toggled' });
  }
  const action = req.body.action;
  if (!['load', 'unload'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "load" or "unload"' });
  }
  const plistPath = path.join(HOME, `Library/LaunchAgents/${svc.launchagentLabel}.plist`);
  exec(`launchctl ${action} ${plistPath} 2>&1`, { env: { ...process.env, PATH: SYSTEM_PATH } }, (err, stdout) => {
    if (err) { addLog('error', 'ext-service', `${action === 'load' ? '启动' : '停止'}失败: ${svc.name}`, err.message); return res.status(500).json({ error: err.message }); }
    addLog(action === 'load' ? 'info' : 'warn', 'ext-service', `${action === 'load' ? '启动' : '停止'}: ${svc.name}`);
    res.json({ message: `${action}ed ${svc.name}`, id: svc.id });
  });
});

app.get('/api/webviews', async (req, res) => {
  const wvDefs = await loadWebviewsConfig();
  const results = [];
  for (const view of wvDefs) {
    const info = { ...view, healthy: false };
    if (view.port) info.healthy = await checkPort('localhost', view.port);
    results.push(info);
  }
  res.json(results);
});

// === AI CLI Process Monitor ===
const MONITOR_SCRIPT = path.join(__dirname, 'scripts/ai-cli-monitor.py');

app.get('/api/ai-cli-processes', (req, res) => {
  if (!fs.existsSync(MONITOR_SCRIPT)) {
    return res.json({ processes: [], error: 'Monitor script not found' });
  }
  exec(`python3 "${MONITOR_SCRIPT}" --json`, { timeout: 10000, env: { ...process.env, PATH: SYSTEM_PATH } }, (err, stdout, stderr) => {
    if (err) {
      addLog('error', 'ai-cli', '进程监控脚本执行失败', stderr || err.message);
      return res.json({ processes: [], error: stderr || err.message });
    }
    try {
      const processes = JSON.parse(stdout);
      const byTool = {};
      for (const p of processes) {
        if (!byTool[p.tool]) byTool[p.tool] = { count: 0, totalCpu: 0, totalMemMB: 0 };
        byTool[p.tool].count++;
        byTool[p.tool].totalCpu += p.cpuPercent;
        byTool[p.tool].totalMemMB += p.memMB;
      }
      res.json({ processes, summary: byTool, count: processes.length });
    } catch (e) {
      addLog('error', 'ai-cli', '进程监控数据解析失败', e.message);
      res.json({ processes: [], error: 'Parse error: ' + e.message });
    }
  });
});

// === Dashboard Log API ===
app.get('/api/dashboard-logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, DASH_LOG_MAX);
  const source = req.query.source;
  const type = req.query.type;
  let logs = dashLog;
  if (source) logs = logs.filter(l => l.source === source);
  if (type) logs = logs.filter(l => l.type === type);
  res.json(logs.slice(0, limit));
});

// === Error Handling Middleware ===
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  addLog('error', 'system', `请求错误: ${req.method} ${req.path}`, err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error', path: req.path });
});

// === Periodic Status Broadcast (every 30s, only if something changed) ===
let lastBroadcastStatus = null;
setInterval(async () => {
  try {
    const { services } = await buildUnifiedServices();
    const statusSig = services.map(s => `${s.id}:${s.status}:${s.healthy}`).join(',');
    if (statusSig !== lastBroadcastStatus) {
      lastBroadcastStatus = statusSig;
      broadcast('status-change', { services: services.map(s => ({ id: s.id, status: s.status, healthy: s.healthy })) });
    }
  } catch (_) {}
}, 30000);

// === Server Start & Graceful Shutdown ===
const server = app.listen(PORT, () => {
  console.log(`AI Services Dashboard running at http://localhost:${PORT}`);
});

function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  for (const client of sseClients) client.end();
  sseClients.clear();
  server.close(() => {
    for (const job of Object.values(scheduledJobs)) { if (job && job.cancel) job.cancel(); }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
