import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const oldPlanPath = path.join(root, "docs/game-card-system/generation-plan-v3.json");
const onlinePath = path.join(root, "feishu-latest-v10.ndjson");
const outPath = path.join(root, "docs/game-card-system/generation-plan-v4.json");

const oldPlan = JSON.parse(fs.readFileSync(oldPlanPath, "utf8"));
const onlineRows = fs.readFileSync(onlinePath, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const onlineBySlug = new Map(onlineRows.map((row) => [row.Slug, row]));

const palette = {
  "dwarf-lost-in-the-dark-forest": ["#11121a", "#e9ddbd", "#e73735", "#4169a8"],
  "stones-feast": ["#d99a34", "#6f7b35", "#f5e2ae", "#d54830"],
  "the-cold-trial": ["#0c3d91", "#38c7e7", "#f4fbff", "#d72d45"],
  "peak-social-design": ["#6944d8", "#f36a4f", "#ffd24a", "#67c9ef"],
  "rock-kingdom-world-breakdown": ["#68c84b", "#2465c7", "#ffc43d", "#e9568e"],
  "transformers-ip-games": ["#e65b2f", "#477ba7", "#f0d7a7", "#25242d"],
  "rock-kingdom-farewell": ["#9d75d8", "#63c8c8", "#f29a87", "#f0c35b"],
  "pokemon-character-design": ["#7bdc45", "#ef5fa3", "#51c7e8", "#fff0b3"],
  "helldivers2-community-ops": ["#db3a2c", "#f18b32", "#151923", "#8bd9e8"],
  "alien-meme-culture": ["#b7ef44", "#7b4ab9", "#141b36", "#eff7cf"],
  "chainsaw-man-dream": ["#ed3638", "#51d2c9", "#111822", "#f4e5c0"],
  "fujimoto-cinematic-sense": ["#10141c", "#f5eee0", "#ef493d", "#49bad1"],
  "bbno-internet-playbook": ["#b58be3", "#e5ef52", "#52cce0", "#171526"],
  "disappear": ["#1f9e9a", "#315caa", "#e985a6", "#d9ded7"],
  "iron-superman": ["#e0b33f", "#233d67", "#b94836", "#f0dfb6"],
  "rain-alley-pagoda-tree": ["#27865b", "#b74a3a", "#4389a8", "#e8a23b"],
  "caines-mutiny-stage-review": ["#18396d", "#f4e7c9", "#b44837", "#14141b"],
  "rango-review": ["#3eb7a5", "#ec8a35", "#72c8ef", "#ddbf70"],
  "twelve-angry-men-review": ["#d9382d", "#f2b82e", "#f2dfb0", "#202027"],
  "2001-space-odyssey-review": ["#f4f2dc", "#f06b2f", "#10131a", "#365cb4"],
  "film-ranking-analysis": ["#39bccc", "#f28b30", "#7c51bd", "#171725"],
  "game-experience-table": ["#e64f91", "#72d7b0", "#33357d", "#f0cc3d"],
  "short-film-iron-superman": ["#e5bd35", "#16191d", "#c43d31", "#355a9a"],
  "short-film-sanction": ["#12151b", "#efe6d0", "#c62931", "#8b9a72"],
  "short-film-disappear": ["#f2e8d1", "#3f7ead", "#db779d", "#222c3b"],
  wangu: ["#a64732", "#4c9b78", "#d0a33b", "#17181c"],
  liuguang: ["#2379db", "#dc4eac", "#efa43b", "#101325"],
  cangmang: ["#6cbfe5", "#ba873c", "#f1e8cf", "#233a60"],
  shenhai: ["#264fbd", "#39bfc0", "#8252c7", "#ef6f68"],
  zhejin: ["#e5aa36", "#4e8a4d", "#f3e1b9", "#bd6542"],
};

const titlePolicy = {
  "dwarf-lost-in-the-dark-forest": ["DWARF: LOST IN THE DARK FOREST", "georgia", "branch-carved"],
  "stones-feast": ["STONE'S FEAST", "impact", "comic-horror"],
  "the-cold-trial": ["THE COLD TRIAL", "consolas", "case-file"],
  "peak-social-design": ["PEAK", "trebuchet", "rounded-adventure"],
  "rock-kingdom-world-breakdown": ["ROCO KINGDOM", "trebuchet", "playful-fantasy"],
  "rock-kingdom-farewell": ["ROCO KINGDOM", "georgia", "soft-farewell"],
  "pokemon-character-design": ["CREATURE DESIGN", "trebuchet", "toy-bright"],
  "helldivers2-community-ops": ["COMMUNITY OPS", "impact", "propaganda-block"],
  disappear: ["DISAPPEAR", "consolas", "eroded-school"],
  "iron-superman": ["SUPER IRON WHERE", "georgia", "pulp-serial"],
  "rain-alley-pagoda-tree": ["RAIN ALLEY", "georgia", "weathered-literary"],
  "short-film-iron-superman": ["SUPER IRON WHERE", "impact", "bold-tokusatsu"],
  "short-film-sanction": ["SANCTION", "consolas", "red-stamp"],
  "short-film-disappear": ["DISAPPEAR", "consolas", "overexposed-scan"],
};

const referenceMode = {
  "peak-social-design": "user-extract-core-recompose-portrait",
  "rock-kingdom-world-breakdown": "user-extract-core-recompose-portrait",
  "transformers-ip-games": "user-direct-composition-coarse-pixel",
  "rock-kingdom-farewell": "user-back-view-coarse-silhouette",
  "pokemon-character-design": "user-direct-composition-remove-branding",
  "helldivers2-community-ops": "user-extract-core-recompose-portrait",
  "alien-meme-culture": "user-direct-composition-simplified",
  "chainsaw-man-dream": "user-direct-composition-simplified",
  "fujimoto-cinematic-sense": "user-direct-composition-remove-text",
  "rango-review": "user-direct-composition-remove-text",
  "twelve-angry-men-review": "user-direct-composition-remove-text",
  "2001-space-odyssey-review": "user-direct-composition-remove-text",
  "short-film-iron-superman": "user-shared-with-script-version",
  "short-film-sanction": "user-direct-composition-remove-all-text",
  wangu: "invent-from-photography-theme-no-original-photo",
  liuguang: "invent-from-photography-theme-no-original-photo",
  cangmang: "invent-from-photography-theme-no-original-photo",
  shenhai: "invent-from-photography-theme-no-original-photo",
  zhejin: "invent-from-photography-theme-no-original-photo",
};

const userRefPath = (slug, attachments) => {
  if (!attachments?.length) return null;
  const extension = path.extname(attachments[0].name).toLowerCase();
  return `references/game-card-v10/feishu/${slug}${extension}`;
};

const works = oldPlan.works.map((work) => {
  const online = onlineBySlug.get(work.slug);
  const attachments = online?.["参考素材位置（用户填写）"] ?? [];
  const userRequirement = online?.["个别生成要求（用户填写）"] ?? null;
  const title = titlePolicy[work.slug] ?? null;
  return {
    ...work,
    onlineRecordId: online?.record_id ?? null,
    userReference: userRefPath(work.slug, attachments),
    userRequirement,
    referenceMode: referenceMode[work.slug] ?? "content-derived-original-composition",
    palette: palette[work.slug],
    titlePolicy: title ? { show: true, text: title[0], fontFamily: title[1], treatment: title[2] } : { show: false },
    logicalGrid: {
      cover: [72, 117],
      inside: [68, 111],
      cartridge: [50, 73],
      upscale: "nearest-neighbor-only",
    },
    cartridgeDerivation: "reduce cover to one emblem or silhouette; 2-4 palette colors; no fine linework",
  };
});

const plan = {
  source: "Online Feishu Base: 作品卡带盒资源生成规划 / 作品生成规划（主表）",
  sourceUrl: "https://vivix-ai.feishu.cn/wiki/HAP0wugJ3iAWEmkeHY3cq1vWnib?table=tbl6h6auAwVu1cjQ&view=vew3Seoja4",
  syncedAt: new Date().toISOString(),
  onlineRows: onlineRows.length,
  totalWorks: works.length,
  version: "V10",
  productionRules: {
    priority: ["userReference", "userRequirement", "official English title", "work content", "table design suggestion"],
    fixedGeometry: {
      case: [900, 1100],
      inside: [1536, 1024],
      cartridge: [700, 1000],
      caseMaster: "public/portfolio-assets/ui/game-card-system-v5/masters/case-master.png",
      insideMaster: "public/portfolio-assets/ui/game-card-system-v5/masters/inside-master.png",
      cartridgeMaster: "public/portfolio-assets/ui/game-card-system-v5/masters/cart-master.png",
    },
    artDirection: {
      coarseLogicalPixels: true,
      highOutputResolutionButLowLogicalResolution: true,
      saturatedWorkSpecificPalettes: true,
      forbidFineLinework: true,
      forbidDetailedMicroShading: true,
      forbidCyanMagentaNeonOutline: true,
      forbidNestedPackaging: true,
      forbidDirectPhotoPaste: true,
      forbidChineseInImages: true,
      photographyInventedArtworkOnly: true,
      photographyCoverText: "none",
      reviewsCoverText: "none",
      insideComposition: "independent portrait composition",
    },
  },
  works,
};

fs.writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outPath, onlineRows: onlineRows.length, works: works.length, titled: works.filter((w) => w.titlePolicy.show).length, untitled: works.filter((w) => !w.titlePolicy.show).length }, null, 2));
