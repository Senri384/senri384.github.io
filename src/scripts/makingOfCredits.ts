const root = document.querySelector<HTMLElement>("[data-making-of]");

if (root) {
  const track = root.querySelector<HTMLElement>("[data-making-track]");
  const passages = Array.from(root.querySelectorAll<HTMLElement>("[data-making-passage]"));
  let activeIndex = Math.min(
    Math.max(Number(root.dataset.initialIndex || 0), 0),
    Math.max(0, passages.length - 1),
  );
  let locked = false;
  let unlockTimer = 0;
  let wheelRemainder = 0;
  let pendingSteps = 0;
  let touchStartY = 0;
  let measureFrame = 0;

  const render = () => {
    root.dataset.activeIndex = String(activeIndex);
    if (track) track.style.setProperty("--making-index", String(activeIndex));
    passages.forEach((passage, index) => {
      const distance = Math.abs(index - activeIndex);
      passage.dataset.active = String(index === activeIndex);
      passage.style.setProperty("--line-distance", String(distance));
      passage.style.setProperty("--line-direction", String(Math.sign(index - activeIndex)));
    });
    window.cancelAnimationFrame(measureFrame);
    measureFrame = window.requestAnimationFrame(() => {
      const activePassage = passages[activeIndex];
      if (!track || !activePassage) return;
      const center = activePassage.offsetTop + activePassage.offsetHeight / 2;
      track.style.setProperty("--making-offset", `${center}px`);
    });
  };

  const step = (direction: number) => {
    if (passages.length < 2) return;
    const nextIndex = (activeIndex + Math.sign(direction) + passages.length) % passages.length;
    if (nextIndex === activeIndex) return;
    const wrapping = Math.abs(nextIndex - activeIndex) > 1;
    if (wrapping && track) track.dataset.wrapping = "true";
    activeIndex = nextIndex;
    render();
    if (wrapping && track) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          delete track.dataset.wrapping;
        });
      });
    }
  };

  const queueStep = (direction: number) => {
    if (!direction) return;
    const normalizedDirection = Math.sign(direction);
    if (locked) {
      pendingSteps = Math.max(-3, Math.min(3, pendingSteps + normalizedDirection));
      return;
    }
    locked = true;
    step(normalizedDirection);
    window.clearTimeout(unlockTimer);
    unlockTimer = window.setTimeout(() => {
      locked = false;
      if (pendingSteps) {
        const pendingDirection = Math.sign(pendingSteps);
        pendingSteps -= pendingDirection;
        queueStep(pendingDirection);
      }
    }, 170);
  };

  root.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      wheelRemainder += event.deltaY;
      const threshold = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 1 : 42;
      if (Math.abs(wheelRemainder) >= threshold) {
        const direction = wheelRemainder > 0 ? 1 : -1;
        const requestedSteps = Math.min(3, Math.floor(Math.abs(wheelRemainder) / threshold));
        wheelRemainder -= direction * requestedSteps * threshold;
        for (let index = 0; index < requestedSteps; index += 1) {
          queueStep(direction);
        }
      }
    },
    { passive: false },
  );

  root.addEventListener(
    "touchstart",
    (event) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
    },
    { passive: true },
  );

  root.addEventListener(
    "touchmove",
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );

  root.addEventListener("touchend", (event) => {
    const touchEndY = event.changedTouches[0]?.clientY ?? touchStartY;
    const delta = touchStartY - touchEndY;
    if (Math.abs(delta) >= 34) queueStep(delta > 0 ? 1 : -1);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      queueStep(1);
    }
    if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      queueStep(-1);
    }
  });

  const resizeObserver = new ResizeObserver(render);
  resizeObserver.observe(root);
  passages.forEach((passage) => resizeObserver.observe(passage));

  render();
}

export {};
