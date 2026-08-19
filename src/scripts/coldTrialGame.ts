type ScoreDelta = { sympathy?: number; reproach?: number };
type Choice = {
  label: string;
  note?: string;
  delta?: ScoreDelta;
  next?: string;
  dossierComplete?: string;
  verdict?: "guilty" | "not-guilty";
};
type Scene = {
  act: string;
  kicker: string;
  title: string;
  text: string;
  image: string;
  alt: string;
  quote?: string;
  next?: string;
  continueLabel?: string;
  choices?: Choice[];
  dossier?: boolean;
  ending?: boolean;
  epilogue?: boolean;
};
type GameState = {
  current: string;
  sympathy: number;
  reproach: number;
  dossiers: string[];
  decisions: string[];
  seen: string[];
  verdict: "guilty" | "not-guilty" | null;
  finished: boolean;
};

const root = document.querySelector<HTMLElement>("#cold-trial-game")!;
const assetBase = root.dataset.assetBase ?? "/games/the-cold-trial/assets";
const saveKey = "the-cold-trial-save-v1";

const dossierMeta: Record<string, { name: string; role: string; image: string; finding: string }> = {
  conlin: {
    name: "CHARLES CONLIN",
    role: "乘客 · 死亡",
    image: "ch05b-conlin-scene.webp",
    finding: "当康林抓住霍尔姆斯的手腕问自己是否将被扔下去时，执行者与被执行者短暂地看见了彼此。",
  },
  askin: {
    name: "FRANCIS ASKIN",
    role: "乘客 · 死亡",
    image: "askin-character-sheet.webp",
    finding: "阿斯金拿出五英镑请求活命。钞票被海风卷走，交易从未成立，恐惧却留了下来。",
  },
  mcavoy: {
    name: "McAVOY",
    role: "乘客 · 死亡",
    image: "mcavoy-character-sheet.webp",
    finding: "麦卡沃伊请求五分钟祷告。厨师阻止了水手动手，麦卡沃伊最终自己走向船舷。",
  },
  holmes: {
    name: "JOHN HOLMES",
    role: "水手 · 被告",
    image: "holmes-sheet-v2.webp",
    finding: "在最混乱的时刻，霍尔姆斯宣布不会再有人被扔下去。此前的死亡并未因此消失。",
  },
};

