const os = require('os');
const fs = require('fs');
const path = require('path');
const HOME = os.homedir();

// Detect Homebrew prefix (Apple Silicon vs Intel)
function getBrewPrefix() {
  const candidates = ['/opt/homebrew', '/usr/local'];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'bin/brew'))) return p;
  }
  // Fallback: check common paths
  return process.arch === 'arm64' ? '/opt/homebrew' : '/usr/local';
}

const BREW = getBrewPrefix();

// Service definitions: only include if the script exists on this machine
const serviceDefs = [
  {
    name: 'scheduler',
    script: path.join(HOME, '.agents/scheduler/server.js'),
    cwd: path.join(HOME, '.agents/scheduler'),
    env: { NODE_ENV: 'production', PORT: 3777 },
  },
  {
    name: 'cc-connect',
    script: path.join(BREW, 'lib/node_modules/cc-connect/bin/cc-connect'),
    cwd: path.join(HOME, '.agents/services/cc-connect'),
  },
  {
    name: 'openclaw-gateway',
    script: path.join(BREW, 'bin/openclaw'),
    args: 'gateway',
    cwd: path.join(HOME, 'File/AIAssistant/Openclaw'),
    env: {
      GLOBAL_AGENT_HTTP_PROXY: 'http://127.0.0.1:7890',
      GLOBAL_AGENT_HTTPS_PROXY: 'http://127.0.0.1:7890',
      NO_PROXY: 'open.feishu.cn,*.feishu.cn,*.larkoffice.com,127.0.0.1,localhost',
      GLOBAL_AGENT_NO_PROXY: 'open.feishu.cn,*.feishu.cn,*.larkoffice.com,127.0.0.1,localhost',
      NODE_OPTIONS: '--experimental-global-webcrypto --dns-result-order=ipv4first',
      UNDICI_PROXY: 'http://127.0.0.1:7890',
      UNDICI_NO_PROXY: 'open.feishu.cn,*.feishu.cn,*.larkoffice.com,127.0.0.1,localhost',
    },
  },
  {
    name: 'gemini',
    script: path.join(BREW, 'bin/gemini'),
    cwd: path.join(HOME, '.agents/services/gemini'),
  },
  {
    name: 'xiaohongshu-mcp',
    // Detect correct binary for current architecture
    script: path.join(HOME, `.agents/skills/xiaohongshu-mcp/xiaohongshu-mcp-darwin-${process.arch === 'arm64' ? 'arm64' : 'amd64'}`),
    cwd: path.join(HOME, '.agents/skills/xiaohongshu-mcp'),
  },
];

// Build apps list: only include services whose script exists
const apps = serviceDefs
  .filter(def => {
    const exists = fs.existsSync(def.script);
    if (!exists) console.log(`[ecosystem] Skipping ${def.name}: ${def.script} not found`);
    return exists;
  })
  .map(def => ({
    name: def.name,
    script: def.script,
    ...(def.args && { args: def.args }),
    cwd: def.cwd,
    log_file: path.join(HOME, `.agents/services/logs/${def.name}-combined.log`),
    out_file: path.join(HOME, `.agents/services/logs/${def.name}-out.log`),
    error_file: path.join(HOME, `.agents/services/logs/${def.name}-error.log`),
    pid_file: path.join(HOME, `.agents/services/${def.name}/pid.pid`),
    watch: false,
    autorestart: true,
    max_restarts: 5,
    min_uptime: '10s',
    ...(def.env && { env: { NODE_ENV: 'production', ...def.env } }),
    kill_timeout: 5000,
    restart_delay: 3000,
  }));

module.exports = { apps };
