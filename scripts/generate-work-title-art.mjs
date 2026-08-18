import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
const portfolioPath = path.join(projectRoot, "src", "data", "portfolio-content.json");
const photoPortfolioPath = path.join(projectRoot, "src", "data", "photo-albums.json");
const filmPortfolioPath = path.join(projectRoot, "src", "data", "film-works.json");
const outputDir = path.join(projectRoot, "public", "portfolio-assets", "ui", "text", "generated-3d");
const onlyCategoryFlagIndex = process.argv.indexOf("--only-category");
const onlyCategory =
  onlyCategoryFlagIndex >= 0 ? process.argv[onlyCategoryFlagIndex + 1] : null;

const escapeSvgText = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const titleUnits = (value) =>
  Array.from(value).reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.36;
    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(character)) return total + 1;
    if (/[A-Z]/u.test(character)) return total + 0.76;
    if (/[a-z0-9]/u.test(character)) return total + 0.61;
    return total + 0.46;
  }, 0);

const isLatinOnlyTitle = (value) =>
  /[A-Za-z]/u.test(value) && !/[\u3400-\u9fff\uf900-\ufaff]/u.test(value);

const mainTitleFont = "Arial Black, Microsoft YaHei, SimHei, Noto Sans SC, sans-serif";
const latinTitleFont = "Impact, Arial Black, sans-serif";
const mainTitleUnits = (value) => titleUnits(value) * (isLatinOnlyTitle(value) ? 0.68 : 1);
const extrusionLayerCount = 24;
const titleBaseline = 213;
const extrusionXPerLayer = 1.5;
const extrusionYPerLayer = 2.4;
const titleSkewTransform = "translate(0 155) skewX(-4) translate(0 -155)";
const baseTitlePixelScale = 0.43;
const titleSourceHeight = 310;
const workTitleDisplayHeight = 128;
const workTitleDisplayMaxWidth = 1600;
const titleAssetMaxWidth = 1800;

const workTitleRenderProfile = (aspect, latinOnly) => {
  const outputWidth = Math.min(
    titleAssetMaxWidth,
    Math.max(360, Math.round(aspect * titleSourceHeight)),
  );
  const outputHeight = Math.round(outputWidth / aspect);
  const displayWidth = Math.min(
    workTitleDisplayMaxWidth,
    workTitleDisplayHeight * aspect,
  );
  const displayHeight = displayWidth / aspect;
  const referencePixelSize =
    workTitleDisplayHeight / (titleSourceHeight * baseTitlePixelScale);
  const displayMatchedScale = displayHeight / (outputHeight * referencePixelSize);
  const pixelScale = Math.min(
    1,
    Math.max(latinOnly ? 0.56 : baseTitlePixelScale, displayMatchedScale),
  );
  const sourceToDisplayScale = displayHeight / outputHeight;
  const outlineRadius = Math.max(
    4,
    Math.min(5, Math.round((3.8 * pixelScale) / sourceToDisplayScale)),
  );

  return { pixelScale, outlineRadius };
};

