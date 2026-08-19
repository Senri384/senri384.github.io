import type Hls from "hls.js";

type HlsModule = typeof import("hls.js/light");

const hlsInstances = new Map<HTMLVideoElement, Hls>();
const activationCleanups = new Map<HTMLVideoElement, () => void>();
let hlsModulePromise: Promise<HlsModule> | null = null;
let warmupCancel: (() => void) | null = null;

const loadHlsModule = () => {
  hlsModulePromise ??= import("hls.js/light");
  return hlsModulePromise;
};

function armFilmVideo(video: HTMLVideoElement) {
  const source = video.dataset.filmHls;
  if (!source || activationCleanups.has(video) || hlsInstances.has(video)) return;

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    const activateNative = () => {
      if (!video.src) {
        video.src = source;
        video.dataset.hlsReady = "native";
      }
      void video.play().catch(() => {});
    };
    const activateNativeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") activateNative();
    };
    video.addEventListener("pointerdown", activateNative, { once: true });
    video.addEventListener("keydown", activateNativeFromKeyboard);
    activationCleanups.set(video, () => {
      video.removeEventListener("pointerdown", activateNative);
      video.removeEventListener("keydown", activateNativeFromKeyboard);
    });
    return;
  }

  let attachmentPromise: Promise<void> | null = null;
  let playRequested = false;

  const attach = (requestPlayback = false) => {
    playRequested ||= requestPlayback;
    if (attachmentPromise) return attachmentPromise;

    video.dataset.hlsReady = "loading";
    attachmentPromise = loadHlsModule().then(({ default: HlsPlayer }) => {
      if (!HlsPlayer.isSupported() || !video.isConnected) {
        delete video.dataset.hlsReady;
        return;
      }

      const hls = new HlsPlayer({
        enableWorker: true,
        startFragPrefetch: false,
        maxBufferLength: 24,
        backBufferLength: 24,
      });
      hls.attachMedia(video);
      hls.on(HlsPlayer.Events.MEDIA_ATTACHED, () => hls.loadSource(source));
      hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
        video.dataset.hlsReady = "true";
        if (playRequested) void video.play().catch(() => {});
      });
      hlsInstances.set(video, hls);
    }).catch(() => {
      delete video.dataset.hlsReady;
      attachmentPromise = null;
    });
    return attachmentPromise;
  };

  const activate = () => void attach(true);
  const activateFromKeyboard = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") activate();
  };
  video.addEventListener("pointerdown", activate, { once: true });
  video.addEventListener("keydown", activateFromKeyboard);
  activationCleanups.set(video, () => {
    video.removeEventListener("pointerdown", activate);
    video.removeEventListener("keydown", activateFromKeyboard);
  });

  // Parse the lightweight player while the browser is idle, but do not attach
  // it to the video yet. Attaching starts media requests in Chromium even with
  // startFragPrefetch disabled, so fragments must wait for an explicit click.
  const warmPlayer = () => void loadHlsModule();
  if (typeof window.requestIdleCallback === "function") {
    const callbackId = window.requestIdleCallback(warmPlayer, { timeout: 3500 });
    warmupCancel = () => window.cancelIdleCallback(callbackId);
  } else {
    const timerId = window.setTimeout(warmPlayer, 1800);
    warmupCancel = () => window.clearTimeout(timerId);
  }
}

function setupFilmHls() {
  document.querySelectorAll<HTMLVideoElement>("video[data-film-hls]").forEach(armFilmVideo);
}

function destroyFilmHls() {
  warmupCancel?.();
  warmupCancel = null;
  activationCleanups.forEach((cleanup, video) => {
    cleanup();
    delete video.dataset.hlsReady;
  });
  activationCleanups.clear();
  hlsInstances.forEach((hls, video) => {
    hls.destroy();
    delete video.dataset.hlsReady;
  });
  hlsInstances.clear();
}

setupFilmHls();
document.addEventListener("astro:page-load", setupFilmHls);
document.addEventListener("astro:before-swap", destroyFilmHls);
