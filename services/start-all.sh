#!/bin/bash
set -e
cd "$(dirname "$0")"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

SERVICE_NAME="${1:-}"

if [ -n "$SERVICE_NAME" ]; then
  echo -e "${BLUE}▶ 启动服务: $SERVICE_NAME${NC}"
  pm2 start ecosystem.config.js --only "$SERVICE_NAME"
  echo -e "${GREEN}✓ $SERVICE_NAME 已启动${NC}"
  exit 0
fi

echo -e "${BLUE}▶ 启动所有 AI 服务...${NC}\n"
echo -e "${YELLOW}  清理旧进程...${NC}"
launchctl unload ~/Library/LaunchAgents/com.qoder.skills-daily-commit.plist 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
sleep 1
echo -e "${GREEN}  ✓ 旧进程已清理${NC}\n"

pm2 start ecosystem.config.js

echo ""
echo -e "${GREEN}✓ 所有服务已启动${NC}"
echo ""
echo -e "${BLUE}  Dashboard:${NC}  http://localhost:3777"
echo -e "${BLUE}  PM2 状态:${NC}  pm2 status"
echo ""
