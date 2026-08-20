import * as THREE from "three";

type GameMode = "idle" | "running" | "paused" | "recovering";
type DriveMode = "race" | "airing";
type ObstacleType = "traffic" | "barrier" | "broken";
type LaneIndex = 0 | 1 | 2;
type PreviewVariant = "A" | "B" | "C" | "D";
type AttackSoundVariant = "A" | "B" | "C";
type AttackSoundMode = AttackSoundVariant | "RANDOM";
type AttackDirection = "front" | "left" | "right";
type UiPreviewVariant = "A" | "B" | "C";
type VehicleWheelFrame = 0 | 1 | 2;
type VehicleAssetVariant =
  | "normal"
  | "damaged-front"
  | "damaged-rear"
  | "damaged-diagonal";

interface DifficultyStage {
  time: number;
  speed: number;
  spawnInterval: number;
  groupMax: number;
  groupChance: number;
  laneCooldownDepth: number;
}

interface GameState {
  mode: GameMode;
  driveMode: DriveMode | null;
  distance: number;
  score: number;
  scoreBonus: number;
  best: number;
  speed: number;
  runTime: number;
  lastTime: number;
  spawnTimer: number;
  crashTimer: number;
  attackTimer: number;
  attackCooldown: number;
  attackLaneOffset: number;
  comboCount: number;
  comboTimer: number;
  comboPool: number;
  comboFlashTimer: number;
  reducedMotion: boolean;
}

interface PlayerState {
  laneIndex: LaneIndex;
  visualLane: number;
  velocity: number;
  drift: number;
}

interface Obstacle {
  id: number;
  type: ObstacleType;
  laneIndex: LaneIndex;
  trackY: number;
  passed: boolean;
  wreckedByAttack?: boolean;
  wreckTimer?: number;
  wreckDirection?: AttackDirection;
  attackScore?: number;
}

interface ScorePopup {
  id: number;
  obstacleId: number;
  value: number;
  laneIndex: LaneIndex;
  trackY: number;
  anchorX: number;
  anchorY: number;
  timer: number;
  duration: number;
  offsetIndex: number;
}

interface AudioSettings {
  muted: boolean;
  volume: number;
  volumeAdjusted: boolean;
  unlocked: boolean;
}

const canvasElement = document.querySelector<HTMLCanvasElement>("#neon-drive-canvas");

if (!canvasElement) {
  throw new Error("Missing neon drive canvas");
}

const canvas = canvasElement;
const renderingContext = canvas.getContext("2d", { alpha: true });

if (!renderingContext) {
  throw new Error("Unable to create canvas context");
}

const ctx = renderingContext;
let paintCtx: CanvasRenderingContext2D = ctx;
const threeCanvas = document.createElement("canvas");
threeCanvas.className = "three-drive-canvas";
threeCanvas.setAttribute("aria-hidden", "true");
canvas.parentElement?.insertBefore(threeCanvas, canvas);

const readout = {
  distance: document.querySelector<HTMLElement>("#distance-readout"),
  score: document.querySelector<HTMLElement>("#score-readout"),
  speed: document.querySelector<HTMLElement>("#speed-readout"),
  best: document.querySelector<HTMLElement>("#best-readout"),
  status: document.querySelector<HTMLElement>("#status-line"),
  combo: document.querySelector<HTMLElement>("#combo-hud"),
  comboValue: document.querySelector<HTMLElement>("#combo-readout"),
  metricLabels: Array.from(document.querySelectorAll<HTMLElement>(".hud-metrics .metric span")),
  modeSelect: document.querySelector<HTMLElement>("#mode-select"),
  modeButtons: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-drive-mode]")),
};

const searchParams = new URLSearchParams(window.location.search);

if (searchParams.has("debugNoHud")) {
  document.documentElement.dataset.debugHud = "hidden";
}

function readPreviewVariant(key: string): PreviewVariant | null {
  const value = searchParams.get(key)?.toUpperCase();
  return value === "A" || value === "B" || value === "C" || value === "D" ? value : null;
}

function readAttackSoundVariant(): AttackSoundMode {
  const value = searchParams.get("attackSound")?.toUpperCase();
  return value === "A" || value === "B" || value === "C" ? value : "RANDOM";
}

function readUiPreviewVariant(): UiPreviewVariant | null {
  const value = searchParams.get("uiPreview")?.toUpperCase();
  return value === "A" || value === "B" || value === "C" ? value : null;
}

const previewMode = {
  palm: readPreviewVariant("previewPalm"),
  grid: readPreviewVariant("previewGrid"),
};
const attackSoundMode = readAttackSoundVariant();
const uiPreviewMode = readUiPreviewVariant();
if (uiPreviewMode) {
  document.documentElement.dataset.uiPreview = uiPreviewMode.toLowerCase();
}
document.documentElement.dataset.vehicleAssets = "v55";
const bgmUrl = "/audio/music/game/Perturbator - Miami Disco.mp3";
const openingAudioUrl = import.meta.env.PROD
  ? [
      "https://senri-homepage-media-1471298053.cos.ap-guangzhou.myqcloud.com/site-assets",
      "_astro",
      "the%20touch.mp3",
    ].join("/")
  : "/audio/music/the touch.mp3";
const openingAudioMinimumVolume = 0.2;
const openingAudioVolumeBoost = 1.55;
const openingAudioDurationMs = 3120;
const attackHitVariants = [
  {
    mode: "A",
    url: "/audio/effects/attack-ref-A-clean-impact-loud.mp3",
  },
  {
    mode: "B",
    url: "/audio/effects/attack-ref-A2-heavy-body-loud.mp3",
  },
  {
    mode: "C",
    url: "/audio/effects/attack-ref-A3-tight-shards-loud.mp3",
  },
] satisfies Array<{ mode: AttackSoundVariant; url: string }>;
const attackHitVolumeBoost = 2.15;
const attackHitPresenceGain = 4.5;
const attackHitNoiseGain = 0.13;
const attackHitPingGain = 0.045;
const attackHitCompressorThreshold = -8;
const playerCrashUrl = "/audio/effects/player-crash-from-crack-1p1s-natural.mp3";
const playerCrashVolumeBoost = 1.75;
const raceSpeed = 315;
const displayedRunningSpeed = 280;
const attackDuration = 0.22;
const attackWreckDuration = 0.55;
const comboWindow = 3;

const config = {
  lanes: [-0.58, 0, 0.58],
  colors: {
    skyTop: "#07081c",
    skyMid: "#151044",
    road: "#11112c",
    roadEdge: "#ff4fd8",
    lane: "#5dfcff",
    cyan: "#5dfcff",
    hot: "#ff4fd8",
    amber: "#ffb347",
    violet: "#8e5cff",
  },
  stages: [
    { time: 0, speed: 118, spawnInterval: 2.2, groupMax: 1, groupChance: 0, laneCooldownDepth: 0.5 },
    { time: 20, speed: 142, spawnInterval: 1.75, groupMax: 1, groupChance: 0, laneCooldownDepth: 0.46 },
    { time: 45, speed: 168, spawnInterval: 1.35, groupMax: 2, groupChance: 0.22, laneCooldownDepth: 0.4 },
    { time: 80, speed: 194, spawnInterval: 1.08, groupMax: 2, groupChance: 0.38, laneCooldownDepth: 0.34 },
    { time: 130, speed: 220, spawnInterval: 0.92, groupMax: 2, groupChance: 0.5, laneCooldownDepth: 0.3 },
  ] satisfies DifficultyStage[],
  obstacleTravelRate: 0.22,
  storageKeys: {
    best: "neon-drive-best-distance",
    audio: "neon-drive-audio-settings",
  },
};

const skylineBars = [
  [-244, 36, 34], [-205, 58, 34], [-166, 76, 36], [-125, 52, 32], [-88, 84, 34],
  [-49, 64, 34], [-10, 42, 32],
  [0, 22, 32], [37, 48, 32], [74, 60, 34], [113, 40, 32], [150, 72, 34],
  [189, 56, 32], [226, 66, 34], [265, 82, 32], [302, 58, 34], [341, 48, 32],
  [378, 74, 34], [417, 100, 34], [456, 56, 32], [493, 72, 34], [532, 92, 32],
  [569, 114, 34], [608, 124, 36], [649, 80, 34], [688, 118, 34], [727, 142, 34],
  [766, 190, 36], [807, 164, 34], [846, 156, 36], [887, 108, 34], [926, 112, 34],
  [965, 146, 36], [1006, 108, 34], [1045, 90, 34], [1084, 58, 32], [1121, 54, 34],
  [1160, 74, 34], [1199, 94, 36], [1240, 100, 34], [1279, 58, 34], [1318, 48, 32],
  [1355, 78, 34], [1394, 82, 34], [1433, 54, 36], [1474, 56, 34], [1513, 38, 34],
  [1552, 30, 32], [1590, 44, 32], [1627, 66, 34], [1666, 86, 34], [1705, 60, 32],
  [1742, 74, 34], [1781, 50, 34], [1820, 34, 32],
] as const;

const sunTextureCircleDiameter = 0.72;
const sunTextureHorizonCut = 0.78;
const sunStripeSpeed = 0.0224;
const sunTextureUpdateInterval = 100;
const skylineGeometryHeightScale = 1.4;
const skylineBaseMotionScale = 1.15;
const skylineHeightMotionScale = 3.6;
const skylineMusicMotionHeightScale = 0.75;
const skylineAudioRampDuration = 3.2;
const skylineBlockCount = 7;
const skylineBeatSectionCount = 5;
const skylineBeatLiftRatio = 5 / 12;
const skylineBeatDuration = 0.46;
const skylineBeatCooldownDuration = 0.34;
const skylineBeatRetriggerPhase = 0.88;
const skylineBeatLowFloor = 0.18;
const skylineBeatTransientFloor = 0.006;
const skylineBeatRiseFloor = 0.0001;
const skylineBeatScoreFloor = 0.24;
const skylineBandRanges = [
  [1, 4],
  [4, 8],
  [8, 15],
  [15, 28],
] as const;
const skylineBandMultipliers = [1.05, 1.12, 1.28, 1.55] as const;
const skylineMotionMode = "audio-blocks";

const state: GameState = {
  mode: "idle",
  driveMode: null,
  distance: 0,
  score: 0,
  scoreBonus: 0,
  best: readBestDistance(),
  speed: 0,
  runTime: 0,
  lastTime: performance.now(),
  spawnTimer: 1.25,
  crashTimer: 0,
  attackTimer: 0,
  attackCooldown: 0,
  attackLaneOffset: 0,
  comboCount: 0,
  comboTimer: 0,
  comboPool: 0,
  comboFlashTimer: 0,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

const player: PlayerState = {
  laneIndex: 1,
  visualLane: 1,
  velocity: 0,
  drift: 0,
};

const audio: AudioSettings = readAudioSettings();
let width = 0;
let height = 0;
let dpr = 1;
let nextObstacleId = 1;
let nextScorePopupId = 1;
let roadTick = 0;
let roadScroll = 0;
let obstacles: Obstacle[] = [];
let scorePopups: ScorePopup[] = [];
let audioContext: AudioContext | null = null;
let bgmElement: HTMLAudioElement | null = null;
let bgmSourceNode: MediaElementAudioSourceNode | null = null;
let bgmAnalyser: AnalyserNode | null = null;
let bgmFrequencyData: Uint8Array<ArrayBuffer> | null = null;
let bgmStarted = false;
let bgmEnergy = 0;
let bgmPulse = 0;
let bgmBrightness = 0;
let skylineKick = 0;
let skylineEnvelope = 0;
let skylineAudioRamp = 0;
let skylineAudioRampStartedAt: number | null = null;
const skylineBandEnergies = skylineBandRanges.map(() => 0);
let skylineLowFast = 0;
let skylineLowBaseline = 0;
let skylinePreviousLowFast = 0;
let skylineLowTransient = 0;
let skylineLowRise = 0;
let skylineHeavyBeatScore = 0;
let skylineBeatPhase = 1;
let skylineBeatCooldown = 0;
let skylineBeatMask = 0;
let skylineBeatCount = 0;
let skylineBeatStrength = 0;
let skylineBeatRandomState = (Date.now() ^ 0x6d2b79f5) >>> 0;
const skylineBeatMaskHistory: number[] = [];
let previousBgmTarget = 0;
let previousBgmPeak = 0;
const attackHitBuffers: Array<AudioBuffer | null> = attackHitVariants.map(() => null);
const attackHitBufferPromises: Array<Promise<AudioBuffer | null> | null> = attackHitVariants.map(() => null);
let playerCrashBuffer: AudioBuffer | null = null;
let playerCrashBufferPromise: Promise<AudioBuffer | null> | null = null;
let openingAudioElement: HTMLAudioElement | null = null;
let openingAudioFadeFrame = 0;
let openingAudioActive = false;
let openingAudioStarted = false;
let openingAudioStartPending = false;
let openingAudioStartToken = 0;
let openingAudioStopAt = 0;
let openingRenderStartedAt: number | null = null;
const openingAudioNodes: AudioNode[] = [];
const openingAudioSources: AudioScheduledSourceNode[] = [];
let pointerActive = false;
let pointerLastShiftX = 0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 260);
const renderer = new THREE.WebGLRenderer({
  canvas: threeCanvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

interface VehicleSprite {
  sprite: THREE.Sprite;
  texture: THREE.Texture;
  kind: "player" | "traffic" | "barrier" | "broken";
  paletteIndex: number;
  laneIndex: LaneIndex;
  assetVariant: VehicleAssetVariant;
  wheelFrame: VehicleWheelFrame;
  aspect: number;
  ownsTexture: boolean;
  usesGeneratedAsset: boolean;
}

function textureImageSize(texture: THREE.Texture) {
  const image = texture.image as HTMLCanvasElement | HTMLImageElement | undefined;
  if (!image) return { width: 0, height: 0 };
  return {
    width: image instanceof HTMLImageElement ? image.naturalWidth || image.width : image.width,
    height: image instanceof HTMLImageElement ? image.naturalHeight || image.height : image.height,
  };
}

interface GroundStrip {
  core: THREE.Mesh;
  glow: THREE.Mesh;
}

interface GridStyle {
  textureKey: string;
  longCoreWidth: number;
  longGlowWidth: number;
  crossCoreWidth: number;
  crossGlowWidth: number;
  coreOpacity: number;
  glowOpacity: number;
  stops: Array<[number, string]>;
}

const worldScene = {
  nearZ: 3.2,
  farZ: -118,
  horizonZ: -108,
  roadWidth: 10.4,
  gridOuterWidth: 92,
  gridSpacing: 5.6,
  dashSpacing: 11,
  palmSpacing: 16.8,
  scrollSpeed: 18,
  playerZ: 3,
  cameraPosition: new THREE.Vector3(0, 4.8, 12),
  cameraTarget: new THREE.Vector3(0, -8, -60),
};

const roadScene = {
  visualNearZ: Number.NaN,
  road: null as THREE.Mesh | null,
  roadEdges: [] as GroundStrip[],
  gridLongLines: [] as GroundStrip[],
  dashes: [] as THREE.Mesh[],
  gridCrossLines: [] as GroundStrip[],
  palms: [] as THREE.Group[],
  gridSlotCount: 0,
  dashSlotCount: 0,
  palmGroupCount: 0,
  buildings: [] as THREE.Mesh[],
  sunTexture: null as THREE.CanvasTexture | null,
  sunTextureLastUpdate: Number.NEGATIVE_INFINITY,
  sunSprite: null as THREE.Sprite | null,
  glowTexture: null as THREE.CanvasTexture | null,
  glowSprite: null as THREE.Sprite | null,
  horizonPinkTexture: null as THREE.CanvasTexture | null,
  horizonPinkSprite: null as THREE.Sprite | null,
  playerVehicle: null as VehicleSprite | null,
  obstacleVehicles: new Map<number, VehicleSprite>(),
};

const projectionScratch = new THREE.Vector3();
const rayScratch = new THREE.Vector3();
const cameraForwardScratch = new THREE.Vector3();
const worldMeasureScratch = new THREE.Vector3();
const laserStripTextures = new Map<string, THREE.CanvasTexture>();

function readBestDistance(): number {
  try {
    return Number.parseFloat(localStorage.getItem(config.storageKeys.best) || "0") || 0;
  } catch {
    return 0;
  }
}

function writeBestDistance(value: number) {
  try {
    localStorage.setItem(config.storageKeys.best, value.toFixed(3));
  } catch {
    // Local storage is optional; gameplay should keep running without it.
  }
}

function readAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(config.storageKeys.audio);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AudioSettings>;
      const hasAdjustmentFlag = Object.prototype.hasOwnProperty.call(parsed, "volumeAdjusted");
      const legacyVolumeWasAdjusted =
        !hasAdjustmentFlag &&
        typeof parsed.volume === "number" &&
        Math.abs(parsed.volume - 0.5) > 0.001;
      const volumeAdjusted = parsed.volumeAdjusted === true || legacyVolumeWasAdjusted;
      return {
        muted: parsed.muted ?? false,
        volume: volumeAdjusted && typeof parsed.volume === "number" ? parsed.volume : 0.2,
        volumeAdjusted,
        unlocked: false,
      };
    }
  } catch {
    // Defaults handle blocked storage or bad data.
  }

  return { muted: false, volume: 0.2, volumeAdjusted: false, unlocked: false };
}