const scenes: Record<string, Scene> = {
  "court-convenes": {
    act: "ACT I · THE COURT CONVENES",
    kicker: "PHILADELPHIA · MARCH 1842",
    title: "请陪审员入席",
    text: "你面前的被告名叫约翰·霍尔姆斯，一名普通水手。十一月前，他从一艘沉没的移民船上活了下来。十四名乘客没有。",
    image: "courtroom-juror-pov-seated-v2.webp",
    alt: "从陪审员座位望向十九世纪费城联邦法庭",
    next: "the-charge",
  },
  "the-charge": {
    act: "ACT I · THE COURT CONVENES",
    kicker: "UNITED STATES CIRCUIT COURT",
    title: "控罪",
    text: "检方没有指控霍尔姆斯制造海难。他们指控的是：在救生艇上，他亲手将乘客推入冰冷的北大西洋。大副弗朗西斯·罗兹下令，却从未受审。",
    image: "courtroom-overhead.webp",
    alt: "费城联邦巡回法庭的俯视档案图",
    next: "holmes-speaks",
  },
  "holmes-speaks": {
    act: "ACT I · THE COURT CONVENES",
    kicker: "THE DEFENDANT",
    title: "“船会沉。”",
    text: "霍尔姆斯承认自己执行了命令。他说长艇严重超载、船帮进水、风浪正在变大。若不减轻重量，所有人都会死。",
    quote: "我没有挑选谁该死。我只是服从了船上的指挥。",
    image: "courtroom-holmes-closeup-v2.webp",
    alt: "被告约翰·霍尔姆斯坐在法庭中",
    next: "the-lifeboat",
  },
  "the-lifeboat": {
    act: "ACT II · THE LONGBOAT",
    kicker: "NORTH ATLANTIC · 19 APRIL 1841",
    title: "威廉·布朗号之后",
    text: "冰山撕开船体后，八十余人争抢两艘小艇。霍尔姆斯所在的长艇挤满乘客与船员。海水漫过脚踝，月光照见每一张脸。",
    image: "lifeboat-scene-v2.webp",
    alt: "月夜中挤满幸存者的长艇",
    next: "the-order",
  },
  "the-order": {
    act: "ACT II · THE LONGBOAT",
    kicker: "NO LOT WAS DRAWN",
    title: "没有抽签",
    text: "大副罗兹没有让所有人共同承担风险。他指定男性乘客。水手们开始行动。每一名水手最终都活了下来。",
    quote: "The sailors chose. Every sailor survived.",
    image: "ch07-holmes-eyes-closeup.webp",
    alt: "霍尔姆斯在长艇中的眼睛特写",
    next: "dossier-intro",
  },
  "dossier-intro": {
    act: "ACT III · THE DOSSIERS",
    kicker: "COURT RECESS",
    title: "四份档案，只能调查三份",
    text: "书记官把案件册推到你面前。时间只够深入查看三个人的记录。第四份档案将保持封闭——不是因为它不重要，而是因为你选择了别处。",
    image: "dossier-scene-v2.webp",
    alt: "桌上的案件档案册与四张人物照片",
    next: "dossier-hub",
    continueLabel: "打开案件册",
  },
  "dossier-hub": {
    act: "ACT III · THE DOSSIERS",
    kicker: "CHECK 3 CLUES",
    title: "选择要深入调查的人",
    text: "每份档案都会改变你理解这场海难的方式。选择之后无法撤回。",
    image: "dossier-scene-v2.webp",
    alt: "案件档案册中的康林、阿斯金、麦卡沃伊与霍尔姆斯",
    dossier: true,
  },
  "conlin-1": {
    act: "DOSSIER I · CHARLES CONLIN",
    kicker: "PASSENGER · LOST AT SEA",
    title: "“我是要被扔下去吗？”",
    text: "康林抓住霍尔姆斯的手腕。他没有反抗，也没有喊叫，只是提出一个他已经知道答案的问题。",
    image: "ch05-conlin-scene.webp",
    alt: "长艇中康林与霍尔姆斯对视",
    next: "conlin-2",
  },
  "conlin-2": {
    act: "DOSSIER I · CHARLES CONLIN",
    kicker: "CONTACT",
    title: "握住执行者的手",
    text: "在那一刻，命令不再是抽象的“减重”。它变成一个人的手腕、另一个人的手，以及周围沉默旁观的人群。",
    image: "ch05b-conlin-scene.webp",
    alt: "康林紧握霍尔姆斯的手腕",
    next: "conlin-3",
  },
  "conlin-3": {
    act: "DOSSIER I · CHARLES CONLIN",
    kicker: "YOUR READING",
    title: "你如何理解这一瞬间？",
    text: "陪审员必须把人的动作翻译成责任。",
    image: "ch05c-conlin-scene.webp",
    alt: "乘客被带向长艇船舷",
    choices: [
      { label: "霍尔姆斯仍然可以拒绝", note: "执行命令不等于失去选择。", delta: { reproach: 2 }, dossierComplete: "conlin" },
      { label: "他的手也被命令束缚", note: "责任首先属于下令者。", delta: { sympathy: 2 }, dossierComplete: "conlin" },
      { label: "两件事可以同时成立", note: "理解不必取消谴责。", delta: { sympathy: 1, reproach: 1 }, dossierComplete: "conlin" },
    ],
  },
  "askin-1": {
    act: "DOSSIER II · FRANCIS ASKIN",
    kicker: "FIVE POUNDS",
    title: "一张无法兑现的钞票",
    text: "阿斯金从湿透的外套里摸出五英镑。他把钱递向霍尔姆斯，像是生命仍可以用熟悉的规则谈判。",
    image: "ch06-askin-scene.webp",
    alt: "阿斯金把五英镑递给霍尔姆斯",
    next: "askin-2",
  },
  "askin-2": {
    act: "DOSSIER II · FRANCIS ASKIN",
    kicker: "YOUR READING",
    title: "风把钱卷走了",
    text: "纸币落进黑暗。长艇依然超载，阿斯金依然在名单上。",
    image: "ch06b-askin-scene.webp",
    alt: "长艇中阿斯金被水手夹在中间",
    choices: [
      { label: "绝境不能为冷漠开脱", note: "他看见了恐惧，却仍继续执行。", delta: { reproach: 2 }, dossierComplete: "askin" },
      { label: "没有任何价码能解决超载", note: "拒绝交易不等于渴望死亡。", delta: { sympathy: 2 }, dossierComplete: "askin" },
      { label: "无效的交易仍留下道德创伤", note: "处境与行为都应被记录。", delta: { sympathy: 1, reproach: 1 }, dossierComplete: "askin" },
    ],
  },
  "mcavoy-1": {
    act: "DOSSIER III · McAVOY",
    kicker: "FIVE MINUTES",
    title: "“让我祷告。”",
    text: "麦卡沃伊跪在积水中，请求最后五分钟。他不争辩谁更值得活，只请求为死亡做好准备。",
    image: "ch07-mcavoy-scene.webp",
    alt: "麦卡沃伊跪在长艇中请求祷告",
    next: "mcavoy-2",
  },
  "mcavoy-2": {
    act: "DOSSIER III · McAVOY",
    kicker: "THE COOK INTERVENES",
    title: "有人说“不”",
    text: "船上的厨师挡在水手面前。资料没有留下他的姓名，却留下了这个动作：在同样的命令与风浪里，他选择阻止。",
    image: "ch07b-cook-scene.webp",
    alt: "厨师伸手阻止水手接近麦卡沃伊",
    next: "mcavoy-3",
  },
  "mcavoy-3": {
    act: "DOSSIER III · McAVOY",
    kicker: "YOUR READING",
    title: "麦卡沃伊自己走向船舷",
    text: "五分钟之后，他起身。没有人需要推他。",
    image: "ch07c-mcavoy-walk-scene.webp",
    alt: "麦卡沃伊从长艇中央走向船舷",
    choices: [
      { label: "厨师证明了拒绝命令是可能的", note: "相同处境中仍存在不同选择。", delta: { reproach: 2 }, dossierComplete: "mcavoy" },
      { label: "霍尔姆斯并未夺走麦卡沃伊的最后选择", note: "结局不能被简化为一次推搡。", delta: { sympathy: 2 }, dossierComplete: "mcavoy" },
      { label: "这不是免责，也不是单纯的谋杀", note: "责任在命令、执行与绝境之间分裂。", delta: { sympathy: 1, reproach: 1 }, dossierComplete: "mcavoy" },
    ],
  },
  "holmes-1": {
    act: "DOSSIER IV · JOHN HOLMES",
    kicker: "THE EXECUTOR",
    title: "“不会再有人被扔下去了。”",
    text: "一些人已经落海后，霍尔姆斯停了下来。他转身面对水手，宣布杀戮到此为止。长艇没有立刻沉没。",
    image: "ch08-holmes-mercy-scene.webp",
    alt: "霍尔姆斯独自站在长艇船首",
    next: "holmes-2",
  },
  "holmes-2": {
    act: "DOSSIER IV · JOHN HOLMES",
    kicker: "YOUR READING",
    title: "停止能改变此前发生的事吗？",
    text: "法庭要求你判断的不是一个人的全部，而是他在那个夜晚做过的具体事情。",
    image: "ch08b-holmes-scene.webp",
    alt: "霍尔姆斯在海难当夜的近景",
    choices: [
      { label: "停止说明他仍保有道德判断", note: "服从并没有完全吞没他。", delta: { sympathy: 2 }, dossierComplete: "holmes" },
      { label: "停止得太晚，死亡已经发生", note: "迟来的界限不能抹去此前的执行。", delta: { reproach: 2 }, dossierComplete: "holmes" },
      { label: "正因他能停止，他也本可以更早停止", note: "同一个事实同时支持理解与谴责。", delta: { sympathy: 1, reproach: 1 }, dossierComplete: "holmes" },
    ],
  },
  "baldwin-charge": {
    act: "ACT IV · ARGUMENTS",
    kicker: "JUDGE HENRY BALDWIN",
    title: "紧急状态不是空白支票",
    text: "鲍德温法官提醒陪审团：如果牺牲确实不可避免，至少应以抽签让风险落在所有人身上。水手不能只让乘客承担死亡。",
    quote: "No lot was drawn.",
    image: "ch12-verdict-scene.webp",
    alt: "鲍德温法官在法庭上举起法槌",
    choices: [
      { label: "程序是绝境中最后的正义", note: "没有抽签，因此选择缺乏正当性。", delta: { reproach: 2 }, next: "brown-defense" },
      { label: "法庭低估了海上当时的混乱", note: "事后的程序要求可能不切实际。", delta: { sympathy: 2 }, next: "brown-defense" },
    ],
  },
  "brown-defense": {
    act: "ACT IV · ARGUMENTS",
    kicker: "DAVID PAUL BROWN · DEFENSE",
    title: "真正下令的人不在被告席",
    text: "辩护律师指向空着的位置：罗兹决定了谁被牺牲，却从未被追诉。法律为何只抓住命令链最末端的那双手？",
    image: "courtroom-brown-closeup-v2.webp",
    alt: "辩护律师布朗在法庭上陈词",
    choices: [
      { label: "罗兹的责任不能免除霍尔姆斯", note: "缺席的主谋不让执行者自动无罪。", delta: { reproach: 2 }, next: "deliberation" },
      { label: "法律把全部重量压给了一个水手", note: "选择性追诉本身也是不公。", delta: { sympathy: 2 }, next: "deliberation" },
    ],
  },
  deliberation: {
    act: "ACT V · DELIBERATION",
    kicker: "THE JURY ROOM",
    title: "法庭清场",
    text: "你调查了三份档案，也留下了一份未读。现在，故事必须被压缩成法律要求的两个词之一。",
    image: "ch13c-empty-courtroom-scene.webp",
    alt: "审理结束后空荡的费城法庭",
    next: "verdict",
    continueLabel: "投下裁决",
  },
  verdict: {
    act: "ACT V · YOUR VERDICT",
    kicker: "UNITED STATES v. HOLMES",
    title: "约翰·霍尔姆斯是否有罪？",
    text: "不要寻找系统期待的答案。游戏只会记住你愿意为哪一种判断负责。",
    image: "courtroom-juror-pov-seated-v2.webp",
    alt: "陪审员视角中的被告席与法官席",
    choices: [
      { label: "GUILTY · 有罪", note: "绝境不能取消个人责任。", verdict: "guilty", next: "guilty-verdict" },
      { label: "NOT GUILTY · 无罪", note: "合理怀疑仍然存在。", verdict: "not-guilty", next: "not-guilty-verdict" },
    ],
  },
  "guilty-verdict": {
    act: "VERDICT · GUILTY",
    kicker: "SIX MONTHS' IMPRISONMENT",
    title: "有罪",
    text: "法槌落下。霍尔姆斯被判六个月监禁。他没有回头看陪审席。",
    image: "ch12b-holmes-departs-scene.webp",
    alt: "霍尔姆斯在警卫押送下离开法庭",
    next: "guilty-aftermath",
  },
  "guilty-aftermath": {
    act: "AFTERMATH",
    kicker: "THE HISTORICAL RECORD",
    title: "判决之后",
    text: "霍尔姆斯出狱后再次登船，前往南美洲。他在途中染病去世，死因与埋葬地点都没有留下确定记录。",
    image: "ch13b-holmes-walks-scene-v5.webp",
    alt: "霍尔姆斯走出法庭大门",
    ending: true,
  },
  "not-guilty-verdict": {
    act: "VERDICT · NOT GUILTY",
    kicker: "AN UNWRITTEN HISTORY",
    title: "无罪",
    text: "法庭里先是安静，然后爆发出低语。霍尔姆斯被引向门外，走进一种历史从未给过他的自由。",
    image: "ch13b-holmes-walks-scene-v5.webp",
    alt: "霍尔姆斯独自走向法庭外的光",
    next: "not-guilty-aftermath",
  },
  "not-guilty-aftermath": {
    act: "AFTERMATH",
    kicker: "COUNTERFACTUAL VERDICT",
    title: "你参与了一个历史上从未存在的裁决",
    text: "真实的霍尔姆斯被判有罪。你的无罪票不会改写过去，却暴露了法律、道德与求生本能之间无法完全缝合的裂缝。",
    image: "ch13c-empty-courtroom-scene.webp",
    alt: "判决后空荡的法庭",
    ending: true,
  },
  epilogue: {
    act: "EPILOGUE",
    kicker: "BEFORE DAWN · NORTH ATLANTIC",
    title: "问题的形状",
    text: "一个人站在海上，背对朝阳。前方没有地平线。",
    quote: "谁有权决定谁死？",
    image: "ch14-epilogue-scene.webp",
    alt: "黎明前的北大西洋上，一个人独自站在长艇中",
    epilogue: true,
  },
};

