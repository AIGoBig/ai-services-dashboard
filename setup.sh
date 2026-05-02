#!/bin/bash
# ============================================================
# AI Services Dashboard - Setup Script
# ============================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

HOME_DIR="$HOME"
AGENTS_DIR="$HOME_DIR/.agents"
SERVICES_DIR="$AGENTS_DIR/services"
SCRIPTS_DIR="$AGENTS_DIR/scripts"
SCHEDULER_DIR="$AGENTS_DIR/scheduler"
DASHBOARD_APP_DIR="$AGENTS_DIR/dashboard-app"

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     AI Services Dashboard - Setup               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Check prerequisites
echo -e "${YELLOW}[1/7] 检查依赖...${NC}"
for cmd in node npm git; do
  if ! command -v $cmd &>/dev/null; then
    echo -e "  ❌ $cmd 未安装"
    exit 1
  fi
  echo -e "  ✓ $cmd $(command -v $cmd)"
done

# 2. Install pm2
echo -e "${YELLOW}[2/7] 安装 pm2...${NC}"
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
  echo -e "  ✓ pm2 已安装"
else
  echo -e "  ✓ pm2 已存在"
fi

# 3. Create directory structure
echo -e "${YELLOW}[3/7] 创建目录结构...${NC}"
mkdir -p "$SERVICES_DIR/logs"
mkdir -p "$SCRIPTS_DIR"
mkdir -p "$SCHEDULER_DIR/public"
mkdir -p "$DASHBOARD_APP_DIR"
echo -e "  ✓ $AGENTS_DIR/"

# 4. Copy server files
echo -e "${YELLOW}[4/7] 部署后端服务...${NC}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/server.js" "$SCHEDULER_DIR/server.js"
cp -r "$SCRIPT_DIR/public/" "$SCHEDULER_DIR/public/"
if [ ! -f "$SCHEDULER_DIR/tasks.json" ]; then
  cp "$SCRIPT_DIR/config/tasks.example.json" "$SCHEDULER_DIR/tasks.json"
fi
echo -e "  ✓ scheduler/"

# 5. Copy service scripts
echo -e "${YELLOW}[5/7] 部署管理脚本...${NC}"
cp "$SCRIPT_DIR/services/ecosystem.config.js" "$SERVICES_DIR/ecosystem.config.js"
cp "$SCRIPT_DIR/services/start-all.sh" "$SERVICES_DIR/start-all.sh"
cp "$SCRIPT_DIR/services/stop-all.sh" "$SERVICES_DIR/stop-all.sh"
cp "$SCRIPT_DIR/services/status.sh" "$SERVICES_DIR/status.sh"
chmod +x "$SERVICES_DIR/start-all.sh" "$SERVICES_DIR/stop-all.sh" "$SERVICES_DIR/status.sh"
echo -e "  ✓ services/"

# 6. Build desktop app
echo -e "${YELLOW}[6/7] 构建桌面应用...${NC}"
cd "$DASHBOARD_APP_DIR"
if [ ! -f package.json ]; then
  cp -r "$SCRIPT_DIR/dashboard-app/"* "$DASHBOARD_APP_DIR/"
fi
if [ ! -d node_modules ]; then
  npm install --silent
fi
echo -e "  ✓ dashboard-app/"

# Build macOS .app
ELECTRON_APP="/Applications/AI Services Dashboard.app"
if [ -d "$DASHBOARD_APP_DIR/node_modules/electron/dist/Electron.app" ]; then
  rm -rf "$ELECTRON_APP"
  cp -R "$DASHBOARD_APP_DIR/node_modules/electron/dist/Electron.app" "$ELECTRON_APP"
  mkdir -p "$ELECTRON_APP/Contents/Resources/app"
  cp "$DASHBOARD_APP_DIR/main.js" "$ELECTRON_APP/Contents/Resources/app/"
  cp "$DASHBOARD_APP_DIR/package.json" "$ELECTRON_APP/Contents/Resources/app/"
  if [ -f "$DASHBOARD_APP_DIR/icon.png" ]; then
    cp "$DASHBOARD_APP_DIR/icon.png" "$ELECTRON_APP/Contents/Resources/app/"
  fi
  # Generate icon
  if [ -f "$SCRIPT_DIR/dashboard-app/icon.png" ]; then
    ICON_SRC="$SCRIPT_DIR/dashboard-app/icon.png"
    ICON_DIR="/tmp/AI Services Dashboard.iconset"
    rm -rf "$ICON_DIR"
    mkdir -p "$ICON_DIR"
    for size in "16 16" "32 16@2x" "32 32" "64 32@2x" "128 128" "256 128@2x" "256 256" "512 256@2x" "512 512" "1024 512@2x"; do
      set -- $size
      sips -z $1 $1 "$ICON_SRC" --out "$ICON_DIR/icon_$2x$3.png" &>/dev/null
    done
    iconutil -c icns "$ICON_DIR" -o "$ELECTRON_APP/Contents/Resources/AppIcon.icns" 2>/dev/null || true
  fi
  # Update Info.plist
  python3 -c "
import plistlib
plist = {
    'CFBundleExecutable': 'Electron',
    'CFBundleIdentifier': 'com.qoder.ai-services-dashboard',
    'CFBundleName': 'AI Services Dashboard',
    'CFBundleDisplayName': 'AI Services Dashboard',
    'CFBundleVersion': '1.0.0',
    'CFBundlePackageType': 'APPL',
    'CFBundleIconFile': 'AppIcon',
    'LSMinimumSystemVersion': '12.0',
}
with open('$ELECTRON_APP/Contents/Info.plist', 'wb') as f:
    plistlib.dump(plist, f)
" 2>/dev/null
  echo -e "  ✓ $ELECTRON_APP"
fi

# 7. Start services
echo -e "${YELLOW}[7/7] 启动服务...${NC}"
cd "$SERVICES_DIR"
pm2 start ecosystem.config.js
pm2 save

# Add to login items (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
  osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/AI Services Dashboard.app", hidden:false}' 2>/dev/null || true
  echo -e "  ✓ 已加入开机自启"
fi

echo ""
echo -e "${GREEN}✓ 安装完成！${NC}"
echo ""
echo -e "  桌面应用:  Spotlight 搜索 \"AI Services\""
echo -e "  Web 面板:  http://localhost:3777"
echo -e "  命令行:    cd $SERVICES_DIR && ./status.sh"
echo ""