function writeAudioSettings() {
  try {
    localStorage.setItem(
      config.storageKeys.audio,
      JSON.stringify({
        muted: audio.muted,
        volume: audio.volume,
        volumeAdjusted: audio.volumeAdjusted,
      }),
    );
  } catch {
    // Audio preference persistence is non-critical.
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, state.reducedMotion ? 1.25 : 1.75);
  width = Math.max(1, Math.floor(rect.width));
  height = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function positiveModulo(value: number, mod: number) {
  return ((value % mod) + mod) % mod;
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function activeStage(): DifficultyStage {
  return config.stages.reduce((current, stage) =>
    state.runTime >= stage.time ? stage : current,
  );
}

function weightedPick<T>(items: T[], weight: (item: T) => number): T {
  const weights = items.map((item) => Math.max(0.01, weight(item)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = Math.random() * total;

  for (let i = 0; i < items.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return items[i];
  }

  return items[items.length - 1];
}

function trackHorizonY() {
  if (!width || !height) return height * 0.36;
  return worldToScreenY(0, 0, worldScene.horizonZ);
}

function trackPlayerY() {
  if (!width || !height) return height * 0.81;
  return worldToScreenY(0, 0, worldScene.playerZ);
}

function trackRange() {
  return Math.max(1, trackPlayerY() - trackHorizonY());
}

function trackProgress(trackY: number) {
  return (trackY - trackHorizonY()) / trackRange();
}

function trackConveyorSpeed() {
  return trackRange() * config.obstacleTravelRate;
}

function sceneScrollSpeed() {
  return worldScene.scrollSpeed;
}

function targetSpeedForMode() {
  return raceSpeed;
}

function comboAttackValue(nextComboCount: number) {
  if (nextComboCount <= 10) return 400;
  if (nextComboCount <= 50) return 800;
  return 1600;
}

function clearCombo() {
  state.comboCount = 0;
  state.comboTimer = 0;
  state.comboPool = 0;
  state.comboFlashTimer = 0;
}

function settleCombo() {
  clearCombo();
}

function registerAttackScore() {
  const nextComboCount = state.comboCount + 1;
  const attackScore = comboAttackValue(nextComboCount);
  state.comboCount = nextComboCount;
  state.comboTimer = comboWindow;
  state.comboFlashTimer = 0.22;
  state.comboPool += attackScore;
  state.scoreBonus += attackScore;
  refreshScore();
  updateHud();
  return attackScore;
}

function createScorePopup(obstacle: Obstacle, value: number) {
  const nearbyPopupCount = scorePopups.filter(
    (popup) =>
      popup.timer > 0 &&
      popup.laneIndex === obstacle.laneIndex &&
      Math.abs(trackProgress(popup.trackY) - trackProgress(obstacle.trackY)) < 0.12,
  ).length;
  const vehicle = roadScene.obstacleVehicles.get(obstacle.id);
  const point = vehicle
    ? worldToScreenPoint(
        vehicle.sprite.position.x,
        vehicle.sprite.position.y + vehicle.sprite.scale.y * 0.2,
        vehicle.sprite.position.z,
      )
    : worldToScreenPoint(
        laneToWorldX(obstacle.laneIndex),
        1.05,
        screenYToWorldZAtY(obstacle.trackY, 1.05),
      );
  scorePopups.push({
    id: nextScorePopupId,
    obstacleId: obstacle.id,
    value,
    laneIndex: obstacle.laneIndex,
    trackY: obstacle.trackY,
    anchorX: point.x,
    anchorY: point.y,
    timer: 0.82,
    duration: 0.82,
    offsetIndex: nearbyPopupCount % 3,
  });
  nextScorePopupId += 1;
}

function laneSpawnPenalty(laneIndex: LaneIndex, stage: DifficultyStage) {
  return obstacles.reduce((penalty, obstacle) => {
    if (obstacle.wreckedByAttack) return penalty;
    const progress = trackProgress(obstacle.trackY);
    if (progress < -0.08 || progress > stage.laneCooldownDepth) return penalty;

    const freshness = 1 - clamp(progress / stage.laneCooldownDepth, 0, 1);
    const laneDistance = Math.abs(obstacle.laneIndex - laneIndex);

    if (laneDistance === 0) return penalty + 9 * freshness;
    if (laneDistance === 1) return penalty + 3.5 * freshness;
    return penalty + 0.8 * freshness;
  }, 0);
}

function spawnObstacles(stage: DifficultyStage) {
  const wantsPair = stage.groupMax >= 2 && Math.random() < stage.groupChance;
  const laneGroups: LaneIndex[][] = wantsPair
    ? [[0, 2], [0, 1], [1, 2]]
    : [[0], [1], [2]];
  const selected = weightedPick(laneGroups, (group) => {
    const penalty = group.reduce<number>((sum, laneIndex) => sum + laneSpawnPenalty(laneIndex, stage), 0);
    const adjacentPairPenalty = group.length === 2 && Math.abs(group[0] - group[1]) === 1 ? 3.5 : 0;
    const centerLaneStartPenalty = group.length === 1 && group[0] === 1 && state.runTime < 20 ? 0.6 : 0;
    return 1 / (1 + penalty + adjacentPairPenalty + centerLaneStartPenalty);
  });

  selected.forEach((laneIndex, index) => {
    const type: ObstacleType = "traffic";
    obstacles.push({
      id: nextObstacleId,
      type,
      laneIndex,
      trackY: trackHorizonY() - index * trackRange() * 0.04,
      passed: false,
    });
    nextObstacleId += 1;
  });
}

function baseScore() {
  return Math.floor(state.distance * 10000);
}

function refreshScore() {
  state.score = baseScore() + state.scoreBonus;
}

function resetToStandby(status = "STANDING BY") {
  state.mode = "idle";
  state.driveMode = null;
  state.distance = 0;
  state.score = 0;
  state.scoreBonus = 0;
  state.runTime = 0;
  state.spawnTimer = 1.25;
  state.crashTimer = 0;
  state.attackTimer = 0;
  state.attackCooldown = 0;
  state.attackLaneOffset = 0;
  state.speed = 0;
  state.lastTime = performance.now();
  clearCombo();
  player.laneIndex = 1;
  player.visualLane = 1;
  player.velocity = 0;
  player.drift = 0;
  roadTick = 0;
  roadScroll = 0;
  obstacles = [];
  scorePopups = [];
  setStatus(status);
  syncDriveDataset();
  syncBgm();
}

function resetRun(mode: DriveMode) {
  state.mode = "running";
  state.driveMode = mode;
  bgmStarted = true;
  state.distance = 0;
  state.score = 0;
  state.scoreBonus = 0;
  state.runTime = 0;
  state.spawnTimer = mode === "race" ? 1.25 : Number.POSITIVE_INFINITY;
  state.crashTimer = 0;
  state.attackTimer = 0;
  state.attackCooldown = 0;
  state.attackLaneOffset = 0;
  state.speed = targetSpeedForMode();
  clearCombo();
  state.lastTime = performance.now();
  player.laneIndex = 1;
  player.visualLane = 1;
  player.velocity = 0;
  player.drift = 0;
  roadTick = 0;
  roadScroll = 0;
  obstacles = [];
  scorePopups = [];
  setStatus(mode === "race" ? "RACING" : "AIRING");
  syncDriveDataset();
  syncBgm();
}

async function startDriveMode(mode: DriveMode) {
  await window.__soundwavePlayer?.playFromGame();
  await unlockAudio();
  if (mode === "race") {
    setStatus("LOADING VEHICLES");
    const assetsReady = await generatedVehicleAssetsReady;
    if (!assetsReady) {
      setStatus("VEHICLE LOAD FAILED");
      return;
    }
  }
  resetRun(mode);
  playEffect("button");
}

function attackTarget(direction: AttackDirection) {
  if (state.mode !== "running" || state.driveMode !== "race" || state.attackCooldown > 0) return;

  const laneDelta = direction === "left" ? -1 : direction === "right" ? 1 : 0;
  const targetLane = player.laneIndex + laneDelta;
  if (targetLane < 0 || targetLane > 2) return;

  const target = obstacles
    .filter((obstacle) => {
      if (obstacle.wreckedByAttack) return false;
      if (obstacle.laneIndex !== targetLane) return false;
      const progress = trackProgress(obstacle.trackY);
      return progress >= 0.66 && progress <= 1.04;
    })
    .sort((a, b) => Math.abs(1 - trackProgress(a.trackY)) - Math.abs(1 - trackProgress(b.trackY)))[0];

  if (!target) return;

  target.type = "broken";
  target.wreckedByAttack = true;
  target.wreckTimer = attackWreckDuration;
  target.wreckDirection = direction;
  target.passed = true;
  const attackScore = registerAttackScore();
  target.attackScore = attackScore;
  createScorePopup(target, attackScore);
  state.attackTimer = attackDuration;
  state.attackCooldown = 0.34;
  state.attackLaneOffset = laneDelta;
  playEffect("attackHit");
}

function laneOffset(lanePosition: number) {
  const lower = Math.floor(clamp(lanePosition, 0, config.lanes.length - 1));
  const upper = Math.ceil(clamp(lanePosition, 0, config.lanes.length - 1));
  return lerp(config.lanes[lower], config.lanes[upper], lanePosition - lower);
}

function laneToWorldX(lanePosition: number) {
  return laneOffset(lanePosition) * driveLaneWidth() * 0.5;
}

function responsiveDriveAmount() {
  return clamp((camera.aspect - 0.64) / 0.72, 0, 1);
}

function driveLaneWidth() {
  return lerp(4.8, worldScene.roadWidth, responsiveDriveAmount());
}

function playerVehicleWorldWidth() {
  return lerp(1.36, 3.08, responsiveDriveAmount());
}

function obstacleVehicleWorldWidth() {
  return playerVehicleWorldWidth() * lerp(0.78, 0.9, responsiveDriveAmount());
}

function worldToScreenY(x: number, y: number, z: number) {
  projectionScratch.set(x, y, z).project(camera);
  return (-projectionScratch.y * 0.5 + 0.5) * height;
}

function worldToScreenPoint(x: number, y: number, z: number) {
  projectionScratch.set(x, y, z).project(camera);
  return {
    x: (projectionScratch.x * 0.5 + 0.5) * width,
    y: (-projectionScratch.y * 0.5 + 0.5) * height,
  };
}

function screenYToGroundZ(screenY: number, maxZ = worldScene.playerZ) {
  if (!height) return worldScene.horizonZ;
  const ndcY = -(screenY / height) * 2 + 1;
  rayScratch.set(0, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
  if (rayScratch.y >= -0.0001) return worldScene.horizonZ;
  const distance = -camera.position.y / rayScratch.y;
  const z = camera.position.z + rayScratch.z * distance;
  return clamp(z, worldScene.horizonZ, maxZ);
}

function screenYToWorldZAtY(screenY: number, worldY: number) {
  if (!height) return worldScene.horizonZ;
  const ndcY = -(screenY / height) * 2 + 1;
  rayScratch.set(0, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
  if (Math.abs(rayScratch.y) < 0.0001) return worldScene.horizonZ;
  const distance = (worldY - camera.position.y) / rayScratch.y;
  if (distance <= 0) return camera.position.z - 0.25;
  const z = camera.position.z + rayScratch.z * distance;
  return clamp(z, worldScene.horizonZ, camera.position.z - 0.25);
}

function gridCrossLineZ(index: number, nearZ: number, scroll: number) {
  return recycledZ(index, nearZ, worldScene.gridSpacing, scroll, roadScene.gridSlotCount);
}

function palmGroupZ(index: number, nearZ: number, scroll: number) {
  return gridCrossLineZ(index * 3, nearZ, scroll);
}

function dashLineZ(index: number, nearZ: number, scroll: number) {
  return recycledZ(index, nearZ, worldScene.dashSpacing, scroll, roadScene.dashSlotCount);
}

function recycledZ(index: number, nearZ: number, spacing: number, scroll: number, slotCount: number) {
  const count = Math.max(1, slotCount);
  const cycle = count * spacing;
  const nearMargin = spacing * 1.25;
  const farStart = nearZ + nearMargin - cycle;
  return farStart + positiveModulo(index * spacing + scroll, cycle);
}

function poolCountForSpacing(spacing: number, multiplier = 1) {
  const maxRange = camera.position.z - worldScene.horizonZ + 34;
  return Math.ceil(Math.max(1, maxRange / spacing)) + multiplier;
}

function gridPoolSlotCount() {
  return Math.ceil(poolCountForSpacing(worldScene.gridSpacing, 8) / 3) * 3;
}

function visualNearScreenY() {
  return height + Math.max(80, height * 0.08);
}

function visualNearZ() {
  return screenYToGroundZ(visualNearScreenY(), camera.position.z - 0.2);
}

function worldYForScreenYAtZ(screenY: number, z: number) {
  if (!height) return 0;
  const ndcY = -(screenY / height) * 2 + 1;
  rayScratch.set(0, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
  if (Math.abs(rayScratch.z) < 0.0001) return 0;
  const distance = (z - camera.position.z) / rayScratch.z;
  return camera.position.y + rayScratch.y * distance;
}

function worldUnitsForScreenWidthAt(z: number, y: number, fraction: number) {
  camera.getWorldDirection(cameraForwardScratch);
  worldMeasureScratch.set(0, y, z).sub(camera.position);
  const depth = Math.max(0.01, worldMeasureScratch.dot(cameraForwardScratch));
  const visibleHeight = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  return visibleHeight * camera.aspect * fraction;
}

function activeGridStyle(): GridStyle {
  switch (previewMode.grid) {
    case "A":
      return {
        textureKey: "preview-grid-a",
        longCoreWidth: 0.075,
        longGlowWidth: 0.38,
        crossCoreWidth: 0.068,
        crossGlowWidth: 0.34,
        coreOpacity: 0.98,
        glowOpacity: 0.46,
        stops: [
          [0, "rgba(31, 157, 255, 0)"],
          [0.22, "rgba(67, 215, 255, 0.12)"],
          [0.42, "rgba(176, 247, 255, 0.7)"],
          [0.5, "rgba(232, 253, 255, 1)"],
          [0.58, "rgba(176, 247, 255, 0.7)"],
          [0.78, "rgba(67, 215, 255, 0.12)"],
          [1, "rgba(31, 157, 255, 0)"],
        ],
      };
    case "B":
      return {
        textureKey: "preview-grid-b",
        longCoreWidth: 0.15,
        longGlowWidth: 0.9,
        crossCoreWidth: 0.13,
        crossGlowWidth: 0.78,
        coreOpacity: 0.98,
        glowOpacity: 0.74,
        stops: [
          [0, "rgba(31, 157, 255, 0)"],
          [0.12, "rgba(31, 157, 255, 0.1)"],
          [0.28, "rgba(98, 232, 255, 0.38)"],
          [0.43, "rgba(190, 249, 255, 0.84)"],
          [0.5, "rgba(232, 253, 255, 1)"],
          [0.57, "rgba(190, 249, 255, 0.84)"],
          [0.72, "rgba(98, 232, 255, 0.38)"],
          [0.88, "rgba(31, 157, 255, 0.1)"],
          [1, "rgba(31, 157, 255, 0)"],
        ],
      };
    case "C":
      return {
        textureKey: "preview-grid-c",
        longCoreWidth: 0.11,
        longGlowWidth: 0.62,
        crossCoreWidth: 0.102,
        crossGlowWidth: 0.56,
        coreOpacity: 1,
        glowOpacity: 0.64,
        stops: [
          [0, "rgba(31, 157, 255, 0)"],
          [0.16, "rgba(31, 157, 255, 0.12)"],
          [0.35, "rgba(98, 232, 255, 0.46)"],
          [0.46, "rgba(205, 250, 255, 0.9)"],
          [0.5, "rgba(244, 254, 255, 1)"],
          [0.54, "rgba(205, 250, 255, 0.9)"],
          [0.65, "rgba(98, 232, 255, 0.46)"],
          [0.84, "rgba(31, 157, 255, 0.12)"],
          [1, "rgba(31, 157, 255, 0)"],
        ],
      };
    case "D":
      return {
        textureKey: "preview-grid-d",
        longCoreWidth: 0.105,
        longGlowWidth: 0.7,
        crossCoreWidth: 0.096,
        crossGlowWidth: 0.62,
        coreOpacity: 0.96,
        glowOpacity: 0.58,
        stops: [
          [0, "rgba(31, 157, 255, 0)"],
          [0.18, "rgba(31, 157, 255, 0.12)"],
          [0.36, "rgba(98, 232, 255, 0.36)"],
          [0.46, "rgba(210, 251, 255, 0.9)"],
          [0.5, "rgba(255, 255, 255, 1)"],
          [0.54, "rgba(210, 251, 255, 0.9)"],
          [0.64, "rgba(98, 232, 255, 0.36)"],
          [0.82, "rgba(31, 157, 255, 0.12)"],
          [1, "rgba(31, 157, 255, 0)"],
        ],
      };
    default:
      return {
        textureKey: "default-grid-b",
        longCoreWidth: 0.15,
        longGlowWidth: 0.9,
        crossCoreWidth: 0.13,
        crossGlowWidth: 0.78,
        coreOpacity: 0.98,
        glowOpacity: 0.74,
        stops: [
          [0, "rgba(31, 157, 255, 0)"],
          [0.12, "rgba(31, 157, 255, 0.1)"],
          [0.28, "rgba(98, 232, 255, 0.38)"],
          [0.43, "rgba(190, 249, 255, 0.84)"],
          [0.5, "rgba(232, 253, 255, 1)"],
          [0.57, "rgba(190, 249, 255, 0.84)"],
          [0.72, "rgba(98, 232, 255, 0.38)"],
          [0.88, "rgba(31, 157, 255, 0.1)"],
          [1, "rgba(31, 157, 255, 0)"],
        ],
      };
  }
}

function makeGroundStrip(color: number, coreOpacity: number, glowOpacity: number) {
  const makeLayer = (opacity: number) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.renderOrder = 2;
    return mesh;
  };

  return {
    core: makeLayer(coreOpacity),
    glow: makeLayer(glowOpacity),
  };
}

function makeLaserStripTexture(crossAxis: "x" | "y", style: GridStyle) {
  const cacheKey = `${style.textureKey}-${crossAxis}`;
  const cached = laserStripTextures.get(cacheKey);
  if (cached) return cached;

  const laserCanvas = document.createElement("canvas");
  laserCanvas.width = 96;
  laserCanvas.height = 96;
  const laserCtx = laserCanvas.getContext("2d");
  if (!laserCtx) return null;

  const gradient = crossAxis === "x"
    ? laserCtx.createLinearGradient(0, 0, laserCanvas.width, 0)
    : laserCtx.createLinearGradient(0, 0, 0, laserCanvas.height);
  style.stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  laserCtx.fillStyle = gradient;
  laserCtx.fillRect(0, 0, laserCanvas.width, laserCanvas.height);

  const texture = new THREE.CanvasTexture(laserCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  laserStripTextures.set(cacheKey, texture);
  return texture;
}

function makeLaserGroundStrip(crossAxis: "x" | "y", style = activeGridStyle()) {
  const texture = makeLaserStripTexture(crossAxis, style);
  const makeLayer = (opacity: number) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.renderOrder = 2;
    return mesh;
  };

  return {
    core: makeLayer(style.coreOpacity),
    glow: makeLayer(style.glowOpacity),
  };
}

function makePreviewGridHorizonGlowTexture() {
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 1024;
  glowCanvas.height = 192;
  const glowCtx = glowCanvas.getContext("2d");
  if (!glowCtx) return null;

  const horizontal = glowCtx.createLinearGradient(0, 0, glowCanvas.width, 0);
  horizontal.addColorStop(0, "rgba(31, 157, 255, 0)");
  horizontal.addColorStop(0.18, "rgba(31, 157, 255, 0.18)");
  horizontal.addColorStop(0.5, "rgba(130, 238, 255, 0.64)");
  horizontal.addColorStop(0.82, "rgba(31, 157, 255, 0.18)");
  horizontal.addColorStop(1, "rgba(31, 157, 255, 0)");
  glowCtx.fillStyle = horizontal;
  glowCtx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);

  glowCtx.globalCompositeOperation = "destination-in";
  const vertical = glowCtx.createLinearGradient(0, 0, 0, glowCanvas.height);
  vertical.addColorStop(0, "rgba(0, 0, 0, 0)");
  vertical.addColorStop(0.34, "rgba(0, 0, 0, 0.92)");
  vertical.addColorStop(0.5, "rgba(0, 0, 0, 1)");
  vertical.addColorStop(0.66, "rgba(0, 0, 0, 0.92)");
  vertical.addColorStop(1, "rgba(0, 0, 0, 0)");
  glowCtx.fillStyle = vertical;
  glowCtx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
  glowCtx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function setStripAlongZ(strip: GroundStrip, x: number, nearZ: number, farZ: number, coreWidth: number, glowWidth: number) {
  const length = Math.max(0.01, Math.abs(nearZ - farZ));
  const z = (nearZ + farZ) * 0.5;
  strip.glow.position.set(x, 0.035, z);
  strip.glow.scale.set(glowWidth, length, 1);
  strip.core.position.set(x, 0.055, z);
  strip.core.scale.set(coreWidth, length, 1);
}

function setStripAlongX(strip: GroundStrip, startX: number, endX: number, z: number, coreWidth: number, glowWidth: number) {
  const length = Math.max(0.01, Math.abs(endX - startX));
  const x = (startX + endX) * 0.5;
  strip.glow.position.set(x, 0.035, z);
  strip.glow.scale.set(length, glowWidth, 1);
  strip.core.position.set(x, 0.055, z);
  strip.core.scale.set(length, coreWidth, 1);
}

function shiftLane(delta: -1 | 1) {
  if (state.mode !== "running") return;
  const nextLane = clamp(player.laneIndex + delta, 0, 2) as LaneIndex;
  if (nextLane === player.laneIndex) return;
  player.laneIndex = nextLane;
  playEffect("button");
}

function makeSkyTexture() {
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 1024;
  skyCanvas.height = 1024;
  const skyCtx = skyCanvas.getContext("2d");
  if (!skyCtx) return null;

  const gradient = skyCtx.createLinearGradient(0, 0, 0, skyCanvas.height);
  gradient.addColorStop(0, "#07071f");
  gradient.addColorStop(0.36, "#1a0750");
  gradient.addColorStop(0.58, "#a30592");
  gradient.addColorStop(1, "#050516");
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);

  skyCtx.fillStyle = "#ffffff";
  for (let i = 0; i < 130; i += 1) {
    const x = (i * 137) % skyCanvas.width;
    const y = (i * 59) % Math.floor(skyCanvas.height * 0.36);
    const size = i % 15 === 0 ? 2 : 1;
    skyCtx.globalAlpha = i % 9 === 0 ? 0.9 : 0.42;
    skyCtx.fillRect(x, y, size, size);
  }
  skyCtx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(skyCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawSunTexture(time: number) {
  const sunCanvas = document.createElement("canvas");
  sunCanvas.width = 512;
  sunCanvas.height = 512;
  const sunCtx = sunCanvas.getContext("2d");
  if (!sunCtx) return null;

  const x = sunCanvas.width * 0.5;
  const y = sunCanvas.height * 0.5;
  const radius = sunCanvas.width * (sunTextureCircleDiameter * 0.5);
  sunCtx.clearRect(0, 0, sunCanvas.width, sunCanvas.height);

  const glowCore = sunCtx.createRadialGradient(x, y, radius * 0.12, x, y, radius);
  glowCore.addColorStop(0, "rgba(255, 93, 222, 0.42)");
  glowCore.addColorStop(0.7, "rgba(255, 79, 216, 0.38)");
  glowCore.addColorStop(1, "rgba(255, 68, 208, 0.34)");
  sunCtx.fillStyle = glowCore;
  sunCtx.beginPath();
  sunCtx.arc(x, y, radius, 0, Math.PI * 2);
  sunCtx.fill();

  const glow = sunCtx.createRadialGradient(x, y, radius * 0.96, x, y, radius * 1.3);
  glow.addColorStop(0, "rgba(255, 79, 216, 0.24)");
  glow.addColorStop(0.16, "rgba(255, 79, 216, 0.32)");
  glow.addColorStop(0.38, "rgba(255, 51, 196, 0.2)");
  glow.addColorStop(1, "rgba(255, 49, 196, 0)");
  sunCtx.fillStyle = glow;
  sunCtx.beginPath();
  sunCtx.arc(x, y, radius * 1.3, 0, Math.PI * 2);
  sunCtx.fill();

  const discCanvas = document.createElement("canvas");
  discCanvas.width = sunCanvas.width;
  discCanvas.height = sunCanvas.height;
  const discCtx = discCanvas.getContext("2d");
  if (!discCtx) return null;

  const gradient = discCtx.createLinearGradient(0, y - radius, 0, y + radius);
  gradient.addColorStop(0, "#fff58f");
  gradient.addColorStop(0.22, "#ffd84f");
  gradient.addColorStop(0.5, "#ff8a5e");
  gradient.addColorStop(0.74, "#ff4fb5");
  gradient.addColorStop(1, "#ff1f9d");
  discCtx.fillStyle = gradient;
  discCtx.beginPath();
  discCtx.arc(x, y, radius, 0, Math.PI * 2);
  discCtx.fill();

  const stripeGap = radius * 0.215;
  const stripePhase = state.reducedMotion ? stripeGap * 0.34 : (time * sunStripeSpeed) % stripeGap;
  const stripeLowerY = y + radius * 0.79;
  const stripeUpperY = y - radius * 0.64;
  const stripeRange = stripeLowerY - stripeUpperY;

  discCtx.save();
  discCtx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 10; i += 1) {
    const lineY = stripeLowerY - i * stripeGap - stripePhase;
    if (lineY < stripeUpperY) continue;
    const lift = clamp((stripeLowerY - lineY) / stripeRange, 0, 1);
    const topFade = clamp((lineY - stripeUpperY) / (stripeRange * 0.18), 0, 1);
    const alpha = topFade;
    if (alpha <= 0.02) continue;

    const thickness = Math.max(1.2, lerp(radius * 0.092, radius * 0.006, Math.pow(lift, 1.35)));
    discCtx.globalAlpha = alpha;
    discCtx.fillRect(x - radius * 1.42, lineY - thickness * 0.16, radius * 2.84, thickness * 1.32);
  }
  discCtx.restore();
  sunCtx.drawImage(discCanvas, 0, 0);

  sunCtx.save();
  sunCtx.globalCompositeOperation = "destination-out";
  sunCtx.fillStyle = "#000";
  sunCtx.fillRect(0, sunCanvas.height * sunTextureHorizonCut, sunCanvas.width, sunCanvas.height);
  sunCtx.restore();

  const texture = new THREE.CanvasTexture(sunCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeHorizonGlowTexture() {
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 1536;
  glowCanvas.height = 512;
  const glowCtx = glowCanvas.getContext("2d");
  if (!glowCtx) return null;

  const gradient = glowCtx.createRadialGradient(
    glowCanvas.width * 0.5,
    glowCanvas.height * 0.5,
    glowCanvas.width * 0.02,
    glowCanvas.width * 0.5,
    glowCanvas.height * 0.5,
    glowCanvas.width * 0.48,
  );
  gradient.addColorStop(0, "rgba(255, 170, 128, 0.3)");
  gradient.addColorStop(0.18, "rgba(255, 78, 186, 0.34)");
  gradient.addColorStop(0.42, "rgba(255, 77, 216, 0.16)");
  gradient.addColorStop(0.72, "rgba(255, 124, 184, 0.04)");
  gradient.addColorStop(1, "rgba(255, 124, 184, 0)");
  glowCtx.fillStyle = gradient;
  glowCtx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);

  glowCtx.globalCompositeOperation = "destination-in";
  const verticalFade = glowCtx.createLinearGradient(0, 0, 0, glowCanvas.height);
  verticalFade.addColorStop(0, "rgba(0, 0, 0, 0)");
  verticalFade.addColorStop(0.18, "rgba(0, 0, 0, 0)");
  verticalFade.addColorStop(0.36, "rgba(0, 0, 0, 0.72)");
  verticalFade.addColorStop(0.48, "rgba(0, 0, 0, 1)");
  verticalFade.addColorStop(0.6, "rgba(0, 0, 0, 0.82)");
  verticalFade.addColorStop(0.84, "rgba(0, 0, 0, 0)");
  verticalFade.addColorStop(1, "rgba(0, 0, 0, 0)");
  glowCtx.fillStyle = verticalFade;
  glowCtx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
  glowCtx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeHorizonPinkBandTexture() {
  const bandCanvas = document.createElement("canvas");
  bandCanvas.width = 1536;
  bandCanvas.height = 384;
  const bandCtx = bandCanvas.getContext("2d");
  if (!bandCtx) return null;

  const baseY = bandCanvas.height * 0.94;
  const topPoints: Array<[number, number]> = [];
  const segments = 28;
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const centerRise = Math.sin(Math.PI * t) ** 0.82;
    const ripple =
      Math.sin(t * Math.PI * 7.5) * 0.035 +
      Math.sin(t * Math.PI * 16.5 + 0.9) * 0.018;
    const rise = clamp(centerRise + ripple, 0.1, 1);
    topPoints.push([
      t * bandCanvas.width,
      baseY - bandCanvas.height * lerp(0.12, 0.58, rise),
    ]);
  }

  bandCtx.save();
  bandCtx.beginPath();
  bandCtx.moveTo(0, baseY);
  topPoints.forEach(([x, y]) => bandCtx.lineTo(x, y));
  bandCtx.lineTo(bandCanvas.width, baseY);
  bandCtx.closePath();
  bandCtx.clip();

  const vertical = bandCtx.createLinearGradient(0, baseY, 0, bandCanvas.height * 0.2);
  vertical.addColorStop(0, "rgba(255, 72, 205, 0.62)");
  vertical.addColorStop(0.2, "rgba(255, 87, 215, 0.34)");
  vertical.addColorStop(0.58, "rgba(255, 119, 218, 0.13)");
  vertical.addColorStop(1, "rgba(255, 119, 218, 0)");
  bandCtx.fillStyle = vertical;
  bandCtx.fillRect(0, 0, bandCanvas.width, bandCanvas.height);
  bandCtx.restore();

  bandCtx.globalCompositeOperation = "destination-in";
  const horizontal = bandCtx.createLinearGradient(0, 0, bandCanvas.width, 0);
  horizontal.addColorStop(0, "rgba(0, 0, 0, 0)");
  horizontal.addColorStop(0.08, "rgba(0, 0, 0, 0.12)");
  horizontal.addColorStop(0.22, "rgba(0, 0, 0, 0.58)");
  horizontal.addColorStop(0.5, "rgba(0, 0, 0, 1)");
  horizontal.addColorStop(0.78, "rgba(0, 0, 0, 0.58)");
  horizontal.addColorStop(0.92, "rgba(0, 0, 0, 0.12)");
  horizontal.addColorStop(1, "rgba(0, 0, 0, 0)");
  bandCtx.fillStyle = horizontal;
  bandCtx.fillRect(0, 0, bandCanvas.width, bandCanvas.height);
  bandCtx.globalCompositeOperation = "source-over";

  const softened = bandCtx.getImageData(0, 0, bandCanvas.width, bandCanvas.height);
  bandCtx.clearRect(0, 0, bandCanvas.width, bandCanvas.height);
  const softCanvas = document.createElement("canvas");
  softCanvas.width = bandCanvas.width;
  softCanvas.height = bandCanvas.height;
  const softCtx = softCanvas.getContext("2d");
  if (!softCtx) return null;
  softCtx.putImageData(softened, 0, 0);
  bandCtx.filter = "blur(18px)";
  bandCtx.drawImage(softCanvas, 0, 0);
  bandCtx.filter = "blur(6px)";
  const line = bandCtx.createLinearGradient(0, 0, bandCanvas.width, 0);
  line.addColorStop(0, "rgba(255, 72, 205, 0)");
  line.addColorStop(0.16, "rgba(255, 72, 205, 0.16)");
  line.addColorStop(0.5, "rgba(255, 160, 235, 0.42)");
  line.addColorStop(0.84, "rgba(255, 72, 205, 0.16)");
  line.addColorStop(1, "rgba(255, 72, 205, 0)");
  bandCtx.fillStyle = line;
  bandCtx.fillRect(0, baseY - 9, bandCanvas.width, 18);
  bandCtx.filter = "none";

  const texture = new THREE.CanvasTexture(bandCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makePalmGroup(side = 1, index = 0) {
  return makePreviewPalmGroup(previewMode.palm ?? "D", side, index);
}

function makePreviewPalmGroup(variant: PreviewVariant, side = 1, index = 0) {
  const palm = new THREE.Group();
  const coreMaterial = new THREE.LineBasicMaterial({ color: 0x7ff8ff, transparent: true, opacity: 0.98 });
  const dimMaterial = new THREE.LineBasicMaterial({ color: 0x2fd9ff, transparent: true, opacity: 0.66 });
  const auraMaterial = new THREE.LineBasicMaterial({ color: 0xc9ffff, transparent: true, opacity: 0.78 });
  const seed = Math.sin((index + 1) * 19.19 + side * 43.17) * 12345.6789;
  const seed01 = seed - Math.floor(seed);

  const addCurve = (points: THREE.Vector3[], material = coreMaterial) => {
    palm.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  };

  const trunkHeight = variant === "D" ? 3.05 : 3.36;
  const lean =
    variant === "B"
      ? side * (0.34 + seed01 * 0.08)
      : side * (0.08 + seed01 * 0.05);
  const ringCount = variant === "D" ? 8 : 12;
  const ringSegments = variant === "D" ? 10 : 14;
  const ringCenters: THREE.Vector3[] = [];
  const ringRadii: Array<[number, number]> = [];

  for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
    const t = ringIndex / (ringCount - 1);
    const center = new THREE.Vector3(
      lean * t * t + Math.sin(t * Math.PI * 1.1 + seed01) * 0.035,
      t * trunkHeight,
      Math.sin(t * Math.PI * 1.25 + seed01 * 2.1) * 0.035,
    );
    const radiusX = lerp(0.16, 0.055, t);
    const radiusZ = lerp(0.11, 0.042, t);
    const points: THREE.Vector3[] = [];

    for (let segment = 0; segment <= ringSegments; segment += 1) {
      const angle = (segment / ringSegments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        center.x + Math.cos(angle) * radiusX,
        center.y,
        center.z + Math.sin(angle) * radiusZ,
      ));
    }

    ringCenters.push(center);
    ringRadii.push([radiusX, radiusZ]);
    addCurve(points, ringIndex % 2 === 0 ? coreMaterial : dimMaterial);
  }

  for (let rib = 0; rib < 5; rib += 1) {
    const angle = (rib / 5) * Math.PI * 2 + seed01 * 0.3;
    addCurve(ringCenters.map((center, ringIndex) => {
      const [radiusX, radiusZ] = ringRadii[ringIndex];
      return new THREE.Vector3(
        center.x + Math.cos(angle) * radiusX,
        center.y,
        center.z + Math.sin(angle) * radiusZ,
      );
    }), rib % 2 === 0 ? coreMaterial : dimMaterial);
  }

  const crownPoint = ringCenters[ringCenters.length - 1].clone().add(new THREE.Vector3(0.02, 0.12, 0));
  const leafCount = variant === "C" ? 18 : variant === "D" ? 9 : 13;
  const crownRadius = variant === "D" ? 1.24 : variant === "C" ? 1.48 : 1.38;
  const crownLift = variant === "A" ? 0.58 : variant === "B" ? 0.46 : variant === "C" ? 0.52 : 0.42;
  const windPush = variant === "B" ? side * 0.42 : 0;

  for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
    const spread = leafIndex / (leafCount - 1);
    const jitter = Math.sin(seed01 * 8 + leafIndex * 1.83);
    const angle = -Math.PI * 0.94 + spread * Math.PI * 1.88 + (variant === "B" ? side * 0.22 : 0) + jitter * 0.045;
    const sideFalloff = Math.abs(spread - 0.5) * 2;
    const length =
      crownRadius *
      lerp(0.82, 1.12, variant === "C" ? Math.sin(leafIndex * 2.4 + seed01) * 0.5 + 0.5 : 1 - sideFalloff * 0.18);
    const droop =
      variant === "A"
        ? lerp(0.52, 1.02, sideFalloff)
        : variant === "B"
          ? lerp(0.46, 0.92, sideFalloff) + 0.08
          : variant === "C"
            ? lerp(0.42, 0.98, Math.min(1, sideFalloff + Math.abs(jitter) * 0.22))
            : lerp(0.5, 0.88, sideFalloff);
    const depth = Math.sin(angle) * (variant === "D" ? 0.38 : 0.62);
    const tip = crownPoint.clone().add(new THREE.Vector3(
      Math.cos(angle) * length + windPush,
      crownLift - droop,
      depth,
    ));
    const control = crownPoint.clone().lerp(tip, 0.44).add(new THREE.Vector3(
      windPush * 0.32,
      variant === "A" ? 0.72 : variant === "C" ? 0.62 : 0.54,
      depth * 0.12,
    ));
    const vein = new THREE.QuadraticBezierCurve3(crownPoint, control, tip);
    addCurve(vein.getPoints(variant === "D" ? 10 : 14), coreMaterial);

    if (variant !== "D" || leafIndex % 2 === 0) {
      const width = (variant === "C" ? 0.18 : 0.14) * lerp(0.72, 1.15, 1 - sideFalloff * 0.35);
      const offset = new THREE.Vector3(-Math.sin(angle) * width, -0.08 - droop * 0.04, Math.cos(angle) * width * 0.38);
      const outline = new THREE.QuadraticBezierCurve3(
        crownPoint.clone().lerp(tip, 0.12).add(offset.clone().multiplyScalar(0.16)),
        control.clone().add(offset.clone().multiplyScalar(0.55)),
        tip.clone().add(offset),
      );
      addCurve(outline.getPoints(variant === "D" ? 8 : 11), variant === "C" ? auraMaterial : dimMaterial);
    }
  }

  if (variant === "A" || variant === "C") {
    const outlinePoints: THREE.Vector3[] = [];
    const outlineSegments = variant === "C" ? 28 : 20;
    for (let segment = 0; segment <= outlineSegments; segment += 1) {
      const angle = (segment / outlineSegments) * Math.PI * 2;
      outlinePoints.push(crownPoint.clone().add(new THREE.Vector3(
        Math.cos(angle) * crownRadius * 0.94,
        Math.sin(angle) * crownRadius * 0.56 - 0.1,
        Math.sin(angle) * 0.18,
      )));
    }
    addCurve(outlinePoints, variant === "C" ? auraMaterial : dimMaterial);
  }

  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x7ff8ff, transparent: true, opacity: 0.9 }),
  );
  crown.position.copy(crownPoint);
  palm.add(crown);
  return palm;
}

function setupThreeScene() {
  scene.background = makeSkyTexture();
  camera.position.copy(worldScene.cameraPosition);
  camera.lookAt(worldScene.cameraTarget);

  const roadMaterial = new THREE.MeshBasicMaterial({ color: 0x090a22 });
  const roadLength = worldScene.nearZ - worldScene.horizonZ;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(worldScene.roadWidth, roadLength), roadMaterial);
  road.rotation.x = -Math.PI * 0.5;
  road.position.set(0, -0.02, (worldScene.nearZ + worldScene.horizonZ) * 0.5);
  roadScene.road = road;
  scene.add(road);

  for (const x of [-worldScene.roadWidth * 0.5, worldScene.roadWidth * 0.5]) {
    const strip = makeGroundStrip(0xff4fd8, 0.98, 0.26);
    setStripAlongZ(strip, x, worldScene.nearZ, worldScene.horizonZ, 0.09, 0.28);
    roadScene.roadEdges.push(strip);
    scene.add(strip.glow, strip.core);
  }

  const roadHalf = worldScene.roadWidth * 0.5;
  const gridStyle = activeGridStyle();
  for (const side of [-1, 1]) {
    for (let x = roadHalf + worldScene.gridSpacing; x <= worldScene.gridOuterWidth; x += worldScene.gridSpacing) {
      const strip = makeLaserGroundStrip("x", gridStyle);
      setStripAlongZ(strip, side * x, worldScene.nearZ, worldScene.horizonZ, gridStyle.longCoreWidth, gridStyle.longGlowWidth);
      roadScene.gridLongLines.push(strip);
      scene.add(strip.glow, strip.core);
    }
  }

  const crossLineCount = gridPoolSlotCount();
  roadScene.gridSlotCount = crossLineCount;
  roadScene.palmGroupCount = crossLineCount / 3;
  roadScene.dashSlotCount = poolCountForSpacing(worldScene.dashSpacing, 8);
  for (let i = 0; i < crossLineCount; i += 1) {
    for (const side of [-1, 1]) {
      const strip = makeLaserGroundStrip("y", gridStyle);
      setStripAlongX(strip, side * roadHalf, side * worldScene.gridOuterWidth, worldScene.nearZ, gridStyle.crossCoreWidth, gridStyle.crossGlowWidth);
      strip.core.userData.side = side;
      strip.core.userData.index = i;
      strip.glow.userData.side = side;
      strip.glow.userData.index = i;
      roadScene.gridCrossLines.push(strip);
      scene.add(strip.glow, strip.core);

      if (previewMode.grid === "D") {
        const ghost = makeLaserGroundStrip("y", gridStyle);
        setStripAlongX(ghost, side * roadHalf, side * worldScene.gridOuterWidth, worldScene.nearZ, gridStyle.crossCoreWidth * 0.8, gridStyle.crossGlowWidth * 1.25);
        ghost.core.userData.side = side;
        ghost.core.userData.index = i + 0.42;
        ghost.glow.userData.side = side;
        ghost.glow.userData.index = i + 0.42;
        (ghost.core.material as THREE.MeshBasicMaterial).opacity = 0.42;
        (ghost.glow.material as THREE.MeshBasicMaterial).opacity = 0.3;
        roadScene.gridCrossLines.push(ghost);
        scene.add(ghost.glow, ghost.core);
      }
    }
  }

  if (previewMode.grid === "C") {
    const texture = makePreviewGridHorizonGlowTexture();
    if (texture) {
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
          opacity: 1,
        }),
      );
      glow.position.set(0, 0.7, worldScene.horizonZ + 1.2);
      glow.scale.set(132, 16, 1);
      glow.renderOrder = 2;
      scene.add(glow);
    }
  }

  const dashMaterial = new THREE.MeshBasicMaterial({
    color: 0x5dfcff,
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const lanePosition of [0.5, 1.5]) {
    for (let i = 0; i < roadScene.dashSlotCount; i += 1) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 4.2), dashMaterial);
      dash.rotation.x = -Math.PI * 0.5;
      dash.position.x = laneToWorldX(lanePosition);
      dash.position.y = 0.06;
      dash.userData.index = i;
      dash.userData.lanePosition = lanePosition;
      roadScene.dashes.push(dash);
      scene.add(dash);
    }
  }

  const sunTexture = drawSunTexture(0);
  if (sunTexture) {
    roadScene.sunTexture = sunTexture;
    const sunMaterial = new THREE.SpriteMaterial({ map: sunTexture, transparent: true, depthWrite: false });
    const sun = new THREE.Sprite(sunMaterial);
    sun.position.set(0, 7.6, worldScene.horizonZ - 8);
    sun.scale.set(22, 22, 1);
    sun.renderOrder = 1;
    roadScene.sunSprite = sun;
    scene.add(sun);
  }

  const glowTexture = makeHorizonGlowTexture();
  if (glowTexture) {
    roadScene.glowTexture = glowTexture;
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.4,
      }),
    );
    glow.position.set(0, 4.2, worldScene.horizonZ + 0.8);
    glow.scale.set(96, 18, 1);
    glow.renderOrder = 4;
    roadScene.glowSprite = glow;
    scene.add(glow);
  }

  const horizonPinkTexture = makeHorizonPinkBandTexture();
  if (horizonPinkTexture) {
    roadScene.horizonPinkTexture = horizonPinkTexture;
    const horizonPink = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: horizonPinkTexture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.72,
      }),
    );
    horizonPink.position.set(0, 1.5, worldScene.horizonZ - 0.4);
    horizonPink.scale.set(48, 3.4, 1);
    horizonPink.renderOrder = 2.4;
    roadScene.horizonPinkSprite = horizonPink;
    scene.add(horizonPink);
  }

  const buildingMaterial = new THREE.MeshBasicMaterial({ color: 0x050612 });
  skylineBars.forEach(([x, baseHeight, barWidth], index) => {
    const worldX = (x / 1600 - 0.5) * 54;
    const worldW = (barWidth / 1600) * 54;
    const silhouetteScale = skylineSilhouetteScale(x + barWidth * 0.5);
    const h = baseHeight * 0.028 * skylineGeometryHeightScale * silhouetteScale;
    const building = new THREE.Mesh(new THREE.PlaneGeometry(worldW, h), buildingMaterial.clone());
    building.position.set(worldX + worldW * 0.5, h * 0.5, worldScene.horizonZ);
    building.userData.baseHeight = h;
    building.userData.baseX = worldX + worldW * 0.5;
    building.userData.index = index;
    building.userData.blockIndex = skylineBlockForBuilding(index);
    building.userData.beatSectionIndex = skylineBeatSectionForBuilding(index);
    building.userData.silhouetteScale = silhouetteScale;
    building.renderOrder = 3;
    roadScene.buildings.push(building);
    scene.add(building);
  });

  for (const side of [-1, 1]) {
    for (let i = 0; i < roadScene.palmGroupCount; i += 1) {
      const palm = makePalmGroup(side, i);
      palm.userData.side = side;
      palm.userData.index = i;
      roadScene.palms.push(palm);
      scene.add(palm);
    }
  }
}

