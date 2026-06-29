import type { Poolable } from '../Engine/ObjectPool';

export class Particle implements Poolable {
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public color: string = '#00f3ff';
  public size: number = 0;
  public alpha: number = 1;
  public life: number = 0;
  public maxLife: number = 0;

  /**
   * Initializes or resets particle properties. Called when retrieved from pool.
   */
  public spawn(
    x: number,
    y: number,
    angle: number,
    speed: number,
    size: number,
    maxLife: number,
    color: string
  ): void {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = size;
    this.maxLife = maxLife;
    this.life = maxLife;
    this.color = color;
    this.alpha = 1;
    this.active = true;
  }

  /**
   * Reset activity status. Called when returned to the pool.
   */
  public despawn(): void {
    this.active = false;
  }

  /**
   * Update particle position and fade state.
   */
  public update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    // Slow down slightly over time (friction)
    this.vx *= Math.pow(0.95, dt * 60);
    this.vy *= Math.pow(0.95, dt * 60);
    
    this.life -= dt;
    this.alpha = Math.max(0, this.life / this.maxLife);
    
    if (this.life <= 0) {
      this.active = false;
    }
  }

  /**
   * Renders the particle as a glowing neon dot
   */
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.size * 2;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
