import * as THREE from "three";

interface SkylineLayerConfig {
  z: number;
  height: number;
  phase: number;
  color: number;
  renderOrder: number;
}

interface SkylineLayer {
  meshes: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  span: number;
  phase: number;
}

const skylineSource = "/portfolio-assets/ui/city-skyline-near.webp";
const skylineAspect = 1148 / 196;
const horizonY = -6.15;
const cameraZ = 32;
const cameraTargetZ = -150;
const tileRadius = 7;
const horizonScreenShift = 0.59;

const layerConfigs: SkylineLayerConfig[] = [
  { z: -104, height: 11.2, phase: 0.62, color: 0xffffff, renderOrder: 1 },
  { z: -68, height: 8.7, phase: 0.31, color: 0xd8d8d8, renderOrder: 2 },
  { z: -34, height: 6.45, phase: 0, color: 0xb8b8b8, renderOrder: 3 },
];

const loader = new THREE.TextureLoader();

function loadSkylineTexture() {
  const texture = loader.load(skylineSource, (loadedTexture) => {
    const source = loadedTexture.image as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth || source.width;
    canvas.height = source.naturalHeight || source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      loadedTexture.needsUpdate = true;
      return;
    }

    try {
      context.drawImage(source, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const shadow = [102, 12, 35];
      const highlight = [244, 62, 76];

      for (let offset = 0; offset < image.data.length; offset += 4) {
        if (image.data[offset + 3] === 0) continue;
        const signal = Math.min(
          1,
          Math.max(image.data[offset], image.data[offset + 1], image.data[offset + 2]) / 220,
        );
        const mix = Math.pow(signal, 0.72);
        image.data[offset] = shadow[0] + (highlight[0] - shadow[0]) * mix;
        image.data[offset + 1] = shadow[1] + (highlight[1] - shadow[1]) * mix;
        image.data[offset + 2] = shadow[2] + (highlight[2] - shadow[2]) * mix;
      }

      context.putImageData(image, 0, 0);
      (loadedTexture.source as THREE.Source<HTMLImageElement | HTMLCanvasElement>).data = canvas;
    } catch {
      // Keep the original loaded skyline visible when canvas pixel access fails.
    }
    loadedTexture.needsUpdate = true;
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function buildSkylineLayer(
  config: SkylineLayerConfig,
  texture: THREE.Texture,
) {
  const span = config.height * skylineAspect;
  const geometry = new THREE.PlaneGeometry(span, config.height);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: config.color,
    transparent: true,
    opacity: 1,
    alphaTest: 0.025,
    depthTest: true,
    depthWrite: true,
  });
  const meshes: SkylineLayer["meshes"] = [];

  for (let index = -tileRadius; index <= tileRadius; index += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      (index + config.phase) * span,
      horizonY + config.height / 2,
      config.z,
    );
    mesh.renderOrder = config.renderOrder;
    meshes.push(mesh);
  }

  return { meshes, span, phase: config.phase } satisfies SkylineLayer;
}

function buildPixelSunTexture() {
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();

  const image = context.createImageData(size, size);
  const center = (size - 1) / 2;
  const radius = size * 0.46875;
  const top = [255, 156, 128];
  const middle = [255, 91, 132];
  const bottom = [255, 29, 105];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      if (dx * dx + dy * dy > radius * radius) continue;

      const progress = y / (size - 1);
      const firstHalf = progress <= 0.55;
      const localProgress = firstHalf ? progress / 0.55 : (progress - 0.55) / 0.45;
      const from = firstHalf ? top : middle;
      const to = firstHalf ? middle : bottom;
      const clusterHash =
        (Math.floor(x / 8) * 17 + Math.floor(y / 8) * 29 + Math.floor(x / 20) * 7) % 13;
      const grain = clusterHash === 0 ? -7 : clusterHash === 6 ? 5 : 0;
      const offset = (y * size + x) * 4;

      image.data[offset] = Math.max(0, Math.min(255, from[0] + (to[0] - from[0]) * localProgress + grain));
      image.data[offset + 1] = Math.max(0, Math.min(255, from[1] + (to[1] - from[1]) * localProgress + grain));
      image.data[offset + 2] = Math.max(0, Math.min(255, from[2] + (to[2] - from[2]) * localProgress + grain));
      image.data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function buildSun() {
  const texture = buildPixelSunTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const height = 10.8;
  const width = height;
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  sun.position.set(0, horizonY + height / 2 + 4.4, -126);
  sun.renderOrder = 0;
  return sun;
}

function applyVerticalLensShift(camera: THREE.PerspectiveCamera) {
  camera.updateProjectionMatrix();
  // Keep the camera level while placing the horizon low in the viewport.
  camera.projectionMatrix.elements[9] = horizonScreenShift;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

function initCitySelect(canvas: HTMLCanvasElement) {
  if (canvas.dataset.citySelectReady === "true") return;
  canvas.dataset.citySelectReady = "true";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 260);
  const skylineTexture = loadSkylineTexture();
  const layers = layerConfigs.map((config) => buildSkylineLayer(config, skylineTexture));
  const sun = buildSun();
  let pan = 0;
  let lastTime = performance.now();
  let frame = 0;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;

  scene.add(sun);
  layers.forEach((layer) => scene.add(...layer.meshes));

  const placeTiles = () => {
    layers.forEach((layer) => {
      const centerTile = Math.round(pan / layer.span - layer.phase);
      layer.meshes.forEach((mesh, index) => {
        const tileOffset = index - tileRadius;
        mesh.position.x = (centerTile + tileOffset + layer.phase) * layer.span;
      });
    });
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, reducedMotion ? 1.1 : 1.5);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.set(pan, horizonY, cameraZ);
    camera.lookAt(pan, horizonY, cameraTargetZ);
    applyVerticalLensShift(camera);
    placeTiles();
  };

  window.addEventListener("resize", resize);
  resize();

  const render = (time: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (time - lastTime) / 1000));
    lastTime = time;
    frame = requestAnimationFrame(render);

    pan += dt * (reducedMotion ? 0.18 : 0.68);
    camera.position.x = pan;
    camera.position.y = horizonY;
    camera.lookAt(pan, horizonY, cameraTargetZ);
    sun.position.x = pan;
    placeTiles();

    renderer.render(scene, camera);
  };

  frame = requestAnimationFrame(render);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else {
      lastTime = performance.now();
      frame = requestAnimationFrame(render);
    }
  });
}

function bootCitySelect() {
  const canvases = Array.from(
    document.querySelectorAll<HTMLCanvasElement>("[data-city-select-canvas]"),
  );
  canvases.forEach(initCitySelect);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootCitySelect, { once: true });
} else {
  bootCitySelect();
}

export {};
