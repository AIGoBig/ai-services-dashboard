# AGENTS.md

本文件为 AI 代理在此仓库中工作时提供指引。

## 架构

- **源码目录**：`/Users/king/Projects/ai-services-dashboard/`；**运行部署目录**：`~/.agents/`
- `setup.sh` 将源码部署到 `~/.agents/` — 修改 server.js/public/ 后需重新部署（`cp` 或 `bash setup.sh`）
- 后端（Express，端口 3777）+ 前端（`public/index.html` 纯 HTML）= 单页应用，无构建步骤
- Electron 桌面应用在 `dashboard-app/`，启动方式：`cd dashboard-app && npm start`

## 服务端口

| 服务 | 端口 |
|------|------|
| scheduler | 3777 |
| gemini | 52019 |
| xiaohongshu-mcp | 18060 |
| openclaw-gateway | 18789 |
| agent-browser | 54247 |

## 常用命令

```bash
# 本地开发启动后端
node server.js

# 启停所有 pm2 服务（在部署目录下）
cd ~/.agents/services && ./start-all.sh
./stop-all.sh
./status.sh

# 保存 pm2 配置（重启后自动恢复）
pm2 save

# 启动 Electron 桌面应用
cd dashboard-app && npm install && npm start
```

## 注意事项

- `tasks.json` 已加入 gitignore（含本地配置），模板为 `config/tasks.example.json`
- `ecosystem.config.js` 使用 `HOME` 环境变量和硬编码 Homebrew 路径（`/opt/homebrew/`）— 仅限 macOS ARM
- openclaw-gateway 需要代理环境变量：`GLOBAL_AGENT_HTTP_PROXY=http://127.0.0.1:7890`，`NO_PROXY` 需排除飞书/Lark 域名
- 面板每 30 秒自动刷新（`public/index.html` 中的 `setInterval`）
- 前端无构建/打包工具，所有 CSS/JS 内联在 `index.html` 中
