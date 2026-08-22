import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
const cosOrigin = "https://senri-homepage-media-1471298053.cos.ap-guangzhou.myqcloud.com";

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

  // These high-use assets are mirrored to Tencent COS. Keep source files and
  // development URLs local, then rewrite only the production build so local
  // work remains independent of the network.
  for (const hostedRoot of [
    "/portfolio-assets/audio-player/",
    "/portfolio-assets/disc-covers/",
    "/portfolio-assets/ui/disc-system/",
    "/portfolio-assets/ui/game-card-system-v7/racks/",
    "/portfolio-assets/ui/game-card-system-v12/cases/",
    "/portfolio-assets/ui/game-card-system-v12/cartridges/",
    "/portfolio-assets/ui/game-card-system-v12/insides/",
  ]) {
    optimized = optimized.replaceAll(hostedRoot, `${cosOrigin}${hostedRoot}`);
  }

  // The remaining files directly inside /ui are mirrored as well. Other
  // nested directories deliberately stay on the site origin until mirrored.
  optimized = optimized.replace(
    /\/portfolio-assets\/ui\/([^/"'\s`()<>?#]+)(?=[?"'\s`()<>#]|$)/g,
    `${cosOrigin}/portfolio-assets/ui/$1`,
  );

  // Keep build-specific hashed runtime files on the hosting origin. Their
  // names change on every CSS/JS edit, so rewriting them to COS before the
  // matching objects are mirrored creates broken production references.

  if (optimized !== original) await writeFile(filePath, optimized, "utf8");
}
