import { mkdir, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";


const projectRoot = process.cwd();
const rawRoot = join(projectRoot, "output", "breakdown-v54", "raw");
const sourceVehicleRoot = join(
  projectRoot,
  "public",
  "portfolio-assets",
  "vehicles",
  "home-v53",
);
const outputVehicleRoot = join(
  projectRoot,
  "public",
  "portfolio-assets",
  "vehicles",
  "home-v55",
);

await mkdir(outputVehicleRoot, { recursive: true });


const targetSpecs = {
  center: { width: 916, height: 511, source: "normal-center.png" },
  left: { width: 1119, height: 625, source: "normal-left.png" },
  damagedCenter: { width: 917, height: 591, source: "damaged-center-v2.png" },
  damagedLeft: { width: 1123, height: 702, source: "damaged-left-v2.png" },
};


async function removeMagentaBackground(sourceName) {
  const source = await sharp(join(rawRoot, sourceName))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.from(source.data);
  for (let index = 0; index < output.length; index += 4) {
    const r = output[index];
    const g = output[index + 1];
    const b = output[index + 2];
    const isChromaBackground =
      r > g + 24
      && b > g + 24
      && r + b > 160;
    if (isChromaBackground) {
      output[index] = 0;
      output[index + 1] = 0;
      output[index + 2] = 0;
      output[index + 3] = 0;
    } else {
      // Pixel-art sprites use a hard matte so scaled textures never retain
      // dark semi-transparent chroma remnants around the vehicle.
      output[index + 3] = 255;
    }
  }

  // Generated chroma sources can contain detached dark scanline/shadow bars
  // that are not magenta. Keep only the largest connected opaque component
  // (the car) so those full-width remnants cannot survive the crop.
  const { width, height } = source.info;
  const pixelCount = width * height;
  const labels = new Int32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const componentSizes = [0];
  let component = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (labels[pixel] !== 0 || output[pixel * 4 + 3] === 0) continue;
    component += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = pixel;
    labels[pixel] = component;
    while (head < tail) {
      const current = queue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (labels[next] !== 0 || output[next * 4 + 3] === 0) continue;
          labels[next] = component;
          queue[tail++] = next;
        }
      }
    }
    componentSizes[component] = tail;
  }
  let largestComponent = 0;
  for (let index = 1; index < componentSizes.length; index += 1) {
    if (componentSizes[index] > (componentSizes[largestComponent] ?? 0)) {
      largestComponent = index;
    }
  }
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (labels[pixel] !== largestComponent) {
      output[pixel * 4] = 0;
      output[pixel * 4 + 1] = 0;
      output[pixel * 4 + 2] = 0;
      output[pixel * 4 + 3] = 0;
    }
  }
  return sharp(output, { raw: source.info })
    .png()
    .toBuffer();
}


async function fitTransparentSource(sourceName, width, height, outputName) {
  const keyed = await removeMagentaBackground(sourceName);
  const trimmed = await sharp(keyed)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const fitted = await sharp(trimmed)
    .resize({
      width: Math.max(1, width - 4),
      height: Math.max(1, height - 4),
      fit: "contain",
      withoutEnlargement: false,
      kernel: sharp.kernel.nearest,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const metadata = await sharp(fitted).metadata();
  const left = Math.floor((width - metadata.width) / 2);
  const top = height - metadata.height - 2;
  await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: fitted, left, top }])
    .png()
    .toFile(join(outputVehicleRoot, outputName));

  const final = await sharp(join(outputVehicleRoot, outputName))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let partialAlphaPixels = 0;
  let opaqueBorderPixels = 0;
  for (let y = 0; y < final.info.height; y += 1) {
    for (let x = 0; x < final.info.width; x += 1) {
      const alpha = final.data[(y * final.info.width + x) * 4 + 3];
      if (alpha > 0 && alpha < 255) partialAlphaPixels += 1;
      if (
        alpha > 0
        && (x === 0 || y === 0 || x === final.info.width - 1 || y === final.info.height - 1)
      ) {
        opaqueBorderPixels += 1;
      }
    }
  }
  if (partialAlphaPixels !== 0 || opaqueBorderPixels !== 0) {
    throw new Error(
      `${outputName}: dirty matte (${partialAlphaPixels} partial, ${opaqueBorderPixels} border pixels)`,
    );
  }
}


await fitTransparentSource(
  targetSpecs.center.source,
  targetSpecs.center.width,
  targetSpecs.center.height,
  "breakdown-normal-center.png",
);
await fitTransparentSource(
  targetSpecs.left.source,
  targetSpecs.left.width,
  targetSpecs.left.height,
  "breakdown-normal-left.png",
);
await fitTransparentSource(
  targetSpecs.damagedCenter.source,
  targetSpecs.damagedCenter.width,
  targetSpecs.damagedCenter.height,
  "breakdown-damaged-front-center.png",
);
await fitTransparentSource(
  targetSpecs.damagedLeft.source,
  targetSpecs.damagedLeft.width,
  targetSpecs.damagedLeft.height,
  "breakdown-damaged-front-left.png",
);


