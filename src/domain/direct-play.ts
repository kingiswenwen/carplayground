/** Coordinates and motion use game units, never manufacturer performance data. */
export type Point = { x: number; y: number };
export type Rect = Point & { w: number; h: number };
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function inside(p: Point, r: Rect, padding = 0) {
  return Math.abs(p.x - r.x) <= r.w / 2 + padding && Math.abs(p.y - r.y) <= r.h / 2 + padding;
}
export function flickVelocity(samples: (Point & { t: number })[], now: number): Point {
  const recent = samples.filter(p => now - p.t <= 120);
  if (recent.length < 2 || now - recent[recent.length - 1].t > 80) return { x: 0, y: 0 };
  const first = recent[0], last = recent[recent.length - 1], seconds = (last.t - first.t) / 1000;
  if (seconds < .008) return { x: 0, y: 0 };
  return { x: clamp((last.x - first.x) / seconds, -1000, 1000), y: clamp((last.y - first.y) / seconds, -1000, 1000) };
}
export function coast(x: number, velocity: number, seconds: number, resistance: number, min = 130, max = 870) {
  const dt = Math.min(Math.max(seconds, 0), .05), sign = Math.sign(velocity);
  const elapsed = Math.abs(velocity) / resistance;
  const moving = Math.min(dt, elapsed);
  const nextX = x + velocity * moving - sign * resistance * moving * moving / 2;
  return { x: clamp(nextX, min, max), velocity: nextX <= min || nextX >= max ? 0 : sign * Math.max(0, Math.abs(velocity) - resistance * dt) };
}
export function snapTarget(p: Point, targets: (Rect & { occupied?: boolean })[], radius = 80) {
  let best = -1, nearest = Infinity;
  targets.forEach((target, index) => {
    const d = distance(p, target);
    if (!target.occupied && inside(p, target, radius) && d < nearest) { nearest = d; best = index; }
  });
  return best;
}
export function sampledSegment(a: Point, b: Point, spacing: number): Point[] {
  const steps = Math.max(1, Math.ceil(distance(a, b) / Math.max(1, spacing)));
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }));
}
