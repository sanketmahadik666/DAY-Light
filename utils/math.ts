/**
 * Math utilities for parallax & animation calculations
 */

/**
 * Calculate parallax offset based on index and scroll position
 */
export function calculateParallaxOffset(
  index: number,
  scrollProgress: number,
  intensity: number = 10
): number {
  return index * -intensity * (1 - scrollProgress);
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Ease out cubic
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Ease in out cubic
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Calculate aspect ratio category
 */
export function getAspectRatioCategory(
  width: number,
  height: number
): 'landscape' | 'portrait' | 'square' {
  const ratio = width / height;
  if (ratio >= 1.2) return 'landscape';
  if (ratio <= 0.8) return 'portrait';
  return 'square';
}

/**
 * Calculate scale for active slide
 */
export function calculateActiveScale(
  isActive: boolean,
  baseScale: number = 1.03
): number {
  return isActive ? baseScale : 1;
}

/**
 * Calculate opacity for crossfade
 */
export function calculateCrossfadeOpacity(
  progress: number,
  startOpacity: number = 0,
  endOpacity: number = 1
): number {
  return lerp(startOpacity, endOpacity, easeOutCubic(progress));
}