function updateThreeScene(time: number) {
  const nearZ = visualNearZ();
  const farZ = worldScene.horizonZ;
  const rangeZ = nearZ - farZ;
  const scroll = state.reducedMotion ? 0 : roadScroll;
  const gridStyle = activeGridStyle();

  if (Number.isNaN(roadScene.visualNearZ) || Math.abs(roadScene.visualNearZ - nearZ) > 0.001) {
    roadScene.visualNearZ = nearZ;

    if (roadScene.road) {
      const roadLength = rangeZ;
      roadScene.road.geometry.dispose();
      roadScene.road.geometry = new THREE.PlaneGeometry(worldScene.roadWidth, roadLength);
      roadScene.road.position.z = (nearZ + farZ) * 0.5;
    }

    roadScene.roadEdges.forEach((strip) => {
      setStripAlongZ(strip, strip.core.position.x, nearZ, farZ, 0.09, 0.28);
    });

    roadScene.gridLongLines.forEach((strip) => {
      setStripAlongZ(strip, strip.core.position.x, nearZ, farZ, gridStyle.longCoreWidth, gridStyle.longGlowWidth);
    });
  }

  roadScene.dashes.forEach((dash) => {
    const index = dash.userData.index as number;
    dash.position.x = laneToWorldX(dash.userData.lanePosition as number);
    dash.position.z = dashLineZ(index, nearZ, scroll);
  });

  roadScene.gridCrossLines.forEach((strip) => {
    const side = strip.core.userData.side as number;
    const index = strip.core.userData.index as number;
    const z = gridCrossLineZ(index, nearZ, scroll);
    const roadHalf = worldScene.roadWidth * 0.5;
    const outer = side * worldScene.gridOuterWidth;
    const inner = side * roadHalf;
    setStripAlongX(strip, inner, outer, z, gridStyle.crossCoreWidth, gridStyle.crossGlowWidth);
  });

  roadScene.palms.forEach((palm) => {
    const side = palm.userData.side as number;
    const index = palm.userData.index as number;
    const z = palmGroupZ(index, nearZ, scroll);
    palm.position.set(side * (worldScene.roadWidth * 0.5 + 1.25), 0.02, z);
    palm.scale.setScalar(1.18);
    palm.rotation.y = side < 0 ? 0.18 : -0.18;
  });

  const skylineHeightScale = lerp(1.2, 1.48, responsiveDriveAmount());
  const audioInfluence = skylineAudioInfluence();
  const skylineBeatLift = currentSkylineBeatLift();

  roadScene.buildings.forEach((building) => {
    const blockIndex = building.userData.blockIndex as number;
    const beatSectionIndex = building.userData.beatSectionIndex as number;
    const baseHeight = building.userData.baseHeight as number;
    const baseX = building.userData.baseX as number;
    const skylineFraction = lerp(0.78, 0.7, responsiveDriveAmount());
    const skylineScale = worldUnitsForScreenWidthAt(worldScene.horizonZ, 0, skylineFraction) / 54;
    const basePulse = skylineBasePulse();
    const blockPulse = skylineBlockPulse(blockIndex);
    const beatPulse = skylineBeatSectionPulse(beatSectionIndex);
    const beatOffset = beatPulse * skylineBeatLift;
    const musicMotionOffset =
      basePulse * skylineBaseMotionScale +
      blockPulse * skylineHeightMotionScale +
      beatOffset;
    building.userData.basePulse = basePulse;
    building.userData.blockPulse = blockPulse;
    building.userData.beatPulse = beatPulse;
    building.userData.beatOffset = beatOffset * skylineMusicMotionHeightScale;
    const h =
      baseHeight * skylineHeightScale +
      musicMotionOffset * skylineMusicMotionHeightScale;
    building.position.x = baseX * skylineScale;
    building.scale.y = h / baseHeight;
    building.scale.x = skylineScale;
    building.position.y = h * 0.5;
    const material = building.material as THREE.MeshBasicMaterial;
    const glow = shouldPlayBgm()
      ? clamp(
          (basePulse - 0.12) * 0.28 +
            blockPulse * 0.62 +
            Math.abs(beatPulse) * 0.3 +
            bgmBrightness * 0.24 * audioInfluence,
          0,
          1,
        )
      : 0;
    material.color.setRGB(0.018 + glow * 0.032, 0.02 + glow * 0.022, 0.07 + glow * 0.085);
  });

  if (roadScene.sunTexture && time - roadScene.sunTextureLastUpdate > sunTextureUpdateInterval) {
    const next = drawSunTexture(time);
    if (next && roadScene.sunSprite?.material.map) {
      roadScene.sunSprite.material.map.dispose();
      roadScene.sunSprite.material.map = next;
      roadScene.sunSprite.material.needsUpdate = true;
      roadScene.sunTexture = next;
      roadScene.sunTextureLastUpdate = time;
    }
  }

  if (roadScene.sunSprite) {
    const targetSunCircleFraction = lerp(0.31, 0.28, responsiveDriveAmount());
    const sunVerticalMargin = Math.max(10, height * 0.018);
    const cutOffset = sunTextureHorizonCut - 0.5;
    const topOffset = cutOffset + sunTextureCircleDiameter * 0.5;
    const sunCircleFraction = Math.min(
      targetSunCircleFraction,
      Math.max(
        0.18,
        ((trackHorizonY() - sunVerticalMargin) * sunTextureCircleDiameter) / (width * topOffset),
      ),
    );
    const sunSpriteFraction = sunCircleFraction / sunTextureCircleDiameter;
    const sunZ = worldScene.horizonZ - 8;
    const sunSpriteWidthPx = width * sunSpriteFraction;
    const sunCenterScreenY = trackHorizonY() - sunSpriteWidthPx * cutOffset;
    const sunY = worldYForScreenYAtZ(sunCenterScreenY, sunZ);
    const sunWorldWidth = worldUnitsForScreenWidthAt(sunZ, sunY, sunSpriteFraction);
    roadScene.sunSprite.position.set(0, sunY, sunZ);
    roadScene.sunSprite.scale.set(sunWorldWidth, sunWorldWidth, 1);
  }

  if (roadScene.glowSprite) {
    const glowY = lerp(4.1, 5, responsiveDriveAmount());
    const glowZ = worldScene.horizonZ + 0.8;
    const glowWidth = worldUnitsForScreenWidthAt(glowZ, glowY, lerp(0.88, 0.82, responsiveDriveAmount()));
    roadScene.glowSprite.position.set(0, glowY, glowZ);
    roadScene.glowSprite.scale.set(glowWidth, glowWidth * 0.22, 1);
  }

  if (roadScene.horizonPinkSprite) {
    const bandZ = worldScene.horizonZ - 0.4;
    const bandHeight = lerp(3.15, 3.55, responsiveDriveAmount());
    const bandY = bandHeight * 0.44;
    const bandWidth = worldUnitsForScreenWidthAt(bandZ, bandY, lerp(0.72, 0.68, responsiveDriveAmount()));
    roadScene.horizonPinkSprite.position.set(0, bandY, bandZ);
    roadScene.horizonPinkSprite.scale.set(bandWidth, bandHeight, 1);
  }

  updateVehicleSprites();
  renderer.render(scene, camera);
}

