import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(projectRoot, "photo");
const outputRoot = path.join(projectRoot, "public", "portfolio-assets", "photography");

const albums = [
  { folder: "顽古", slug: "wangu" },
  { folder: "流光", slug: "liuguang" },
  { folder: "苍茫", slug: "cangmang" },
  { folder: "深海", slug: "shenhai" },
  { folder: "蛰今", slug: "zhejin" },
];

for (const album of albums) {
  const sourceDir = path.join(sourceRoot, album.folder);
  const outputDir = path.join(outputRoot, album.slug);
  const filenames = (await fs.readdir(sourceDir))
    .filter((filename) => /\.(png|jpe?g|webp)$/i.test(filename))
    .sort((left, right) => left.localeCompare(right, "en"));

  if (filenames.length === 0) {
    throw new Error(`No images found in ${sourceDir}`);
  }

  await fs.mkdir(outputDir, { recursive: true });

  for (const [index, filename] of filenames.entries()) {
    const number = String(index + 1).padStart(2, "0");
    await sharp(path.join(sourceDir, filename))
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 88, smartSubsample: true, effort: 5 })
      .toFile(path.join(outputDir, `${number}.webp`));
  }

  await sharp(path.join(sourceDir, filenames[0]))
    .rotate()
    .resize(720, 960, { fit: "cover", position: sharp.strategy.attention })
    .webp({ quality: 90, smartSubsample: true, effort: 5 })
    .toFile(path.join(outputDir, "cover.webp"));
}

console.log(`Imported ${albums.length} photography albums into ${outputRoot}`);
