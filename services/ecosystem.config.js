const os = require('os');
const path = require('path');
const HOME = os.homedir();

module.exports = {
  apps: [
    {
      name: 'scheduler',
      script: path.join(HOME, '.agents/scheduler/server.js'),
      cwd: path.join(HOME, '.agents/scheduler'),
      log_file: path.join(HOME, '.agents/services/logs/scheduler-combined.log'),
      out_file: path.join(HOME, '.agents/services/logs/scheduler-out.log'),
      error_file: path.join(HOME, '.agents/services/logs/scheduler-error.log'),
      pid_file: path.join(HOME, '.agents/services/scheduler/pid.pid'),
      watch: false,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      env: { NODE_ENV: 'production', PORT: 3777 },
      kill_timeout: 5000,
      restart_delay: 3000
    },
    {
      name: 'cc-connect',
      script: '/opt/homebrew/lib/node_modules/cc-connect/bin/cc-connect',
      cwd: path.join(HOME, '.agents/services/cc-connect'),
      log_file: path.join(HOME, '.agents/services/logs/cc-connect-combined.log'),
      out_file: path.join(HOME, '.agents/services/logs/cc-connect-out.log'),
      error_file: path.join(HOME, '.agents/services/logs/cc-connect-error.log'),
      pid_file: path.join(HOME, '.agents/services/cc-connect/pid.pid'),
      watch: false,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      kill_timeout: 5000,
      restart_delay: 3000
    },
    {
      name: 'openclaw-gateway',
      script: '/opt/homebrew/bin/openclaw',
      args: 'gateway',
      cwd: path.join(HOME, 'File/AIAssistant/Openclaw'),
      log_file: path.join(HOME, '.agents/services/logs/openclaw-gateway-combined.log'),
      out_file: path.join(HOME, '.agents/services/logs/openclaw-gateway-out.log'),
      error_file: path.join(HOME, '.agents/services/logs/openclaw-gateway-error.log'),
      pid_file: path.join(HOME, '.agents/services/openclaw-gateway/pid.pid'),
      watch: false,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        GLOBAL_AGENT_HTTP_PROXY: 'http://127.0.0.1:7890',
        GLOBAL_AGENT_HTTPS_PROXY: 'http://127.0.0.1:7890',
        NO_PROXY: 'open.feishu.cn,*.feishu.cn,*.larkoffice.com,127.0.0.1,localhost',
        GLOBAL_AGENT_NO_PROXY: 'open.feishu.cn,*.feishu.cn,*.larkoffice.com,127.0.0.1,localhost',
        NODE_OPTIONS: '--experimental-global-webcrypto --dns-result-order=ipv4first',
        UNDICI_PROXY: 'http://127.0.0.1:7890',
        UNDICI_NO_PROXY: 'open.feishu.cn,*.feishu.cn,*.larkoffice.com,127.0.0.1,localhost'
      },
      kill_timeout: 5000,
      restart_delay: 3000
    },
    {
      name: 'gemini',
      script: '/opt/homebrew/bin/gemini',
      cwd: path.join(HOME, '.agents/services/gemini'),
      log_file: path.join(HOME, '.agents/services/logs/gemini-combined.log'),
      out_file: path.join(HOME, '.agents/services/logs/gemini-out.log'),
      error_file: path.join(HOME, '.agents/services/logs/gemini-error.log'),
      pid_file: path.join(HOME, '.agents/services/gemini/pid.pid'),
      watch: false,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      kill_timeout: 5000,
      restart_delay: 3000
    },
    {
      name: 'xiaohongshu-mcp',
      script: path.join(HOME, '.agents/skills/xiaohongshu-mcp/xiaohongshu-mcp-darwin-arm64'),
      cwd: path.join(HOME, '.agents/skills/xiaohongshu-mcp'),
      log_file: path.join(HOME, '.agents/services/logs/xiaohongshu-mcp-combined.log'),
      out_file: path.join(HOME, '.agents/services/logs/xiaohongshu-mcp-out.log'),
      error_file: path.join(HOME, '.agents/services/logs/xiaohongshu-mcp-error.log'),
      pid_file: path.join(HOME, '.agents/services/xiaohongshu-mcp/pid.pid'),
      watch: false,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      kill_timeout: 5000,
      restart_delay: 3000
    }
  ]
};
