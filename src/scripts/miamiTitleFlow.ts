import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uFaceMask;
  uniform sampler2D uVolumeMask;
  uniform float uTime;
  uniform float uCanvasAspect;
  uniform float uMaskAspect;
  uniform vec2 uMaskResolution;
  varying vec2 vUv;

  vec2 containUv(vec2 canvasUv) {
    vec2 uv = canvasUv;

    if (uCanvasAspect > uMaskAspect) {
      float visibleWidth = uMaskAspect / uCanvasAspect;
      uv.x = (canvasUv.x - (1.0 - visibleWidth) * 0.5) / visibleWidth;
    } else {
      float visibleHeight = uCanvasAspect / uMaskAspect;
      uv.y = (canvasUv.y - (1.0 - visibleHeight) * 0.5) / visibleHeight;
    }

    return uv;
  }

  float depthGlow(float layerDistance) {
    const float glowRadius = 6.1;
    float distance01 = clamp(layerDistance / glowRadius, 0.0, 1.0);
    float linearFalloff = 1.0 - distance01;
    float easedFalloff = 1.0 - smoothstep(0.0, 1.0, distance01);
    return mix(linearFalloff, easedFalloff, 0.55);
  }

  void main() {
    vec2 maskUv = containUv(vUv);
    if (maskUv.x < 0.0 || maskUv.x > 1.0 || maskUv.y < 0.0 || maskUv.y > 1.0) discard;

    // The generated masks already share the static title's nearest-neighbour
    // pixel grid. Sampling that grid directly keeps both silhouettes aligned;
    // quantising it a second time produces stray bright blocks at thin edges.
    vec2 pixelUv = maskUv;
    vec4 faceSample = texture2D(uFaceMask, pixelUv);
    vec4 volumeSample = texture2D(uVolumeMask, pixelUv);
    // Match the same binary edge threshold used by the generated title art.
    // This prevents semi-transparent mask pixels from tinting the black rim.
    float face = step(0.282, faceSample.a);
    float volume = step(0.282, volumeSample.a);
    float depthSignal = volumeSample.r;
    // The two generated masks are binary and must be mutually exclusive.
    // Any overlap would mix mint emission into the pink depth or reveal the
    // hue-shifted static layer as purple fragments on long, tightly set titles.
    float side = volume * (1.0 - face);
    if (face < 0.015 && side < 0.015) discard;

    float faceY = floor(clamp(faceSample.r, 0.0, 1.0) * 30.0 + 0.5) / 30.0;

    // The title is one front face plus eighteen equally spaced extrusion
    // layers. Emission travels along that depth axis, never down the 2D face.
    // Layer 0 is the complete cyan face; layers 1..18 are the visible pink
    // contour slices encoded in the volume mask's luminance.
    const float sideLayerCount = 18.0;
    const float sideTravelEnd = sideLayerCount + 6.1;
    const float layersPerSecond = 4.0;
    float cyclePhase = mod(uTime * layersPerSecond, sideTravelEnd) / sideTravelEnd;
    // A new pass begins at the exact frame where the preceding bottom glow is
    // gone. The pink depth is locally ready at that boundary, but the
    // complementary hand-off below keeps it at zero until the mint face starts
    // releasing brightness, so both materials change together without a pop.
    float glowDepth = cyclePhase * sideTravelEnd;

    // The mint face hands its peak to the first extrusion layers, reaches its
    // darkest state, rests briefly, then spends most of the remaining cycle
    // easing back to full emission. Its return reaches exactly 1.0 when the
    // final pink layer's glow falls to zero, so the next transfer begins with
    // no idle frame or brightness jump.
    float departingFaceGlow = depthGlow(glowDepth);
    const float faceReturnStart = 0.31;
    float faceReturnPhase = clamp(
      (cyclePhase - faceReturnStart) / (1.0 - faceReturnStart),
      0.0,
      1.0
    );
    float returningFaceGlow = pow(
      smoothstep(0.0, 1.0, faceReturnPhase),
      1.35
    );
    float faceGlow = max(departingFaceGlow, returningFaceGlow);

    // The face keeps a fixed top-to-bottom colour structure, but its emission
    // energy changes as one indivisible layer.
    float upperBlend = smoothstep(0.26, 0.68, faceY);
    float lowerBlend = smoothstep(0.66, 1.0, faceY);
    vec3 baseTop = vec3(0.18, 0.67, 0.58);
    vec3 baseMid = vec3(0.025, 0.49, 0.43);
    vec3 baseBottom = vec3(0.003, 0.36, 0.33);
    vec3 glowTop = vec3(0.76, 0.98, 0.87);
    vec3 glowMid = vec3(0.34, 0.96, 0.73);
    vec3 glowBottom = vec3(0.12, 0.91, 0.67);
    vec3 baseColor = mix(baseTop, baseMid, upperBlend);
    baseColor = mix(baseColor, baseBottom, lowerBlend);
    vec3 emittedColor = mix(glowTop, glowMid, upperBlend);
    emittedColor = mix(emittedColor, glowBottom, lowerBlend);
    vec3 faceColor = mix(baseColor, emittedColor, faceGlow * 0.96);

    // The mask stores near layers as bright values and far layers as dark
    // values. Convert that luminance into the same n+1 depth coordinate used
    // above. The intersected slice is brightest while neighbouring slices
    // receive a soft falloff, matching the broader flow seen in the reference.
    float sideDepth01 = clamp((0.965 - depthSignal) / 0.82, 0.0, 1.0);
    float sideLayer = floor(sideDepth01 * (sideLayerCount - 1.0) + 0.5) + 1.0;
    // The hand-off is complementary only while the mint face is dimming.
    // Once that departure is complete, its later return does not suppress the
    // pink depth; the travelling band is free to finish its own descent.
    float sideActivation = 1.0 - departingFaceGlow;
    float sideGlow = depthGlow(abs(glowDepth - sideLayer)) * sideActivation;
    float steppedDepth = (sideLayer - 1.0) / (sideLayerCount - 1.0);
    vec3 sideBase = mix(vec3(0.56, 0.004, 0.13), vec3(0.24, 0.002, 0.035), steppedDepth);
    vec3 sideEmission = mix(vec3(1.0, 0.035, 0.52), vec3(0.92, 0.012, 0.25), steppedDepth);
    vec3 sideColor = mix(sideBase, sideEmission, sideGlow * 0.98);

    float alpha = max(face, side);
    // The mint front face owns every overlapping pixel. Blending it with the
    // magenta depth layer creates the dirty fringe seen around the glyphs.
    float faceMix = face;
    vec3 color = mix(sideColor, faceColor, faceMix);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
  }
