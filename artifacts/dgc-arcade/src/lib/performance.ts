/**
 * PERFORMANCE UTILITIES FOR GAME COMPONENTS
 * 
 * Reduces CPU usage on older hardware (2015 MacBook Air) by:
 * 1. Memoizing expensive calculations
 * 2. Batching state updates
 * 3. Lazy rendering of off-screen elements
 * 4. Throttling animation updates
 * 5. Debouncing network requests
 */

/**
 * Throttle a function to run at most once per interval
 * Useful for resize handlers, scroll events, animation updates
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  intervalMs: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return function throttled(...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= intervalMs) {
      lastCall = now;
      fn(...args);
    } else {
      // Schedule call for later
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
      }, intervalMs - timeSinceLastCall);
    }
  };
}

/**
 * Debounce a function to run only after N ms of inactivity
 * Useful for search, form input, API calls
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delayMs);
  };
}

/**
 * Batch multiple state updates into a single render
 * Usage: batchUpdates(() => { setState1(...); setState2(...); })
 */
export function batchUpdates(callback: () => void) {
  // In React 18+, this is built-in via flushSync
  // For older React versions, use ReactDOM.unstable_batchedUpdates
  if ((window as any).React?.unstable_batchedUpdates) {
    (window as any).React.unstable_batchedUpdates(callback);
  } else {
    callback();
  }
}

/**
 * Detect if device is low-end (e.g., 2015 MacBook Air)
 * Used to reduce animations, effects, and rendering quality
 */
export function isLowEndDevice(): boolean {
  // Check CPU cores
  const cores = (navigator as any).hardwareConcurrency ?? 4;
  if (cores <= 2) return true;

  // Check user agent
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('macbook') && /201[345]/.test(ua)) return true;

  // Check device memory
  if ((navigator as any).deviceMemory && (navigator as any).deviceMemory <= 4) {
    return true;
  }

  return false;
}

/**
 * Get optimal animation frame rate based on device
 * Returns frames per second
 */
export function getOptimalFPS(): number {
  if (isLowEndDevice()) {
    return 30; // Older devices: 30 FPS
  }
  return 60; // Modern devices: 60 FPS
}

/**
 * Request animation frame with FPS limiting
 * Useful for smooth animations on all devices
 */
export function requestAnimationFrameWithFPS(
  callback: (timestamp: number) => void,
  fps: number = 60
): number {
  const frameInterval = 1000 / fps;
  let lastFrameTime = 0;

  const wrappedCallback = (timestamp: number) => {
    const elapsed = timestamp - lastFrameTime;
    if (elapsed >= frameInterval) {
      lastFrameTime = timestamp - (elapsed % frameInterval);
      callback(timestamp);
    }
    return requestAnimationFrame(wrappedCallback);
  };

  return requestAnimationFrame(wrappedCallback);
}

/**
 * Lazy load a component when it enters the viewport
 * Reduces initial render time
 */
export function useIntersectionObserver(
  ref: React.RefObject<HTMLElement>,
  options: IntersectionObserverInit = {}
): boolean {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.1, ...options });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, options]);

  return isVisible;
}

/**
 * Memoize expensive calculations with dependency tracking
 * Similar to useMemo but with manual control
 */
export function memoize<T>(
  fn: () => T,
  deps: any[] = []
): () => T {
  let cachedValue: T;
  let hasCached = false;
  let cachedDeps: any[] = [];

  return () => {
    const depsChanged = !hasCached || deps.some((dep, i) => dep !== cachedDeps[i]);
    if (depsChanged) {
      cachedValue = fn();
      cachedDeps = [...deps];
      hasCached = true;
    }
    return cachedValue;
  };
}

/**
 * Measure performance of a function
 * Useful for identifying bottlenecks
 */
export function measurePerformance<T>(
  label: string,
  fn: () => T
): T {
  if (typeof performance === 'undefined') {
    return fn();
  }

  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  if (duration > 16) { // Longer than one frame at 60fps
    console.warn(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
  }

  return result;
}

/**
 * Request idle callback with fallback for older browsers
 */
export function requestIdleCallback(
  callback: (deadline: IdleDeadline) => void,
  options?: IdleRequestOptions
): number {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return (window as any).requestIdleCallback(callback, options);
  }

  // Fallback: schedule after current frame
  return setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => 1,
    } as IdleDeadline);
  }, 1) as unknown as number;
}

// Re-export React for convenience
import * as React from 'react';
