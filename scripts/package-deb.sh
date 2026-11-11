#!/usr/bin/env bash
# 编译并打包 UU 远程桌面 Linux 安装包（.deb）与免安装解包目录。
# 产物输出到 desktop/dist/release/，其中包含可直接安装的 uurc-web_<version>_amd64.deb。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "找不到 node 或 npm，请先确认运行环境。" >&2
  exit 1
fi

ESBUILD_BIN="$ROOT_DIR/node_modules/.bin/esbuild"
ELECTRON_DIR="$ROOT_DIR/node_modules/electron/dist"
BUILDER_BIN="$ROOT_DIR/node_modules/.bin/electron-builder"

if [ ! -x "$ESBUILD_BIN" ]; then
  echo "缺少 esbuild，请先在仓库根目录执行 npm ci。" >&2
  exit 1
fi

if [ ! -d "$ELECTRON_DIR" ] || [ ! -x "$BUILDER_BIN" ]; then
  echo "正在本地临时安装 Electron 与 electron-builder（不写入 package.json）..."
  ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}" \
    npm install --no-save --no-audit --no-fund electron@33.4.11 electron-builder@26.18.0
fi

ELECTRON_VERSION="$(node -p "require('./node_modules/electron/package.json').version")"
APP_VERSION="$(node -p "require('./package.json').version")"

echo "=== 1/4 全量编译 shared / backend / frontend ==="
npm run build

STAGE_DIR="$ROOT_DIR/desktop/dist/app"
BUILD_RES_DIR="$ROOT_DIR/desktop/dist/build"
RELEASE_DIR="$ROOT_DIR/desktop/dist/release"

rm -rf "$STAGE_DIR" "$BUILD_RES_DIR" "$RELEASE_DIR"
mkdir -p "$STAGE_DIR/desktop" "$STAGE_DIR/frontend" "$BUILD_RES_DIR"

echo "=== 2/4 打包单文件后端运行时 (backend-server.mjs) ==="
"$ESBUILD_BIN" "$ROOT_DIR/backend/dist/index.js" \
  --bundle \
  --platform=node \
  --format=esm \
  --outfile="$STAGE_DIR/backend-server.mjs" \
  --banner:js='import { createRequire } from "node:module";const require = createRequire(import.meta.url);'

echo "=== 3/4 组装桌面壳资源 ==="
cp "$ROOT_DIR/desktop/main.cjs" "$STAGE_DIR/desktop/"
cp "$ROOT_DIR/desktop/preload.cjs" "$STAGE_DIR/desktop/"
cp "$ROOT_DIR/desktop/loginStatePersistence.cjs" "$STAGE_DIR/desktop/"
cp "$ROOT_DIR/desktop/icon.png" "$STAGE_DIR/desktop/"
cp -r "$ROOT_DIR/frontend/dist" "$STAGE_DIR/frontend/dist"
cp "$ROOT_DIR/frontend/public/brand/icon-512.png" "$BUILD_RES_DIR/icon.png"

node -e '
  const fs = require("node:fs");
  const rootPkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const appPkg = {
    name: rootPkg.name || "uurc-web",
    version: rootPkg.version || "0.1.0",
    private: true,
    type: "module",
    main: "desktop/main.cjs",
    desktopName: "uu-remote.desktop",
    description: "UU 远程桌面主控端",
    homepage: "https://github.com/ofoz/uu_web",
    license: "MIT",
    author: {
      name: "ofoz",
      email: "ofoz@users.noreply.github.com",
    },
  };
  fs.writeFileSync(process.argv[2], JSON.stringify(appPkg, null, 2) + "\n", "utf8");
' "$ROOT_DIR/package.json" "$STAGE_DIR/package.json"

echo "=== 4/4 构建 Linux .deb 与桌面应用程序 ($ELECTRON_VERSION) ==="
"$BUILDER_BIN" \
  --linux deb \
  --config "$ROOT_DIR/packaging/electron-builder.yml" \
  --c.electronVersion="$ELECTRON_VERSION" \
  --c.electronDist="$ELECTRON_DIR" \
  --publish never

DEB_PATH="$RELEASE_DIR/uurc-web_${APP_VERSION}_amd64.deb"
if [ ! -f "$DEB_PATH" ]; then
  DEB_PATH="$(find "$RELEASE_DIR" -maxdepth 1 -name '*.deb' | head -n 1 || true)"
fi

echo
echo "构建完成："
echo "  .deb 安装包: ${DEB_PATH:-未找到}"
echo "  免安装目录: $RELEASE_DIR/linux-unpacked"
