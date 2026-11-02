#!/usr/bin/env bash
# UU 远程网页主控端（uurc-web）本地服务管理
# 默认只监听 127.0.0.1，账号凭证不离开本机。
set -uo pipefail

SELF_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")" && pwd)"
APP_DIR="${UURC_DIR:-$(dirname "$SELF_DIR")}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/uurc-web"
PID_FILE="$STATE_DIR/uurc-web.pid"
LOG_FILE="$STATE_DIR/uurc-web.log"
APP_PROFILE="${XDG_DATA_HOME:-$HOME/.local/share}/uurc-web/app-profile"
APP_LOG="$STATE_DIR/app.log"
HOST="${UURC_HOST:-127.0.0.1}"
PORT="${UURC_PORT:-8787}"
URL="http://$HOST:$PORT/"

find_node() {
  local candidate
  for candidate in "${UURC_NODE:-}" "$(command -v node 2>/dev/null)"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] && { echo "$candidate"; return 0; }
  done
  return 1
}

pid_alive() {
  [ -f "$PID_FILE" ] || return 1
  local pid; pid=$(cat "$PID_FILE" 2>/dev/null) || return 1
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

port_busy() {
  ss -ltn 2>/dev/null | grep -q ":$PORT "
}

start() {
  if pid_alive; then
    echo "已在运行 (PID $(cat "$PID_FILE")): $URL"
    return 0
  fi
  if port_busy; then
    echo "端口 $PORT 已被其他程序占用，未启动。可用 UURC_PORT=8788 $0 start 换端口。"
    return 1
  fi
  local node; node=$(find_node) || { echo "找不到 node，请设置 UURC_NODE=/path/to/node"; return 1; }
  [ -f "$APP_DIR/backend/dist/index.js" ] || {
    echo "安装不完整：缺少 $APP_DIR/backend/dist/index.js，先执行 npm ci && npm run build"
    return 1
  }
  mkdir -p "$STATE_DIR"
  cd "$APP_DIR/backend" || return 1
  HOST="$HOST" PORT="$PORT" UURC_BACKEND_LOG_PATH="$LOG_FILE" \
    setsid nohup "$node" "$APP_DIR/backend/dist/index.js" >>"$STATE_DIR/stdout.log" 2>&1 </dev/null &
  echo $! > "$PID_FILE"
  sleep 3
  if pid_alive; then
    echo "已启动 (PID $(cat "$PID_FILE")): $URL"
  else
    echo "启动失败，日志：$STATE_DIR/stdout.log"
    tail -n 15 "$STATE_DIR/stdout.log" 2>/dev/null
    return 1
  fi
}

stop() {
  if pid_alive; then
    local pid; pid=$(cat "$PID_FILE")
    kill "$pid" 2>/dev/null
    for _ in 1 2 3 4 5; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
    echo "已停止 (PID $pid)"
  else
    echo "未在运行"
  fi
  rm -f "$PID_FILE"
}

status() {
  if pid_alive; then
    echo "运行中  PID $(cat "$PID_FILE")  $URL"
    curl -s --noproxy '*' -o /dev/null -w "HTTP %{http_code}\n" "$URL" 2>/dev/null || true
  else
    echo "未运行（端口 $PORT $([ -n "$(port_busy && echo busy)" ] && echo 已占用 || echo 空闲)）"
  fi
}

open_url() {
  start >/dev/null
  xdg-open "$URL" >/dev/null 2>&1 &
}

# 找一个支持 --app 的 Chromium 内核浏览器
find_chrome() {
  local candidate
  for candidate in \
    "${UURC_CHROME:-}" \
    "$(command -v google-chrome-stable 2>/dev/null)" \
    "$(command -v google-chrome 2>/dev/null)" \
    "$(command -v chromium 2>/dev/null)" \
    "$(command -v chromium-browser 2>/dev/null)" \
    /usr/bin/google-chrome-stable \
    /usr/bin/google-chrome \
    /opt/google/chrome/chrome; do
    [ -n "$candidate" ] && [ -x "$candidate" ] && { echo "$candidate"; return 0; }
  done
  return 1
}

# 独立窗口（Chrome app 模式）：无地址栏、无标签页、任务栏独立图标
app() {
  start >/dev/null 2>&1 || true
  if ! pid_alive && ! port_busy; then
    echo "服务未能启动，请先执行：$0 start"
    return 1
  fi

  local chrome
  if ! chrome=$(find_chrome); then
    echo "未找到 Chrome/Chromium，退回默认浏览器打开"
    xdg-open "$URL" >/dev/null 2>&1 &
    return 0
  fi

  # 已有窗口就聚焦，避免重复点击开出一堆窗口
  if command -v xdotool >/dev/null 2>&1; then
    local existing
    existing=$(xdotool search --class uurc-web 2>/dev/null | head -1)
    if [ -n "$existing" ]; then
      xdotool windowactivate "$existing" 2>/dev/null && {
        echo "窗口已在运行，已切到前台"
        return 0
      }
    fi
  fi

  mkdir -p "$APP_PROFILE" "$STATE_DIR"
  # 独立 user-data-dir：与日常浏览的 Chrome 完全隔离，关掉浏览器不影响远控窗口
  setsid "$chrome" \
    --app="$URL" \
    --class=uurc-web \
    --user-data-dir="$APP_PROFILE" \
    --start-maximized \
    --no-first-run \
    --no-default-browser-check \
    --disable-features=Translate,MediaRouter,OptimizationHints \
    --disable-sync \
    --noerrdialogs \
    >>"$APP_LOG" 2>&1 </dev/null &

  # Chrome 把 WM_CLASS 的 instance 段设成 URL 主机名（127.0.0.1、localhost），
  # 有的桌面环境按这一段匹配应用图标，会落到「无图标」的兜底。等窗口出现后统一改为 uurc-web。
  if command -v xdotool >/dev/null 2>&1; then
    (
      for _ in $(seq 1 20); do
        ids=$(xdotool search --class uurc-web 2>/dev/null)
        if [ -n "$ids" ]; then
          for id in $ids; do
            case "$(xprop -id "$id" WM_CLASS 2>/dev/null)" in
              *'"uurc-web", "uurc-web"'*) ;;
              *) xdotool set_window --classname uurc-web --class uurc-web "$id" 2>/dev/null ;;
            esac
          done
          break
        fi
        sleep 1
      done
    ) >/dev/null 2>&1 &
  fi

  echo "已打开独立窗口（最大化）：$URL"
}

case "${1:-start}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; sleep 1; start ;;
  status)  status ;;
  app)     app ;;
  open)    open_url ;;
  *)       echo "用法: $0 {start|stop|restart|status|app|open}" ;;
esac
