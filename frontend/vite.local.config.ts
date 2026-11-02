import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sharedSourceAliases } from "./sharedSourceAliases";

// 本地构建用：publicDir 关闭自动复制，避免沙箱拦截 node 的 copyFile。
// 静态文件由 build-local.sh 用 cp 手动拷贝到 dist。
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  resolve: {
    alias: sharedSourceAliases,
  },
});