function drawBackground(time: number) {
  updateThreeScene(time);
  ctx.clearRect(0, 0, width, height);
}

function skylineBlockForBuilding(index: number) {
  return Math.min(skylineBlockCount - 1, Math.floor((index * skylineBlockCount) / skylineBars.length));
}

function skylineBeatSectionForBuilding(index: number) {
  return Math.min(
    skylineBeatSectionCount - 1,
    Math.floor((index * skylineBeatSectionCount) / skylineBars.length),
  );
}

function currentSkylineBeatLift() {
  const skylineHeightScale = lerp(1.2, 1.48, responsiveDriveAmount());
  const shortestStretchedBuildingHeight = roadScene.buildings.reduce(
    (shortest, building) =>
      Math.min(shortest, (building.userData.baseHeight as number) * skylineHeightScale),
    Number.POSITIVE_INFINITY,
  );
  return Number.isFinite(shortestStretchedBuildingHeight)
    ? shortestStretchedBuildingHeight * skylineBeatLiftRatio
    : 0;
}

function skylineSilhouetteScale(pixelCenter: number) {
  const first = skylineBars[0];
  const last = skylineBars[skylineBars.length - 1];
  const minX = first[0];
  const maxX = last[0] + last[2];
  const center = (minX + maxX) * 0.5;
  const halfSpan = Math.max(1, (maxX - minX) * 0.5);
  const centerWeight = 1 - clamp(Math.abs(pixelCenter - center) / halfSpan, 0, 1);
  return lerp(0.56, 1.06, Math.pow(centerWeight, 0.72));
}

function skylineBandForBlock(blockIndex: number) {
  const center = (skylineBlockCount - 1) * 0.5;
  return Math.min(skylineBandRanges.length - 1, Math.round(Math.abs(blockIndex - center)));
}

function skylineBasePulse() {
  if (!shouldPlayBgm() || skylineEnvelope <= 0.015) return 0.12;
  const influence = skylineAudioInfluence();
  const driven = clamp(0.14 + skylineEnvelope * 0.42 + bgmPulse * 0.1, 0.14, 0.64);
  return lerp(0.12, driven, influence);
}

function skylineBlockPulse(blockIndex: number) {
  const audioActive = shouldPlayBgm() && skylineEnvelope > 0.015;
  if (!audioActive) return 0;
  const influence = skylineAudioInfluence();
  const bandIndex = skylineBandForBlock(blockIndex);
  const center = (skylineBlockCount - 1) * 0.5;
  const centerWeight = 1 - Math.abs(blockIndex - center) / Math.max(1, center);
  const bandEnergy = skylineBandEnergies[bandIndex] ?? 0;
  return clamp(
    Math.pow(clamp(bandEnergy, 0, 1), 0.82) * (0.94 + centerWeight * 0.22) + skylineKick * 0.1,
    0,
    1.22,
  ) * influence;
}

function skylineAudioInfluence() {
  return smoothstep(skylineAudioRamp);
}

function skylineBeatCurve() {
  if (skylineBeatPhase >= 1) return 0;
  const attackEnd = 0.2;
  const troughEnd = 0.64;
  if (skylineBeatPhase <= attackEnd) {
    const attack = skylineBeatPhase / attackEnd;
    return 1 - Math.pow(1 - attack, 3);
  }
  if (skylineBeatPhase <= troughEnd) {
    const fall = clamp((skylineBeatPhase - attackEnd) / (troughEnd - attackEnd), 0, 1);
    const easedFall = fall * fall * (3 - 2 * fall);
    return lerp(1, -1, easedFall);
  }
  const settle = clamp((skylineBeatPhase - troughEnd) / (1 - troughEnd), 0, 1);
  const easedSettle = 1 - Math.pow(1 - settle, 2);
  return lerp(-1, 0, easedSettle);
}

function skylineBeatSectionPulse(sectionIndex: number) {
  if ((skylineBeatMask & (1 << sectionIndex)) === 0) return 0;
  return skylineBeatCurve() * skylineAudioInfluence();
}

function nextSkylineBeatRandom() {
  skylineBeatRandomState ^= skylineBeatRandomState << 13;
  skylineBeatRandomState ^= skylineBeatRandomState >>> 17;
  skylineBeatRandomState ^= skylineBeatRandomState << 5;
  return (skylineBeatRandomState >>> 0) / 0x1_0000_0000;
}

function triggerSkylineHeavyBeat(strength: number) {
  const previousMask = skylineBeatMaskHistory.at(-1) ?? 0;
  let nextMask = previousMask;
  for (let attempt = 0; attempt < 5 && nextMask === previousMask; attempt += 1) {
    nextMask = 1 + Math.floor(nextSkylineBeatRandom() * ((1 << skylineBeatSectionCount) - 2));
  }
  if (nextMask === previousMask) {
    nextMask = previousMask === 1 ? 2 : 1;
  }
  skylineBeatMask = nextMask;
  skylineBeatPhase = 0;
  skylineBeatCooldown = skylineBeatCooldownDuration;
  skylineBeatStrength = clamp(strength, 0.72, 1);
  skylineBeatCount += 1;
  skylineBeatMaskHistory.push(nextMask);
  if (skylineBeatMaskHistory.length > 10) skylineBeatMaskHistory.shift();
}

function advanceSkylineBeat(dt: number) {
  skylineBeatCooldown = Math.max(0, skylineBeatCooldown - dt);
  if (skylineBeatPhase < 1) {
    skylineBeatPhase = Math.min(1, skylineBeatPhase + dt / skylineBeatDuration);
    if (skylineBeatPhase >= 1) {
      skylineBeatMask = 0;
      skylineBeatStrength = 0;
    }
  }
}


interface VehiclePalette {
  body: Array<[number, string]>;
  upper: Array<[number, string]>;
  side: Array<[number, string]>;
  tail: Array<[number, string]>;
  bumper: Array<[number, string]>;
  plate: Array<[number, string]>;
  spoiler: Array<[number, string]>;
  glow: string;
  shade: string;
  ventDark: string;
  ventBright: string;
  lampRed: string;
  lampDark: string;
  lampAmber: string;
  exhaust: string;
}

const playerVehiclePalette: VehiclePalette = {
  body: [
    [0, "#566070"],
    [0.17, "#f4f7ff"],
    [0.35, "#a7b2c2"],
    [0.5, "#ffffff"],
    [0.66, "#939fb1"],
    [0.83, "#f8fbff"],
    [1, "#505b6c"],
  ],
  upper: [
    [0, "#7f8b9d"],
    [0.22, "#f9fcff"],
    [0.45, "#c6ceda"],
    [0.58, "#ffffff"],
    [0.82, "#98a5b6"],
    [1, "#657184"],
  ],
  side: [
    [0, "#f9fcff"],
    [1, "#9faabb"],
  ],
  tail: [
    [0, "#697588"],
    [0.24, "#e8eef7"],
    [0.5, "#b9c3d1"],
    [0.76, "#f8fbff"],
    [1, "#667284"],
  ],
  bumper: [
    [0, "#071022"],
    [0.28, "#16315a"],
    [0.5, "#0d2142"],
    [0.72, "#1c3b66"],
    [1, "#060d1c"],
  ],
  plate: [
    [0, "#d9e0ea"],
    [1, "#a5afbd"],
  ],
  spoiler: [
    [0, "#050817"],
    [0.14, "#20283a"],
    [0.5, "#f5f8ff"],
    [0.86, "#20283a"],
    [1, "#050817"],
  ],
  glow: "#ff4fd8",
  shade: "#758294",
  ventDark: "#07101f",
  ventBright: "#edf3fb",
  lampRed: "#b8352f",
  lampDark: "#6b1b24",
  lampAmber: "#d56936",
  exhaust: "#eef3fb",
};

const obstacleVehiclePalettes: VehiclePalette[] = [
  {
    body: [
      [0, "#5c080e"],
      [0.28, "#ff6069"],
      [0.49, "#ffebeb"],
      [0.67, "#ff5962"],
      [1, "#52060c"],
    ],
    upper: [
      [0, "#8d1018"],
      [0.34, "#ff555d"],
      [0.5, "#ffd6d6"],
      [0.66, "#d71924"],
      [1, "#780b13"],
    ],
    side: [
      [0, "#ff4b53"],
      [1, "#8c111a"],
    ],
    tail: [
      [0, "#8e1018"],
      [0.36, "#df1c27"],
      [0.52, "#ff656b"],
      [0.72, "#c81520"],
      [1, "#770b13"],
    ],
    bumper: [
      [0, "#8e1018"],
      [0.36, "#df1c27"],
      [0.52, "#ff656b"],
      [0.72, "#c81520"],
      [1, "#770b13"],
    ],
    plate: [
      [0, "#e73640"],
      [1, "#8b1018"],
    ],
    spoiler: [
      [0, "#050817"],
      [0.16, "#3a0d14"],
      [0.5, "#ff6d74"],
      [0.84, "#3a0d14"],
      [1, "#050817"],
    ],
    glow: "#5dfcff",
    shade: "#7d1018",
    ventDark: "#080814",
    ventBright: "#ff8e8e",
    lampRed: "#b8352f",
    lampDark: "#6b1b24",
    lampAmber: "#d56936",
    exhaust: "#ffb5b5",
  },
  {
    body: [
      [0, "#747e8e"],
      [0.3, "#ffffff"],
      [0.5, "#ffffff"],
      [0.69, "#ebf0f8"],
      [1, "#667080"],
    ],
    upper: [
      [0, "#b8c1ce"],
      [0.38, "#ffffff"],
      [0.53, "#ffffff"],
      [0.7, "#e2e8f1"],
      [1, "#9aa5b5"],
    ],
    side: [
      [0, "#ffffff"],
      [1, "#aeb8c7"],
    ],
    tail: [
      [0, "#9ea8b7"],
      [0.38, "#f8fbff"],
      [0.52, "#ffffff"],
      [0.72, "#d7dee9"],
      [1, "#8d98a8"],
    ],
    bumper: [
      [0, "#8e1018"],
      [0.35, "#e51e2a"],
      [0.52, "#ff7377"],
      [0.72, "#c81520"],
      [1, "#790b13"],
    ],
    plate: [
      [0, "#e8edf5"],
      [1, "#a9b4c2"],
    ],
    spoiler: [
      [0, "#050817"],
      [0.16, "#273044"],
      [0.5, "#ffffff"],
      [0.84, "#273044"],
      [1, "#050817"],
    ],
    glow: "#ff4b3e",
    shade: "#9aa3b0",
    ventDark: "#07101f",
    ventBright: "#f7fbff",
    lampRed: "#b8352f",
    lampDark: "#6b1b24",
    lampAmber: "#d56936",
    exhaust: "#f7fbff",
  },
  {
    body: [
      [0, "#684809"],
      [0.3, "#ffd33d"],
      [0.5, "#ffffd2"],
      [0.68, "#ffc72a"],
      [1, "#604107"],
    ],
    upper: [
      [0, "#9b6b15"],
      [0.34, "#ffe45a"],
      [0.5, "#fff8bf"],
      [0.66, "#f5bd28"],
      [1, "#80530e"],
    ],
    side: [
      [0, "#ffe85f"],
      [1, "#b98118"],
    ],
    tail: [
      [0, "#9c6a13"],
      [0.36, "#f2bd29"],
      [0.52, "#fff080"],
      [0.72, "#d79a1d"],
      [1, "#80530e"],
    ],
    bumper: [
      [0, "#9c6a13"],
      [0.36, "#f2bd29"],
      [0.52, "#fff080"],
      [0.72, "#d79a1d"],
      [1, "#80530e"],
    ],
    plate: [
      [0, "#efbd2c"],
      [1, "#9d6b14"],
    ],
    spoiler: [
      [0, "#090b12"],
      [0.18, "#555d6b"],
      [0.5, "#bfc6d1"],
      [0.82, "#555d6b"],
      [1, "#090b12"],
    ],
    glow: "#5dfcff",
    shade: "#9f7620",
    ventDark: "#080814",
    ventBright: "#ffe98a",
    lampRed: "#b8352f",
    lampDark: "#6b1b24",
    lampAmber: "#d56936",
    exhaust: "#ffe98a",
  },
];

interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function fillPolygon(points: Array<[number, number]>) {
  paintCtx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) paintCtx.moveTo(x, y);
    else paintCtx.lineTo(x, y);
  });
  paintCtx.closePath();
  paintCtx.fill();
}

function rectPct(carW: number, carH: number, left: number, top: number, rectW: number, rectH: number): SpriteRect {
  return {
    x: -carW * 0.5 + carW * left,
    y: -carH * 0.5 + carH * top,
    w: carW * rectW,
    h: carH * rectH,
  };
}

function rectLR(carW: number, carH: number, left: number, right: number, top: number, rectH: number): SpriteRect {
  return rectPct(carW, carH, left, top, 1 - left - right, rectH);
}

function polygonFromRect(rect: SpriteRect, points: Array<[number, number]>) {
  return points.map(([x, y]) => [rect.x + rect.w * x, rect.y + rect.h * y] as [number, number]);
}

function makeGradient(rect: SpriteRect, stops: Array<[number, string]>, axis: "x" | "y" = "x") {
  const gradient =
    axis === "x"
      ? paintCtx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y)
      : paintCtx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  stops.forEach(([stop, color]) => gradient.addColorStop(stop, color));
  return gradient;
}

function clipPolygon(points: Array<[number, number]>) {
  paintCtx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) paintCtx.moveTo(x, y);
    else paintCtx.lineTo(x, y);
  });
  paintCtx.closePath();
  paintCtx.clip();
}

function drawPolygonPart(rect: SpriteRect, points: Array<[number, number]>, fill: string | CanvasGradient) {
  paintCtx.fillStyle = fill;
  fillPolygon(polygonFromRect(rect, points));
}

function drawSideVent(rect: SpriteRect, side: "left" | "right", palette: VehiclePalette) {
  const polygon =
    side === "left"
      ? [
          [0, 0.68],
          [0.19, 0.26],
          [1, 0],
          [0.78, 1],
          [0.1, 0.94],
        ]
      : [
          [0, 0],
          [0.81, 0.26],
          [1, 0.68],
          [0.9, 0.94],
          [0.22, 1],
        ];

  paintCtx.save();
  clipPolygon(polygonFromRect(rect, polygon as Array<[number, number]>));
  paintCtx.fillStyle = makeGradient(rect, palette.side, "y");
  paintCtx.fillRect(rect.x, rect.y, rect.w, rect.h);

  paintCtx.fillStyle = palette.ventDark;
  const stripeCount = 5;
  for (let index = 0; index < stripeCount; index += 1) {
    const x = rect.x + rect.w * (0.18 + index * 0.14);
    paintCtx.save();
    paintCtx.translate(x, rect.y + rect.h * 0.5);
    paintCtx.rotate(side === "left" ? 0.18 : -0.18);
    paintCtx.fillRect(-rect.w * 0.035, -rect.h * 0.42, rect.w * 0.07, rect.h * 0.84);
    paintCtx.restore();
  }

  paintCtx.fillStyle = palette.ventBright;
  paintCtx.globalAlpha = 0.42;
  paintCtx.fillRect(rect.x, rect.y, rect.w, Math.max(1, rect.h * 0.12));
  paintCtx.globalAlpha = 1;
  paintCtx.restore();
}

function drawCenterVent(rect: SpriteRect, palette: VehiclePalette) {
  const polygon: Array<[number, number]> = [
    [0.16, 0],
    [0.84, 0],
    [1, 1],
    [0, 1],
  ];
  paintCtx.save();
  clipPolygon(polygonFromRect(rect, polygon));
  paintCtx.fillStyle = palette.ventDark;
  paintCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
  paintCtx.fillStyle = palette.shade;
  for (let index = 0; index < 5; index += 1) {
    const x = rect.x + rect.w * (0.2 + index * 0.14);
    paintCtx.fillRect(x, rect.y, rect.w * 0.07, rect.h);
  }
  paintCtx.restore();
}

