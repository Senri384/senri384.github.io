import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const distDir = process.env.SITES_DIST_DIR
  ? resolve(process.env.SITES_DIST_DIR)
  : fileURLToPath(new URL("../dist/", import.meta.url));
const clientDir = join(distDir, "client");
const serverDir = join(distDir, "server");
const hostingDir = join(distDir, ".openai");
const hostingSource = fileURLToPath(new URL("../.openai/hosting.json", import.meta.url));

// Astro writes the static site directly to client/. Clean only the generated
// Sites wrapper and any stale root-level output left by older build scripts.
await rm(serverDir, { recursive: true, force: true });
await rm(hostingDir, { recursive: true, force: true });
await mkdir(clientDir, { recursive: true });

for (const entry of await readdir(distDir, { withFileTypes: true })) {
  if (entry.name === "client" || entry.name === "server" || entry.name === ".openai") continue;
  await rm(join(distDir, entry.name), { recursive: true, force: true });
}

// Keep earlier vehicle art iterations in the master workspace, but omit them
// from the hosted bundle. The current runtime references only home-v55 WebP assets.
for (const obsoleteVehicleSet of [
  "home-v4c",
  "home-v48",
  "home-v49",
  "home-v50",
  "home-v51",
  "home-v52",
  "home-v53",
  "home-v54",
]) {
  await rm(join(clientDir, "portfolio-assets", "vehicles", obsoleteVehicleSet), {
    recursive: true,
    force: true,
  });
}

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
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path, matches)));
    else if (matches(path)) files.push(path);
  }
  return files;
}

// Article screenshots account for most of the remaining transfer size. WebP
// keeps their native dimensions while making the hosted copies much smaller.
const extractedAssetsDir = join(clientDir, "portfolio-assets", "extracted");
for (const input of await collectFiles(extractedAssetsDir, (path) => /\.(?:png|jpe?g)$/i.test(path))) {
  const output = input.replace(/\.(?:png|jpe?g)$/i, ".webp");
  await execFileAsync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    input,
    "-frames:v",
    "1",
    "-codec:v",
    "libwebp",
    "-q:v",
    "78",
    "-compression_level",
    "3",
    output,
  ]);
  await rm(input);
}

for (const directory of [
  "vehicles",
  "games",
  "reviews",
  "audio-player",
  "ui",
  "films",
  "articles",
  "resume",
  "photography",
]) {
  const assetDirectory = join(clientDir, "portfolio-assets", directory);
  for (const input of await collectFiles(assetDirectory, (path) => /\.(?:png|jpe?g)$/i.test(path))) {
    const output = input.replace(/\.(?:png|jpe?g)$/i, ".webp");
    await execFileAsync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      input,
      "-frames:v",
      "1",
      "-codec:v",
      "libwebp",
      "-q:v",
      "82",
      "-compression_level",
      "3",
      output,
    ]);
    await rm(input);
  }
}

const textAssets = await collectFiles(clientDir, (path) => /\.(?:html|js|css|json)$/i.test(path));
for (const path of textAssets) {
  const original = await readFile(path, "utf8");
  let optimized = original;
  for (const assetRoot of [
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
  ]) {
    const escapedRoot = assetRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const assetUrl = new RegExp(
      `(${escapedRoot}[^\\s"'\\x60()<>?#]+?)\\.(?:png|jpe?g)(?=[$\\s"'\\x60()<>?#])`,
      "gi",
    );
    optimized = optimized.replace(assetUrl, "$1.webp");
  }
  if (optimized !== original) await writeFile(path, optimized, "utf8");
}

await mkdir(serverDir, { recursive: true });
await writeFile(
  join(serverDir, "index.js"),
  `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
`,
  "utf8",
);

await mkdir(hostingDir, { recursive: true });
await copyFile(hostingSource, join(hostingDir, "hosting.json"));
