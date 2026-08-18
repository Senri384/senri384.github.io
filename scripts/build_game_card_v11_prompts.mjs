import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'game-card-system', 'generation-plan-v5.json'), 'utf8'));
const outPath = path.join(root, 'docs', 'game-card-system', 'generation-prompts-v11.json');

const style = `Use case: stylized-concept. Asset type: portfolio game-cartridge artwork. Style/medium: polished 16-bit-era pixel illustration with clearly visible medium-sized square pixels, recognizable silhouettes and facial/prop cues, controlled cluster shading, 8-12 effective colors, and enough detail to preserve the source identity. This must be less coarse than 8-bit icon art but still unmistakably pixel-based. Color: preserve the work or reference's natural palette and tonal hierarchy; allow neutral, muted, pale, dark, and saturated regions where appropriate; do not globally boost saturation. Constraints: flat artwork only, no product mockup, no case, no cartridge shell, no frame, no text, no letters, no numbers, no Chinese, no logos, no trademarks, no watermark, no cyan-magenta neon outline, no smooth painted gradients, no photographic texture.`;

function referenceRule(work) {
  if (!work.userReference) return 'Invent the composition from the work content only; do not imitate a photograph.';
  if (work.referenceMode === 'direct-faithful-reference') {
    return `Input image 1 role: primary composition and subject reference. Preserve its main subject identity or silhouette, pose, relative scale, principal props, dominant color relationships, and visual hierarchy faithfully. Remove all existing text, logos, branding, and poster borders. If the reference is landscape, extract the central recognizable elements and recompose them vertically without inventing an unrelated scene. Rebuild as original pixel art rather than pasting the image.`;
  }
  if (work.referenceMode === 'direct-back-view-reference') {
    return `Input image 1 role: primary character and pose reference. Preserve the referenced character's back-view silhouette, hair/cape shape, direction of gaze, pastel color relationship, and farewell mood faithfully. Build the surrounding vertical scene from the work content. Remove every word and logo.`;
  }
  return `Input image 1 role: core-element reference. Retain its most recognizable characters, objects, action relationships, and dominant color balance. Recompose into a vertical design while keeping those elements clearly identifiable. Remove all text, logos, branding, and poster borders; do not replace the subject with a generic symbol.`;
}

function photoRule(work) {
  return work.category === 'photography'
    ? 'Photography collection rule: do not reuse or imitate an original photo. Invent a symbolic environment or object-based scene from the collection theme. Cover remains completely untitled.'
    : '';
}

const prompts = {};
for (const work of plan.works) {
  if (work.sharedResourceWith) continue;
  const base = `${style} ${referenceRule(work)} ${photoRule(work)}`.trim();
  prompts[work.slug] = {
    referencePath: work.userReference || null,
    cover: `${base} Primary request: full-bleed vertical cover art, approximately 8:13. Content: ${work.cover}. Preserve a clear focal subject and readable depth. Leave visually calm space only where the external title policy requires it; generate no title yourself.`,
    inside: `${base} Primary request: full-bleed vertical inside-left-page art, approximately 8:13, based on: ${work.inside}. This must be an independent editorial composition, not a crop, repeat, or miniature of the cover. Use pictorial map, portrait, route, inventory, timeline, specimen, or object-sheet structure appropriate to the work. No readable labels or pseudo-text.`,
    cartridge: `${style} Input image 1 role: exact approved cover artwork reference. Primary request: make a simplified vertical cartridge-label version of the same cover. Preserve the same dominant subject, silhouette, and color identity; reduce it to two or three large forms with 5-7 effective colors, but do not replace it with a generic unrelated icon. Content emphasis: ${work.cartridge}. No text.`,
  };
}

fs.writeFileSync(outPath, JSON.stringify({ version: 'V11', prompts }, null, 2), 'utf8');
console.log(JSON.stringify({ outPath, uniqueWorks: Object.keys(prompts).length }, null, 2));
