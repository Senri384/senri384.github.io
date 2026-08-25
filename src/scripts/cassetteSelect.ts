import { navigate } from "astro:transitions/client";

interface CassetteWork {
  slug: string;
  title: string;
  href: string;
  image: string;
  caseImage: string;
  openingFrames: string[];
  gameCardOpenCaseImage?: string;
  gameCardCartridgeImage?: string;
  titleImage: string;
  faceMaskImage: string;
  volumeMaskImage: string;
  titleAspect: number;
  kicker: string;
  overview: string;
  description: string;
  kind: string;
  meta: string;
  tags: string[];
}

interface CassetteCategory {
  slug: string;
  title: string;
  kicker: string;
  description: string;
  titleImage: string;
  faceMaskImage: string;
  volumeMaskImage: string;
  titleAspect: number;
  gameCardRackImage?: string;
  works: CassetteWork[];
}

interface GameCardGeometry {
  openWidth: number;
  openHeight: number;
  closedCanvasWidth: number;
  closedCanvasHeight: number;
  closedAlphaLeft: number;
  closedAlphaTop: number;
  closedAlphaRight: number;
  closedAlphaBottom: number;
  openRightAlphaLeft: number;
  openRightAlphaTop: number;
  openRightAlphaRight: number;
  openRightAlphaBottom: number;
  slotCenterX: number;
  slotCenterY: number;
  slotDisplayWidth: number;
}

interface CassettePayload {
  categories: CassetteCategory[];
  gameCardGeometry: GameCardGeometry;
}

let cleanupCassetteSelect: (() => void) | null = null;

