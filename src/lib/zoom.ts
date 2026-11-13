export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

/** Snap a stored value to its nearest step, then move one step (clamped at both ends). */
export function stepZoom(current: number, dir: 1 | -1): number {
  let near = 0;
  ZOOM_STEPS.forEach((s, i) => { if (Math.abs(s - current) < Math.abs(ZOOM_STEPS[near] - current)) near = i; });
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, near + dir))];
}

export const zoomLabel = (scale: number): string => `${Math.round(scale * 100)}%`;