async function mirrorAsset(sourceName, outputName) {
  await sharp(join(outputVehicleRoot, sourceName))
    .flop()
    .png()
    .toFile(join(outputVehicleRoot, outputName));
}


await mirrorAsset("breakdown-normal-left.png", "breakdown-normal-right.png");
await mirrorAsset(
  "breakdown-damaged-front-left.png",
  "breakdown-damaged-front-right.png",
);


function isRollingTexturePixel(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const a = data[index + 3];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const average = (r + g + b) / 3;
  // Match the obstacle-car wheel frames: only shade existing neutral-dark
  // tread/lower-chassis pixels.  Very dark outline pixels stay untouched so
  // the wheel and bumper geometry cannot acquire holes between frames.
  return a === 255 && average >= 10 && average < 76 && max - min < 30;
}


function rollingTextureRegions(lane, width, height) {
  if (lane === "center") {
    return [
      [0, Math.floor(height * 0.70), width, height],
    ];
  }
  if (lane === "left") {
    return [
      [Math.floor(width * 0.02), Math.floor(height * 0.63), Math.floor(width * 0.92), height],
    ];
  }
  return [
    [Math.floor(width * 0.08), Math.floor(height * 0.63), Math.floor(width * 0.98), height],
  ];
}


async function makeWheelFrame(baseName, outputName, lane, phase) {
  const source = await sharp(join(outputVehicleRoot, baseName))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = source.info;
  const output = Buffer.from(source.data);
  let changed = 0;

  for (const [x0, y0, x1, y1] of rollingTextureRegions(lane, width, height)) {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const index = (y * width + x) * channels;
        if (!isRollingTexturePixel(source.data, index)) continue;

        // Scroll a restrained diagonal tread highlight through the existing
        // dark texture.  Unlike the old implementation this never relocates
        // a source pixel, so body panels, tire edges and the rear bumper stay
        // bit-for-bit in place while only their internal shading animates.
        const stripe = ((y * 3 - x + phase) % 23 + 23) % 23;
        let delta = 0;
        // At the in-game scale the source is reduced to roughly one sixth of
        // its authored width.  Use the same contrast range as the obstacle
        // frames so the diagonal tread motion survives WebP compression and
        // linear texture filtering instead of reading as a static tire.
        if (stripe <= 3) delta = 28;
        else if (stripe >= 11 && stripe <= 13) delta = -14;
        if (delta === 0) continue;

        output[index] = Math.max(0, Math.min(255, source.data[index] + delta));
        output[index + 1] = Math.max(0, Math.min(255, source.data[index + 1] + delta));
        output[index + 2] = Math.max(0, Math.min(255, source.data[index + 2] + delta));
        if (
          output[index] !== source.data[index]
          || output[index + 1] !== source.data[index + 1]
          || output[index + 2] !== source.data[index + 2]
        ) {
          changed += 1;
        }
      }
    }
  }

  if (changed < 100) {
    throw new Error(`${outputName}: wheel animation changed only ${changed} pixels`);
  }

  // Frame animation is allowed to change RGB values only.  This catches the
  // exact regression that previously produced missing wheel/body fragments.
  for (let index = 3; index < output.length; index += channels) {
    if (output[index] !== source.data[index]) {
      throw new Error(`${outputName}: wheel animation changed alpha at pixel ${index / channels}`);
    }
  }
  await sharp(output, { raw: { width, height, channels } })
    .png()
    .toFile(join(outputVehicleRoot, outputName));
  console.log(`${outputName}: ${changed} tire pixels changed; body pixels retained`);
}


for (const [lane, baseName] of [
  ["center", "breakdown-normal-center.png"],
  ["left", "breakdown-normal-left.png"],
  ["right", "breakdown-normal-right.png"],
]) {
  await makeWheelFrame(
    baseName,
    `breakdown-normal-${lane}-wheel-1.png`,
    lane,
    0,
  );
  await makeWheelFrame(
    baseName,
    `breakdown-normal-${lane}-wheel-2.png`,
    lane,
    8,
  );
}


for (const fileName of await readdir(sourceVehicleRoot)) {
  if (fileName.startsWith("breakdown-") || !fileName.endsWith(".png")) continue;
  await copyFile(join(sourceVehicleRoot, fileName), join(outputVehicleRoot, fileName));
}

// The game requests WebP directly. Keep matching WebP files in public so both
// the fixed static preview and an Astro dev server can load the same v54 set.
for (const fileName of await readdir(outputVehicleRoot)) {
  if (!fileName.endsWith(".png")) continue;
  await sharp(join(outputVehicleRoot, fileName))
    .webp({ quality: 82, effort: 4 })
    .toFile(join(outputVehicleRoot, fileName.replace(/\.png$/i, ".webp")));
}

console.log(outputVehicleRoot);
