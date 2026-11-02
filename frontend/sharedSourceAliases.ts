import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface SharedPackageManifest {
  exports: Record<string, { default: string }>;
}

const manifestUrl = new URL("../shared/package.json", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as SharedPackageManifest;

function toSourcePath(exportTarget: string): string {
  if (!exportTarget.startsWith("./dist/") || !exportTarget.endsWith(".js")) {
    throw new Error(`Unsupported @uurc/shared export target: ${exportTarget}`);
  }

  const sourcePath = exportTarget.slice("./dist/".length, -".js".length);
  return fileURLToPath(new URL(`../shared/src/${sourcePath}.ts`, import.meta.url));
}

export const sharedSourceAliases = Object.fromEntries(
  Object.entries(manifest.exports).map(([exportName, target]) => [
    `@uurc/shared/${exportName.slice("./".length)}`,
    toSourcePath(target.default),
  ]),
);
