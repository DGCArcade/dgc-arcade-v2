import { useCallback, useEffect, useRef, useState } from "react";

export type BoardLaneCenters = {
  sidewalk: number;
  lanes: number[];
};

/**
 * Measures sewer / sidewalk centers relative to the play row (for chicken positioning).
 *
 * Stability improvements:
 * - Scroll events are debounced at 200 ms (up from 150 ms) to avoid the
 *   measure -> targetLeft change -> motor glide -> scroll -> measure loop
 *   that caused the chicken to oscillate at sewer 5-6.
 * - A "scroll-in-progress" lock suppresses ResizeObserver callbacks while
 *   the container is actively scrolling, preventing mid-scroll measurements
 *   from feeding stale positions back into the motor.
 * - Measurements are only committed when all lane refs are present and the
 *   scroll container has been stable for the full debounce window.
 */
export function useBoardLaneCenters(
  playRowRef: React.RefObject<HTMLElement | null>,
  sidewalkRef: React.RefObject<HTMLElement | null>,
  laneCount: number,
  laneRefs: React.MutableRefObject<(HTMLElement | null)[]>,
  scrollRef: React.RefObject<HTMLElement | null>,
) {
  const [centers, setCenters] = useState<BoardLaneCenters | null>(null);
  // True while a smooth-scroll is in progress -- suppresses ResizeObserver.
  const scrollingRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = useCallback(() => {
    // Don't measure while the container is scrolling -- positions are mid-flight.
    if (scrollingRef.current) return;

    const row = playRowRef.current;
    const sidewalk = sidewalkRef.current;
    if (!row || !sidewalk) return;

    const rowRect = row.getBoundingClientRect();
    const sw = sidewalk.getBoundingClientRect();
    const sidewalkCenter = sw.left + sw.width / 2 - rowRect.left;

    const lanes: number[] = [];
    for (let i = 0; i < laneCount; i++) {
      const el = laneRefs.current[i];
      if (!el) return; // Bail if any lane ref is missing -- partial data is worse than none.
      const r = el.getBoundingClientRect();
      lanes[i] = r.left + r.width / 2 - rowRect.left;
    }

    // Only update state when we have a complete, stable measurement.
    setCenters({ sidewalk: sidewalkCenter, lanes });
  }, [laneCount, laneRefs, playRowRef, sidewalkRef]);

  useEffect(() => {
    // Initial measurement after mount.
    const initialTimer = setTimeout(measure, 50);

    const row = playRowRef.current;
    const scroll = scrollRef.current;
    if (!row) return () => clearTimeout(initialTimer);

    // ResizeObserver: only fires when not scrolling.
    const ro = new ResizeObserver(() => {
      if (!scrollingRef.current) measure();
    });
    ro.observe(row);
    if (sidewalkRef.current) ro.observe(sidewalkRef.current);
    laneRefs.current.forEach(el => { if (el) ro.observe(el); });

    // Scroll handler: mark scrolling, debounce the remeasure.
    const SCROLL_DEBOUNCE_MS = 200;
    const onScroll = () => {
      scrollingRef.current = true;
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = setTimeout(() => {
        scrollingRef.current = false;
        measure();
        scrollEndTimerRef.current = null;
      }, SCROLL_DEBOUNCE_MS);
    };

    scroll?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);

    return () => {
      clearTimeout(initialTimer);
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      ro.disconnect();
      scroll?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [measure, laneCount, laneRefs, playRowRef, scrollRef, sidewalkRef]);

  return { centers, remeasure: measure };
}
