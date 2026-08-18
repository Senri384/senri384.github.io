import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist/", import.meta.url));

async function collectFiles(directory, matches) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(filePath, matches));
    else if (matches(filePath)) files.push(filePath);
  }
  return files;
}

const assetRoots = [
  "/portfolio-assets/extracted/",
  "/portfolio-assets/vehicles/",
  "/portfolio-assets/games/",
  "/portfolio-assets/reviews/",
  "/portfolio-assets/audio-player/",
  "/portfolio-assets/ui/",
  "/portfolio-assets/films/",
  "/portfolio-assets/articles/",
  "/portfolio-assets/resume/",
  "/portfolio-assets/photography/",
];

const textAssets = await collectFiles(distDir, (filePath) => /\.(?:html|js|css|json)$/i.test(filePath));
for (const filePath of textAssets) {
  const original = await readFile(filePath, "utf8");
  let optimized = original;
  for (const assetRoot of assetRoots) {
    const escapedRoot = assetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const assetUrl = new RegExp(
      `(${escapedRoot}[^\\s"'\\x60()<>?#]+?)\\.(?:png|jpe?g)(?=[$\\s"'\\x60()<>?#])`,
      "gi",
    );
    optimized = optimized.replace(assetUrl, "$1.webp");
  }
  if (optimized !== original) await writeFile(filePath, optimized, "utf8");
}