const createMainTitleSvg = (value) => {
  const height = 310;
  const latinOnly = isLatinOnlyTitle(value);
  const width = Math.max(520, Math.ceil(mainTitleUnits(value) * 220 + 190));
  const center = width / 2 - 18;
  const text = escapeSvgText(value);
  const fontSize = value.startsWith("说真的") ? 190 : 210;
  const titleGroupAttributes = `font-family="${latinOnly ? latinTitleFont : mainTitleFont}" font-size="${fontSize}" font-style="italic" font-weight="900" letter-spacing="${latinOnly ? 4 : 0}"`;
  const sideOffsets = Array.from({ length: extrusionLayerCount }, (_, index) => {
    const depth = extrusionLayerCount - index;
    const x = Math.round(depth * extrusionXPerLayer);
    const y = Math.round(depth * extrusionYPerLayer);
    const layerProgress = index / (extrusionLayerCount - 1);
    // Match the WebGL shader's dark pink base hue exactly. Keeping hue fixed
    // while depth changes only luminance prevents purple seams wherever the
    // static layer is visible beneath the animated mask.
    const farSide = [61, 1, 9];
    const nearSide = [143, 1, 33];
    const sideColor = farSide.map((channel, channelIndex) =>
      Math.round(channel + (nearSide[channelIndex] - channel) * layerProgress),
    );
    return { x, y, sideColor };
  });
  const sideLayers = sideOffsets
    .map(({ x, y, sideColor }) =>
      `<text x="${center - x}" y="${titleBaseline + y}" fill="rgb(${sideColor.join(" ")})">${text}</text>`,
    )
    .join("");
  const sideShapeLayers = sideOffsets
    .map(
      ({ x, y }) =>
        `<text x="${center - x}" y="${titleBaseline + y}" fill="#ffffff">${text}</text>`,
    )
    .join("");
  const sideMaskLayers = sideOffsets
    .map(({ x, y }, index) => {
      // Encode extrusion depth in luminance: dark pixels are the far/back
      // planes, bright pixels sit close to the mint face. The WebGL shader
      // reads this channel as geometry information, not as final colour.
      const layerProgress = index / (extrusionLayerCount - 1);
      const depthValue = Math.round(42 + layerProgress * 204);
      const depthHex = depthValue.toString(16).padStart(2, "0");
      return `<text x="${center - x}" y="${titleBaseline + y}" fill="#${depthHex}${depthHex}${depthHex}">${text}</text>`;
    })
    .join("");

  return {
    aspect: width / height,
    sideSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g ${titleGroupAttributes} text-anchor="middle" transform="${titleSkewTransform}">${sideLayers}</g></svg>`,
    faceSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2eab94"/><stop offset=".26" stop-color="#2eab94"/><stop offset=".68" stop-color="#067d6e"/><stop offset="1" stop-color="#015c54"/></linearGradient></defs><g ${titleGroupAttributes} text-anchor="middle" transform="${titleSkewTransform}"><text x="${center}" y="${titleBaseline}" fill="url(#face)">${text}</text></g></svg>`,
    sideShapeSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g ${titleGroupAttributes} text-anchor="middle" transform="${titleSkewTransform}">${sideShapeLayers}</g></svg>`,
    faceShapeSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g ${titleGroupAttributes} text-anchor="middle" transform="${titleSkewTransform}"><text x="${center}" y="${titleBaseline}" fill="#ffffff">${text}</text></g></svg>`,
    fullShapeSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g ${titleGroupAttributes} text-anchor="middle" transform="${titleSkewTransform}">${sideShapeLayers}<text x="${center}" y="${titleBaseline}" fill="#ffffff">${text}</text></g></svg>`,
    faceMaskSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="height" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#080808"/><stop offset="1" stop-color="#f8f8f8"/></linearGradient></defs><g ${titleGroupAttributes} text-anchor="middle" transform="${titleSkewTransform}"><text x="${center}" y="${titleBaseline}" fill="url(#height)">${text}</text></g></svg>`,
    volumeMaskSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g ${titleGroupAttributes} text-anchor="middle" transform="${titleSkewTransform}">${sideMaskLayers}</g></svg>`,
  };
};

const createYellowHintSvg = (value) => {
  const height = 126;
  const width = Math.max(420, Math.ceil(titleUnits(value) * 66 + 100));
  const text = escapeSvgText(value);
  return {
    aspect: width / height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="yellow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffde1"/><stop offset=".18" stop-color="#fff574"/><stop offset=".58" stop-color="#ffd51f"/><stop offset="1" stop-color="#e99b00"/></linearGradient></defs><g font-family="Arial Black, Microsoft YaHei, SimHei, sans-serif" font-size="61" font-style="italic" font-weight="900" text-anchor="middle" paint-order="stroke" stroke-linejoin="round"><text x="${width / 2 + 5}" y="94" fill="#8b2600">${text}</text><text x="${width / 2 + 3}" y="91" fill="#a93600">${text}</text><text x="${width / 2 + 1}" y="89" fill="#c84600">${text}</text><text x="${width / 2 - 1}" y="86" fill="#e06000">${text}</text><text x="${width / 2 - 5}" y="81" fill="url(#yellow)" stroke="#5a1900" stroke-width="4">${text}</text></g></svg>`,
  };
};

