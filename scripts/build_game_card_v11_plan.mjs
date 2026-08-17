import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'docs', 'game-card-system', 'generation-plan-v4.json');
const outPath = path.join(root, 'docs', 'game-card-system', 'generation-plan-v5.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

const titleStyles = {
  'dwarf-lost-in-the-dark-forest': { fontFamily: 'georgia', placement: 'top-center', treatment: 'engraved-serif', size: 24, tracking: 1 },
  'stones-feast': { fontFamily: 'impact', placement: 'bottom-left', treatment: 'heavy-poster', size: 31, tracking: 0 },
  'the-cold-trial': { fontFamily: 'consolas', placement: 'top-left', treatment: 'technical-grid', size: 27, tracking: 2 },
  'peak-social-design': { fontFamily: 'trebuchet', placement: 'top-right', treatment: 'outdoor-badge', size: 34, tracking: 1 },
  'rock-kingdom-world-breakdown': { fontFamily: 'palatino', placement: 'bottom-center', treatment: 'fantasy-crest', size: 28, tracking: 1 },
  'rock-kingdom-farewell': { fontFamily: 'book-antiqua', placement: 'top-center', treatment: 'quiet-editorial', size: 25, tracking: 3 },
  'pokemon-character-design': { fontFamily: 'arial-black', placement: 'left-vertical', treatment: 'arcade-column', size: 25, tracking: 1 },
  'helldivers2-community-ops': { fontFamily: 'franklin', placement: 'top-left', treatment: 'military-stencil', size: 25, tracking: 2 },
  'disappear': { fontFamily: 'bahnschrift', placement: 'bottom-left', treatment: 'cinematic-minimal', size: 33, tracking: 4 },
  'iron-superman': { fontFamily: 'rockwell', placement: 'bottom-center', treatment: 'retro-serial', size: 26, tracking: 1 },
  'rain-alley-pagoda-tree': { fontFamily: 'cambria', placement: 'top-left', treatment: 'literary-serif', size: 27, tracking: 2 },
  'short-film-iron-superman': { fontFamily: 'rockwell', placement: 'bottom-center', treatment: 'retro-serial', size: 26, tracking: 1 },
  'short-film-sanction': { fontFamily: 'segoe-black', placement: 'top-right', treatment: 'judgement-block', size: 34, tracking: 2 },
  'short-film-disappear': { fontFamily: 'bahnschrift', placement: 'bottom-left', treatment: 'cinematic-minimal', size: 33, tracking: 4 },
};

const referenceModes = new Map([
  ['peak-social-design', 'extract-core-elements'],
  ['rock-kingdom-world-breakdown', 'extract-core-elements'],
  ['transformers-ip-games', 'direct-faithful-reference'],
  ['rock-kingdom-farewell', 'direct-back-view-reference'],
  ['pokemon-character-design', 'direct-faithful-reference'],
  ['helldivers2-community-ops', 'extract-core-elements'],
  ['alien-meme-culture', 'direct-faithful-reference'],
  ['chainsaw-man-dream', 'direct-faithful-reference'],
  ['fujimoto-cinematic-sense', 'direct-faithful-reference'],
  ['rango-review', 'direct-faithful-reference'],
  ['twelve-angry-men-review', 'direct-faithful-reference'],
  ['2001-space-odyssey-review', 'direct-faithful-reference'],
  ['short-film-sanction', 'direct-faithful-reference'],
]);

const sharedResources = {
  'short-film-iron-superman': 'iron-superman',
  'short-film-disappear': 'disappear',
};

const works = source.works.map((work) => ({
  ...work,
  referenceMode: referenceModes.get(work.slug) || (work.userReference ? 'extract-core-elements' : 'content-derived-original'),
  titlePolicy: work.titlePolicy.show
    ? { ...work.titlePolicy, ...titleStyles[work.slug] }
    : { show: false, text: null, fontFamily: null, placement: null, treatment: null },
  sharedResourceWith: sharedResources[work.slug] || null,
  logicalGrid: {
    cover: [144, 234],
    inside: [136, 222],
    cartridge: [100, 146],
    upscale: 'nearest-neighbor-only',
  },
}));

const plan = {
  ...source,
  source: 'Online Feishu Base refreshed for V11',
  syncedAt: new Date().toISOString(),
  version: 'V11',
  productionRules: {
    ...source.productionRules,
    fidelityPriority: ['userReference', 'userRequirement', 'workContent', 'tableDesignSuggestion'],
    pixelArt: {
      logicalResolution: 'medium',
      colorsPerArtwork: [8, 12],
      preserveRecognizablePoseAndComposition: true,
      avoidMicroDetail: true,
      avoidExtremeChunkiness: true,
    },
    color: {
      preserveReferencePalette: true,
      noGlobalSaturationFloor: true,
      allowNeutralAndLowSaturationAreas: true,
      requireCrossWorkVariation: true,
    },
    referenceHandling: {
      direct: 'preserve main subject, pose, scale, color relationship and hierarchy; remove text/logo; vertical recompose only when needed',
      extract: 'retain recognizable core elements and relative roles; vertical recompose without unrelated invention',
      photography: 'invent thematic imagery; no photo reuse; no title',
    },
    sharedResources,
  },
  works,
};

fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8');
console.log(JSON.stringify({ outPath, works: works.length, sharedResources, titled: works.filter(w => w.titlePolicy.show).length }, null, 2));
