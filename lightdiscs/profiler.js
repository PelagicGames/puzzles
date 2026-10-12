// Copyright (C) 2026 Pelagic Games

(() => {
  const output = {
    renderer: document.querySelector("#profile-renderer"),
    frames: document.querySelector("#profile-frames"),
    medianInterval: document.querySelector("#profile-median-interval"),
    p95Interval: document.querySelector("#profile-p95-interval"),
    p95Update: document.querySelector("#profile-p95-update"),
    slowFrames: document.querySelector("#profile-slow-frames"),
    composingFrames: document.querySelector("#profile-composing-frames"),
    transitions: document.querySelector("#profile-transitions"),
    longTasks: document.querySelector("#profile-long-tasks"),
    descendants: document.querySelector("#profile-descendants"),
    masks: document.querySelector("#profile-masks"),
    images: document.querySelector("#profile-images")
  };
  const clearButton = document.querySelector("#clear-profile");
  let state;
  let renderTimer = null;

  function emptyState() {
    return {
      composingFrames: 0,
      dragStartTime: null,
      dragWindows: [],
      dragging: false,
      frameIntervals: [],
      frames: 0,
      lastComposing: null,
      lastFrameTime: null,
      longTaskDuration: 0,
      longTasks: 0,
      slowFrames: 0,
      transitions: 0,
      updateDurations: []
    };
  }

  function percentile(values, fraction) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(
      sorted.length - 1,
      Math.floor(sorted.length * fraction)
    )];
  }

  function milliseconds(value) {
    return value === null ? "\u2014" : `${value.toFixed(2)} ms`;
  }

  function scheduleRender(immediate = false) {
    if (immediate) {
      if (renderTimer !== null) window.clearTimeout(renderTimer);
      renderTimer = null;
      render();
      return;
    }
    if (renderTimer !== null) return;
    renderTimer = window.setTimeout(() => {
      renderTimer = null;
      render();
    }, 250);
  }

  function render() {
    const stats = window.LightDiscGame.renderStats();
    output.renderer.textContent = stats.renderer;
    output.frames.textContent = String(state.frames);
    output.medianInterval.textContent = milliseconds(
      percentile(state.frameIntervals, 0.5)
    );
    output.p95Interval.textContent = milliseconds(
      percentile(state.frameIntervals, 0.95)
    );
    output.p95Update.textContent = milliseconds(
      percentile(state.updateDurations, 0.95)
    );
    output.slowFrames.textContent = String(state.slowFrames);
    output.composingFrames.textContent = String(state.composingFrames);
    output.transitions.textContent = String(state.transitions);
    output.longTasks.textContent = state.longTasks === 0
      ? "0"
      : `${state.longTasks} (${state.longTaskDuration.toFixed(1)} ms)`;
    output.descendants.textContent = String(stats.descendants);
    output.masks.textContent = String(stats.masks);
    output.images.textContent = String(stats.images);
  }

  function record(type, detail) {
    if (type === "drag-start") {
      state.dragging = true;
      state.dragStartTime = performance.now();
      state.lastComposing = null;
      state.lastFrameTime = null;
      scheduleRender(true);
      return;
    }
    if (type === "drag-end") {
      if (state.dragStartTime !== null) {
        state.dragWindows.push({
          start: state.dragStartTime,
          end: performance.now()
        });
      }
      state.dragging = false;
      state.dragStartTime = null;
      state.lastComposing = null;
      state.lastFrameTime = null;
      scheduleRender(true);
      return;
    }
    if (type !== "drag-frame") return;
    state.frames += 1;
    state.updateDurations.push(detail.updateDuration);
    if (detail.composing) state.composingFrames += 1;
    if (state.lastComposing !== null
      && state.lastComposing !== detail.composing) {
      state.transitions += 1;
    }
    state.lastComposing = detail.composing;
    if (state.lastFrameTime !== null) {
      const interval = detail.frameTime - state.lastFrameTime;
      state.frameIntervals.push(interval);
      if (interval > 20) state.slowFrames += 1;
    }
    state.lastFrameTime = detail.frameTime;
    scheduleRender();
  }

  function clear() {
    state = emptyState();
    scheduleRender(true);
  }

  document.querySelectorAll("[data-renderer-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const identity = window.LightDiscGame.profileIdentity();
      const target = new URL(event.currentTarget.href);
      target.searchParams.set("seed", identity.seed);
      target.searchParams.set("iteration", identity.iteration);
      event.currentTarget.href = target;
    });
  });
  clearButton.addEventListener("click", clear);
  state = emptyState();
  window.LightDiscProfiler = { record };

  if ("PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const entryEnd = entry.startTime + entry.duration;
          const duringCompletedDrag = state.dragWindows.some(
            (window) => entry.startTime >= window.start
              && entryEnd <= window.end
          );
          const duringActiveDrag = state.dragStartTime !== null
            && entry.startTime >= state.dragStartTime;
          if (!duringCompletedDrag && !duringActiveDrag) return;
          state.longTasks += 1;
          state.longTaskDuration += entry.duration;
        });
        scheduleRender();
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch (error) {
      console.warn("Long-task profiling is unavailable.", error);
      output.longTasks.textContent = "Unsupported";
    }
  }
  render();
})();