`;

interface TitleFlowInstance {
  element: HTMLElement;
  renderer: THREE.WebGLRenderer;
  material: THREE.ShaderMaterial;
  observer: MutationObserver;
  faceTexture: THREE.Texture | null;
  volumeTexture: THREE.Texture | null;
  requestToken: number;
  width: number;
  height: number;
  resizeObserver: ResizeObserver;
  render?: (time: number) => void;
}

const instances: TitleFlowInstance[] = [];
const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, Promise<THREE.Texture>>();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function cachedTexture(url: string) {
  const cached = textureCache.get(url);
  if (cached) return cached;
  const pending = textureLoader.loadAsync(url).then((texture) => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return texture;
  });
  textureCache.set(url, pending);
  return pending;
}

function resize(instance: TitleFlowInstance) {
  const rect = instance.element.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width < 1 || height < 1) return false;

  if (width !== instance.width || height !== instance.height) {
    instance.width = width;
    instance.height = height;
    instance.renderer.setSize(width, height, false);
    instance.material.uniforms.uCanvasAspect.value = width / height;
  }

  return true;
}

async function loadMasks(instance: TitleFlowInstance) {
  const faceUrl = instance.element.dataset.miamiFaceMask;
  const volumeUrl = instance.element.dataset.miamiVolumeMask;
  const token = ++instance.requestToken;
  instance.element.classList.remove("has-three-title-flow");
  if (!faceUrl || !volumeUrl) return;

  try {
    const [faceTexture, volumeTexture] = await Promise.all([
      cachedTexture(faceUrl),
      cachedTexture(volumeUrl),
    ]);
    if (token !== instance.requestToken) {
      return;
    }
    instance.faceTexture = faceTexture;
    instance.volumeTexture = volumeTexture;
    instance.material.uniforms.uFaceMask.value = faceTexture;
    instance.material.uniforms.uVolumeMask.value = volumeTexture;
    const image = faceTexture.image as HTMLImageElement;
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    instance.material.uniforms.uMaskAspect.value = imageWidth / imageHeight;
    instance.material.uniforms.uMaskResolution.value.set(imageWidth, imageHeight);
    resize(instance);
    instance.element.classList.add("has-three-title-flow");
  } catch {
    if (token === instance.requestToken) instance.element.classList.remove("has-three-title-flow");
  }
}

function createTitleFlow(element: HTMLElement) {
  if (element.dataset.miamiTitleFlowReady === "true") return;
  const canvas = element.querySelector<HTMLCanvasElement>("[data-miami-title-flow-canvas]");
  if (!canvas) return;
  element.dataset.miamiTitleFlowReady = "true";

  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uFaceMask: { value: null },
        uVolumeMask: { value: null },
        uTime: { value: 0 },
        uCanvasAspect: { value: 1 },
        uMaskAspect: { value: 1 },
        uMaskResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const instance: TitleFlowInstance = {
      element,
      renderer,
      material,
      faceTexture: null,
      volumeTexture: null,
      requestToken: 0,
      width: 0,
      height: 0,
      resizeObserver: new ResizeObserver(() => resize(instance)),
      observer: new MutationObserver(() => void loadMasks(instance)),
    };
    instance.observer.observe(element, {
      attributes: true,
      attributeFilter: ["data-miami-face-mask", "data-miami-volume-mask"],
    });
    instances.push(instance);
    instance.resizeObserver.observe(element);
    resize(instance);
    void loadMasks(instance);

    const render = (time: number) => {
      if (!element.classList.contains("has-three-title-flow") || instance.width < 1 || instance.height < 1) return;
      // A single global multiplier keeps every phase relationship intact.
      material.uniforms.uTime.value = reducedMotion.matches ? 1.75 : time * 0.0015;
      renderer.render(scene, camera);
    };
    instance.render = render;
  } catch {
    delete element.dataset.miamiTitleFlowReady;
    element.classList.remove("has-three-title-flow");
  }
}

function bootTitleFlows() {
  document.querySelectorAll<HTMLElement>(".miami-title-motion[data-miami-face-mask]").forEach(createTitleFlow);
}

bootTitleFlows();
document.addEventListener("astro:page-load", bootTitleFlows);

let animationTime = 0;
let previousFrameTime: number | null = null;

function animate(time: number) {
  if (previousFrameTime === null) previousFrameTime = time;
  // Keep a missed browser frame from turning into a visibly large gradient
  // jump on wide Latin titles. Normal 60/30 fps cadence is untouched; only
  // unusually long frame gaps are capped instead of being replayed at once.
  const frameDelta = Math.min(Math.max(time - previousFrameTime, 0), 34);
  animationTime += frameDelta;
  previousFrameTime = time;
  for (let index = instances.length - 1; index >= 0; index -= 1) {
    const instance = instances[index];
    if (!instance.element.isConnected) {
      instance.resizeObserver.disconnect();
      instance.observer.disconnect();
      instance.material.dispose();
      instance.renderer.dispose();
      instances.splice(index, 1);
      continue;
    }
    instance.render?.(animationTime);
  }
  window.requestAnimationFrame(animate);
}

window.requestAnimationFrame(animate);
