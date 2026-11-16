// ./src/adapters/settle.mjs
/**
 * Brings a page to its resting state before it is audited.
 *
 * Audits that start at `domcontentloaded` measure pages mid-animation: fade-ins composite text with the page
 * background (false color-contrast violations), scroll-reveal content is still invisible, and fonts have not swapped.
 * The result also changes with machine load (the same site produced 88 violations alone and 374 under parallel load).
 *
 * Steps, each bounded by `timeoutMs`: window load, web fonts, a top-to-bottom scroll pass (triggers
 * IntersectionObserver reveals and lazy content), then every finite CSS animation/transition finishing. Infinite
 * animations (spinners, marquees) are ignored. Never throws: an unsettled page is audited as it is.
 */

export async function settlePage(page, options = {}) {
  if (options === false || options.enabled === false) return { settled: false, skipped: true };
  const timeoutMs = options.timeoutMs ?? 4000;
  const scroll = options.scroll !== false;
  const started = Date.now();
  try {
    await page.waitForLoadState('load', { timeout: Math.min(timeoutMs, 10_000) }).catch(() => {});
    const report = await page.evaluate(async ({ budget, doScroll }) => {
      const deadline = performance.now() + budget;
      const left = () => Math.max(0, deadline - performance.now());
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      try {
        await Promise.race([document.fonts?.ready, sleep(Math.min(1500, left()))]);
      } catch {
        // fonts API unavailable
      }

      let steps = 0;
      const origin = { x: window.scrollX, y: window.scrollY };
      if (doScroll) {
        const total = Math.min(document.documentElement.scrollHeight, 40_000);
        const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
        for (let y = 0; y < total && steps < 60 && left() > 0; y += step) {
          window.scrollTo(0, y);
          steps += 1;
          await sleep(60);
        }
        window.scrollTo(origin.x, origin.y);
        await sleep(60);
      }

      let pending = 0;
      for (let pass = 0; pass < 4 && left() > 0; pass += 1) {
        const running = document.getAnimations().filter((animation) => {
          if (animation.playState !== 'running') return false;
          const iterations = animation.effect?.getComputedTiming?.().iterations;
          return iterations !== Infinity;
        });
        pending = running.length;
        if (running.length === 0) break;
        await Promise.race([Promise.all(running.map((animation) => animation.finished.catch(() => {}))), sleep(left())]);
      }
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      return { scrollSteps: steps, pendingAnimations: pending };
    }, { budget: timeoutMs, doScroll: scroll });
    return { settled: report.pendingAnimations === 0, ...report, durationMs: Date.now() - started };
  } catch (error) {
    return { settled: false, error: String(error.message).split('\n')[0], durationMs: Date.now() - started };
  }
}