const startScreen = document.querySelector<HTMLElement>("#start-screen")!;
const gameStage = document.querySelector<HTMLElement>("#game-stage")!;
const sceneImage = document.querySelector<HTMLImageElement>("#scene-image")!;
const sceneKicker = document.querySelector<HTMLElement>("#scene-kicker")!;
const sceneTitle = document.querySelector<HTMLElement>("#scene-title")!;
const sceneText = document.querySelector<HTMLElement>("#scene-text")!;
const sceneQuote = document.querySelector<HTMLElement>("#scene-quote")!;
const continueButton = document.querySelector<HTMLButtonElement>("#continue-button")!;
const continueLabel = document.querySelector<HTMLElement>("#continue-label")!;
const choiceList = document.querySelector<HTMLElement>("#choice-list")!;
const dossierHotspots = document.querySelector<HTMLElement>("#dossier-hotspots")!;
const narrativePanel = document.querySelector<HTMLElement>("#narrative-panel")!;
const endingCard = document.querySelector<HTMLElement>("#ending-card")!;
const toast = document.querySelector<HTMLElement>("#toast")!;
const journalDialog = document.querySelector<HTMLDialogElement>("#journal-dialog")!;
const helpDialog = document.querySelector<HTMLDialogElement>("#help-dialog")!;
const resumeButton = document.querySelector<HTMLButtonElement>("#resume-button")!;