const renderPixelWebp = async (
  svg,
  aspect,
  targetPath,
  maxWidth,
  pixelScale = 0.43,
  hardAlpha = false,
  alphaThreshold = 72,
) => {
  const outputWidth = Math.min(maxWidth, Math.max(360, Math.round(aspect * 310)));
  const outputHeight = Math.round(outputWidth / aspect);
  const pixelWidth = Math.max(180, Math.round(outputWidth * pixelScale));
  let pixelRaster = await sharp(Buffer.from(svg))
    .resize({ width: pixelWidth, kernel: sharp.kernel.cubic })
    .png()
    .toBuffer();

  if (hardAlpha) {
    const { data, info } = await sharp(pixelRaster)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let index = 0; index < info.width * info.height; index += 1) {
      const offset = index * info.channels;
      const visible = data[offset + 3] >= alphaThreshold;
      data[offset + 3] = visible ? 255 : 0;
      if (!visible) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
      }
    }
    pixelRaster = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    })
      .png()
      .toBuffer();
  }

  await sharp(pixelRaster)
    .resize({ width: outputWidth, height: outputHeight, kernel: sharp.kernel.nearest })
    .webp({ lossless: true, alphaQuality: 100, effort: 5 })
    .toFile(targetPath);
};

const renderMainTitleWebp = async (
  title,
  targetPath,
  maxWidth,
  pixelScale = 0.43,
  alphaThreshold = 72,
  outlineRadius = 4,
  faceMaskTargetPath = null,
  volumeMaskTargetPath = null,
) => {
  const outputWidth = Math.min(maxWidth, Math.max(360, Math.round(title.aspect * 310)));
  const outputHeight = Math.round(outputWidth / title.aspect);
  const pixelWidth = Math.max(180, Math.round(outputWidth * pixelScale));
  const pixelHeight = Math.max(1, Math.round(outputHeight * pixelScale));
  const renderLayer = (svg) =>
    sharp(Buffer.from(svg))
      .resize({ width: pixelWidth, height: pixelHeight, kernel: sharp.kernel.cubic })
      .png()
      .toBuffer();

  const [
    sideRaster,
    faceRaster,
    sideShapeRaster,
    faceShapeRaster,
    fullShapeRaster,
    faceMaskRaster,
    volumeMaskRaster,
  ] = await Promise.all([
    renderLayer(title.sideSvg),
    renderLayer(title.faceSvg),
    renderLayer(title.sideShapeSvg),
    renderLayer(title.faceShapeSvg),
    renderLayer(title.fullShapeSvg),
    renderLayer(title.faceMaskSvg),
    renderLayer(title.volumeMaskSvg),
  ]);

  const binaryAlpha = (raster) =>
    sharp(raster)
      .ensureAlpha()
      .extractChannel("alpha")
      .threshold(alphaThreshold)
      .png()
      .toBuffer();
  const [sideAlpha, faceAlpha, fullAlpha] = await Promise.all([
    binaryAlpha(sideShapeRaster),
    binaryAlpha(faceShapeRaster),
    binaryAlpha(fullShapeRaster),
  ]);
  const dilateAlpha = async (alpha, radius) => {
    const { data, info } = await sharp(alpha).raw().toBuffer({ resolveWithObject: true });
    const expanded = Buffer.alloc(pixelWidth * pixelHeight);
    for (let y = 0; y < pixelHeight; y += 1) {
      for (let x = 0; x < pixelWidth; x += 1) {
        if (data[(y * pixelWidth + x) * info.channels] === 0) continue;
        const roundedRadius = radius + 0.35;
        const radiusSquared = roundedRadius * roundedRadius;
        for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
          const targetY = y + offsetY;
          if (targetY < 0 || targetY >= pixelHeight) continue;
          for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
            const targetX = x + offsetX;
            if (targetX < 0 || targetX >= pixelWidth) continue;
            if (offsetX * offsetX + offsetY * offsetY > radiusSquared) continue;
            expanded[targetY * pixelWidth + targetX] = 255;
          }
        }
      }
    }
    return sharp(expanded, {
      raw: { width: pixelWidth, height: pixelHeight, channels: 1 },
    })
      .png()
      .toBuffer();
  };
  const [outerAlpha, faceOutlineAlpha] = await Promise.all([
    dilateAlpha(fullAlpha, outlineRadius),
    dilateAlpha(faceAlpha, outlineRadius),
  ]);

  const rawPixels = (image) => sharp(image).raw().toBuffer({ resolveWithObject: true });
  const subtractAlpha = async (baseAlpha, cutoutAlpha) => {
    const [{ data: base, info: baseInfo }, { data: cutout, info: cutoutInfo }] =
      await Promise.all([rawPixels(baseAlpha), rawPixels(cutoutAlpha)]);
    const visible = Buffer.alloc(pixelWidth * pixelHeight);
    for (let index = 0; index < pixelWidth * pixelHeight; index += 1) {
      const baseVisible = base[index * baseInfo.channels] > 0;
      const cutoutVisible = cutout[index * cutoutInfo.channels] > 0;
      visible[index] = baseVisible && !cutoutVisible ? 255 : 0;
    }
    return sharp(visible, {
      raw: { width: pixelWidth, height: pixelHeight, channels: 1 },
    })
      .png()
      .toBuffer();
  };
  // The animated masks must describe only pixels that remain visible in the
  // final composited title. The old independently rendered volume mask also
  // covered the black separator around the mint face, so the shader painted
  // magenta seams and isolated colour chips over that outline.
  const visibleSideAlpha = await subtractAlpha(sideAlpha, faceOutlineAlpha);
  const cleanLayer = async (raster, alpha) => {
    const [{ data: colour, info }, { data: mask, info: maskInfo }] = await Promise.all([
      rawPixels(raster),
      rawPixels(alpha),
    ]);
    const rgba = Buffer.alloc(pixelWidth * pixelHeight * 4);
    for (let index = 0; index < pixelWidth * pixelHeight; index += 1) {
      const colourOffset = index * info.channels;
      const outputOffset = index * 4;
      rgba[outputOffset] = colour[colourOffset];
      rgba[outputOffset + 1] = colour[colourOffset + 1];
      rgba[outputOffset + 2] = colour[colourOffset + 2];
      rgba[outputOffset + 3] = mask[index * maskInfo.channels];
    }
    return sharp(rgba, {
      raw: { width: pixelWidth, height: pixelHeight, channels: 4 },
    })
      .png()
      .toBuffer();
  };
  const solidLayer = async (alpha) => {
    const { data: mask, info: maskInfo } = await rawPixels(alpha);
    const rgba = Buffer.alloc(pixelWidth * pixelHeight * 4);
    for (let index = 0; index < pixelWidth * pixelHeight; index += 1) {
      const outputOffset = index * 4;
      rgba[outputOffset] = 5;
      rgba[outputOffset + 1] = 0;
      rgba[outputOffset + 2] = 3;
      rgba[outputOffset + 3] = mask[index * maskInfo.channels];
    }
    return sharp(rgba, {
      raw: { width: pixelWidth, height: pixelHeight, channels: 4 },
    })
      .png()
      .toBuffer();
  };

  const [
    outerOutline,
    cleanSide,
    faceOutline,
    cleanFace,
    cleanFaceMask,
    cleanVolumeMask,
  ] = await Promise.all([
    solidLayer(outerAlpha),
    cleanLayer(sideRaster, sideAlpha),
    solidLayer(faceOutlineAlpha),
    cleanLayer(faceRaster, faceAlpha),
    cleanLayer(faceMaskRaster, faceAlpha),
    cleanLayer(volumeMaskRaster, visibleSideAlpha),
  ]);
  const pixelRaster = await sharp(outerOutline)
    .composite([
      { input: cleanSide, blend: "over" },
      { input: faceOutline, blend: "over" },
      { input: cleanFace, blend: "over" },
    ])
    .png()
    .toBuffer();

  const writeRaster = (raster, outputPath) =>
    sharp(raster)
      .resize({ width: outputWidth, height: outputHeight, kernel: sharp.kernel.nearest })
      .webp({ lossless: true, alphaQuality: 100, effort: 5 })
      .toFile(outputPath);

  const outputs = [writeRaster(pixelRaster, targetPath)];
  if (faceMaskTargetPath) outputs.push(writeRaster(cleanFaceMask, faceMaskTargetPath));
  if (volumeMaskTargetPath) outputs.push(writeRaster(cleanVolumeMask, volumeMaskTargetPath));
  await Promise.all(outputs);
};

