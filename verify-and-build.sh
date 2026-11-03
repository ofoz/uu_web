#!/usr/bin/env bash
# 任务栏标题功能：一键验证 + 构建。
#
# 必须在**你自己的桌面终端**里运行。AI 会话进程的地址空间被硬限在 4GB
# （/proc/self/limits → Max address space soft=hard=4294967296），
# Node 无法实例化任何 WASM，vite/vitest 都会报
# WebAssembly.instantiate(): Out of memory。桌面终端没有这个限制。
set -euo pipefail

NODE_BIN="/home/ofoxx/.workbuddy/binaries/node/versions/22.22.2/bin"
if ! command -v npx >/dev/null 2>&1; then
  if [ -d "$NODE_BIN" ]; then
    export PATH="$NODE_BIN:$PATH"
  else
    echo "找不到 npx：$NODE_BIN 不存在，请先确认 node 装在哪。" >&2
    exit 1
  fi
fi

echo "使用 node：$(command -v node)（$(node -v)）"

cd "$(dirname "$0")/frontend"

echo
echo "=== 1/5 信令轮询器（连接活得比页面久 + 会话接手时序） ==="
npx vitest run tests/signalPolling.test.ts

echo
echo "=== 2/5 远控生命周期（返回不断开、页签切换、页签 × 才断开） ==="
npx vitest run tests/app.remoteLifecycle.test.tsx

echo
echo "=== 3/5 任务栏标题 + 相邻用例 ==="
npx vitest run tests/desktopTaskbarTitle.test.tsx tests/desktopNewWindow.test.tsx tests/deviceListPage.test.tsx

echo
echo "=== 4/5 类型检查 ==="
npx tsc --noEmit

echo
echo "=== 5/5 构建产物 ==="
npx vite build
rm -rf dist/prerender
npx vite build --ssr src/entry-server.tsx --outDir dist/prerender
node scripts/prerender.mjs

echo
echo "构建完成，产物在 $(pwd)/dist"
ls -1 dist/*.html 2>/dev/null | head -5
echo
echo "全部完成。回来让 AI 提交。"