let state: GameState = freshState();
let toastTimer = 0;
let audioContext: AudioContext | null = null;
let ambientGain: GainNode | null = null;
let muted = false;

function freshState(): GameState {
  return { current: "court-convenes", sympathy: 0, reproach: 0, dossiers: [], decisions: [], seen: [], verdict: null, finished: false };
}

function loadState(): GameState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(saveKey) ?? "null") as GameState | null;
    if (!parsed || !scenes[parsed.current]) return null;
    return { ...freshState(), ...parsed };
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(saveKey, JSON.stringify(state));
}

function startGame(mode: "new" | "resume") {
  state = mode === "resume" ? loadState() ?? freshState() : freshState();
  startScreen.hidden = true;
  gameStage.hidden = false;
  gameStage.classList.add("is-entering");
  startAmbient();
  render();
}

function setSceneImage(scene: Scene) {
  const nextSrc = `${assetBase}/${scene.image}`;
  if (sceneImage.src.endsWith(`/${scene.image}`)) return;
  sceneImage.classList.add("is-changing");
  const preloaded = new Image();
  preloaded.onload = () => {
    sceneImage.src = nextSrc;
    sceneImage.alt = scene.alt;
    requestAnimationFrame(() => sceneImage.classList.remove("is-changing"));
  };
  preloaded.src = nextSrc;
}

