#!/bin/bash
# ============================================================
# AI Services Dashboard - Setup Script
# Supports macOS Intel & Apple Silicon
# ============================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

HOME_DIR="$HOME"
AGENTS_DIR="$HOME_DIR/.agents"
SERVICES_DIR="$AGENTS_DIR/services"
SCRIPTS_DIR="$AGENTS_DIR/scripts"
SCHEDULER_DIR="$AGENTS_DIR/scheduler"
DASHBOARD_APP_DIR="$AGENTS_DIR/dashboard-app"

# Detect architecture and Homebrew prefix
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  BREW_PREFIX="/opt/homebrew"
else
  BREW_PREFIX="/usr/local"
fi

# Build PATH for the setup script itself
export PATH="$HOME/.npm-global/bin:$BREW_PREFIX/bin:$BREW_PREFIX/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     AI Services Dashboard - Setup               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Architecture: ${CYAN}$ARCH${NC}"
echo -e "  Brew prefix:  ${CYAN}$BREW_PREFIX${NC}"
echo ""

# 1. Check / Install Node.js
echo -e "${YELLOW}[1/7] 检查 Node.js...${NC}"
if ! command -v node &>/dev/null; then
  echo -e "  ${YELLOW}Node.js 未安装，尝试自动安装...${NC}"
  if command -v brew &>/dev/null; then
    brew install node
  elif command -v curl &>/dev/null; then
    # Install via nvm (works without Homebrew)
    export NVM_DIR="$HOME/.nvm"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install --lts
    # Update PATH for current session
    export PATH="$(dirname $(which node)):$PATH"
  else
    echo -e "  ${RED}无法自动安装 Node.js，请手动安装后重试${NC}"
    exit 1
  fi
fi
NODE_VER=$(node -v 2>/dev/null || echo "unknown")
NPM_VER=$(npm -v 2>/dev/null || echo "unknown")
echo -e "  ✓ Node.js $NODE_VER (npm $NPM_VER)"

# 2. Install pm2 (prefer user-level ~/.npm-global to avoid sudo)
echo -e "${YELLOW}[2/7] 安装 pm2...${NC}"
NPM_GLOBAL="$HOME/.npm-global"
if ! command -v pm2 &>/dev/null; then
  # Try direct global install first
  if npm install -g pm2 2>/dev/null; then
    echo -e "  ✓ pm2 已安装（系统全局）"
  else
    # Fallback: install to user-level prefix
    echo -e "  ${YELLOW}系统全局安装需要权限，使用用户级目录...${NC}"
    mkdir -p "$NPM_GLOBAL/lib"
    npm config set prefix "$NPM_GLOBAL"
    npm install -g pm2
    # Add to PATH for current and future sessions
    export PATH="$NPM_GLOBAL/bin:$PATH"
    PROFILE_FILE="$HOME/.zshrc"
    [ ! -f "$PROFILE_FILE" ] && PROFILE_FILE="$HOME/.bashrc"
    if ! grep -q '.npm-global/bin' "$PROFILE_FILE" 2>/dev/null; then
      echo '' >> "$PROFILE_FILE"
      echo '# npm global packages (user-level)' >> "$PROFILE_FILE"
      echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$PROFILE_FILE"
    fi
    echo -e "  ✓ pm2 已安装（用户级 ~/.npm-global/）"
  fi
else
  echo -e "  ✓ pm2 已存在"
fi

# 3. Create directory structure
echo -e "${YELLOW}[3/7] 创建目录结构...${NC}"
mkdir -p "$SERVICES_DIR/logs"
mkdir -p "$SCRIPTS_DIR"
mkdir -p "$SCHEDULER_DIR/public/css"
mkdir -p "$SCHEDULER_DIR/public/js"
mkdir -p "$SCHEDULER_DIR/scripts"
mkdir -p "$DASHBOARD_APP_DIR"
# Create per-service dirs for pid files
mkdir -p "$SERVICES_DIR/scheduler" "$SERVICES_DIR/cc-connect" "$SERVICES_DIR/openclaw-gateway" "$SERVICES_DIR/gemini" "$SERVICES_DIR/xiaohongshu-mcp" 2>/dev/null || true
echo -e "  ✓ $AGENTS_DIR/"

# 4. Copy server files
echo -e "${YELLOW}[4/7] 部署后端服务...${NC}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/server.js" "$SCHEDULER_DIR/server.js"
cp -r "$SCRIPT_DIR/public/" "$SCHEDULER_DIR/public/"
# Deploy service-ports.json (port mapping config)
cp "$SCRIPT_DIR/config/service-ports.json" "$SCHEDULER_DIR/service-ports.json"
# Deploy external-services.json (non-pm2 service definitions)
if [ -f "$SCRIPT_DIR/config/external-services.json" ]; then
  cp "$SCRIPT_DIR/config/external-services.json" "$SCHEDULER_DIR/external-services.json"
fi
# Deploy AI CLI monitor script
if [ -f "$SCRIPT_DIR/scripts/ai-cli-monitor.py" ]; then
  cp "$SCRIPT_DIR/scripts/ai-cli-monitor.py" "$SCHEDULER_DIR/scripts/ai-cli-monitor.py"
  chmod +x "$SCHEDULER_DIR/scripts/ai-cli-monitor.py"
fi
if [ ! -f "$SCHEDULER_DIR/tasks.json" ]; then
  cp "$SCRIPT_DIR/config/tasks.example.json" "$SCHEDULER_DIR/tasks.json"
fi
# Install npm dependencies in scheduler dir (express, node-schedule)
if [ ! -d "$SCHEDULER_DIR/node_modules" ]; then
  cd "$SCHEDULER_DIR"
  npm init -y >/dev/null 2>&1
  npm install express node-schedule --silent 2>/dev/null
  cd "$SCRIPT_DIR"
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
