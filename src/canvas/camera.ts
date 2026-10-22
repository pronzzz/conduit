import { prefersReducedMotion } from './theme';

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/**
 * Screen = world * scale + offset. Zoom eases toward a target around a fixed
 * anchor (so the point under the cursor never drifts), panning is 1:1 with
 * momentum on release, and `flyTo` eases position and scale together.
 */
export class Camera {
  x = 0;
  y = 0;
  scale = 1;

  private targetScale = 1;
  private anchorX = 0;
  private anchorY = 0;
  private vx = 0;
  private vy = 0;
  private fly: { x: number; y: number; scale: number } | null = null;

  toWorld(sx: number, sy: number) {
    return { x: (sx - this.x) / this.scale, y: (sy - this.y) / this.scale };
  }

  get zoomTarget() {
    return this.targetScale;
  }

  panBy(dx: number, dy: number) {
    this.fly = null;
    this.x += dx;
    this.y += dy;
  }

  /** Momentum in px/ms, applied after a drag ends. */
  fling(vx: number, vy: number) {
    if (prefersReducedMotion()) return;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.05) return;
    const max = 4;
    const k = speed > max ? max / speed : 1;
    this.vx = vx * k;
    this.vy = vy * k;
  }

  stop() {
    this.vx = this.vy = 0;
  }

  zoomAt(sx: number, sy: number, factor: number) {
    this.fly = null;
    this.stop();
    this.anchorX = sx;
    this.anchorY = sy;
    this.targetScale = clampScale(this.targetScale * factor);
    if (prefersReducedMotion()) this.applyScale(this.targetScale);
  }

  flyTo(x: number, y: number, scale: number, instant = false) {
    this.stop();
    const s = clampScale(scale);
    this.targetScale = s;
    if (instant || prefersReducedMotion()) {
      this.x = x;
      this.y = y;
      this.scale = s;
      this.fly = null;
    } else {
      this.fly = { x, y, scale: s };
    }
  }

  private applyScale(next: number) {
    const w = this.toWorld(this.anchorX, this.anchorY);
    this.scale = next;
    this.x = this.anchorX - w.x * next;
    this.y = this.anchorY - w.y * next;
  }

  /** Steps animations; returns true while anything is still moving. */
  update(dt: number): boolean {
    let moving = false;

    if (this.fly) {
      const k = 1 - Math.exp(-dt / 110);
      this.x += (this.fly.x - this.x) * k;
      this.y += (this.fly.y - this.y) * k;
      this.scale = Math.exp(Math.log(this.scale) + (Math.log(this.fly.scale) - Math.log(this.scale)) * k);
      if (Math.abs(this.fly.x - this.x) < 0.3 && Math.abs(this.fly.y - this.y) < 0.3 && Math.abs(this.fly.scale - this.scale) < 1e-3) {
        this.x = this.fly.x;
        this.y = this.fly.y;
        this.scale = this.fly.scale;
        this.fly = null;
      } else moving = true;
    } else if (this.scale !== this.targetScale) {
      const k = 1 - Math.exp(-dt / 70);
      const ls = Math.log(this.scale);
      let next = Math.exp(ls + (Math.log(this.targetScale) - ls) * k);
      if (Math.abs(next - this.targetScale) < 1e-4) next = this.targetScale;
      this.applyScale(next);
      moving = this.scale !== this.targetScale;
    }

    if (this.vx || this.vy) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const decay = Math.exp(-dt / 180);
      this.vx *= decay;
      this.vy *= decay;
      if (Math.hypot(this.vx, this.vy) < 0.01) this.vx = this.vy = 0;
      else moving = true;
    }
    return moving;
  }
}