function render() {
  const scene = scenes[state.current];
  if (!scene) return;
  if (!state.seen.includes(state.current)) state.seen.push(state.current);
  setSceneImage(scene);
  sceneKicker.textContent = scene.kicker;
  sceneTitle.textContent = scene.title;
  sceneText.textContent = scene.text;
  sceneQuote.textContent = scene.quote ?? "";
  sceneQuote.hidden = !scene.quote;
  document.querySelector("#act-label")!.textContent = scene.act;
  narrativePanel.hidden = Boolean(scene.ending);
  endingCard.hidden = !scene.ending;
  choiceList.replaceChildren();
  dossierHotspots.replaceChildren();
  dossierHotspots.hidden = !scene.dossier;
  continueButton.hidden = Boolean(scene.choices || scene.dossier || scene.ending);
  continueLabel.textContent = scene.continueLabel ?? (scene.epilogue ? "审理结束" : "继续");

  if (scene.choices) renderChoices(scene.choices);
  if (scene.dossier) renderDossiers();
  if (scene.ending) renderEnding();
  updateHud();
  updateJournal();
  saveState();
}

function renderChoices(choices: Choice[]) {
  choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.innerHTML = `<span class="choice-index">${index + 1}</span><span><strong>${choice.label}</strong>${choice.note ? `<small>${choice.note}</small>` : ""}</span>`;
    button.addEventListener("click", () => choose(choice));
    choiceList.append(button);
  });
}

