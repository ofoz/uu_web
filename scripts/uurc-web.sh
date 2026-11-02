#!/usr/bin/env bash
# UU 远程网页主控端（uurc-web）本地服务管理
# 默认只监听 127.0.0.1，账号凭证不离开本机。
set -uo pipefail

SELF_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")" && pwd)"
APP_DIR="${UURC_DIR:-$(dirname "$SELF_DIR")}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/uurc-web"
PID_FILE="$STATE_DIR/uurc-web.pid"
LOG_FILE="$STATE_DIR/uurc-web.log"
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

case "${1:-start}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; sleep 1; start ;;
  status)  status ;;
  open)    open_url ;;
  *)       echo "用法: $0 {start|stop|restart|status|open}" ;;
esac
