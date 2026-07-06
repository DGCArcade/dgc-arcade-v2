import { useCallback, useEffect, useState } from "react";

export type BoardLaneCenters = {
  sidewalk: number;
  lanes: number[];
};

/** Measure sewer / sidewalk centers relative to the play row (for chicken positioning). */
export function useBoardLaneCenters(
  playRowRef: React.RefObject<HTMLElement | null>,
  sidewalkRef: React.RefObject<HTMLElement | null>,
  laneCount: number,
  laneRefs: React.MutableRefObject<(HTMLElement | null)[]>,
  scrollRef: React.RefObject<HTMLElement | null>,
) {
  const [centers, setCenters] = useState<BoardLaneCenters | null>(null);

  const measure = useCallback(() => {
    const row = playRowRef.current;
    const sidewalk = sidewalkRef.current;
    if (!row || !sidewalk) return;

    const rowRect = row.getBoundingClientRect();
    const sw = sidewalk.getBoundingClientRect();
    const sidewalkCenter = sw.left + sw.width / 2 - rowRect.left;

    const lanes: number[] = [];
    for (let i = 0; i < laneCount; i++) {
      const el = laneRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      lanes[i] = r.left + r.width / 2 - rowRect.left;
    }

    if (lanes.length === laneCount) {
      setCenters({ sidewalk: sidewalkCenter, lanes });
    }
  }, [laneCount, laneRefs, playRowRef, sidewalkRef]);

  useEffect(() => {
    measure();
    const row = playRowRef.current;
    const scroll = scrollRef.current;
    if (!row) return;

    const ro = new ResizeObserver(() => measure());
    ro.observe(row);
    if (sidewalkRef.current) ro.observe(sidewalkRef.current);
    laneRefs.current.forEach(el => {
      if (el) ro.observe(el);
    });

    // Debounce scroll events to avoid constant re-measurement feedback loop
    // that causes the chicken to micro-shake side-to-side
    let scrollTimeout: NodeJS.Timeout | null = null;
    const onScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        measure();
        scrollTimeout = null;
      }, 100);
    };

    scroll?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      scroll?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [measure, laneCount, laneRefs, playRowRef, scrollRef, sidewalkRef]);

  return { centers, remeasure: measure };
}