function bootCassetteSelect() {
  cleanupCassetteSelect?.();
  cleanupCassetteSelect = null;

  const rootElement = document.querySelector<HTMLElement>("[data-cassette-carousel]");
  const dataElement = document.querySelector<HTMLScriptElement>("#cassette-select-data");

  if (rootElement && dataElement?.textContent) {
  const root = rootElement;
  const parsed = JSON.parse(dataElement.textContent) as CassettePayload | CassetteCategory[];
  const categories = Array.isArray(parsed) ? parsed : parsed.categories;
  const gameCardGeometry: GameCardGeometry = Array.isArray(parsed)
    ? {
        openWidth: 1730,
        openHeight: 1155,
        closedCanvasWidth: 900,
        closedCanvasHeight: 1100,
        closedAlphaLeft: 104,
        closedAlphaTop: 38,
        closedAlphaRight: 795,
        closedAlphaBottom: 1061,
        openRightAlphaLeft: 865,
        openRightAlphaTop: 46,
        openRightAlphaRight: 1581,
        openRightAlphaBottom: 1109,
        slotCenterX: 1264,
        slotCenterY: 884,
        slotDisplayWidth: 228,
      }
    : parsed.gameCardGeometry;
  const rail = root.querySelector<HTMLElement>("[data-cassette-rail]");
  const backButton = document.querySelector<HTMLButtonElement>("[data-cassette-back]");
  const mobilePreviousButton = document.querySelector<HTMLButtonElement>("[data-mobile-portfolio-prev]");
  const mobileNextButton = document.querySelector<HTMLButtonElement>("[data-mobile-portfolio-next]");
  const mobileStatus = document.querySelector<HTMLElement>("[data-mobile-portfolio-status]");
  const titleStage = document.querySelector<HTMLAnchorElement>("[data-work-title-stage]");
  const titleStageMain = titleStage?.querySelector<HTMLImageElement>("[data-work-title-main]");
  const titleStageMainMotion = titleStage?.querySelector<HTMLElement>("[data-work-title-main-motion]");
  const workDescriptionStage = document.querySelector<HTMLElement>("[data-work-description-stage]");
  const workDescriptionSummary = workDescriptionStage?.querySelector<HTMLElement>("[data-work-description-summary]");
  const workDescriptionBody = workDescriptionStage?.querySelector<HTMLElement>("[data-work-description-body]");
  const categoryTitleStage = document.querySelector<HTMLElement>("[data-category-title-stage]");
  const categoryTitleKicker = categoryTitleStage?.querySelector<HTMLElement>("[data-category-title-kicker]");
  const categoryTitleMain = categoryTitleStage?.querySelector<HTMLImageElement>("[data-category-title-main]");
  const categoryTitleMainMotion = categoryTitleMain?.parentElement;
  const discOpeningTransition = document.querySelector<HTMLElement>("[data-disc-opening-transition]");
  const discOpeningImage = discOpeningTransition?.querySelector<HTMLImageElement>("[data-disc-opening-image]");
  const openingStatus = discOpeningTransition?.querySelector<HTMLElement>("[data-opening-status]");
  const gameCardOpeningStage = discOpeningTransition?.querySelector<HTMLElement>("[data-game-card-opening-stage]");
  const gameCardOpeningOpenRight = gameCardOpeningStage?.querySelector<HTMLImageElement>("[data-game-card-opening-open-right]");
  const gameCardOpeningOpenLeft = gameCardOpeningStage?.querySelector<HTMLImageElement>("[data-game-card-opening-open-left]");
  const gameCardOpeningCartridge = gameCardOpeningStage?.querySelector<HTMLImageElement>("[data-game-card-opening-cartridge]");
  const gameCardOpenSound = new Audio("/audio/effects/game-card-case-open.mp3");
  gameCardOpenSound.preload = "auto";
  gameCardOpenSound.load();
  const cases = Array.from(root.querySelectorAll<HTMLElement>("[data-cassette-case]"));
  const imagePreloadCache = new Map<string, Promise<void>>();
  const preloadImage = (source?: string) => {
    if (!source) return Promise.resolve();
    const cached = imagePreloadCache.get(source);
    if (cached) return cached;
    const promise = new Promise<void>((resolve) => {
      const image = new Image();
      const finish = () => {
        if (typeof image.decode === "function") void image.decode().catch(() => {}).finally(resolve);
        else resolve();
      };
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
      image.src = source;
      if (image.complete) finish();
    });
    imagePreloadCache.set(source, promise);
    return promise;
  };
  const preloadWorkDisplayVisuals = (work: CassetteWork) => Promise.all([
    preloadImage(work.caseImage),
    preloadImage(work.titleImage),
    preloadImage(work.faceMaskImage),
    preloadImage(work.volumeMaskImage),
  ]);
  const preloadWorkOpeningVisuals = (work: CassetteWork) => Promise.all([
    ...work.openingFrames.map((source) => preloadImage(source)),
    preloadImage(work.gameCardOpenCaseImage),
    preloadImage(work.gameCardCartridgeImage),
  ]);
  const preloadCategoryVisuals = (category: CassetteCategory) => Promise.all([
    preloadImage(category.titleImage),
    preloadImage(category.faceMaskImage),
    preloadImage(category.volumeMaskImage),
    preloadImage(category.gameCardRackImage),
  ]);
  const wrapIndex = (index: number, length: number) => (index + length) % length;
  const preloadAllCategoryVisuals = () => Promise.all(categories.map(preloadCategoryVisuals));
  const preloadActiveCategoryWorks = (category: CassetteCategory) =>
    Promise.all(category.works.map(preloadWorkDisplayVisuals));
  const categoryTitlePreloads = categories.map((category) => {
    const image = new Image();
    image.src = category.titleImage;
    return image;
  });
  let activeCategoryIndex: number | null = null;
  let browseCategoryIndex = 0;
  let activeWorkIndex = 0;
  let wheelLock = false;
  let workSwapTimer = 0;
  let workTitleEnterTimer = 0;
  let categorySwapTimer = 0;
  let categoryEnterTimer = 0;
  let categorySwapRequest = 0;
  let workSwapRequest = 0;
  let browseCenterFrame = 0;
  let openingPreloadTimer = 0;
  let discOpening = false;
  let openingQueued = false;
  let openingLeadInTimer = 0;
  let lastWheelInputAt = Number.NEGATIVE_INFINITY;
  let gestureStartX = 0;
  let gestureStartY = 0;
  let gesturePointerId: number | null = null;
  let suppressClickUntil = 0;
  const discOpeningTimers: number[] = [];
  root.dataset.mode = "browse";

  function updateMobileStatus() {
    if (!mobileStatus) return;
    if (activeCategoryIndex === null) {
      const category = categories[browseCategoryIndex];
      mobileStatus.textContent = category
        ? `${browseCategoryIndex + 1} / ${categories.length} · ${category.title}`
        : "左右滑动切换分类";
      return;
    }

    const category = categories[activeCategoryIndex];
    const work = category?.works[activeWorkIndex];
    mobileStatus.textContent = work
      ? `${activeWorkIndex + 1} / ${category.works.length} · ${work.title}`
      : "左右滑动切换作品";
  }

  function playGameCardOpenSound() {
    let volume = 0.5;
    let muted = false;
    try {
      const settings = JSON.parse(window.localStorage.getItem("neon-drive-audio-settings") || "{}");
      if (typeof settings.volume === "number") volume = settings.volume;
      muted = settings.muted === true;
    } catch {}
    volume = Math.max(0, Math.min(1, volume));
    if (muted || volume <= 0) return;

    gameCardOpenSound.pause();
    gameCardOpenSound.currentTime = 0;
    gameCardOpenSound.volume = Math.min(1, volume * 1.15);
    void gameCardOpenSound.play().catch(() => {});
  }

  function markBrowseCategory(index: number) {
    browseCategoryIndex = index;
    cases.forEach((item, itemIndex) => {
      item.dataset.browseActive = String(itemIndex === index);
    });
    updateMobileStatus();
  }

  function pulseStep() {
    root.classList.remove("is-stepping");
    window.requestAnimationFrame(() => {
      root.classList.add("is-stepping");
    });
  }

  function renderCategoryTitle(index: number) {
    if (activeCategoryIndex !== null || root.dataset.mode === "open") return;

    const category = categories[index];
    if (!category || !categoryTitleStage || !categoryTitleKicker || !categoryTitleMain) return;

    categoryTitleKicker.textContent = category.kicker;
    const titleImage = categoryTitlePreloads[index]?.src ?? category.titleImage;
    categoryTitleMain.src = titleImage;
    categoryTitleMain.alt = category.title;
    categoryTitleMainMotion?.style.setProperty("--miami-title-mask", `url("${titleImage}")`);
    categoryTitleMainMotion?.style.setProperty("--miami-title-aspect", String(category.titleAspect));
    if (categoryTitleMainMotion) {
      categoryTitleMainMotion.dataset.miamiFaceMask = category.faceMaskImage;
      categoryTitleMainMotion.dataset.miamiVolumeMask = category.volumeMaskImage;
    }
    categoryTitleStage.classList.remove("is-work-directory");
    categoryTitleStage.hidden = false;
  }

  function showCategoryTitle(index: number) {
    categorySwapRequest += 1;
    window.clearTimeout(categorySwapTimer);
    window.clearTimeout(categoryEnterTimer);
    categoryTitleStage?.classList.remove("is-leaving", "is-entering");
    renderCategoryTitle(index);
  }

  function swapCategoryTitle(index: number, direction: number, immediate = false) {
    if (!categoryTitleStage) return;

    const request = ++categorySwapRequest;
    window.clearTimeout(categorySwapTimer);
    window.clearTimeout(categoryEnterTimer);
    void preloadCategoryVisuals(categories[index]).then(() => {
      if (request !== categorySwapRequest) return;
      if (activeCategoryIndex !== null || root.dataset.mode === "open") return;
      categoryTitleStage.dataset.direction = direction > 0 ? "next" : "previous";
      categoryTitleStage.classList.remove("is-leaving", "is-entering");
      if (immediate) {
        renderCategoryTitle(index);
        return;
      }
      void categoryTitleStage.offsetWidth;
      categoryTitleStage.classList.add("is-leaving");

      categorySwapTimer = window.setTimeout(() => {
        if (request !== categorySwapRequest) return;
        if (activeCategoryIndex !== null || root.dataset.mode === "open") return;
        renderCategoryTitle(index);
        categoryTitleStage.classList.remove("is-leaving");
        categoryTitleStage.classList.add("is-entering");
        categoryEnterTimer = window.setTimeout(() => {
          if (request !== categorySwapRequest) return;
          if (activeCategoryIndex !== null || root.dataset.mode === "open") return;
          categoryTitleStage.classList.remove("is-entering");
        }, 145);
      }, 105);
    });
  }

  function clearWorkTitleMotion() {
    window.clearTimeout(workTitleEnterTimer);
    categoryTitleStage?.classList.remove("is-leaving", "is-entering");
    titleStage?.classList.remove("is-leaving", "is-entering");
    workDescriptionStage?.classList.remove("is-leaving", "is-entering");
  }

  function hideWorkTitle() {
    clearWorkTitleMotion();
    if (titleStage) titleStage.hidden = true;
    if (workDescriptionStage) workDescriptionStage.hidden = true;
  }

  function ordinal(value: number) {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
    if (value % 10 === 1) return `${value}st`;
    if (value % 10 === 2) return `${value}nd`;
    if (value % 10 === 3) return `${value}rd`;
    return `${value}th`;
  }

  function showWorkTitle(work: CassetteWork, workIndex: number, preserveMotion = false) {
    if (!titleStage || !titleStageMain || !titleStageMainMotion) return;
    if (categoryTitleStage) {
      categoryTitleStage.hidden = false;
      if (!preserveMotion) categoryTitleStage.classList.remove("is-leaving", "is-entering");
      categoryTitleStage.classList.add("is-work-directory");
    }
    if (!preserveMotion) titleStage.classList.remove("is-leaving", "is-entering");
    if (categoryTitleKicker) categoryTitleKicker.textContent = `${ordinal(workIndex + 1)} scene`;
    titleStage.href = work.href;
    titleStage.setAttribute("aria-label", `打开作品：${work.title}`);
    titleStageMain.src = work.titleImage;
    titleStageMain.alt = work.title;
    titleStageMainMotion.style.setProperty("--miami-title-mask", `url("${work.titleImage}")`);
    titleStageMainMotion.style.setProperty("--miami-title-aspect", String(work.titleAspect));
    titleStageMainMotion.dataset.miamiFaceMask = work.faceMaskImage;
    titleStageMainMotion.dataset.miamiVolumeMask = work.volumeMaskImage;
    titleStage.hidden = false;
    // Only the final settled work earns the heavier opening animation assets.
    // Rapidly passed intermediate works must not compete for bandwidth.
    window.clearTimeout(openingPreloadTimer);
    openingPreloadTimer = window.setTimeout(() => {
      if (currentWork()?.slug === work.slug) void preloadWorkOpeningVisuals(work);
    }, 650);
    if (workDescriptionStage && workDescriptionSummary && workDescriptionBody) {
      const hasDescription = Boolean(work.overview.trim() || work.description.trim());
      const summaryLength = Array.from(work.overview).reduce((total, character) => (
        total + (/\s/u.test(character) ? 0.35 : /[\u3400-\u9fff]/u.test(character) ? 1 : 0.58)
      ), 0);
      workDescriptionSummary.textContent = work.overview;
      workDescriptionBody.textContent = work.description;
      workDescriptionStage.dataset.summaryLength = summaryLength > 23
        ? "extra-long"
        : summaryLength > 17
          ? "long"
          : "standard";
      workDescriptionStage.hidden = !hasDescription;
      if (!preserveMotion) workDescriptionStage.classList.remove("is-leaving", "is-entering");
    }
  }

  function currentWork() {
    if (activeCategoryIndex === null) return null;
    return categories[activeCategoryIndex]?.works[activeWorkIndex] ?? null;
  }

  function navigateToWork(work: CassetteWork) {
    const category = activeCategoryIndex === null ? null : categories[activeCategoryIndex];
    if (category) {
      const directoryUrl = new URL("/works/", window.location.href);
      directoryUrl.searchParams.set("category", category.slug);
      directoryUrl.searchParams.set("work", work.slug);
      if (window.location.pathname !== directoryUrl.pathname || window.location.search !== directoryUrl.search) {
        window.history.pushState(
          { ...(window.history.state ?? {}), cassetteMode: "directory" },
          "",
          directoryUrl,
        );
      }
    }

    void navigate(work.href);
  }

  function ensureBrowseEntryBeforeDirectory(categorySlug: string, workSlug: string | null) {
    const browseUrl = new URL("/works/", window.location.href);
    const directoryUrl = new URL("/works/", window.location.href);
    directoryUrl.searchParams.set("category", categorySlug);
    if (workSlug) directoryUrl.searchParams.set("work", workSlug);

    if (window.history.state?.cassetteMode === "directory") return;

    window.history.replaceState(
      { ...(window.history.state ?? {}), cassetteMode: "browse" },
      "",
      browseUrl,
    );
    window.history.pushState(
      { ...(window.history.state ?? {}), cassetteMode: "directory" },
      "",
      directoryUrl,
    );
  }

  function pushDirectoryUrl(categoryIndex: number) {
    const category = categories[categoryIndex];
    const work = category?.works[activeWorkIndex];
    if (!category) return;

    const directoryUrl = new URL("/works/", window.location.href);
    directoryUrl.searchParams.set("category", category.slug);
    if (work) directoryUrl.searchParams.set("work", work.slug);
    if (window.location.pathname === directoryUrl.pathname && window.location.search === directoryUrl.search) return;

    window.history.pushState(
      { ...(window.history.state ?? {}), cassetteMode: "directory" },
      "",
      directoryUrl,
    );
  }

  function getContainedImageRect(image: HTMLImageElement) {
    const bounds = image.getBoundingClientRect();
    if (!image.naturalWidth || !image.naturalHeight || !bounds.width || !bounds.height) {
      return bounds;
    }

    const naturalAspect = image.naturalWidth / image.naturalHeight;
    const boundsAspect = bounds.width / bounds.height;
    if (naturalAspect > boundsAspect) {
      const height = bounds.width / naturalAspect;
      const top = bounds.top + (bounds.height - height) / 2;
      return new DOMRect(bounds.left, top, bounds.width, height);
    }

    const width = bounds.height * naturalAspect;
    const left = bounds.left + (bounds.width - width) / 2;
    return new DOMRect(left, bounds.top, width, bounds.height);
  }

  function playGameCardOpening(work: CassetteWork) {
    if (
      !discOpeningTransition ||
      !gameCardOpeningStage ||
      !gameCardOpeningOpenRight ||
      !gameCardOpeningOpenLeft ||
      !gameCardOpeningCartridge ||
      !work.gameCardOpenCaseImage ||
      !work.gameCardCartridgeImage
    ) {
      navigateToWork(work);
      return;
    }

    const sourceCase = activeCategoryIndex === null
      ? null
      : cases[activeCategoryIndex]?.querySelector<HTMLElement>("[data-game-card-work='true']");
    const sourceImage = sourceCase?.querySelector<HTMLImageElement>(".tape-art img");
    const sourceRect = sourceImage
      ? getContainedImageRect(sourceImage)
      : sourceCase?.getBoundingClientRect();
    if (sourceRect) {
      const closedAlphaWidth = gameCardGeometry.closedAlphaRight - gameCardGeometry.closedAlphaLeft;
      const openRightAlphaWidth = gameCardGeometry.openRightAlphaRight - gameCardGeometry.openRightAlphaLeft;
      const targetWidth = sourceRect.width *
        (closedAlphaWidth / gameCardGeometry.closedCanvasWidth) *
        (gameCardGeometry.openWidth / openRightAlphaWidth);
      const targetHeight = targetWidth * (gameCardGeometry.openHeight / gameCardGeometry.openWidth);
      const sourceVisibleCenterX = sourceRect.left + sourceRect.width *
        (((gameCardGeometry.closedAlphaLeft + gameCardGeometry.closedAlphaRight) / 2) /
          gameCardGeometry.closedCanvasWidth);
      const sourceVisibleCenterY = sourceRect.top + sourceRect.height *
        (((gameCardGeometry.closedAlphaTop + gameCardGeometry.closedAlphaBottom) / 2) /
          gameCardGeometry.closedCanvasHeight);
      const openRightVisibleCenterX =
        (gameCardGeometry.openRightAlphaLeft + gameCardGeometry.openRightAlphaRight) / 2;
      const openRightVisibleCenterY =
        (gameCardGeometry.openRightAlphaTop + gameCardGeometry.openRightAlphaBottom) / 2;
      const originX = sourceVisibleCenterX -
        ((openRightVisibleCenterX - gameCardGeometry.openWidth / 2) / gameCardGeometry.openWidth) * targetWidth;
      const originY = sourceVisibleCenterY -
        ((openRightVisibleCenterY - gameCardGeometry.openHeight / 2) / gameCardGeometry.openHeight) * targetHeight;
      discOpeningTransition.style.setProperty(
        "--game-card-origin-x",
        `${originX}px`,
      );
      discOpeningTransition.style.setProperty(
        "--game-card-origin-y",
        `${originY}px`,
      );
      discOpeningTransition.style.setProperty("--game-card-open-width", `${targetWidth}px`);
      discOpeningTransition.style.setProperty(
        "--game-card-slot-offset-x",
        `${((gameCardGeometry.slotCenterX - gameCardGeometry.openWidth / 2) / gameCardGeometry.openWidth) * targetWidth}px`,
      );
      discOpeningTransition.style.setProperty(
        "--game-card-slot-offset-y",
        `${((gameCardGeometry.slotCenterY - gameCardGeometry.openHeight / 2) / gameCardGeometry.openHeight) * targetHeight}px`,
      );
      discOpeningTransition.style.setProperty(
        "--game-card-slot-width",
        `${(gameCardGeometry.slotDisplayWidth / gameCardGeometry.openWidth) * targetWidth}px`,
      );
    }

    discOpening = true;
    wheelLock = true;
    discOpeningTimers.splice(0).forEach((timer) => window.clearTimeout(timer));
    discOpeningTransition.hidden = false;
    discOpeningTransition.setAttribute("aria-hidden", "false");
    discOpeningTransition.dataset.openingType = "game-card";
    discOpeningTransition.dataset.gameCardStep = "ready";
    discOpeningTransition.classList.remove("is-flashing", "is-game-card-ejecting");
    discOpeningTransition.classList.add("is-active");
    document.documentElement.dataset.discOpening = "true";

    if (discOpeningImage) discOpeningImage.removeAttribute("src");
    if (openingStatus) openingStatus.textContent = "LOADING CARTRIDGE";
    gameCardOpeningStage.hidden = false;
    gameCardOpeningStage.setAttribute("aria-hidden", "false");
    gameCardOpeningOpenRight.src = work.gameCardOpenCaseImage;
    gameCardOpeningOpenLeft.src = work.gameCardOpenCaseImage;
    gameCardOpeningCartridge.src = work.gameCardCartridgeImage;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timings = reducedMotion
      ? { open: 25, loaded: 410, eject: 540, flash: 720, navigate: 900 }
      : { open: 80, loaded: 440, eject: 560, flash: 900, navigate: 1160 };

    discOpeningTimers.push(window.setTimeout(() => {
      sourceCase?.classList.add("is-game-card-opening-source");
      root.classList.add("is-game-card-opening");
      playGameCardOpenSound();
      discOpeningTransition.dataset.gameCardStep = "open";
    }, timings.open));
    discOpeningTimers.push(window.setTimeout(() => {
      discOpeningTransition.dataset.gameCardStep = "loaded";
    }, timings.loaded));
    discOpeningTimers.push(window.setTimeout(() => {
      discOpeningTransition.dataset.gameCardStep = "eject";
      discOpeningTransition.classList.add("is-game-card-ejecting");
    }, timings.eject));
    discOpeningTimers.push(window.setTimeout(() => {
      discOpeningTransition.classList.add("is-flashing");
    }, timings.flash));
    discOpeningTimers.push(window.setTimeout(() => {
      navigateToWork(work);
    }, timings.navigate));
  }

  function beginDiscOpening(work: CassetteWork) {
    if (work.gameCardOpenCaseImage && work.gameCardCartridgeImage) {
      playGameCardOpening(work);
      return;
    }

    if (!discOpeningTransition || !discOpeningImage || work.openingFrames.length === 0) {
      navigateToWork(work);
      return;
    }

    discOpening = true;
    wheelLock = true;
    discOpeningTimers.splice(0).forEach((timer) => window.clearTimeout(timer));
    discOpeningTransition.hidden = false;
    discOpeningTransition.setAttribute("aria-hidden", "false");
    discOpeningTransition.classList.remove("is-flashing");
    discOpeningTransition.classList.add("is-active");
    discOpeningTransition.dataset.openingType = "disc";
    delete discOpeningTransition.dataset.gameCardStep;
    if (openingStatus) openingStatus.textContent = "READING DISC";
    if (gameCardOpeningStage) {
      gameCardOpeningStage.hidden = true;
      gameCardOpeningStage.setAttribute("aria-hidden", "true");
    }
    document.documentElement.dataset.discOpening = "true";

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frameDuration = reducedMotion ? 18 : 145;
    work.openingFrames.forEach((source, frameIndex) => {
      discOpeningTimers.push(window.setTimeout(() => {
        discOpeningImage.src = source;
        discOpeningTransition.dataset.frame = String(frameIndex);
      }, frameIndex * frameDuration));
    });

    const finalFrameAt = Math.max(0, work.openingFrames.length - 1) * frameDuration;
    discOpeningTimers.push(window.setTimeout(() => {
      discOpeningTransition.classList.add("is-flashing");
    }, finalFrameAt + (reducedMotion ? 20 : 230)));
    discOpeningTimers.push(window.setTimeout(() => {
      navigateToWork(work);
    }, finalFrameAt + (reducedMotion ? 70 : 520)));
  }

  function playDiscOpening(event: Event) {
    const work = currentWork();
    if (!work) return;
    event.preventDefault();
    if (discOpening || openingQueued) return;

    const hasDescription = Boolean(work.overview.trim() || work.description.trim());
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!workDescriptionStage || workDescriptionStage.hidden || !hasDescription || reducedMotion) {
      beginDiscOpening(work);
      return;
    }

    openingQueued = true;
    wheelLock = true;
    window.clearTimeout(openingLeadInTimer);
    workDescriptionStage.classList.remove("is-entering");
    workDescriptionStage.classList.add("is-leaving");
    openingLeadInTimer = window.setTimeout(() => {
      openingQueued = false;
      beginDiscOpening(work);
    }, 80);
  }

  function updateTape(caseElement: HTMLElement, categoryIndex: number, workIndex: number, titleDirection = 0) {
    const category = categories[categoryIndex];
    const work = category?.works[workIndex];
    if (!work) return;

    const tape = caseElement.querySelector<HTMLAnchorElement>("[data-cassette-tape]");
    const image = caseElement.querySelector<HTMLImageElement>("[data-cassette-image]");

    if (tape) {
      tape.href = work.href;
      tape.dataset.gameCardWork = String(Boolean(work.gameCardOpenCaseImage));
      tape.setAttribute("aria-label", `打开作品：${work.title}`);
    }
    if (image) {
      image.hidden = !work.caseImage;
      if (work.caseImage) image.src = work.caseImage;
      image.alt = "";
    }
    caseElement.dataset.gameCardActive = String(Boolean(work.gameCardOpenCaseImage));
    showWorkTitle(work, workIndex, titleDirection !== 0);

    if (titleDirection !== 0) {
      const directionName = titleDirection > 0 ? "next" : "previous";
      [categoryTitleStage, titleStage, workDescriptionStage].forEach((stage) => {
        if (!stage) return;
        stage.dataset.direction = directionName;
        stage.classList.remove("is-leaving");
        stage.classList.add("is-entering");
      });
      workTitleEnterTimer = window.setTimeout(() => {
        categoryTitleStage?.classList.remove("is-entering");
        titleStage?.classList.remove("is-entering");
      }, 145);
    }

    caseElement.classList.remove("is-switching", "is-work-retracting");
    window.requestAnimationFrame(() => {
      caseElement.classList.add("is-switching");
    });
  }

  function swapTapeWithRetract(
    caseElement: HTMLElement,
    categoryIndex: number,
    workIndex: number,
    direction: number,
    immediate = false,
  ) {
    const work = categories[categoryIndex]?.works[workIndex];
    if (!work) return;
    const request = ++workSwapRequest;
    window.clearTimeout(workSwapTimer);
    clearWorkTitleMotion();
    void preloadWorkDisplayVisuals(work).then(() => {
      if (request !== workSwapRequest || activeCategoryIndex !== categoryIndex) return;
      if (immediate) {
        caseElement.classList.remove("is-switching", "is-work-retracting");
        updateTape(caseElement, categoryIndex, workIndex);
        return;
      }
      const directionName = direction > 0 ? "next" : "previous";
      [categoryTitleStage, titleStage].forEach((stage) => {
        if (!stage) return;
        stage.dataset.direction = directionName;
        stage.classList.add("is-leaving");
      });
      caseElement.classList.remove("is-switching");
      caseElement.classList.add("is-work-retracting");
      workSwapTimer = window.setTimeout(() => {
        if (request !== workSwapRequest || activeCategoryIndex !== categoryIndex) return;
        updateTape(caseElement, categoryIndex, workIndex, direction);
      }, 150);
    });
  }

  function centerCase(caseElement: HTMLElement, behavior: ScrollBehavior = "smooth") {
    if (root.dataset.mode === "open") return;
    if (!rail) return;
    const target = caseElement.offsetLeft + caseElement.offsetWidth / 2 - rail.clientWidth / 2;
    rail.scrollTo({ left: Math.max(0, target), behavior });
    window.scrollTo({ left: 0 });
  }

  function centerBrowseCaseAfterLayout(index: number) {
    window.cancelAnimationFrame(browseCenterFrame);
    browseCenterFrame = window.requestAnimationFrame(() => {
      browseCenterFrame = window.requestAnimationFrame(() => {
        const caseElement = cases[index];
        if (root.dataset.mode === "browse" && caseElement) {
          centerCase(caseElement);
        }
      });
    });
  }

  function openCase(index: number) {
    const caseElement = cases[index];
    const category = categories[index];
    if (!caseElement || !category?.works.length) return;

    activeCategoryIndex = index;
    categorySwapRequest += 1;
    workSwapRequest += 1;
    markBrowseCategory(index);
    activeWorkIndex = Math.min(activeWorkIndex, category.works.length - 1);

    cases.forEach((item, itemIndex) => {
      const isOpen = itemIndex === index;
      item.dataset.active = String(isOpen);
      item.dataset.position = itemIndex < index ? "left" : itemIndex > index ? "right" : "active";
      item.dataset.open = String(isOpen);
      item.querySelector<HTMLButtonElement>("[data-cassette-open]")?.setAttribute("aria-expanded", String(isOpen));
    });

    updateTape(caseElement, index, activeWorkIndex);
    // Opening switches the rail to overflow: visible immediately afterwards.
    // Position it synchronously so that an interrupted smooth scroll cannot
    // leave the selected category between two snap points.
    centerCase(caseElement, "auto");
    root.dataset.mode = "open";
    window.scrollTo({ left: 0 });

    void preloadActiveCategoryWorks(category);
  }

  function closeCase() {
    workSwapRequest += 1;
    window.clearTimeout(workSwapTimer);
    hideWorkTitle();
    activeCategoryIndex = null;
    activeWorkIndex = 0;
    root.dataset.mode = "browse";
    markBrowseCategory(browseCategoryIndex);
    showCategoryTitle(browseCategoryIndex);
    cases.forEach((item) => {
      item.classList.remove("is-switching", "is-work-retracting");
      item.dataset.active = "false";
      item.dataset.position = "center";
      item.dataset.open = "false";
      item.querySelector<HTMLButtonElement>("[data-cassette-open]")?.setAttribute("aria-expanded", "false");
    });
    // Wait for the browse dimensions and scroll snapping to be restored, then
    // return the selected cassette case to the exact viewport center.
    centerBrowseCaseAfterLayout(browseCategoryIndex);
  }

  function setBrowseUrl() {
    const browseUrl = new URL("/works/", window.location.href);
    if (window.location.pathname === browseUrl.pathname && window.location.search === browseUrl.search) return;
    window.history.replaceState(
      { ...(window.history.state ?? {}), cassetteMode: "browse" },
      "",
      browseUrl,
    );
  }

  function resetDiscOpeningState() {
    discOpeningTimers.splice(0).forEach((timer) => window.clearTimeout(timer));
    discOpening = false;
    wheelLock = false;
    root.classList.remove("is-game-card-opening");
    root.querySelectorAll(".is-game-card-opening-source").forEach((item) => {
      item.classList.remove("is-game-card-opening-source");
    });
    delete document.documentElement.dataset.discOpening;

    if (discOpeningTransition) {
      discOpeningTransition.hidden = true;
      discOpeningTransition.setAttribute("aria-hidden", "true");
      discOpeningTransition.classList.remove("is-active", "is-flashing", "is-game-card-ejecting");
      delete discOpeningTransition.dataset.openingType;
      delete discOpeningTransition.dataset.gameCardStep;
      delete discOpeningTransition.dataset.frame;
      [
        "--game-card-origin-x",
        "--game-card-origin-y",
        "--game-card-open-width",
        "--game-card-slot-offset-x",
        "--game-card-slot-offset-y",
        "--game-card-slot-width",
      ].forEach((property) => discOpeningTransition.style.removeProperty(property));
    }

    if (discOpeningImage) discOpeningImage.removeAttribute("src");
    if (gameCardOpeningStage) {
      gameCardOpeningStage.hidden = true;
      gameCardOpeningStage.setAttribute("aria-hidden", "true");
    }
  }

  function restoreDirectoryStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const categorySlug = params.get("category");
    const workSlug = params.get("work");
    const categoryIndex = categories.findIndex((category) => category.slug === categorySlug);

    if (categoryIndex < 0) {
      closeCase();
      return;
    }

    const works = categories[categoryIndex]?.works ?? [];
    const workIndex = works.findIndex((work) => work.slug === workSlug);
    activeWorkIndex = Math.max(0, workIndex);
    openCase(categoryIndex);
  }

  function stepWork(direction: number, distance = 1, immediate = false) {
    if (activeCategoryIndex === null) return;
    const category = categories[activeCategoryIndex];
    const caseElement = cases[activeCategoryIndex];
    if (!category || !caseElement || category.works.length < 2) return;

    const nextWorkIndex = wrapIndex(activeWorkIndex + direction * distance, category.works.length);
    const nextWork = category.works[nextWorkIndex];
    if (!nextWork) return;

    activeWorkIndex = nextWorkIndex;
    updateMobileStatus();
    swapTapeWithRetract(caseElement, activeCategoryIndex, activeWorkIndex, direction, immediate);
  }

  function stepCategory(direction: number, distance = 1, immediate = false) {
    const nextIndex = wrapIndex(browseCategoryIndex + direction * distance, cases.length);
    const nextCategory = categories[nextIndex];
    if (!nextCategory) return;

    markBrowseCategory(nextIndex);
    swapCategoryTitle(nextIndex, direction, immediate);
    const caseElement = cases[browseCategoryIndex];
    if (caseElement) centerCase(caseElement, immediate ? "auto" : "smooth");
  }

  function stepCurrent(direction: number) {
    if (wheelLock || discOpening || openingQueued) return;
    wheelLock = true;
    pulseStep();
    if (activeCategoryIndex === null) stepCategory(direction);
    else stepWork(direction);
    window.setTimeout(() => {
      wheelLock = false;
    }, activeCategoryIndex === null ? 260 : 320);
  }

  cases.forEach((caseElement, index) => {
    caseElement.addEventListener("focusin", () => {
      markBrowseCategory(index);
      showCategoryTitle(index);
      centerCase(caseElement);
    });
    caseElement.querySelector("[data-cassette-open]")?.addEventListener("click", () => {
      activeWorkIndex = 0;
      openCase(index);
      pushDirectoryUrl(index);
    });
    caseElement.querySelector("[data-cassette-tape]")?.addEventListener("click", playDiscOpening);
  });

  backButton?.addEventListener("click", () => {
    closeCase();
    setBrowseUrl();
  });
  titleStage?.addEventListener("click", playDiscOpening);
  mobilePreviousButton?.addEventListener("click", () => stepCurrent(-1));
  mobileNextButton?.addEventListener("click", () => stepCurrent(1));

  if (window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 760px)").matches) {
    root.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || discOpening || openingQueued) return;
      gesturePointerId = event.pointerId;
      gestureStartX = event.clientX;
      gestureStartY = event.clientY;
    });

    root.addEventListener("pointerup", (event) => {
      if (gesturePointerId !== event.pointerId) return;
      const deltaX = event.clientX - gestureStartX;
      const deltaY = event.clientY - gestureStartY;
      gesturePointerId = null;
      if (Math.abs(deltaX) < 44 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
      suppressClickUntil = Date.now() + 380;
      stepCurrent(deltaX < 0 ? 1 : -1);
    });

    root.addEventListener("pointercancel", () => {
      gesturePointerId = null;
    });

    root.addEventListener("click", (event) => {
      if (Date.now() >= suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
    }, { capture: true });
  }

  root.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (discOpening || openingQueued || wheelLock) return;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (delta === 0) return;

      const direction = delta > 0 ? 1 : -1;
      const now = window.performance.now();
      const isRapidInput = now - lastWheelInputAt < 180;
      lastWheelInputAt = now;
      pulseStep();
      if (activeCategoryIndex === null) stepCategory(direction, 1, isRapidInput);
      else stepWork(direction, 1, isRapidInput);
    },
    { passive: false },
  );

  const initialParams = new URLSearchParams(window.location.search);
  const initialCategory = initialParams.get("category");
  const initialWork = initialParams.get("work");
  const initialCategoryIndex = categories.findIndex(
    (category) => category.slug === initialCategory,
  );

  if (initialCategoryIndex >= 0 && initialCategory) {
    ensureBrowseEntryBeforeDirectory(initialCategory, initialWork);
    void preloadAllCategoryVisuals();
    const initialWorks = categories[initialCategoryIndex]?.works ?? [];
    const initialWorkIndex = initialWorks.findIndex((work) => work.slug === initialWork);
    activeWorkIndex = Math.max(0, initialWorkIndex);
    openCase(initialCategoryIndex);
  } else {
    markBrowseCategory(browseCategoryIndex);
    showCategoryTitle(browseCategoryIndex);
    void preloadAllCategoryVisuals();
  }

  const handlePageHide = () => {
    if (!discOpening) return;
    resetDiscOpeningState();
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted && document.documentElement.dataset.discOpening !== "true") return;
    resetDiscOpeningState();
    restoreDirectoryStateFromUrl();
  };

  const handlePopState = () => {
    resetDiscOpeningState();
    restoreDirectoryStateFromUrl();
  };

  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("popstate", handlePopState);

  cleanupCassetteSelect = () => {
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("pageshow", handlePageShow);
    window.removeEventListener("popstate", handlePopState);
    window.clearTimeout(openingPreloadTimer);
    if (discOpening) resetDiscOpeningState();
  };

  rail?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCase();
      setBrowseUrl();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = activeCategoryIndex === null ? 0 : Math.min(cases.length - 1, activeCategoryIndex + 1);
      activeWorkIndex = 0;
      openCase(next);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const next = activeCategoryIndex === null ? 0 : Math.max(0, activeCategoryIndex - 1);
      activeWorkIndex = 0;
      openCase(next);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      stepWork(1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      stepWork(-1);
    }
  });
  }
}

bootCassetteSelect();
document.addEventListener("astro:page-load", bootCassetteSelect);

export {};