function renderDossiers() {
  const entries = Object.entries(dossierMeta);
  entries.forEach(([id, meta], index) => {
    const opened = state.dossiers.includes(id);
    const locked = !opened && state.dossiers.length >= 3;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `dossier-target dossier-${id}`;
    button.disabled = opened || locked;
    button.dataset.state = opened ? "opened" : locked ? "sealed" : "available";
    button.innerHTML = `<span>${index + 1}</span><strong>${meta.name}</strong><small>${opened ? "已调查" : locked ? "永久封存" : "查看档案"}</small>`;
    button.addEventListener("click", () => openDossier(id));
    dossierHotspots.append(button);
  });

  const status = document.createElement("div");
  status.className = "dossier-status";
  status.innerHTML = `<strong>${state.dossiers.length} / 3</strong><span>CLUES CHECKED</span>`;
  dossierHotspots.append(status);

  if (state.dossiers.length === 3) {
    const returnButton = document.createElement("button");
    returnButton.type = "button";
    returnButton.className = "return-court-button";
    returnButton.textContent = "返回法庭";
    returnButton.addEventListener("click", () => goTo("baldwin-charge"));
    dossierHotspots.append(returnButton);
  }
}

function openDossier(id: string) {
  if (state.dossiers.includes(id) || state.dossiers.length >= 3) return;
  goTo(`${id}-1`);
}

function choose(choice: Choice) {
  if (choice.delta) {
    state.sympathy += choice.delta.sympathy ?? 0;
    state.reproach += choice.delta.reproach ?? 0;
    const parts = [];
    if (choice.delta.sympathy) parts.push(`SYMPATHY +${choice.delta.sympathy}`);
    if (choice.delta.reproach) parts.push(`REPROACH +${choice.delta.reproach}`);
    showToast(parts.join(" · "));
  }
  state.decisions.push(choice.label);
  if (choice.dossierComplete) {
    state.dossiers.push(choice.dossierComplete);
    state.current = "dossier-hub";
  } else if (choice.verdict) {
    state.verdict = choice.verdict;
    state.current = choice.next!;
  } else if (choice.next) {
    state.current = choice.next;
  }
  render();
}

function goTo(id: string) {
  const scene = scenes[id];
  if (!scene) return;
  if (state.current === "epilogue" && scene.epilogue) {
    state.finished = true;
  }
  state.current = id;
  render();
}

function continueScene() {
  const scene = scenes[state.current];
  if (scene.epilogue) {
    state.finished = true;
    saveState();
    showToast("审理记录已保存");
    return;
  }
  if (scene.next) goTo(scene.next);
}

function updateHud() {
  const sympathy = document.querySelector<HTMLElement>("#sympathy-score")!;
  const reproach = document.querySelector<HTMLElement>("#reproach-score")!;
  sympathy.textContent = String(state.sympathy);
  reproach.textContent = String(state.reproach);
  document.querySelector<HTMLElement>("#sympathy-bar")!.style.setProperty("--score", `${Math.min(state.sympathy, 12) / 12 * 100}%`);
  document.querySelector<HTMLElement>("#reproach-bar")!.style.setProperty("--score", `${Math.min(state.reproach, 12) / 12 * 100}%`);
  const progress = Math.min(100, Math.round((state.seen.length / 24) * 100));
  document.querySelector<HTMLElement>("#progress-fill")!.style.width = `${progress}%`;
  document.querySelector("#progress-label")!.textContent = `${progress}%`;
}

function renderEnding() {
  const guilty = state.verdict === "guilty";
  document.querySelector("#ending-kicker")!.textContent = guilty ? "YOUR VERDICT · GUILTY" : "YOUR VERDICT · NOT GUILTY";
  document.querySelector("#ending-title")!.textContent = guilty ? "你选择了责任的边界" : "你选择了合理怀疑";
  document.querySelector("#ending-copy")!.textContent = guilty
    ? "真实历史同样作出了有罪判决。霍尔姆斯被判六个月监禁。"
    : "这项裁决从未出现在真实历史中。真实的霍尔姆斯被判有罪。";
  document.querySelector("#ending-sympathy")!.textContent = String(state.sympathy);
  document.querySelector("#ending-reproach")!.textContent = String(state.reproach);
  const difference = state.sympathy - state.reproach;
  let reflection = "你同时保留了理解与谴责。两种态度没有互相抵消。";
  if (difference >= 3 && guilty) reflection = "你对霍尔姆斯抱有明显同情，却仍判他有罪：理解没有替代责任。";
  if (difference <= -3 && !guilty) reflection = "你强烈谴责霍尔姆斯，却仍投下无罪票：道德判断没有替代法律证明。";
  if (difference >= 3 && !guilty) reflection = "你的调查持续把责任推向命令、处境与选择性追诉。";
  if (difference <= -3 && guilty) reflection = "你的调查持续确认：绝境之中仍然存在拒绝与停止的可能。";
  document.querySelector("#ending-reflection")!.textContent = reflection;
}

