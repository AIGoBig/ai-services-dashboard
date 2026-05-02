#!/bin/bash
set -e
cd "$(dirname "$0")"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

SERVICE_NAME="${1:-}"
if [ -n "$SERVICE_NAME" ]; then
  echo -e "${YELLOW}▶ 停止服务: $SERVICE_NAME${NC}"
  pm2 stop "$SERVICE_NAME"
  echo -e "${GREEN}✓ $SERVICE_NAME 已停止${NC}"
  exit 0
fi

echo -e "${YELLOW}▶ 停止所有 AI 服务...${NC}"
pm2 stop ecosystem.config.js
echo -e "${GREEN}✓ 所有服务已停止${NC}"