function drawVehicle(w: number, h: number, palette: VehiclePalette, broken = false) {
  paintCtx.save();

  // Vehicle sprite spec mirrors references/mockups/car-design-options.html:
  // the same 0-100% part boxes, clip polygons, and paint roles are used here.
  // The live canvas omits rectangular frame-like shadows so the car reads as
  // bodywork instead of a sprite pasted inside a black box.

  // z-index 1: wheels.
  paintCtx.fillStyle = "#050512";
  const wheelLeft = rectPct(w, h, 0.03, 0.72, 0.11, 0.3);
  const wheelRight = rectPct(w, h, 0.86, 0.72, 0.11, 0.3);
  paintCtx.fillRect(wheelLeft.x, wheelLeft.y, wheelLeft.w, wheelLeft.h);
  paintCtx.fillRect(wheelRight.x, wheelRight.y, wheelRight.w, wheelRight.h);
  paintCtx.fillStyle = "#24283f";
  paintCtx.fillRect(wheelLeft.x, wheelLeft.y, Math.max(2, w * 0.012), wheelLeft.h);
  paintCtx.fillRect(wheelRight.x + wheelRight.w - Math.max(2, w * 0.012), wheelRight.y, Math.max(2, w * 0.012), wheelRight.h);

  // z-index 3: main body and details.
  const body = rectLR(w, h, 0.03, 0.03, 0.44, 0.39);
  drawPolygonPart(
    body,
    [
      [0.04, 0.24],
      [0.19, 0],
      [0.81, 0],
      [0.96, 0.24],
      [1, 0.62],
      [0.91, 1],
      [0.09, 1],
      [0, 0.62],
    ],
    makeGradient(body, palette.body, "x"),
  );

  const upper = rectLR(w, h, 0.18, 0.18, 0.06, 0.48);
  drawPolygonPart(
    upper,
    [
      [0.1, 1],
      [0.22, 0.1],
      [0.78, 0.1],
      [0.9, 1],
    ],
    makeGradient(upper, palette.upper, "x"),
  );

  drawCenterVent(rectLR(w, h, 0.39, 0.39, 0.25, 0.24), palette);
  drawSideVent(rectPct(w, h, 0.09, 0.33, 0.19, 0.24), "left", palette);
  drawSideVent(rectPct(w, h, 0.72, 0.33, 0.19, 0.24), "right", palette);

  const tailPanel = rectLR(w, h, 0.12, 0.12, 0.64, 0.14);
  paintCtx.fillStyle = makeGradient(tailPanel, palette.tail, "x");
  paintCtx.fillRect(tailPanel.x, tailPanel.y, tailPanel.w, tailPanel.h);
  paintCtx.fillStyle = palette.shade;
  paintCtx.fillRect(tailPanel.x, tailPanel.y, tailPanel.w, Math.max(2, h * 0.025));

  const plate = rectLR(w, h, 0.42, 0.42, 0.67, 0.07);
  paintCtx.fillStyle = makeGradient(plate, palette.plate, "y");
  paintCtx.fillRect(plate.x, plate.y, plate.w, plate.h);

  const tailLightLeft = rectPct(w, h, 0.08, 0.67, 0.27, 0.09);
  const tailLightRight = rectPct(w, h, 0.65, 0.67, 0.27, 0.09);
  paintCtx.fillStyle = "#192033";
  [tailLightLeft, tailLightRight].forEach((rect) => {
    paintCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
    paintCtx.fillStyle = palette.lampRed;
    paintCtx.fillRect(rect.x + rect.w * 0.08, rect.y + rect.h * 0.16, rect.w * 0.3, rect.h * 0.68);
    paintCtx.fillStyle = palette.lampDark;
    paintCtx.fillRect(rect.x + rect.w * 0.38, rect.y + rect.h * 0.16, rect.w * 0.32, rect.h * 0.68);
    paintCtx.fillStyle = palette.lampAmber;
    paintCtx.fillRect(rect.x + rect.w * 0.7, rect.y + rect.h * 0.16, rect.w * 0.22, rect.h * 0.68);
    paintCtx.fillStyle = "#192033";
  });

  const bumper = rectLR(w, h, 0.08, 0.08, 0.77, 0.11);
  drawPolygonPart(
    bumper,
    [
      [0, 0],
      [1, 0],
      [0.96, 1],
      [0.04, 1],
    ],
    makeGradient(bumper, palette.bumper, "x"),
  );

  const diffuser = rectLR(w, h, 0.23, 0.23, 0.83, 0.125);
  paintCtx.fillStyle = "#050512";
  drawPolygonPart(diffuser, [
    [0.08, 0],
    [0.92, 0],
    [1, 0.5],
    [0.92, 1],
    [0.08, 1],
    [0, 0.5],
  ], "#050512");

  const exhaustLeft = rectPct(w, h, 0.315, 0.857, 0.17, 0.085);
  const exhaustRight = rectPct(w, h, 0.515, 0.857, 0.17, 0.085);
  paintCtx.strokeStyle = palette.exhaust;
  paintCtx.lineWidth = Math.max(1.5, w * 0.012);
  [exhaustLeft, exhaustRight].forEach((rect) => {
    [0.34, 0.66].forEach((cx) => {
      paintCtx.beginPath();
      paintCtx.ellipse(rect.x + rect.w * cx, rect.y + rect.h * 0.5, rect.w * 0.12, rect.h * 0.28, 0, 0, Math.PI * 2);
      paintCtx.stroke();
    });
  });

  // The preview spoiler bar is intentionally not drawn in-game: at runtime
  // perspective scaling made the previous shadow read as a black frame, so the
  // restored spoiler keeps only body-colored metal and slim supports.
  const supportBox = rectLR(w, h, 0.13, 0.13, 0.3, 0.25);
  paintCtx.fillStyle = "rgba(7, 8, 28, 0.74)";
  paintCtx.fillRect(supportBox.x + supportBox.w * 0.11, supportBox.y, supportBox.w * 0.032, supportBox.h);
  paintCtx.fillRect(supportBox.x + supportBox.w * 0.858, supportBox.y, supportBox.w * 0.032, supportBox.h);

  const spoiler = rectLR(w, h, -0.01, -0.01, 0.24, 0.052);
  paintCtx.fillStyle = makeGradient(spoiler, palette.spoiler, "x");
  paintCtx.fillRect(spoiler.x, spoiler.y, spoiler.w, spoiler.h);
  paintCtx.fillStyle = "rgba(255, 255, 255, 0.5)";
  paintCtx.fillRect(spoiler.x, spoiler.y, spoiler.w, Math.max(1, h * 0.01));

  if (broken) {
    paintCtx.save();
    paintCtx.globalCompositeOperation = "source-atop";
    paintCtx.fillStyle = "rgba(3, 4, 12, 0.48)";
    paintCtx.fillRect(-w * 0.58, -h * 0.58, w * 1.16, h * 1.16);
    paintCtx.restore();
    paintCtx.strokeStyle = "rgba(7, 8, 28, 0.88)";
    paintCtx.lineWidth = Math.max(2, w * 0.018);
    paintCtx.beginPath();
    paintCtx.moveTo(-w * 0.28, h * 0.08);
    paintCtx.lineTo(-w * 0.08, h * 0.22);
    paintCtx.lineTo(-w * 0.18, h * 0.42);
    paintCtx.moveTo(w * 0.24, h * 0.02);
    paintCtx.lineTo(w * 0.04, h * 0.22);
    paintCtx.lineTo(w * 0.16, h * 0.38);
    paintCtx.stroke();
  }

  paintCtx.restore();
}

function drawNeonBarrier(w: number, h: number) {
  paintCtx.save();
  paintCtx.shadowColor = "#ffb347";
  paintCtx.shadowBlur = Math.max(8, w * 0.08);

  paintCtx.fillStyle = "rgba(0, 0, 0, 0.34)";
  paintCtx.fillRect(-w * 0.58, h * 0.22, w * 1.16, h * 0.2);

  paintCtx.fillStyle = "#151044";
  paintCtx.fillRect(-w * 0.5, -h * 0.22, w, h * 0.44);
  paintCtx.strokeStyle = "#ff4fd8";
  paintCtx.lineWidth = Math.max(2, w * 0.025);
  paintCtx.strokeRect(-w * 0.5, -h * 0.22, w, h * 0.44);

  for (let i = -2; i <= 2; i += 1) {
    paintCtx.fillStyle = i % 2 === 0 ? "#ffb347" : "#5dfcff";
    paintCtx.beginPath();
    paintCtx.moveTo(i * w * 0.18 - w * 0.1, h * 0.22);
    paintCtx.lineTo(i * w * 0.18 + w * 0.02, h * 0.22);
    paintCtx.lineTo(i * w * 0.18 + w * 0.18, -h * 0.22);
    paintCtx.lineTo(i * w * 0.18 + w * 0.06, -h * 0.22);
    paintCtx.closePath();
    paintCtx.fill();
  }

  paintCtx.fillStyle = "#ff4fd8";
  paintCtx.fillRect(-w * 0.42, -h * 0.34, w * 0.16, h * 0.12);
  paintCtx.fillRect(w * 0.26, -h * 0.34, w * 0.16, h * 0.12);
  paintCtx.fillStyle = "#07081c";
  paintCtx.fillRect(-w * 0.46, h * 0.22, w * 0.14, h * 0.26);
  paintCtx.fillRect(w * 0.32, h * 0.22, w * 0.14, h * 0.26);

  paintCtx.restore();
}

function makeVehicleTexture(kind: VehicleSprite["kind"], paletteIndex: number) {
  const spriteCanvas = document.createElement("canvas");
  const spriteCtx = spriteCanvas.getContext("2d");
  if (!spriteCtx) return null;

  const carW = 512;
  const carH = Math.round(carW * (162 / 314));
  const padding = 96;
  spriteCanvas.width = carW + padding * 2;
  spriteCanvas.height = carH + padding * 2;

  const previousCtx = paintCtx;
  paintCtx = spriteCtx;
  spriteCtx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
  spriteCtx.translate(spriteCanvas.width * 0.5, spriteCanvas.height * 0.5);

  if (kind === "barrier") {
    drawNeonBarrier(carW, carH);
  } else {
    const palette =
      kind === "player"
        ? playerVehiclePalette
        : obstacleVehiclePalettes[paletteIndex % obstacleVehiclePalettes.length];
    drawVehicle(carW, carH, palette, kind === "broken");
  }

  paintCtx = previousCtx;
  const texture = new THREE.CanvasTexture(spriteCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const generatedVehicleAssetRoot = "/portfolio-assets/vehicles/home-v55";
const generatedVehicleAssetExtension = "webp";
const obstacleVehicleAssetSlugs = ["sideswipe", "red-alert", "sunstreaker"] as const;
const playerReturnCenterAssetThreshold = 0.24;
const playerLaneVisualFollowSpeed = 10;
const playerReturnCenterVisualFollowSpeed = 15;
const generatedVehicleTextureCache = new Map<string, THREE.Texture>();
const generatedVehicleTextureLoader = new THREE.TextureLoader();

function vehicleLaneAssetSuffix(laneIndex: LaneIndex) {
  if (laneIndex === 0) return "left";
  if (laneIndex === 2) return "right";
  return "center";
}

function generatedVehicleAssetUrl(
  kind: VehicleSprite["kind"],
  paletteIndex: number,
  laneIndex: LaneIndex,
  assetVariant: VehicleAssetVariant,
  wheelFrame: VehicleWheelFrame = 0,
) {
  if (kind === "barrier") return null;
  const slug =
    kind === "player"
      ? "breakdown"
      : obstacleVehicleAssetSlugs[paletteIndex % obstacleVehicleAssetSlugs.length];
  const laneSuffix = vehicleLaneAssetSuffix(laneIndex);
  if (kind === "player") {
    const playerVariant = assetVariant === "damaged-front" ? "damaged-front" : "normal";
    if (playerVariant === "normal" && wheelFrame > 0) {
      return `${generatedVehicleAssetRoot}/${slug}-${playerVariant}-${laneSuffix}-wheel-${wheelFrame}.${generatedVehicleAssetExtension}`;
    }
    return `${generatedVehicleAssetRoot}/${slug}-${playerVariant}-${laneSuffix}.${generatedVehicleAssetExtension}`;
  }
  const obstacleVariant =
    assetVariant === "damaged-diagonal" && laneIndex !== 1
      ? "damaged-diagonal"
      : assetVariant === "damaged-rear" || assetVariant === "damaged-diagonal"
        ? "damaged-rear"
        : "normal";
  if (obstacleVariant === "normal" && wheelFrame > 0) {
    return `${generatedVehicleAssetRoot}/${slug}-${obstacleVariant}-${laneSuffix}-wheel-${wheelFrame}.${generatedVehicleAssetExtension}`;
  }
  return `${generatedVehicleAssetRoot}/${slug}-${obstacleVariant}-${laneSuffix}.${generatedVehicleAssetExtension}`;
}

function generatedVehicleTexture(url: string) {
  const cached = generatedVehicleTextureCache.get(url);
  if (cached) return cached;

  const texture = generatedVehicleTextureLoader.load(
    url,
    (loadedTexture) => {
      loadedTexture.userData.loaded = true;
      loadedTexture.userData.failed = false;
      loadedTexture.needsUpdate = true;
      canvas.dataset.vehicleAssetLoads = String(
        Number(canvas.dataset.vehicleAssetLoads ?? 0) + 1,
      );
    },
    undefined,
    () => {
      texture.userData.failed = true;
      generatedVehicleTextureCache.delete(url);
      canvas.dataset.vehicleAssetFailures = String(
        Number(canvas.dataset.vehicleAssetFailures ?? 0) + 1,
      );
      console.warn(`[neon-drive] Unable to load generated vehicle asset: ${url}`);
    },
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.userData.assetUrl = url;
  texture.userData.loaded = false;
  texture.userData.failed = false;
  generatedVehicleTextureCache.set(url, texture);
  return texture;
}

function generatedVehicleTextureReady(texture: THREE.Texture | null | undefined) {
  if (!texture || texture.userData.failed) return false;
  if (texture.userData.loaded) return true;
  const image = texture.image as HTMLImageElement | undefined;
  return Boolean(image?.complete && (image.naturalWidth || image.width) > 0);
}

function waitForGeneratedVehicleTextures(textures: THREE.Texture[]) {
  if (textures.length === 0) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const check = () => {
      if (textures.every((texture) => generatedVehicleTextureReady(texture) || texture.userData.failed)) {
        resolve(textures.every((texture) => generatedVehicleTextureReady(texture)));
        return;
      }
      window.setTimeout(check, 40);
    };
    check();
  });
}

function preloadGeneratedVehicleAssets() {
  const lanes: LaneIndex[] = [0, 1, 2];
  const wheelFrames: VehicleWheelFrame[] = [1, 2];
  const textures = new Set<THREE.Texture>();
  const queue = (url: string | null) => {
    if (url) textures.add(generatedVehicleTexture(url));
  };
  lanes.forEach((laneIndex) => {
    queue(generatedVehicleAssetUrl("player", 0, laneIndex, "normal", 0));
    queue(generatedVehicleAssetUrl("player", 0, laneIndex, "damaged-front", 0));
    wheelFrames.forEach((wheelFrame) => {
      queue(generatedVehicleAssetUrl("player", 0, laneIndex, "normal", wheelFrame));
    });
    obstacleVehicleAssetSlugs.forEach((_, paletteIndex) => {
      queue(generatedVehicleAssetUrl("traffic", paletteIndex, laneIndex, "normal", 0));
      queue(generatedVehicleAssetUrl("traffic", paletteIndex, laneIndex, "damaged-rear", 0));
      queue(generatedVehicleAssetUrl("traffic", paletteIndex, laneIndex, "damaged-diagonal", 0));
      wheelFrames.forEach((wheelFrame) => {
        queue(generatedVehicleAssetUrl("traffic", paletteIndex, laneIndex, "normal", wheelFrame));
      });
    });
  });
  return waitForGeneratedVehicleTextures([...textures]);
}

let generatedVehicleAssetsReady = Promise.resolve(true);

function createCarMaterial(
  color: number,
  opacity = 1,
  additive = false,
  options: {
    metalness?: number;
    roughness?: number;
    emissive?: number;
    emissiveIntensity?: number;
    side?: THREE.Side;
  } = {},
) {
  const material = additive
    ? new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: options.side,
      })
    : new THREE.MeshStandardMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        metalness: options.metalness ?? 0.42,
        roughness: options.roughness ?? 0.34,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0,
        side: options.side,
      });
  material.userData.baseColor = color;
  material.userData.baseOpacity = opacity;
  return material;
}

function createSectionedCarBodyGeometry(
  sections: Array<{
    z: number;
    lowerWidth: number;
    upperWidth: number;
    bottomY: number;
    topY: number;
  }>,
) {
  const vertices: number[] = [];
  const indices: number[] = [];

  sections.forEach((section) => {
    vertices.push(
      -section.lowerWidth * 0.5, section.bottomY, section.z,
      section.lowerWidth * 0.5, section.bottomY, section.z,
      -section.upperWidth * 0.5, section.topY, section.z,
      section.upperWidth * 0.5, section.topY, section.z,
    );
  });

  for (let sectionIndex = 0; sectionIndex < sections.length - 1; sectionIndex += 1) {
    const a = sectionIndex * 4;
    const b = (sectionIndex + 1) * 4;
    indices.push(
      a, b, b + 1, a, b + 1, a + 1,
      a + 2, a + 3, b + 3, a + 2, b + 3, b + 2,
      a, a + 2, b + 2, a, b + 2, b,
      a + 1, b + 1, b + 3, a + 1, b + 3, a + 3,
    );
  }

  const front = 0;
  const rear = (sections.length - 1) * 4;
  indices.push(
    front, front + 1, front + 3, front, front + 3, front + 2,
    rear, rear + 2, rear + 3, rear, rear + 3, rear + 1,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addSectionedMesh(
  parent: THREE.Group,
  sections: Parameters<typeof createSectionedCarBodyGeometry>[0],
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(createSectionedCarBodyGeometry(sections), material);
  parent.add(mesh);
  return mesh;
}

function createPanelGeometry(points: Array<[number, number, number]>) {
  const vertices = new Float32Array(points.flat());
  const indices: number[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    indices.push(0, index, index + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addPanel(parent: THREE.Group, points: Array<[number, number, number]>, material: THREE.Material) {
  const mesh = new THREE.Mesh(createPanelGeometry(points), material);
  parent.add(mesh);
  return mesh;
}

function createWedgeGeometry(width: number, length: number, frontHeight: number, rearHeight: number) {
  const halfW = width * 0.5;
  const halfL = length * 0.5;
  const vertices = new Float32Array([
    -halfW, 0, -halfL,
    halfW, 0, -halfL,
    halfW, 0, halfL,
    -halfW, 0, halfL,
    -halfW, frontHeight, -halfL,
    halfW, frontHeight, -halfL,
    halfW, rearHeight, halfL,
    -halfW, rearHeight, halfL,
  ]);
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addBox(
  parent: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}

function addWedge(
  parent: THREE.Group,
  width: number,
  length: number,
  frontHeight: number,
  rearHeight: number,
  position: [number, number, number],
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(createWedgeGeometry(width, length, frontHeight, rearHeight), material);
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}

// Retained for fast wedge variants if the vehicle art needs another iteration.
void addWedge;

function addWheel(
  parent: THREE.Group,
  x: number,
  z: number,
  tireMaterial: THREE.Material,
  rimMaterial: THREE.Material,
  radius = 0.34,
  depth = 0.36,
) {
  const side = Math.sign(x) || 1;
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 22), tireMaterial);
  tire.rotation.z = Math.PI * 0.5;
  tire.position.set(x, radius + 0.02, z);
  parent.add(tire);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, depth + 0.03, 18), rimMaterial);
  rim.rotation.z = Math.PI * 0.5;
  rim.position.set(x + side * 0.012, radius + 0.02, z);
  parent.add(rim);

  const hubMaterial = createCarMaterial(0x070814, 0.88, false, { metalness: 0.2, roughness: 0.45 });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, depth + 0.055, 14), hubMaterial);
  hub.rotation.z = Math.PI * 0.5;
  hub.position.set(x + side * 0.018, radius + 0.02, z);
  parent.add(hub);

  for (let index = 0; index < 5; index += 1) {
    const spoke = addBox(parent, [0.035, 0.02, radius * 0.52], [x + side * 0.04, radius + 0.02, z], rimMaterial);
    spoke.rotation.x = (Math.PI * 2 * index) / 5;
    spoke.rotation.z = Math.PI * 0.5;
  }

  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6;
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.055, radius * 0.055, 0.035, 8), hubMaterial);
    hole.rotation.z = Math.PI * 0.5;
    hole.position.set(
      x + side * (depth * 0.56),
      radius + 0.02 + Math.sin(angle) * radius * 0.34,
      z + Math.cos(angle) * radius * 0.34,
    );
    parent.add(hole);
  }
}

function modelColors(kind: VehicleSprite["kind"], paletteIndex: number) {
  if (kind === "player") {
    return {
      body: 0xc6d2de,
      bodyDark: 0x7d8a99,
      glass: 0x020614,
      trim: 0xf3f8ff,
      glow: 0x5dfcff,
      tail: 0xff3f57,
      under: 0xff4fd8,
    };
  }
  const variants = [
    { body: 0x5b0b18, bodyDark: 0x180612, trim: 0xff6078, glow: 0xff4fd8, tail: 0xff2b3e, under: 0xff4fd8 },
    { body: 0x111827, bodyDark: 0x060912, trim: 0x7afcff, glow: 0x5dfcff, tail: 0xff6042, under: 0x5dfcff },
    { body: 0x6a530d, bodyDark: 0x151005, trim: 0xffdf4e, glow: 0xffb347, tail: 0xff475f, under: 0xffb347 },
  ][paletteIndex % 3];
  return {
    ...variants,
    glass: 0x020614,
  };
}

