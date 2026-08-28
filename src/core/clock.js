export class Clock {
  constructor() {
    this.elapsed = 0;
    this.lastTime = performance.now();
  }

  tick() {
    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);

    this.lastTime = now;
    this.elapsed += delta;

    return delta;
  }
}
