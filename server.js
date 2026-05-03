const express = require('express');
const schedule = require('node-schedule');
const { exec } = require('child_process');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');

const HOME = os.homedir();
const app = express();
const PORT = process.env.DASHBOARD_PORT || 3777;
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const LOGS_DIR = path.join(__dirname, 'logs');
const SERVICES_DIR = path.join(HOME, '.agents/services/logs');

// Auto-detect PATH: Homebrew ARM vs Intel + system paths
function buildPath() {
  const brewPrefix = fs.existsSync('/opt/homebrew/bin/brew') ? '/opt/homebrew'
    : fs.existsSync('/usr/local/bin/brew') ? '/usr/local' : null;
  const paths = [brewPrefix ? `${brewPrefix}/bin` : '', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  return paths.filter(Boolean).join(':');
}
const SYSTEM_PATH = buildPath();

// Service port mapping: load from config file, fallback to defaults
const DEFAULT_PORTS = { scheduler: 3777, gemini: 52019, 'xiaohongshu-mcp': 18060, 'openclaw-gateway': 18789, 'agent-browser': 54247 };
const PORTS_FILE = path.join(__dirname, 'service-ports.json');
const SERVICE_PORTS = fs.existsSync(PORTS_FILE)
  ? { ...DEFAULT_PORTS, ...JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8')) }
  : DEFAULT_PORTS;

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

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
  });
}

function scheduleTask(task) {
  if (scheduledJobs[task.id]) scheduledJobs[task.id].cancel();
  if (task.enabled) {
    scheduledJobs[task.id] = schedule.scheduleJob(task.schedule, () => runTask(task.id));
  }
}

tasks.forEach(scheduleTask);

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

function pm2Exec(cmd) {
  const pm2Path = process.env.PM2_PATH || 'pm2';
  return new Promise((resolve, reject) => {
    exec(`${pm2Path} ${cmd}`, { env: { ...process.env, PATH: SYSTEM_PATH } }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.post('/api/tasks/:id/run', (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  runTask(task.id, true);
  res.json({ message: 'Task started', id: task.id });
});

app.post('/api/tasks/:id/toggle', (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  task.enabled = !task.enabled;
  saveTasks(tasks);
  scheduleTask(task);
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

// === Service APIs ===
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
  try { await pm2Exec(`restart ${req.params.name}`); res.json({ message: 'Restarted', name: req.params.name }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/services/:name/stop', async (req, res) => {
  try { await pm2Exec(`stop ${req.params.name}`); res.json({ message: 'Stopped', name: req.params.name }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/services/:name/start', async (req, res) => {
  try { await pm2Exec(`start ${req.params.name}`); res.json({ message: 'Started', name: req.params.name }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/services/:name/delete', async (req, res) => {
  try { await pm2Exec(`delete ${req.params.name}`); res.json({ message: 'Deleted', name: req.params.name }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', async (req, res) => {
  const results = {};
  for (const [name, port] of Object.entries(SERVICE_PORTS)) {
    results[name] = { port, healthy: await checkPort('localhost', port) };
  }
  res.json(results);
});

app.listen(PORT, () => {
  console.log(`AI Services Dashboard running at http://localhost:${PORT}`);
});