function createCountachInspiredModel(kind: VehicleSprite["kind"], paletteIndex: number) {
  const colors = modelColors(kind, paletteIndex);
  const broken = kind === "broken";
  const group = new THREE.Group();
  group.name = `countach-inspired-${kind}`;

  const opacity = broken ? 0.78 : 1;
  const bodyMaterial = createCarMaterial(colors.body, opacity, false, {
    metalness: kind === "player" ? 0.72 : 0.5,
    roughness: kind === "player" ? 0.22 : 0.3,
    emissive: colors.bodyDark,
    emissiveIntensity: kind === "player" ? 0.025 : 0.04,
  });
  const darkBodyMaterial = createCarMaterial(colors.bodyDark, opacity, false, {
    metalness: 0.45,
    roughness: 0.38,
    emissive: colors.bodyDark,
    emissiveIntensity: 0.05,
  });
  const glassMaterial = createCarMaterial(colors.glass, broken ? 0.7 : 0.94, false, {
    metalness: 0.1,
    roughness: 0.16,
    emissive: 0x00161f,
    emissiveIntensity: 0.34,
  });
  const trimMaterial = createCarMaterial(colors.trim, broken ? 0.62 : 0.88, false, {
    metalness: 0.78,
    roughness: 0.2,
    emissive: colors.glow,
    emissiveIntensity: 0.035,
  });
  const blackPanelMaterial = createCarMaterial(0x02030b, broken ? 0.66 : 0.96, false, {
    metalness: 0.2,
    roughness: 0.46,
    emissive: 0x050614,
    emissiveIntensity: 0.22,
    side: THREE.DoubleSide,
  });
  const creaseMaterial = createCarMaterial(kind === "player" ? 0xf8fbff : colors.trim, broken ? 0.42 : 0.72, false, {
    metalness: 0.72,
    roughness: 0.22,
  });
  const tireMaterial = createCarMaterial(0x03040b, broken ? 0.66 : 1, false, { metalness: 0.18, roughness: 0.58 });
  const rimMaterial = createCarMaterial(kind === "player" ? 0xe8eef6 : colors.trim, broken ? 0.58 : 0.9, false, {
    metalness: 0.86,
    roughness: 0.18,
  });
  const glowMaterial = createCarMaterial(colors.glow, broken ? 0.32 : 0.58, true);
  const tailMaterial = createCarMaterial(colors.tail, broken ? 0.45 : 0.88, true);
  const underMaterial = createCarMaterial(colors.under, broken ? 0.26 : 0.46, true);

  addSectionedMesh(group, [
    { z: -2.7, lowerWidth: 1.18, upperWidth: 0.52, bottomY: 0.09, topY: 0.16 },
    { z: -2.08, lowerWidth: 2.16, upperWidth: 1.58, bottomY: 0.1, topY: 0.28 },
    { z: -1.18, lowerWidth: 2.58, upperWidth: 2.02, bottomY: 0.12, topY: 0.45 },
    { z: -0.16, lowerWidth: 2.78, upperWidth: 2.22, bottomY: 0.13, topY: 0.58 },
    { z: 1.18, lowerWidth: 3, upperWidth: 2.54, bottomY: 0.15, topY: 0.62 },
    { z: 2.48, lowerWidth: 2.9, upperWidth: 2.66, bottomY: 0.17, topY: 0.54 },
  ], bodyMaterial);

  addSectionedMesh(group, [
    { z: -1.24, lowerWidth: 1.64, upperWidth: 1.24, bottomY: 0.5, topY: 0.58 },
    { z: -0.54, lowerWidth: 1.58, upperWidth: 1.24, bottomY: 0.67, topY: 0.91 },
    { z: 0.36, lowerWidth: 1.72, upperWidth: 1.34, bottomY: 0.68, topY: 0.94 },
    { z: 0.92, lowerWidth: 1.46, upperWidth: 1.04, bottomY: 0.56, topY: 0.76 },
  ], glassMaterial);

  addPanel(group, [
    [-1.04, 0.47, -2.46],
    [1.04, 0.47, -2.46],
    [0.8, 0.6, -1.28],
    [-0.8, 0.6, -1.28],
  ], bodyMaterial);
  addPanel(group, [
    [-0.08, 0.5, -2.5],
    [0.08, 0.5, -2.5],
    [0.04, 0.62, -1.18],
    [-0.04, 0.62, -1.18],
  ], creaseMaterial);
  [-0.58, 0.58].forEach((x) => {
    const hoodLine = addBox(group, [0.035, 0.025, 1.18], [x, 0.54, -1.88], creaseMaterial);
    hoodLine.rotation.x = -0.06;
  });

  addBox(group, [1.58, 0.055, 0.07], [0, 0.94, 0.16], trimMaterial);
  addBox(group, [1.62, 0.06, 0.07], [0, 0.72, -1.03], trimMaterial);

  [-1, 1].forEach((side) => {
    addBox(group, [0.24, 0.18, 4.35], [side * 1.42, 0.22, 0.05], bodyMaterial);
    addBox(group, [0.1, 0.055, 1.7], [side * 1.55, 0.22, 0.58], creaseMaterial);
    addBox(group, [0.1, 0.045, 1.3], [side * 1.56, 0.14, 0.58], darkBodyMaterial);
    addBox(group, [0.28, 0.26, 0.9], [side * 1.46, 0.42, -1.42], bodyMaterial);
    addBox(group, [0.34, 0.3, 1.0], [side * 1.5, 0.44, 1.35], bodyMaterial);
    addPanel(group, [
      [side * 1.43, 0.44, -0.72],
      [side * 1.43, 0.69, -0.44],
      [side * 1.43, 0.64, 0.36],
      [side * 1.43, 0.5, 0.48],
    ], glassMaterial);
    addPanel(group, [
      [side * 1.51, 0.42, 0.36],
      [side * 1.51, 0.64, 0.55],
      [side * 1.51, 0.58, 1.1],
      [side * 1.51, 0.34, 1.16],
    ], blackPanelMaterial);
    addPanel(group, [
      [side * 1.525, 0.47, 0.24],
      [side * 1.525, 0.57, 0.34],
      [side * 1.525, 0.6, 1.18],
      [side * 1.525, 0.52, 1.28],
    ], creaseMaterial);

    addPanel(group, [
      [side * 1.535, 0.28, -0.82],
      [side * 1.535, 0.32, -0.74],
      [side * 1.535, 0.58, -0.06],
      [side * 1.535, 0.54, 0.04],
    ], creaseMaterial);
    addBox(group, [0.11, 0.055, 1.48], [side * 1.53, 0.27, 0.74], darkBodyMaterial);
    addBox(group, [0.11, 0.045, 1.22], [side * 1.54, 0.19, 0.7], creaseMaterial);
    addBox(group, [0.1, 0.04, 0.92], [side * 1.55, 0.11, 0.72], darkBodyMaterial);
    addBox(group, [0.26, 0.13, 0.22], [side * 1.45, 0.78, -1.12], trimMaterial);
  });

  addBox(group, [1.65, 0.04, 0.95], [0, 0.68, 1.22], blackPanelMaterial);
  for (let index = 0; index < 8; index += 1) {
    const slat = addBox(group, [1.62, 0.04, 0.08], [0, 0.82, 0.78 + index * 0.12], trimMaterial);
    slat.rotation.x = -0.34;
  }
  addBox(group, [1.95, 0.05, 0.08], [0, 0.6, 2.12], darkBodyMaterial);

  addWheel(group, -1.43, -1.42, tireMaterial, rimMaterial, 0.34, 0.34);
  addWheel(group, 1.43, -1.42, tireMaterial, rimMaterial, 0.34, 0.34);
  addWheel(group, -1.5, 1.36, tireMaterial, rimMaterial, 0.39, 0.43);
  addWheel(group, 1.5, 1.36, tireMaterial, rimMaterial, 0.39, 0.43);

  addBox(group, [2.08, 0.045, 0.06], [0, 0.44, -2.68], glowMaterial);
  addBox(group, [0.58, 0.045, 0.08], [-0.58, 0.38, -2.68], trimMaterial);
  addBox(group, [0.58, 0.045, 0.08], [0.58, 0.38, -2.68], trimMaterial);
  addBox(group, [0.62, 0.09, 0.08], [-0.52, 0.45, 2.52], tailMaterial);
  addBox(group, [0.62, 0.09, 0.08], [0.52, 0.45, 2.52], tailMaterial);
  addBox(group, [0.9, 0.08, 0.08], [0, 0.34, 2.58], blackPanelMaterial);
  addBox(group, [1.72, 0.025, 4.4], [0, 0.08, 0.02], underMaterial);

  if (broken) {
    group.rotation.z = 0.08;
    group.rotation.x = -0.07;
    addBox(group, [1.8, 0.05, 0.08], [0.12, 0.88, 0.12], createCarMaterial(0x050612, 0.58));
    addBox(group, [0.08, 0.08, 0.86], [-0.72, 0.75, 0.38], createCarMaterial(0xffb347, 0.48, true));
  }

  return group;
}

function createNeonBarrierModel() {
  const group = new THREE.Group();
  const core = createCarMaterial(0x181044, 0.95);
  const pink = createCarMaterial(0xff4fd8, 0.78, true);
  const cyan = createCarMaterial(0x5dfcff, 0.72, true);
  const amber = createCarMaterial(0xffb347, 0.8, true);
  addBox(group, [2.44, 0.48, 0.18], [0, 0.48, 0], core);
  addBox(group, [2.62, 0.06, 0.2], [0, 0.75, 0], pink);
  addBox(group, [2.62, 0.06, 0.2], [0, 0.25, 0], cyan);
  for (let index = -2; index <= 2; index += 1) {
    const stripe = addBox(group, [0.16, 0.58, 0.22], [index * 0.44, 0.5, 0.02], index % 2 === 0 ? amber : cyan);
    stripe.rotation.z = -0.32;
  }
  addBox(group, [0.2, 0.55, 0.24], [-1.06, 0.1, 0.03], core);
  addBox(group, [0.2, 0.55, 0.24], [1.06, 0.1, 0.03], core);
  return group;
}

// Inactive reference art pass; vehicle rendering is currently reverted to the 2D sprite pipeline.
void createCountachInspiredModel;
void createNeonBarrierModel;

function createVehicleSprite(
  kind: VehicleSprite["kind"],
  paletteIndex = 0,
  laneIndex: LaneIndex = 1,
  assetVariant: VehicleAssetVariant = "normal",
  wheelFrame: VehicleWheelFrame = 0,
): VehicleSprite | null {
  const usesGeneratedAsset = kind !== "barrier";
  const assetUrl = generatedVehicleAssetUrl(kind, paletteIndex, laneIndex, assetVariant, wheelFrame);
  const generatedTexture = assetUrl ? generatedVehicleTexture(assetUrl) : null;
  if (usesGeneratedAsset && !generatedVehicleTextureReady(generatedTexture)) return null;
  const texture = usesGeneratedAsset ? generatedTexture : makeVehicleTexture(kind, paletteIndex);
  if (!texture) return null;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = kind === "player" ? 12 : 10;
  scene.add(sprite);
  return {
    sprite,
    texture,
    kind,
    paletteIndex,
    laneIndex,
    assetVariant,
    wheelFrame: usesGeneratedAsset ? wheelFrame : 0,
    aspect: usesGeneratedAsset
      ? 0.5
      : (() => {
          const imageSize = textureImageSize(texture);
          return imageSize.width > 0 ? imageSize.height / imageSize.width : 0.5;
        })(),
    ownsTexture: !usesGeneratedAsset,
    usesGeneratedAsset,
  };
}

function disposeVehicleSprite(vehicle: VehicleSprite) {
  scene.remove(vehicle.sprite);
  vehicle.sprite.material.dispose();
  if (vehicle.ownsTexture) vehicle.texture.dispose();
}

function obstacleKind(obstacle: Obstacle): VehicleSprite["kind"] {
  if (obstacle.type === "barrier") return "barrier";
  if (obstacle.type === "broken") return "broken";
  return "traffic";
}

function setVehicleTransform(
  vehicle: VehicleSprite,
  lanePosition: number,
  groundZ: number,
  widthWorld: number,
  transform: {
    heightScale?: number;
    lift?: number;
    offsetX?: number;
    offsetZ?: number;
  } = {},
) {
  const heightScale = transform.heightScale ?? 1;
  const { width: imageWidth, height: imageHeight } = textureImageSize(vehicle.texture);
  const aspect = imageWidth > 0 && imageHeight > 0 ? imageHeight / imageWidth : vehicle.aspect;
  vehicle.aspect = aspect;
  const heightWorld = widthWorld * aspect * heightScale;
  vehicle.sprite.position.set(
    laneToWorldX(lanePosition) + (transform.offsetX ?? 0),
    heightWorld * 0.5 + (transform.lift ?? 0),
    groundZ + (transform.offsetZ ?? 0),
  );
  vehicle.sprite.scale.set(widthWorld, heightWorld, 1);
}

function vehicleHeightWorld(vehicle: VehicleSprite, widthWorld: number) {
  const { width: imageWidth, height: imageHeight } = textureImageSize(vehicle.texture);
  const aspect = imageWidth > 0 && imageHeight > 0 ? imageHeight / imageWidth : vehicle.aspect;
  vehicle.aspect = aspect;
  return widthWorld * aspect;
}

function setVehicleVisualState(vehicle: VehicleSprite, opacity: number, tint: number) {
  const material = vehicle.sprite.material;
  material.opacity = opacity;
  material.transparent = true;
  material.color.setHex(tint);
}

function movingVehicleWheelFrame(): VehicleWheelFrame {
  if (state.mode !== "running" || state.speed <= 0) return 0;
  const wheelFps = clamp(state.speed / 26, 8, 15);
  return (Math.floor(state.runTime * wheelFps) % 3) as VehicleWheelFrame;
}

function setVehicleWheelFrame(vehicle: VehicleSprite, wheelFrame: VehicleWheelFrame) {
  if (!vehicle.usesGeneratedAsset || vehicle.assetVariant !== "normal" || vehicle.wheelFrame === wheelFrame) return;
  const assetUrl = generatedVehicleAssetUrl(
    vehicle.kind,
    vehicle.paletteIndex,
    vehicle.laneIndex,
    vehicle.assetVariant,
    wheelFrame,
  );
  if (!assetUrl) return;
  const texture = generatedVehicleTexture(assetUrl);
  if (!generatedVehicleTextureReady(texture)) return;
  vehicle.texture = texture;
  vehicle.wheelFrame = wheelFrame;
  vehicle.sprite.material.map = texture;
  vehicle.sprite.material.needsUpdate = true;
}

function obstacleWreckTransform(obstacle: Obstacle) {
  if (!obstacle.wreckedByAttack) {
    return { progress: 0, heightScale: 1, lift: 0, offsetX: 0, offsetZ: 0 };
  }
  const progress = clamp(1 - (obstacle.wreckTimer ?? 0) / attackWreckDuration, 0, 1);
  const direction = obstacle.wreckDirection ?? "front";
  const lateralDirection = direction === "left" ? -1 : direction === "right" ? 1 : 0;
  const travelProgress = clamp(progress / 0.18, 0, 1);
  const travelEase = 1 - Math.pow(1 - travelProgress, 3);
  return {
    progress,
    heightScale: 1,
    lift: 0,
    offsetX: lateralDirection * travelEase * 0.46,
    offsetZ: -travelEase * (direction === "front" ? 0.86 : 0.58),
  };
}

function obstacleVehicleAssetVariant(obstacle: Obstacle): VehicleAssetVariant {
  if (!obstacle.wreckedByAttack) return "normal";
  if (
    obstacle.wreckDirection !== "front" &&
    obstacle.laneIndex !== 1
  ) {
    return "damaged-diagonal";
  }
  return "damaged-rear";
}

function obstacleWreckLeanRotation(obstacle: Obstacle) {
  if (!obstacle.wreckedByAttack) return 0;
  if (obstacle.wreckDirection === "left") return 0.045;
  if (obstacle.wreckDirection === "right") return -0.045;
  return 0;
}

function obstacleWreckLeanLift(widthWorld: number, rotation: number) {
  if (rotation === 0) return 0;
  return Math.abs(Math.sin(rotation)) * widthWorld * 0.5;
}

function playerVehicleAssetLaneIndex(currentLaneIndex?: LaneIndex): LaneIndex {
  if (player.laneIndex !== 1) return player.laneIndex;
  if (
    currentLaneIndex !== undefined &&
    currentLaneIndex !== 1 &&
    Math.abs(player.visualLane - 1) > playerReturnCenterAssetThreshold
  ) {
    return currentLaneIndex;
  }
  return 1;
}

function updateVehicleSprites() {
  const wheelFrame = movingVehicleWheelFrame();
  const playerAssetVariant: VehicleAssetVariant =
    state.mode === "recovering" ? "damaged-front" : "normal";
  const currentPlayerVehicle = roadScene.playerVehicle;
  const playerAssetLaneIndex = playerVehicleAssetLaneIndex(currentPlayerVehicle?.laneIndex);
  const playerAssetUrl = generatedVehicleAssetUrl("player", 0, playerAssetLaneIndex, playerAssetVariant, wheelFrame);
  const playerGeneratedAssetReady = playerAssetUrl
    ? generatedVehicleTextureReady(generatedVehicleTexture(playerAssetUrl))
    : false;
  if (
    !currentPlayerVehicle ||
    currentPlayerVehicle.laneIndex !== playerAssetLaneIndex ||
    currentPlayerVehicle.assetVariant !== playerAssetVariant ||
    (playerGeneratedAssetReady && !currentPlayerVehicle.usesGeneratedAsset)
  ) {
    const nextPlayerVehicle = createVehicleSprite("player", 0, playerAssetLaneIndex, playerAssetVariant, wheelFrame);
    if (nextPlayerVehicle) {
      if (currentPlayerVehicle) disposeVehicleSprite(currentPlayerVehicle);
      roadScene.playerVehicle = nextPlayerVehicle;
    }
  }

  if (roadScene.playerVehicle) {
    const attackAmount = state.attackTimer > 0 ? Math.sin((state.attackTimer / attackDuration) * Math.PI) : 0;
    const crashAmount = state.mode === "recovering" ? clamp(1 - state.crashTimer / 0.95, 0, 1) : 0;
    canvas.dataset.playerVehicleAsset =
      String(roadScene.playerVehicle.texture.userData.assetUrl ?? "legacy-canvas");
    setVehicleWheelFrame(roadScene.playerVehicle, playerAssetVariant === "normal" ? wheelFrame : 0);
    const generatedSideLanePlayerScale = 0.74 * 0.9;
    const generatedCenterLanePlayerScale = 0.74;
    const sideLaneGeneratedScale = 1.092;
    const centerLaneGeneratedScale = 1.12;
    const sideLanePlayerWidth = playerVehicleWorldWidth() * generatedSideLanePlayerScale * sideLaneGeneratedScale;
    const centerLanePlayerWidth = obstacleVehicleWorldWidth() * generatedCenterLanePlayerScale * centerLaneGeneratedScale;
    const centerLaneAmount = 1 - clamp(Math.abs(player.visualLane - 1), 0, 1);
    const playerWidth = roadScene.playerVehicle.usesGeneratedAsset
      ? lerp(sideLanePlayerWidth, centerLanePlayerWidth, centerLaneAmount)
      : playerVehicleWorldWidth();
    const playerLanePosition = player.visualLane + state.attackLaneOffset * attackAmount * 0.48;
    const playerGroundZ = worldScene.playerZ - attackAmount * 0.95;
    const playerRotation = state.attackLaneOffset * attackAmount * -0.12;
    const playerTint =
      crashAmount > 0 && !roadScene.playerVehicle.usesGeneratedAsset ? 0x8a8fa0 : 0xffffff;
    setVehicleTransform(
      roadScene.playerVehicle,
      playerLanePosition,
      playerGroundZ,
      playerWidth,
    );
    roadScene.playerVehicle.sprite.material.rotation = playerRotation;
    setVehicleVisualState(
      roadScene.playerVehicle,
      crashAmount > 0 && !roadScene.playerVehicle.usesGeneratedAsset ? 0.78 : 1,
      playerTint,
    );
  }

  const liveObstacleIds = new Set<number>();
  obstacles.forEach((obstacle) => {
    liveObstacleIds.add(obstacle.id);
    const kind = obstacleKind(obstacle);
    const paletteIndex = (obstacle.id - 1) % obstacleVehiclePalettes.length;
    const assetVariant = obstacleVehicleAssetVariant(obstacle);
    const existing = roadScene.obstacleVehicles.get(obstacle.id);
    const obstacleWheelFrame = obstacle.wreckedByAttack ? 0 : wheelFrame;
    const obstacleAssetUrl = generatedVehicleAssetUrl(kind, paletteIndex, obstacle.laneIndex, assetVariant, obstacleWheelFrame);
    const obstacleGeneratedAssetReady = obstacleAssetUrl
      ? generatedVehicleTextureReady(generatedVehicleTexture(obstacleAssetUrl))
      : false;
    const vehicle =
      existing &&
      existing.kind === kind &&
      existing.paletteIndex === paletteIndex &&
      existing.laneIndex === obstacle.laneIndex &&
      existing.assetVariant === assetVariant &&
      !(obstacleGeneratedAssetReady && !existing.usesGeneratedAsset)
        ? existing
        : createVehicleSprite(kind, paletteIndex, obstacle.laneIndex, assetVariant, obstacleWheelFrame);

    if (!vehicle) return;
    if (existing && existing !== vehicle) disposeVehicleSprite(existing);
    roadScene.obstacleVehicles.set(obstacle.id, vehicle);
    setVehicleWheelFrame(vehicle, obstacleWheelFrame);

    const sideLaneAmount = clamp(Math.abs(obstacle.laneIndex - 1), 0, 1);
    const generatedObstacleLaneScale = lerp(1.12, 1.092, sideLaneAmount);
    const widthWorld =
      obstacleVehicleWorldWidth() * (vehicle.usesGeneratedAsset ? 0.74 * generatedObstacleLaneScale : 1);
    const heightWorld = vehicleHeightWorld(vehicle, widthWorld);
    const z = screenYToWorldZAtY(obstacle.trackY, heightWorld * 0.5);
    const wreckTransform = obstacleWreckTransform(obstacle);
    const wreckLeanRotation = obstacleWreckLeanRotation(obstacle);
    setVehicleTransform(vehicle, obstacle.laneIndex, z, widthWorld, {
      heightScale: wreckTransform.heightScale,
      lift: wreckTransform.lift + obstacleWreckLeanLift(widthWorld, wreckLeanRotation),
      offsetX: wreckTransform.offsetX,
      offsetZ: wreckTransform.offsetZ,
    });
    vehicle.sprite.material.rotation = wreckLeanRotation;
    setVehicleVisualState(
      vehicle,
      1,
      obstacle.wreckedByAttack ? 0xc8c8c8 : 0xffffff,
    );
  });

  Array.from(roadScene.obstacleVehicles.entries()).forEach(([id, vehicle]) => {
    if (liveObstacleIds.has(id)) return;
    disposeVehicleSprite(vehicle);
    roadScene.obstacleVehicles.delete(id);
  });
}

function drawCrashFlash() {
  if (state.mode !== "recovering") return;
  const alpha = clamp(1 - state.crashTimer / 1, 0, 1) * 0.38;
  ctx.fillStyle = `rgba(255, 79, 216, ${alpha})`;
  ctx.fillRect(0, 0, width, height);
}

function drawComboOverlay() {
  return;
}

function drawScorePopups() {
  if (scorePopups.length === 0) return;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  scorePopups.forEach((popup) => {
    const progress = clamp(1 - popup.timer / popup.duration, 0, 1);
    if (progress >= 0.96) return;

    const alpha = progress < 0.08 ? lerp(0.72, 1, progress / 0.08) : 1;
    if (alpha <= 0) return;

    const pop = Math.sin(Math.min(1, progress * 3.4) * Math.PI) * 0.18;
    const fontSize = clamp(width * 0.027, 21, 41) * (1 + pop);
    const riseProgress = 1 - (1 - clamp(progress / 0.24, 0, 1)) ** 3;
    const afterimage = clamp(
      Math.sin(clamp(progress / 0.24, 0, 1) * Math.PI * 0.5) *
        (1 - clamp((progress - 0.24) / 0.18, 0, 1)),
      0,
      1,
    );
    const x = clamp(popup.anchorX, 86, width - 86);
    const settledY = clamp(popup.anchorY + 6 - popup.offsetIndex * 5, 112, height - 88);
    const y = clamp(settledY + (1 - riseProgress) * fontSize * 0.92, 112, height - 88);
    const text = `${popup.value}PTS`;
    const flashProgress = clamp((progress - 0.66) / 0.22, 0, 1);
    const exitFlash = Math.sin(flashProgress * Math.PI);
    const glowBoost = 1 + exitFlash * 1.9;

    ctx.globalAlpha = alpha;
    ctx.font = `900 ${fontSize}px Impact, "Arial Black", "Courier New", monospace`;
    if (afterimage > 0) {
      const trailGap = fontSize * afterimage;
      const layers = [
        { dy: trailGap * 0.32, color: `rgba(255, 174, 232, ${0.56 * afterimage})` },
        { dy: trailGap * 0.62, color: `rgba(255, 74, 198, ${0.48 * afterimage})` },
        { dy: trailGap * 0.94, color: `rgba(255, 32, 162, ${0.4 * afterimage})` },
      ];
      layers.forEach((layer) => {
        ctx.shadowColor = layer.color;
        ctx.shadowBlur = 28 * afterimage;
        ctx.lineWidth = Math.max(3, fontSize * 0.1);
        ctx.strokeStyle = `rgba(2, 4, 18, ${0.58 * afterimage})`;
        ctx.strokeText(text, x, y + layer.dy);
        ctx.fillStyle = layer.color;
        ctx.fillText(text, x, y + layer.dy);
      });
    }
    ctx.shadowColor = `rgba(12, 5, 32, ${0.9 * alpha})`;
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(5, fontSize * 0.16);
    ctx.strokeStyle = `rgba(4, 7, 24, ${0.95 * alpha})`;
    ctx.strokeText(text, x, y);
    ctx.lineWidth = Math.max(2, fontSize * 0.055);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * alpha})`;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = `rgba(118, 247, 255, ${alpha})`;
    ctx.fillText(text, x, y);
    ctx.shadowColor = `rgba(93, 252, 255, ${0.58 * alpha * glowBoost})`;
    ctx.shadowBlur = 12 * glowBoost;
    ctx.fillStyle = `rgba(218, 255, 255, ${clamp(0.45 * alpha + exitFlash * 0.42, 0, 1)})`;
    ctx.fillText(text, x, y - fontSize * 0.015);
    if (exitFlash > 0) {
      ctx.shadowColor = `rgba(255, 255, 255, ${0.72 * exitFlash})`;
      ctx.shadowBlur = 24 * exitFlash;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.38 * exitFlash})`;
      ctx.fillText(text, x, y);
    }
  });

  ctx.restore();
}

