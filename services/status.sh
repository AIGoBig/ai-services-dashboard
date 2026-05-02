#!/bin/bash
cd "$(dirname "$0")"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              AI Services 运行状态面板                      ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}▶ PM2 托管服务${NC}"
pm2 status ecosystem.config.js 2>/dev/null || echo -e "  ${RED}pm2 未运行${NC}"

echo ""
echo -e "${BLUE}▶ 端口监听状态${NC}"
PORTS=(3777 52019 54247 18060 8045)
for PORT in "${PORTS[@]}"; do
  if lsof -i :$PORT -sTCP:LISTEN >/dev/null 2>&1; then
    PID=$(lsof -i :$PORT -sTCP:LISTEN -t 2>/dev/null | head -1)
    NAME=$(ps -p "$PID" -o comm= 2>/dev/null | head -c 20)
    printf "  ${GREEN}●${NC} 端口 %-5s 运行中  (PID: %-6s %s)\n" "$PORT" "$PID" "$NAME"
  else
    printf "  ${RED}●${NC} 端口 %-5s 未监听\n" "$PORT"
  fi
done

echo ""
echo -e "${BLUE}▶ 快速操作${NC}"
echo -e "  启动全部:  ${CYAN}./start-all.sh${NC}"
echo -e "  停止全部:  ${CYAN}./stop-all.sh${NC}"
echo -e "  查看日志:  ${CYAN}pm2 logs${NC}"
echo -e "  打开面板:  ${CYAN}open http://localhost:3777${NC}"
