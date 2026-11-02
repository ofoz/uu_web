import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

const frontendDirectory = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDirectory = path.join(frontendDirectory, "dist");
const prerenderDirectory = path.join(distDirectory, "prerender");
const serverEntry = path.join(prerenderDirectory, "entry-server.js");
const indexPath = path.join(distDirectory, "index.html");
const appShellPath = path.join(distDirectory, "app.html");
const sitemapPath = path.join(distDirectory, "sitemap.xml");
const rootMarker = '<div id="root"></div>';

try {
  const { renderLandingPage } = await import(pathToFileURL(serverEntry).href);
  const template = await readFile(indexPath, "utf8");
  assertSingleMarker(template, rootMarker, indexPath);

  const landingMarkup = renderLandingPage();
  const landingDocument = template.replace(
    rootMarker,
    `<div id="root" data-prerendered="landing">${landingMarkup}</div>`,
  );
  const appShellDocument = template.replace(
    /<meta name="robots" content="[^"]+"\s*\/>/,
    '<meta name="robots" content="noindex, nofollow, noarchive" />',
  );

  await Promise.all([
    writeFile(indexPath, landingDocument),
    writeFile(appShellPath, appShellDocument),
    updateSitemapLastModified(sitemapPath),
  ]);
} finally {
  await rm(prerenderDirectory, { force: true, recursive: true });
}

function assertSingleMarker(document, marker, filePath) {
  const firstIndex = document.indexOf(marker);
  if (firstIndex === -1 || firstIndex !== document.lastIndexOf(marker)) {
    throw new Error(`Expected exactly one ${marker} marker in ${filePath}`);
  }
}

async function updateSitemapLastModified(filePath) {
  const sitemap = await readFile(filePath, "utf8");
  if (!/<lastmod>[^<]+<\/lastmod>/.test(sitemap)) {
    throw new Error(`Missing <lastmod> in ${filePath}`);
  }
  const buildDate = new Date().toISOString().slice(0, 10);
  await writeFile(filePath, sitemap.replace(/<lastmod>[^<]+<\/lastmod>/g, `<lastmod>${buildDate}</lastmod>`));
}