function update(dt: number) {
  if (state.mode === "idle" || state.mode === "paused") return;

  const stage = activeStage();
  state.speed = state.mode === "recovering" ? targetSpeedForMode() * 0.35 : targetSpeedForMode();
  if (state.mode === "running") {
    roadTick = (roadTick + config.obstacleTravelRate * dt) % 1;
    roadScroll += sceneScrollSpeed() * dt;
  }
  state.attackTimer = Math.max(0, state.attackTimer - dt);
  state.attackCooldown = Math.max(0, state.attackCooldown - dt);
  if (state.attackTimer <= 0) state.attackLaneOffset = 0;

  if (state.comboCount > 0) {
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    state.comboFlashTimer = Math.max(0, state.comboFlashTimer - dt);
    if (state.comboTimer <= 0) settleCombo();
  }
  if (scorePopups.length > 0) {
    scorePopups.forEach((popup) => {
      popup.timer = Math.max(0, popup.timer - dt);
    });
    scorePopups = scorePopups.filter((popup) => popup.timer > 0);
  }

  const previousLane = player.visualLane;
  const laneVisualFollowSpeed =
    player.laneIndex === 1 ? playerReturnCenterVisualFollowSpeed : playerLaneVisualFollowSpeed;
  player.visualLane = lerp(player.visualLane, player.laneIndex, Math.min(1, dt * laneVisualFollowSpeed));
  player.velocity = player.visualLane - previousLane;
  player.drift = lerp(player.drift, state.mode === "recovering" ? -46 : player.velocity * 180, dt * 6);

  if (state.mode === "recovering") {
    state.crashTimer += dt;
    if (state.crashTimer >= 0.95) resetToStandby("STANDING BY");
  } else {
    state.runTime += dt;
    state.distance += (state.speed / 3600) * dt * 0.22;
    if (state.driveMode === "race" && state.distance > state.best) {
      state.best = state.distance;
      writeBestDistance(state.best);
    }
    refreshScore();
    if (state.driveMode === "race") {
      state.spawnTimer -= dt;
    }
    if (state.driveMode === "race" && state.spawnTimer <= 0) {
      spawnObstacles(stage);
      state.spawnTimer += stage.spawnInterval;
    }
  }

  for (const obstacle of obstacles) {
    if (obstacle.wreckedByAttack) {
      obstacle.wreckTimer = Math.max(0, (obstacle.wreckTimer ?? 0) - dt);
    } else {
      obstacle.trackY += trackConveyorSpeed() * dt;
    }
    const progress = trackProgress(obstacle.trackY);
    if (!obstacle.passed && progress > 0.96) {
      obstacle.passed = true;
      if (state.mode === "running") {
        state.scoreBonus += 120;
        refreshScore();
      }
    }
  }

  if (state.mode === "running" && state.driveMode === "race") {
    const hit = obstacles.some((obstacle) => {
      if (obstacle.wreckedByAttack) return false;
      const progress = trackProgress(obstacle.trackY);
      if (progress < 0.78 || progress > 1.03) return false;
      return obstacle.laneIndex === player.laneIndex;
    });

    if (hit) {
      crash();
    }
  }

  obstacles = obstacles.filter((obstacle) =>
    obstacle.wreckedByAttack
      ? (obstacle.wreckTimer ?? 0) > 0
      : obstacle.trackY < height + Math.max(320, height * 0.45),
  );
}

function crash() {
  state.best = Math.max(state.best, state.distance);
  writeBestDistance(state.best);
  state.mode = "recovering";
  state.crashTimer = 0;
  state.attackTimer = 0;
  state.attackCooldown = 0;
  state.attackLaneOffset = 0;
  clearCombo();
  playEffect("crash");
  setStatus("STANDING BY");
  syncBgm();
}

function render(time: number) {
  drawBackground(time);
  drawComboOverlay();
  drawScorePopups();
  drawCrashFlash();
}

function updateHud() {
  syncDriveDataset();
  canvas.dataset.mode = state.mode;
  canvas.dataset.distance = state.distance.toFixed(4);
  canvas.dataset.score = String(state.score);
  canvas.dataset.speed = String(Math.round(state.speed));
  canvas.dataset.playerLane = String(player.laneIndex);
  canvas.dataset.playerVisualLane = player.visualLane.toFixed(4);
  canvas.dataset.playerX = laneOffset(player.visualLane).toFixed(4);
  canvas.dataset.obstacles = String(obstacles.length);
  if (readout.distance) readout.distance.textContent = `${state.distance.toFixed(2)} KM`;
  if (readout.score) readout.score.textContent = `${String(state.score).padStart(6, "0")}`;
  if (readout.speed) {
    const displayedSpeed = state.mode === "running" ? displayedRunningSpeed : Math.round(state.speed);
    readout.speed.textContent = `${displayedSpeed} KM/H`;
  }
  if (readout.best) readout.best.textContent = `${state.best.toFixed(2)} KM`;
  const metricTitles = ["DISTANCE", "SCORE", "SPEED", "BEST"];
  readout.metricLabels.forEach((label, index) => {
    label.textContent = metricTitles[index] ?? label.textContent;
  });
  const showCombo = state.comboCount >= 2 && state.comboTimer > 0;
  if (readout.combo) {
    readout.combo.hidden = !showCombo;
    readout.combo.classList.toggle("is-popping", showCombo && state.comboFlashTimer > 0);
  }
  if (readout.comboValue) readout.comboValue.textContent = `${state.comboCount}X`;
}

function setStatus(value: string) {
  if (readout.status) readout.status.textContent = value;
}

function syncDriveDataset() {
  document.documentElement.dataset.driveState = state.mode;
  if (state.driveMode) document.documentElement.dataset.driveMode = state.driveMode;
  else delete document.documentElement.dataset.driveMode;
  canvas.dataset.driveMode = state.driveMode ?? "none";
}

function shouldRenderDriveFrame(now: number) {
  const openingState = document.documentElement.dataset.opening;
  if (openingState === "entry") {
    openingRenderStartedAt = null;
    return false;
  }
  if (openingState === "playing") {
    if (openingRenderStartedAt === null) openingRenderStartedAt = now;
    return now - openingRenderStartedAt >= 3700;
  }
  openingRenderStartedAt = null;
  return true;
}

function loop(now: number) {
  const dt = clamp((now - state.lastTime) / 1000, 0, 0.05);
  state.lastTime = now;
  update(dt);
  updateMusic(dt);
  if (shouldRenderDriveFrame(now)) render(now);
  updateHud();
  requestAnimationFrame(loop);
}

function pauseGame() {
  if (state.mode === "running") {
    state.mode = "paused";
    setStatus(state.driveMode === "airing" ? "AIRING" : "RACING");
    syncBgm();
  }
}

function resumeGame() {
  if (state.mode === "paused") {
    state.mode = "running";
    state.lastTime = performance.now();
    setStatus(state.driveMode === "airing" ? "AIRING" : "RACING");
    syncBgm();
  }
}

async function unlockAudio() {
  if (audio.unlocked && audioContext) {
    playOpeningAudio();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (Ctx && !audioContext) {
    audioContext = new Ctx();
    await audioContext.resume();
  } else if (audioContext) {
    await audioContext.resume();
  }
  audio.unlocked = true;
  ensureOpeningAudio();
  ensureBgm();
  attackHitVariants.forEach((_, index) => {
    void loadAttackHitBuffer(index);
  });
  void loadPlayerCrashBuffer();
  syncBgm();
  playOpeningAudio();
}

function ensureBgm() {
  if (!bgmElement) {
    bgmElement = new Audio(bgmUrl);
    bgmElement.loop = true;
    bgmElement.preload = "auto";
    bgmElement.volume = 0;
  }
  if (audioContext && !bgmSourceNode) {
    bgmSourceNode = audioContext.createMediaElementSource(bgmElement);
    bgmAnalyser = audioContext.createAnalyser();
    bgmAnalyser.fftSize = 128;
    bgmAnalyser.smoothingTimeConstant = 0.32;
    bgmFrequencyData = new Uint8Array(bgmAnalyser.frequencyBinCount);
    bgmSourceNode.connect(bgmAnalyser);
    bgmAnalyser.connect(audioContext.destination);
  }
  return bgmElement;
}

function shouldPlayBgm() {
  return Boolean(
    audio.unlocked &&
      !audio.muted &&
      audio.volume > 0 &&
      bgmStarted,
  );
}

function syncBgm() {
  if (!bgmElement && (!audio.unlocked || !bgmStarted)) return;
  const bgm = ensureBgm();
  if (shouldPlayBgm()) {
    stopOpeningAudio(0.28);
    void bgm.play().catch(() => {
      // Browser autoplay policy may still block until the next explicit gesture.
    });
  }
}

function shouldPlayOpeningAudio() {
  return Boolean(
    audio.unlocked &&
      !bgmStarted &&
      ["arming", "playing"].includes(document.documentElement.dataset.opening ?? ""),
  );
}

function openingAudioVolume() {
  // ENTER is an explicit playback gesture. Keep the opening cue audible even
  // when a previous visit left the persistent Walkman state muted or at zero;
  // the saved Walkman preference itself remains unchanged after the intro.
  return clamp(Math.max(audio.volume, openingAudioMinimumVolume) * openingAudioVolumeBoost, 0, 1);
}

function ensureOpeningAudio() {
  if (!openingAudioElement) {
    openingAudioElement = new Audio(openingAudioUrl);
    openingAudioElement.preload = "auto";
    openingAudioElement.loop = false;
    openingAudioElement.volume = 0;
    openingAudioElement.addEventListener("ended", () => {
      openingAudioActive = false;
    });
  }
  return openingAudioElement;
}

async function playOpeningAudio() {
  if (openingAudioStarted || openingAudioStartPending || !shouldPlayOpeningAudio()) return;
  const openingAudio = ensureOpeningAudio();
  const requestToken = ++openingAudioStartToken;
  openingAudioStartPending = true;
  window.cancelAnimationFrame(openingAudioFadeFrame);
  openingAudio.currentTime = 0;
  openingAudio.volume = openingAudioVolume();
  try {
    await openingAudio.play();
    if (requestToken !== openingAudioStartToken) {
      openingAudio.pause();
      openingAudio.currentTime = 0;
      return;
    }
    openingAudioStarted = true;
    openingAudioActive = true;
    openingAudioStopAt = performance.now() + openingAudioDurationMs;
    window.dispatchEvent(new CustomEvent("opening-audio-started", { detail: { audible: true } }));
  } catch {
    if (requestToken !== openingAudioStartToken) return;
    openingAudioActive = false;
    openingAudioStarted = true;
    window.dispatchEvent(new CustomEvent("opening-audio-started", { detail: { audible: false } }));
  } finally {
    if (requestToken === openingAudioStartToken) openingAudioStartPending = false;
  }
}

function stopOpeningAudio(fadeDuration = 0.22) {
  const openingAudio = openingAudioElement;
  if (!openingAudio && !openingAudioActive && openingAudioNodes.length === 0) return;
  openingAudioActive = false;
  window.cancelAnimationFrame(openingAudioFadeFrame);
  if (openingAudio && !openingAudio.paused) {
    const startVolume = openingAudio.volume;
    const fadeStart = performance.now();
    const fadeMs = Math.max(40, fadeDuration * 1000);
    const fade = (nowMs: number) => {
      const progress = clamp((nowMs - fadeStart) / fadeMs, 0, 1);
      openingAudio.volume = startVolume * (1 - progress);
      if (progress < 1) {
        openingAudioFadeFrame = window.requestAnimationFrame(fade);
        return;
      }
      openingAudio.pause();
      openingAudio.currentTime = 0;
      openingAudio.volume = openingAudioVolume();
    };
    openingAudioFadeFrame = window.requestAnimationFrame(fade);
  }
  if (!audioContext) {
    openingAudioNodes.length = 0;
    openingAudioSources.length = 0;
    return;
  }
  const now = audioContext.currentTime;
  openingAudioNodes.forEach((node) => {
    if (node instanceof GainNode) {
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(0.0001, now, Math.max(0.02, fadeDuration * 0.25));
    }
  });
  openingAudioSources.forEach((source) => {
    try {
      source.stop(now + fadeDuration);
    } catch {
      // Sources may already have reached their scheduled stop time.
    }
  });
  openingAudioNodes.length = 0;
  openingAudioSources.length = 0;
}

function updateOpeningAudio() {
  if (!openingAudioActive) return;
  const openingAudio = openingAudioElement;
  if (openingAudio) openingAudio.volume = openingAudioVolume();
  if (!shouldPlayOpeningAudio() || performance.now() >= openingAudioStopAt || openingAudio?.ended) {
    stopOpeningAudio(0.28);
  }
}

function playTone(frequency: number, duration: number, type: OscillatorType, gainValue: number) {
  if (!audioContext || audio.muted || audio.volume <= 0) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = gainValue * audio.volume;
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

async function loadAttackHitBuffer(index: number) {
  if (!audioContext) return null;
  if (attackHitBuffers[index]) return attackHitBuffers[index];
  if (!attackHitBufferPromises[index]) {
    attackHitBufferPromises[index] = fetch(attackHitVariants[index].url)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load attack hit sound: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => audioContext?.decodeAudioData(data) ?? null)
      .then((buffer) => {
        attackHitBuffers[index] = buffer;
        return buffer;
      })
      .catch(() => null);
  }
  return attackHitBufferPromises[index];
}

function attackHitVariantIndex() {
  if (attackSoundMode === "RANDOM") return Math.floor(Math.random() * attackHitVariants.length);
  return Math.max(0, attackHitVariants.findIndex((variant) => variant.mode === attackSoundMode));
}

function playAttackHitSample(index = attackHitVariantIndex()) {
  if (!audioContext || audio.muted || audio.volume <= 0) return false;
  const buffer = attackHitBuffers[index];
  if (!buffer) {
    void loadAttackHitBuffer(index).then((loadedBuffer) => {
      if (!loadedBuffer || !audioContext || audio.muted || audio.volume <= 0) return;
      playAttackHitSample(index);
    });
    return false;
  }

  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  const presence = audioContext.createBiquadFilter();
  const compressor = audioContext.createDynamicsCompressor();
  source.buffer = buffer;
  gain.gain.value = audio.volume * attackHitVolumeBoost;
  presence.type = "highshelf";
  presence.frequency.value = 1850;
  presence.gain.value = attackHitPresenceGain;
  compressor.threshold.value = attackHitCompressorThreshold;
  compressor.knee.value = 5;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.09;
  source.connect(gain).connect(presence).connect(compressor).connect(audioContext.destination);
  source.start();
  return true;
}

function playAttackHitTransient() {
  if (!audioContext || audio.muted || audio.volume <= 0) return;
  const now = audioContext.currentTime;
  const duration = 0.065;
  const frameCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const noiseBuffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    const envelope = Math.pow(1 - index / frameCount, 2.4);
    channel[index] = (Math.random() * 2 - 1) * envelope;
  }

  const noise = audioContext.createBufferSource();
  const highpass = audioContext.createBiquadFilter();
  const noiseGain = audioContext.createGain();
  noise.buffer = noiseBuffer;
  highpass.type = "highpass";
  highpass.frequency.value = 1750;
  highpass.Q.value = 0.72;
  noiseGain.gain.setValueAtTime(Math.max(0.0001, audio.volume * attackHitNoiseGain), now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  noise.connect(highpass).connect(noiseGain).connect(audioContext.destination);
  noise.start(now);
  noise.stop(now + duration);

  const ping = audioContext.createOscillator();
  const pingGain = audioContext.createGain();
  ping.type = "triangle";
  ping.frequency.setValueAtTime(2200, now);
  ping.frequency.exponentialRampToValueAtTime(920, now + 0.055);
  pingGain.gain.setValueAtTime(Math.max(0.0001, audio.volume * attackHitPingGain), now);
  pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
  ping.connect(pingGain).connect(audioContext.destination);
  ping.start(now);
  ping.stop(now + 0.055);
}

function playAttackHitEffect() {
  playAttackHitTransient();
  playAttackHitSample();
}

async function loadPlayerCrashBuffer() {
  if (!audioContext) return null;
  if (playerCrashBuffer) return playerCrashBuffer;
  if (!playerCrashBufferPromise) {
    playerCrashBufferPromise = fetch(playerCrashUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load player crash sound: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => audioContext?.decodeAudioData(data) ?? null)
      .then((buffer) => {
        playerCrashBuffer = buffer;
        return buffer;
      })
      .catch(() => null);
  }
  return playerCrashBufferPromise;
}

function playPlayerCrashSample() {
  if (!audioContext || audio.muted || audio.volume <= 0) return false;
  if (!playerCrashBuffer) {
    void loadPlayerCrashBuffer().then((loadedBuffer) => {
      if (!loadedBuffer || !audioContext || audio.muted || audio.volume <= 0) return;
      playPlayerCrashSample();
    });
    return false;
  }

  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  source.buffer = playerCrashBuffer;
  gain.gain.value = audio.volume * playerCrashVolumeBoost;
  source.connect(gain).connect(audioContext.destination);
  source.start();
  return true;
}

function updateBgmEnergy(dt: number) {
  const safeDt = clamp(dt, 0, 0.1);
  advanceSkylineBeat(safeDt);
  if (!bgmAnalyser || !bgmFrequencyData || !shouldPlayBgm()) {
    bgmEnergy = lerp(bgmEnergy, 0, 0.08);
    bgmPulse = lerp(bgmPulse, 0, 0.12);
    bgmBrightness = lerp(bgmBrightness, 0, 0.1);
    skylineKick = lerp(skylineKick, 0, 0.14);
    skylineEnvelope = lerp(skylineEnvelope, 0, 1 - Math.exp(-safeDt / 0.5));
    skylineAudioRamp = lerp(skylineAudioRamp, 0, 1 - Math.exp(-safeDt / 0.42));
    if (skylineAudioRamp < 0.001) skylineAudioRampStartedAt = null;
    const bandRelease = 1 - Math.exp(-safeDt / 0.48);
    skylineBandEnergies.forEach((energy, index) => {
      skylineBandEnergies[index] = lerp(energy, 0, bandRelease);
    });
    previousBgmTarget = lerp(previousBgmTarget, 0, 0.12);
    previousBgmPeak = lerp(previousBgmPeak, 0, 0.12);
    skylineLowFast = lerp(skylineLowFast, 0, 1 - Math.exp(-safeDt / 0.18));
    skylineLowBaseline = lerp(skylineLowBaseline, 0, 1 - Math.exp(-safeDt / 0.55));
    skylineLowTransient = lerp(skylineLowTransient, 0, 1 - Math.exp(-safeDt / 0.18));
    skylineLowRise = lerp(skylineLowRise, 0, 1 - Math.exp(-safeDt / 0.12));
    skylineHeavyBeatScore = lerp(skylineHeavyBeatScore, 0, 1 - Math.exp(-safeDt / 0.18));
    skylinePreviousLowFast = skylineLowFast;
    return;
  }

  if (skylineAudioRampStartedAt === null) {
    skylineAudioRampStartedAt = performance.now() - skylineAudioRamp * skylineAudioRampDuration * 1000;
  }
  skylineAudioRamp = clamp(
    (performance.now() - skylineAudioRampStartedAt) / (skylineAudioRampDuration * 1000),
    0,
    1,
  );
  bgmAnalyser.getByteFrequencyData(bgmFrequencyData);
  const bins = Math.min(28, bgmFrequencyData.length);
  let lowMid = 0;
  let weightTotal = 0;
  let peak = 0;
  for (let i = 1; i < bins; i += 1) {
    const value = bgmFrequencyData[i] / 255;
    const weight = i < 8 ? 1.55 : i < 16 ? 1 : 0.68;
    lowMid += value * weight;
    weightTotal += weight;
    peak = Math.max(peak, value);
  }
  const target = clamp((lowMid / Math.max(1, weightTotal)) * 0.9, 0, 1);
  const drumEnd = Math.min(7, bgmFrequencyData.length);
  let drumLow = 0;
  let drumWeight = 0;
  for (let index = 1; index < drumEnd; index += 1) {
    const weight = index <= 2 ? 1.5 : index <= 4 ? 1.15 : 0.82;
    drumLow += (bgmFrequencyData[index] / 255) * weight;
    drumWeight += weight;
  }
  drumLow /= Math.max(1, drumWeight);
  skylineBandRanges.forEach(([start, end], bandIndex) => {
    const cappedEnd = Math.min(end, bgmFrequencyData?.length ?? 0);
    let sum = 0;
    let count = 0;
    for (let index = start; index < cappedEnd; index += 1) {
      sum += (bgmFrequencyData?.[index] ?? 0) / 255;
      count += 1;
    }
    const average = count > 0 ? sum / count : 0;
    const bandTarget = clamp(Math.pow(average, 0.78) * skylineBandMultipliers[bandIndex], 0, 1);
    const current = skylineBandEnergies[bandIndex] ?? 0;
    const response = 1 - Math.exp(-safeDt / (bandTarget > current ? 0.24 : 0.42));
    skylineBandEnergies[bandIndex] = lerp(current, bandTarget, response);
  });
  const attack = target > bgmEnergy ? 0.58 : 0.18;
  bgmEnergy = lerp(bgmEnergy, target, attack);
  const pulseTarget = clamp(target * 0.58 + peak * 0.22, 0, 1);
  const previousPulse = bgmPulse;
  bgmPulse = lerp(bgmPulse, pulseTarget, pulseTarget > bgmPulse ? 0.62 : 0.22);
  bgmBrightness = lerp(bgmBrightness, clamp(peak * 0.42 + target * 0.28, 0, 1), 0.38);
  const targetRise = Math.max(0, target - previousBgmTarget);
  const peakRise = Math.max(0, peak - previousBgmPeak);
  const pulseRise = Math.max(0, pulseTarget - previousPulse);
  const kickTarget = clamp(targetRise * 8.5 + peakRise * 3.8 + pulseRise * 1.6, 0, 1);
  const kickResponse = 1 - Math.exp(-safeDt / (kickTarget > skylineKick ? 0.16 : 0.55));
  skylineKick = lerp(skylineKick, kickTarget, kickResponse);
  const envelopeTarget = clamp(bgmPulse * 0.68 + bgmEnergy * 0.32 + skylineKick * 0.12, 0, 1);
  const envelopeResponse =
    1 - Math.exp(-safeDt / (envelopeTarget > skylineEnvelope ? 0.34 : 0.52));
  skylineEnvelope = lerp(skylineEnvelope, envelopeTarget, envelopeResponse);

  const fastResponse = 1 - Math.exp(-safeDt / (drumLow > skylineLowFast ? 0.035 : 0.13));
  const baselineResponse = 1 - Math.exp(-safeDt / 0.82);
  skylineLowFast = lerp(skylineLowFast, drumLow, fastResponse);
  skylineLowBaseline = lerp(skylineLowBaseline, drumLow, baselineResponse);
  skylineLowTransient = Math.max(0, skylineLowFast - skylineLowBaseline);
  skylineLowRise = Math.max(0, skylineLowFast - skylinePreviousLowFast);
  const transientRatio = skylineLowTransient / Math.max(0.12, skylineLowBaseline);
  skylineHeavyBeatScore = clamp(
    skylineLowFast * 0.34 +
      skylineLowTransient * 3.4 +
      transientRatio * 0.46 +
      skylineLowRise * 2.2,
    0,
    1,
  );
  if (
    skylineBeatCooldown <= 0 &&
    skylineBeatPhase >= skylineBeatRetriggerPhase &&
    skylineLowFast >= skylineBeatLowFloor &&
    skylineLowTransient >= skylineBeatTransientFloor &&
    skylineLowRise >= skylineBeatRiseFloor &&
    skylineHeavyBeatScore >= skylineBeatScoreFloor
  ) {
    triggerSkylineHeavyBeat(skylineHeavyBeatScore);
  }
  skylinePreviousLowFast = skylineLowFast;
  previousBgmTarget = lerp(previousBgmTarget, target, 0.52);
  previousBgmPeak = lerp(previousBgmPeak, peak, 0.52);
}

function updateMusic(dt: number) {
  syncBgm();
  updateOpeningAudio();
  const bgm = bgmElement;
  if (!bgm) return;

  const playing = shouldPlayBgm();
  let targetVolume = playing ? audio.volume : 0;
  if (playing && Number.isFinite(bgm.duration) && bgm.duration > 4) {
    const fadeWindow = 2.2;
    if (bgm.currentTime >= bgm.duration - 0.12) bgm.currentTime = 0;
    const remaining = bgm.duration - bgm.currentTime;
    const loopFade = Math.min(1, bgm.currentTime / fadeWindow, remaining / fadeWindow);
    targetVolume *= clamp(loopFade, 0, 1);
  } else if (playing) {
    targetVolume *= Math.min(1, bgm.currentTime / 1.4);
  }

  const fadeRate = playing ? 1.8 : 2.8;
  bgm.volume = lerp(bgm.volume, targetVolume, Math.min(1, dt * fadeRate));
  if (!playing && bgm.volume < 0.01 && !bgm.paused) bgm.pause();
  updateBgmEnergy(dt);
}

function playEffect(effect: "crash" | "button" | "attackHit") {
  if (!audioContext || audio.muted) return;
  if (effect === "crash") playPlayerCrashSample();
  if (effect === "button") playTone(440, 0.11, "triangle", 0.08);
  if (effect === "attackHit") playAttackHitEffect();
}

function setSoundwaveTrack(source?: string) {
  if (!source) return;
  const bgm = ensureBgm();
  const nextSource = new URL(source, window.location.href).href;
  if (bgm.src === nextSource) return;
  bgm.src = source;
  bgm.currentTime = 0;
  bgm.load();
}

async function handleSoundwavePlay(detail: { src?: string; volume?: number }) {
  if (typeof detail.volume === "number") audio.volume = clamp(detail.volume, 0, 1);
  audio.muted = false;
  setSoundwaveTrack(detail.src);
  bgmStarted = true;
  writeAudioSettings();
  await unlockAudio();
  syncBgm();
}

function handleSoundwavePause() {
  bgmStarted = false;
  syncBgm();
}

async function handleSoundwaveTrack(detail: {
  src?: string;
  volume?: number;
  autoplay?: boolean;
}) {
  if (typeof detail.volume === "number") audio.volume = clamp(detail.volume, 0, 1);
  setSoundwaveTrack(detail.src);
  bgmStarted = Boolean(detail.autoplay);
  writeAudioSettings();
  if (bgmStarted) await unlockAudio();
  syncBgm();
}

function handleSoundwaveVolume(detail: { volume?: number }) {
  if (typeof detail.volume !== "number") return;
  audio.volumeAdjusted = true;
  audio.volume = clamp(detail.volume, 0, 1);
  if (audio.volume > 0) audio.muted = false;
  writeAudioSettings();
  syncBgm();
}

function setupEvents() {
  // Start fetching the short opening cue as soon as the homepage runtime is
  // ready, so ENTER can begin audio and visuals together on slower networks.
  ensureOpeningAudio().load();
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("blur", pauseGame);
  window.addEventListener("focus", resumeGame);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
    else resumeGame();
  });
  window.addEventListener("opening-user-gesture", () => {
    audio.unlocked = true;
    ensureOpeningAudio();
    playOpeningAudio();
    void unlockAudio();
  });
  window.addEventListener("opening-audio-cancel", () => {
    openingAudioStartToken += 1;
    openingAudioStartPending = false;
    openingAudioStarted = true;
    if (openingAudioElement) {
      openingAudioElement.pause();
      openingAudioElement.currentTime = 0;
    }
  });
  window.__neonDriveOpeningAudioReady = true;
  window.dispatchEvent(new CustomEvent("opening-audio-ready"));
  window.addEventListener("opening-complete", () => {
    stopOpeningAudio(0.34);
  });
  window.addEventListener("soundwave:play", (event) => {
    void handleSoundwavePlay(
      (event as CustomEvent<{ src?: string; volume?: number }>).detail ?? {},
    );
  });
  window.addEventListener("soundwave:pause", () => {
    handleSoundwavePause();
  });
  window.addEventListener("soundwave:track", (event) => {
    void handleSoundwaveTrack(
      (event as CustomEvent<{ src?: string; volume?: number; autoplay?: boolean }>).detail ?? {},
    );
  });
  window.addEventListener("soundwave:volume", (event) => {
    handleSoundwaveVolume(
      (event as CustomEvent<{ volume?: number }>).detail ?? {},
    );
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === "r") {
      if (state.mode !== "idle") resetToStandby("STANDING BY");
      return;
    }
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      shiftLane(-1);
      unlockAudio();
    }
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      shiftLane(1);
      unlockAudio();
    }
    if (key === "w" || event.key === "ArrowUp") {
      void unlockAudio();
      attackTarget("front");
    }
    if (key === "q") {
      void unlockAudio();
      attackTarget("left");
    }
    if (key === "e") {
      void unlockAudio();
      attackTarget("right");
    }
  });

  readout.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.driveMode === "airing" ? "airing" : "race";
      void startDriveMode(mode);
    });
  });

  canvas.addEventListener("pointerdown", async (event) => {
    pointerActive = true;
    pointerLastShiftX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
    await unlockAudio();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointerActive) return;
    updatePointerLane(event.clientX);
  });

  canvas.addEventListener("pointerup", (event) => {
    pointerActive = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointercancel", () => {
    pointerActive = false;
  });

}

