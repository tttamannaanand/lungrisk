/**
 * Drifting specks that stand in for PM2.5. More pollution, more (and
 * warmer-coloured) specks. Static when the visitor prefers reduced motion.
 */
interface Speck {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
}

export class Particles {
  private ctx: CanvasRenderingContext2D;
  private specks: Speck[] = [];
  private target = 0;
  private colour = '128,128,128';
  private raf = 0;
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    document.addEventListener('visibilitychange', () =>
      document.hidden ? this.stop() : this.start(),
    );
  }

  /** pm25 in µg/m³; colour as "r,g,b". */
  setLevel(pm25: number, colour: string) {
    // ~4 specks per µg/m³ on a 1000×300 hero, capped so phones stay smooth.
    const area = (this.canvas.clientWidth * this.canvas.clientHeight) / (1000 * 300);
    this.target = Math.min(Math.round(pm25 * 4 * area), 900);
    this.colour = colour;
    // Adjust the count right away (new specks fade in), so the density never
    // depends on how many frames a slow device manages to draw.
    while (this.specks.length < this.target) this.specks.push(this.spawn());
    this.specks.length = this.target;
    if (this.still) this.draw();
    else this.start();
  }

  private resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.still) this.draw();
  }

  private spawn(): Speck {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1.8 + Math.random() * 3.4,
      vx: 0.15 + Math.random() * 0.35,
      vy: (Math.random() - 0.5) * 0.15,
      a: 0, // fades in
    };
  }

  private step(dt: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    for (const s of this.specks) {
      s.x += s.vx;
      s.y += s.vy + Math.sin((s.x + s.r * 40) / 60) * 0.12;
      s.a = Math.min(s.a + dt / 600, 1); // fade in over 0.6 s, at any frame rate
      if (s.x > w + 4) s.x = -4;
      if (s.y < -4) s.y = h + 4;
      if (s.y > h + 4) s.y = -4;
    }
  }

  private draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    if (this.still && this.specks.length !== this.target) {
      this.specks = Array.from({ length: this.target }, () => ({ ...this.spawn(), a: 1 }));
    }
    for (const s of this.specks) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.colour},${(0.45 + s.r * 0.07) * s.a})`;
      ctx.fill();
    }
  }

  private start() {
    if (this.still || this.raf) return;
    let last = performance.now();
    const loop = (now: number) => {
      this.step(Math.min(now - last, 100));
      last = now;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