const portfolio = JSON.parse(await fs.readFile(portfolioPath, "utf8"));
const photoPortfolio = JSON.parse(await fs.readFile(photoPortfolioPath, "utf8"));
const filmPortfolio = JSON.parse(await fs.readFile(filmPortfolioPath, "utf8"));
const allWorks = [...portfolio.works, ...filmPortfolio.works, ...photoPortfolio.works];
const allCategories = [
  ...portfolio.categories,
  ...filmPortfolio.categories,
  ...photoPortfolio.categories,
];
const works = onlyCategory
  ? allWorks.filter((work) => work.category === onlyCategory)
  : allWorks;
const categories = onlyCategory
  ? allCategories.filter((category) => category.slug === onlyCategory)
  : allCategories;
await fs.mkdir(outputDir, { recursive: true });

for (const work of works) {
  const subtitle = work.tags.slice(0, 4).join(" / ");
  const main = createMainTitleSvg(work.title);
  const hint = createYellowHintSvg(subtitle);
  const stem = `${work.category}-${work.slug}`;
  const latinOnly = isLatinOnlyTitle(work.title);
  const { pixelScale: mainPixelScale, outlineRadius: mainOutlineRadius } =
    workTitleRenderProfile(main.aspect, latinOnly);
  const mainAlphaThreshold = latinOnly ? 118 : 72;
  await renderMainTitleWebp(
    main,
    path.join(outputDir, `work-main-${stem}.webp`),
    1800,
    mainPixelScale,
    mainAlphaThreshold,
    mainOutlineRadius,
    path.join(outputDir, `work-face-${stem}.webp`),
    path.join(outputDir, `work-volume-${stem}.webp`),
  );
  await renderPixelWebp(hint.svg, hint.aspect, path.join(outputDir, `work-hint-${stem}.webp`), 1200);
}

for (const category of categories) {
  const main = createMainTitleSvg(category.title);
  await renderMainTitleWebp(
    main,
    path.join(outputDir, `category-main-unified-${category.slug}.webp`),
    1800,
    baseTitlePixelScale,
    72,
    4,
    path.join(outputDir, `category-face-unified-${category.slug}.webp`),
    path.join(outputDir, `category-volume-unified-${category.slug}.webp`),
  );
}

if (!onlyCategory) {
  const scrollHint = createYellowHintSvg("使用滚轮滚动作品集");
  await renderPixelWebp(
    scrollHint.svg,
    scrollHint.aspect,
    path.join(outputDir, "category-hint-scroll-unified.webp"),
    1200,
  );
}

console.log(
  `Generated ${works.length * 4 + categories.length * 3 + (onlyCategory ? 0 : 1)} unified title assets in ${outputDir}`,
);
