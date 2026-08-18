import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const planPath = path.join(root, 'docs', 'game-card-system', 'generation-plan-v4.json');
const outPath = path.join(root, 'docs', 'game-card-system', 'generation-prompts-v10.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

const common = (work) => `Use only this vivid palette family: ${work.palette.join(', ')}. Create original flat pixel artwork, not a product mockup. Extremely coarse late-1980s 8-bit visual language: large square clusters, chunky silhouettes, five to seven solid colors, minimal internal lines, no fine outlines, no micro-detail, no smooth gradients, no soft shading, no antialiasing, no glossy 3D render, no cyan-magenta neon outline. Strong value contrast and saturated color separation. Absolutely no text, letters, numbers, logos, trademarks, watermarks, Chinese characters, frames, packaging, case, cartridge shell, nested image, pasted poster, or photographic texture.`;

const reference = (work) => work.userReference
  ? `The supplied reference is identification and composition research only. Extract its recognizable core subject and color relationship, then rebuild it as a new vertical coarse-pixel composition. Never paste, trace, crop, or reproduce the reference; remove every existing word and logo. User-specific direction: ${work.userRequirement || 'retain only the core visual identity'}.`
  : `Invent the image from the work content and design notes. Do not imitate a photograph.`;

const photography = (work) => work.category === 'photography'
  ? 'This is a photography collection, but do not use or imitate any original photograph. Invent a symbolic visual scene from the theme. The cover must remain completely untitled.'
  : '';

const prompts = Object.fromEntries(plan.works.map((work) => {
  const base = `${common(work)} ${reference(work)} ${photography(work)}`.trim();
  return [work.slug, {
    referencePath: work.userReference || null,
    cover: `${base} COVER ART: a full-bleed vertical 8:13 composition. Content: ${work.cover}. Reserve broad calm shapes where an external title may later be added, but generate no title yourself. Make this work immediately distinguishable from every other cover through its palette and silhouette.`,
    inside: `${base} INSIDE LEFT PAGE ART: a full-bleed vertical 8:13 composition that is an independent editorial design, never a copy of the cover and never the reference image pasted into a page. Content: ${work.inside}. Use only pictorial modules such as a map, portrait, object inventory, route diagram, specimen sheet, scene fragments, or icon grid. No readable UI labels and no pseudo-text.`,
    cartridge: `${base} CARTRIDGE LABEL ART: a full-bleed vertical 8:13 composition derived from the cover concept but reduced to one bold emblem or silhouette. Content cue: ${work.cartridge}. Use only two to four palette colors, one centered symbol, very large pixels, almost no internal detail, and generous negative space.`
  }];
}));

fs.writeFileSync(outPath, JSON.stringify({ version: 'V10', prompts }, null, 2), 'utf8');
console.log(JSON.stringify({ outPath, count: Object.keys(prompts).length }, null, 2));