function updateJournal() {
  const grid = document.querySelector<HTMLElement>("#journal-grid")!;
  grid.replaceChildren();
  Object.entries(dossierMeta).forEach(([id, meta]) => {
    const opened = state.dossiers.includes(id);
    const sealed = !opened && state.dossiers.length >= 3;
    const card = document.createElement("article");
    card.className = `journal-card ${opened ? "is-open" : "is-closed"}`;
    card.innerHTML = `
      <img src="${assetBase}/${meta.image}" alt="${opened ? meta.name : "封闭档案"}" />
      <div><span>${opened ? meta.role : sealed ? "SEALED BY YOUR CHOICE" : "NOT YET EXAMINED"}</span>
      <h3>${opened ? meta.name : "REDACTED"}</h3>
      <p>${opened ? meta.finding : sealed ? "你选择不去深究这段证词。" : "返回案件册后可以选择调查。"}</p></div>`;
    grid.append(card);
  });
}

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function startAmbient() {
  if (audioContext) return;
  audioContext = new AudioContext();
  ambientGain = audioContext.createGain();
  ambientGain.gain.value = muted ? 0 : 0.032;
  ambientGain.connect(audioContext.destination);
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.985 + white * 0.015;
    data[i] = last * 1.8;
  }
  const noise = audioContext.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  noise.connect(filter).connect(ambientGain);
  noise.start();
}

function toggleAudio() {
  muted = !muted;
  if (ambientGain) ambientGain.gain.setTargetAtTime(muted ? 0 : 0.032, audioContext?.currentTime ?? 0, 0.12);
  const button = document.querySelector<HTMLButtonElement>("#audio-button")!;
  button.textContent = muted ? "声音：关" : "声音：开";
  button.setAttribute("aria-label", muted ? "打开环境音" : "关闭环境音");
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else root.requestFullscreen?.();
}

function restart() {
  if (!window.confirm("重新审理会清除当前进度。确定继续吗？")) return;
  state = freshState();
  localStorage.removeItem(saveKey);
  endingCard.hidden = true;
  narrativePanel.hidden = false;
  render();
}

document.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((button) => {
  button.addEventListener("click", () => startGame(button.dataset.start as "new" | "resume"));
});
continueButton.addEventListener("click", continueScene);
document.querySelector("#journal-button")!.addEventListener("click", () => journalDialog.showModal());
document.querySelector("#help-button")!.addEventListener("click", () => helpDialog.showModal());
document.querySelector("#audio-button")!.addEventListener("click", toggleAudio);
document.querySelector("#fullscreen-button")!.addEventListener("click", toggleFullscreen);
document.querySelector("#epilogue-button")!.addEventListener("click", () => goTo("epilogue"));
document.querySelector("#restart-button")!.addEventListener("click", restart);

document.addEventListener("keydown", (event) => {
  if (!gameStage.hidden && !journalDialog.open && !helpDialog.open) {
    const activeChoices = [...choiceList.querySelectorAll<HTMLButtonElement>("button"), ...dossierHotspots.querySelectorAll<HTMLButtonElement>(".dossier-target:not(:disabled)")];
    if (/^[1-4]$/.test(event.key) && activeChoices[Number(event.key) - 1]) {
      activeChoices[Number(event.key) - 1].click();
      return;
    }
    if ((event.code === "Space" || event.key === "Enter") && !continueButton.hidden) {
      event.preventDefault();
      continueScene();
    }
    if (event.key.toLowerCase() === "j") journalDialog.showModal();
    if (event.key.toLowerCase() === "m") toggleAudio();
    if (event.key.toLowerCase() === "f") toggleFullscreen();
  }
});

const saved = loadState();
resumeButton.hidden = !saved;
updateJournal();

export {};