function updatePointerLane(clientX: number) {
  const threshold = Math.max(42, width * 0.055);
  const delta = clientX - pointerLastShiftX;
  if (Math.abs(delta) < threshold) return;
  shiftLane(delta > 0 ? 1 : -1);
  pointerLastShiftX = clientX;
}

function sortedGridZ(side = -1) {
  return roadScene.gridCrossLines
    .filter((strip) => strip.core.userData.side === side && Number.isInteger(strip.core.userData.index))
    .map((strip) => strip.core.position.z)
    .sort((a, b) => a - b);
}

function sortedPalmZ(side = -1) {
  return roadScene.palms
    .filter((palm) => palm.userData.side === side)
    .map((palm) => palm.position.z)
    .sort((a, b) => a - b);
}

function sortedDashZ(lanePosition = 0.5) {
  return roadScene.dashes
    .filter((dash) => dash.userData.lanePosition === lanePosition)
    .map((dash) => dash.position.z)
    .sort((a, b) => a - b);
}

function adjacentDeltas(values: number[]) {
  return values.slice(1).map((value, index) => value - values[index]);
}

function palmGridAlignmentDeltas() {
  const grid = sortedGridZ(-1);
  return sortedPalmZ(-1).map((z) =>
    grid.reduce((nearest, gridZ) => Math.min(nearest, Math.abs(gridZ - z)), Number.POSITIVE_INFINITY),
  );
}

function installDebugHook() {
  window.__neonDriveDebug = {
    startMode: (mode: DriveMode) => {
      resetRun(mode);
    },
    reset: () => {
      resetToStandby("STANDING BY");
    },
    attack: (direction: AttackDirection) => {
      attackTarget(direction);
    },
    injectObstacle: (laneIndex: LaneIndex, progress = 0.7) => {
      obstacles.push({
        id: nextObstacleId,
        type: "traffic",
        laneIndex,
        trackY: trackHorizonY() + trackRange() * progress,
        passed: false,
      });
      nextObstacleId += 1;
    },
    setComboForTest: (count: number, pool = 0) => {
      state.comboCount = Math.max(0, Math.floor(count));
      state.comboTimer = state.comboCount > 0 ? comboWindow : 0;
      state.comboPool = Math.max(0, Math.floor(pool));
      state.comboFlashTimer = 0;
    },
    snapshot: () => ({
      mode: state.mode,
      driveMode: state.driveMode,
      distance: state.distance,
      score: state.score,
      scoreBonus: state.scoreBonus,
      speed: state.speed,
      best: state.best,
      comboCount: state.comboCount,
      comboTimer: state.comboTimer,
      comboPool: state.comboPool,
      comboWindow,
      attackTimer: state.attackTimer,
      attackCooldown: state.attackCooldown,
      attackLaneOffset: state.attackLaneOffset,
      attackWreckDuration,
      playerLane: player.laneIndex,
      playerX: laneOffset(player.visualLane),
      obstacleCount: obstacles.length,
      scorePopups: scorePopups.map((popup) => ({
        id: popup.id,
        obstacleId: popup.obstacleId,
        value: popup.value,
        timer: popup.timer,
        duration: popup.duration,
        laneIndex: popup.laneIndex,
        trackY: popup.trackY,
        anchorX: popup.anchorX,
        anchorY: popup.anchorY,
      })),
      attackSoundMode,
      uiPreviewMode,
      bgmStarted,
      bgmEnergy,
      bgmPulse,
      bgmBrightness,
      skylineKick,
      skylineEnvelope,
      skylineAudioRamp,
      skylineAudioInfluence: skylineAudioInfluence(),
      skylineAudioRampDuration,
      buildingCount: roadScene.buildings.length,
      skylineGeometryHeightScale,
      skylineBaseMotionScale,
      skylineHeightMotionScale,
      skylineMusicMotionHeightScale,
      skylineMotionMode,
      skylineBlockCount,
      skylineBandEnergies: [...skylineBandEnergies],
      skylineBlockPulses: Array.from({ length: skylineBlockCount }, (_, index) =>
        skylineBlockPulse(index),
      ),
      skylineBeatSectionCount,
      skylineBeatLiftRatio,
      skylineBeatTargetLift: currentSkylineBeatLift(),
      skylineBeatRiseTarget: currentSkylineBeatLift(),
      skylineBeatFallTarget: -currentSkylineBeatLift(),
      skylineBeatDuration,
      skylineBeatCooldownDuration,
      skylineBeatRetriggerPhase,
      skylineBeatLowFloor,
      skylineBeatTransientFloor,
      skylineBeatRiseFloor,
      skylineBeatScoreFloor,
      skylineBeatCount,
      skylineBeatPhase,
      skylineBeatCurve: skylineBeatCurve(),
      skylineBeatMask,
      skylineBeatMaskHistory: [...skylineBeatMaskHistory],
      skylineBeatStrength,
      skylineBeatSectionPulses: Array.from({ length: skylineBeatSectionCount }, (_, index) =>
        skylineBeatSectionPulse(index),
      ),
      skylineLowFast,
      skylineLowBaseline,
      skylineLowTransient,
      skylineLowRise,
      skylineHeavyBeatScore,
      sunStripeSpeed,
      sunTextureUpdateInterval,
      bgmPaused: bgmElement ? bgmElement.paused : true,
      bgmVolume: bgmElement ? bgmElement.volume : 0,
      bgmSrc: bgmElement?.currentSrc || bgmUrl,
      openingAudioActive,
      openingAudioStarted,
      openingAudioPaused: openingAudioElement ? openingAudioElement.paused : true,
      openingAudioCurrentTime: openingAudioElement ? openingAudioElement.currentTime : 0,
      openingAudioVolume: openingAudioElement ? openingAudioElement.volume : 0,
      openingAudioVolumeBoost,
      openingAudioSrc: openingAudioElement?.currentSrc || openingAudioUrl,
      gridSpacing: worldScene.gridSpacing,
      palmGridInterval: worldScene.palmSpacing / worldScene.gridSpacing,
      gridSlotCount: roadScene.gridSlotCount,
      palmGroupCount: roadScene.palmGroupCount,
      dashSlotCount: roadScene.dashSlotCount,
      gridSpacingDeltas: adjacentDeltas(sortedGridZ(-1)),
      palmSpacingDeltas: adjacentDeltas(sortedPalmZ(-1)),
      palmGridAlignmentDeltas: palmGridAlignmentDeltas(),
      dashSpacingDeltas: adjacentDeltas(sortedDashZ(0.5)),
      roadScroll,
      gridZ: roadScene.gridCrossLines.slice(0, 12).map((strip) => ({
        index: strip.core.userData.index as number,
        side: strip.core.userData.side as number,
        z: strip.core.position.z,
      })),
      palmZ: roadScene.palms.slice(0, 10).map((palm) => ({
        index: palm.userData.index as number,
        side: palm.userData.side as number,
        z: palm.position.z,
      })),
      dashZ: roadScene.dashes.slice(0, 8).map((dash) => ({
        index: dash.userData.index as number,
        lanePosition: dash.userData.lanePosition as number,
        z: dash.position.z,
      })),
      buildingHeights: roadScene.buildings.map((building) => ({
        index: building.userData.index as number,
        blockIndex: building.userData.blockIndex as number,
        bandIndex: skylineBandForBlock(building.userData.blockIndex as number),
        baseHeight: building.userData.baseHeight as number,
        beatSectionIndex: building.userData.beatSectionIndex as number,
        silhouetteScale: building.userData.silhouetteScale as number,
        basePulse: building.userData.basePulse as number,
        blockPulse: building.userData.blockPulse as number,
        beatPulse: building.userData.beatPulse as number,
        beatOffset: building.userData.beatOffset as number,
        scaleY: building.scale.y,
        height: building.position.y * 2,
        opacity: (building.material as THREE.MeshBasicMaterial).opacity,
        color: (building.material as THREE.MeshBasicMaterial).color.getHex(),
      })),
      obstacles: obstacles.map((obstacle) => {
        const vehicle = roadScene.obstacleVehicles.get(obstacle.id);
        const wreckTransform = obstacleWreckTransform(obstacle);
        return {
          id: obstacle.id,
          laneIndex: obstacle.laneIndex,
          trackY: obstacle.trackY,
          progress: trackProgress(obstacle.trackY),
          wreckedByAttack: Boolean(obstacle.wreckedByAttack),
          wreckTimer: obstacle.wreckTimer ?? 0,
          wreckDirection: obstacle.wreckDirection ?? null,
          attackScore: obstacle.attackScore ?? 0,
          wreckProgress: wreckTransform.progress,
          wreckHeightScale: wreckTransform.heightScale,
          wreckLift: wreckTransform.lift,
          wreckOffsetX: wreckTransform.offsetX,
          wreckOffsetZ: wreckTransform.offsetZ,
          type: obstacle.type,
          visualX: vehicle?.sprite.position.x ?? 0,
          visualY: vehicle?.sprite.position.y ?? 0,
          visualZ: vehicle?.sprite.position.z ?? 0,
          scaleX: vehicle?.sprite.scale.x ?? 0,
          scaleY: vehicle?.sprite.scale.y ?? 0,
          materialOpacity: vehicle?.sprite.material.opacity ?? 0,
          materialColor: vehicle?.sprite.material.color.getHex() ?? 0,
          materialTransparent: vehicle?.sprite.material.transparent ?? true,
        };
      }),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    }),
  };
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    __soundwavePlayer?: {
      playFromGame: () => Promise<void>;
      pause: () => void;
      getState: () => {
        loaded: boolean;
        playing: boolean;
        section: string;
        trackIndex: number;
        volume: number;
      };
    };
    __neonDriveOpeningAudioReady?: boolean;
    __neonDriveDebug?: {
      startMode: (mode: DriveMode) => void;
      reset: () => void;
      attack: (direction: AttackDirection) => void;
      injectObstacle: (laneIndex: LaneIndex, progress?: number) => void;
      setComboForTest: (count: number, pool?: number) => void;
      snapshot: () => {
        mode: GameMode;
        driveMode: DriveMode | null;
        distance: number;
        score: number;
        scoreBonus: number;
        speed: number;
        best: number;
        comboCount: number;
        comboTimer: number;
        comboPool: number;
        comboWindow: number;
        attackTimer: number;
        attackCooldown: number;
        attackLaneOffset: number;
        attackWreckDuration: number;
        playerLane: LaneIndex;
        playerX: number;
        obstacleCount: number;
        scorePopups: Array<{
          id: number;
          obstacleId: number;
          value: number;
          timer: number;
          duration: number;
          laneIndex: LaneIndex;
          trackY: number;
          anchorX: number;
          anchorY: number;
        }>;
        attackSoundMode: AttackSoundMode;
        uiPreviewMode: UiPreviewVariant | null;
        bgmStarted: boolean;
        bgmEnergy: number;
        bgmPulse: number;
        bgmBrightness: number;
        skylineKick: number;
        skylineEnvelope: number;
        skylineAudioRamp: number;
        skylineAudioInfluence: number;
        skylineAudioRampDuration: number;
        buildingCount: number;
        skylineGeometryHeightScale: number;
        skylineBaseMotionScale: number;
        skylineHeightMotionScale: number;
        skylineMusicMotionHeightScale: number;
        skylineMotionMode: typeof skylineMotionMode;
        skylineBlockCount: number;
        skylineBandEnergies: number[];
        skylineBlockPulses: number[];
        skylineBeatSectionCount: number;
        skylineBeatLiftRatio: number;
        skylineBeatTargetLift: number;
        skylineBeatRiseTarget: number;
        skylineBeatFallTarget: number;
        skylineBeatDuration: number;
        skylineBeatCooldownDuration: number;
        skylineBeatRetriggerPhase: number;
        skylineBeatLowFloor: number;
        skylineBeatTransientFloor: number;
        skylineBeatRiseFloor: number;
        skylineBeatScoreFloor: number;
        skylineBeatCount: number;
        skylineBeatPhase: number;
        skylineBeatCurve: number;
        skylineBeatMask: number;
        skylineBeatMaskHistory: number[];
        skylineBeatStrength: number;
        skylineBeatSectionPulses: number[];
        skylineLowFast: number;
        skylineLowBaseline: number;
        skylineLowTransient: number;
        skylineLowRise: number;
        skylineHeavyBeatScore: number;
        sunStripeSpeed: number;
        sunTextureUpdateInterval: number;
        bgmPaused: boolean;
        bgmVolume: number;
        bgmSrc: string;
        openingAudioActive: boolean;
        openingAudioStarted: boolean;
        openingAudioPaused: boolean;
        openingAudioCurrentTime: number;
        openingAudioVolume: number;
        openingAudioVolumeBoost: number;
        openingAudioSrc: string;
        gridSpacing: number;
        palmGridInterval: number;
        gridSlotCount: number;
        palmGroupCount: number;
        dashSlotCount: number;
        gridSpacingDeltas: number[];
        palmSpacingDeltas: number[];
        palmGridAlignmentDeltas: number[];
        dashSpacingDeltas: number[];
        roadScroll: number;
        gridZ: Array<{ index: number; side: number; z: number }>;
        palmZ: Array<{ index: number; side: number; z: number }>;
        dashZ: Array<{ index: number; lanePosition: number; z: number }>;
        buildingHeights: Array<{
          index: number;
          blockIndex: number;
          bandIndex: number;
          baseHeight: number;
          beatSectionIndex: number;
          silhouetteScale: number;
          basePulse: number;
          blockPulse: number;
          beatPulse: number;
          beatOffset: number;
          scaleY: number;
          height: number;
          opacity: number;
          color: number;
        }>;
        obstacles: Array<{
          id: number;
          laneIndex: LaneIndex;
          trackY: number;
          progress: number;
          wreckedByAttack: boolean;
          wreckTimer: number;
          wreckDirection: AttackDirection | null;
          attackScore: number;
          wreckProgress: number;
          wreckHeightScale: number;
          wreckLift: number;
          wreckOffsetX: number;
          wreckOffsetZ: number;
          type: ObstacleType;
          visualX: number;
          visualY: number;
          visualZ: number;
          scaleX: number;
          scaleY: number;
          materialOpacity: number;
          materialColor: number;
          materialTransparent: boolean;
        }>;
        canvasWidth: number;
        canvasHeight: number;
      };
    };
  }
}

export {};

setupThreeScene();
resizeCanvas();
setupEvents();
installDebugHook();
generatedVehicleAssetsReady = preloadGeneratedVehicleAssets();
setStatus("STANDING BY");
updateHud();
requestAnimationFrame(loop);
