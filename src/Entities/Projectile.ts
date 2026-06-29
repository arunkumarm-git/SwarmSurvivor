import type { Poolable } from '../Engine/ObjectPool';

export class Projectile implements Poolable {
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  
  public vx: number = 0;
  public vy: number = 0;
  public speed: number = 750; // High speed laser
  public radius: number = 5; // Hitbox radius
  public damage: number = 20;

  private distanceTraveled: number = 0;
  private maxDistance: number = 1000; // Despawn after travel limit
  
  public color: string = '#ffe600'; // Neon Yellow by default
  public glowColor: string = '#ffe600';
  public isLocal: boolean = true;

  /**
   * Initializes projectile coordinates and velocity vectors directed towards targeted coordinates.
   */
  public spawn(
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    speed?: number,
    damage?: number,
    maxDistance?: number,
    color?: string
  ): void {
    this.x = x;
    this.y = y;
    this.isLocal = true;
    
    this.speed = speed !== undefined ? speed : 750;
    this.damage = damage !== undefined ? damage : 20;
    this.maxDistance = maxDistance !== undefined ? maxDistance : 1000;
    this.color = color || '#ffe600';
    this.glowColor = this.color;
    this.distanceTraveled = 0;

    const dx = targetX - x;
    const dy = targetY - y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
      this.vx = (dx / dist) * this.speed;
      this.vy = (dy / dist) * this.speed;
    } else {
      // Default to moving right if spawned exactly on target
      this.vx = this.speed;
      this.vy = 0;
    }

    this.active = true;
  }

  /**
   * Deactivates entity.
   */
  public despawn(): void {
    this.active = false;
  }

  /**
   * Moves the projectile and checks if it exceeds max travel range.
   */
  public update(dt: number): void {
    const moveX = this.vx * dt;
    const moveY = this.vy * dt;
    
    this.x += moveX;
    this.y += moveY;
    
    this.distanceTraveled += Math.hypot(moveX, moveY);
    
    if (this.distanceTraveled >= this.maxDistance) {
      this.active = false;
    }
  }

  /**
   * Renders the projectile as a glowing neon laser beam
   */
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // Set neon laser glow
    ctx.shadowColor = this.glowColor;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    // Draw as a vector trail segment (laser capsule)
    const tailLength = 15;
    const velLen = Math.hypot(this.vx, this.vy);
    const dirX = velLen > 0 ? this.vx / velLen : 1;
    const dirY = velLen > 0 ? this.vy / velLen : 0;

    ctx.beginPath();
    ctx.moveTo(this.x - dirX * tailLength, this.y - dirY * tailLength);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    // Laser inner white core
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.x - dirX * (tailLength - 2), this.y - dirY * (tailLength - 2));
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    ctx.restore();
  }
}
