import type { Poolable } from '../Engine/ObjectPool';

export class ExperienceGem implements Poolable {
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public radius: number = 7;
  public xpValue: number = 20;

  // Movement physics
  private speedX: number = 0;
  private speedY: number = 0;
  private bobOffset: number = 0;

  // Visual appearance
  public color: string = '#39ff14'; // Neon Green
  public glowColor: string = '#39ff14';

  /**
   * Initializes experience gem stats when retrieved from the object pool.
   */
  public spawn(x: number, y: number, xpValue?: number, color?: string): void {
    this.x = x;
    this.y = y;
    this.xpValue = xpValue !== undefined ? xpValue : 25;
    this.color = color || '#39ff14';
    this.glowColor = this.color;
    
    // Reset velocities and randomise bob offset phase
    this.speedX = 0;
    this.speedY = 0;
    this.bobOffset = Math.random() * Math.PI * 2;
    
    this.active = true;
  }

  /**
   * Resets active flag on despawning
   */
  public despawn(): void {
    this.active = false;
  }

  /**
   * Update gem status. Checks if within player collection/magnet radius to accelerate towards them.
   */
  public update(dt: number, playerX: number, playerY: number, magnetRadius: number): void {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance < magnetRadius) {
      // 1. Magnet Attraction: Accelerate towards the player
      // Gradually increases attraction speed as it gets closer
      const baseAccel = 900;
      const proximityMultiplier = Math.max(1, 400 / (distance + 50));
      const accel = baseAccel * proximityMultiplier;
      
      const dirX = dx / distance;
      const dirY = dy / distance;

      this.speedX += dirX * accel * dt;
      this.speedY += dirY * accel * dt;

      // Limit speed to prevent extreme orbiting/overshooting
      const maxSpeed = 800;
      const speed = Math.hypot(this.speedX, this.speedY);
      if (speed > maxSpeed) {
        this.speedX = (this.speedX / speed) * maxSpeed;
        this.speedY = (this.speedY / speed) * maxSpeed;
      }

      this.x += this.speedX * dt;
      this.y += this.speedY * dt;
    } else {
      // 2. Idle State: Apply deceleration friction if it was previously pulled
      this.speedX *= Math.pow(0.85, dt * 60);
      this.speedY *= Math.pow(0.85, dt * 60);

      if (Math.hypot(this.speedX, this.speedY) < 2) {
        this.speedX = 0;
        this.speedY = 0;
      }

      this.x += this.speedX * dt;
      this.y += this.speedY * dt;

      // Pulse and bob up and down
      this.bobOffset += 4 * dt;
    }
  }

  /**
   * Renders the Experience Gem as a floating, glowing neon crystal/diamond shape
   */
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    
    // Apply visual bobbing offset only to drawing, keeping physics coordinates clean
    const drawY = this.speedX === 0 && this.speedY === 0 
      ? this.y + Math.sin(this.bobOffset) * 3 
      : this.y;

    ctx.translate(this.x, drawY);

    // Glowing Neon borders
    ctx.shadowColor = this.glowColor;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'miter';

    ctx.beginPath();
    // Diamond Crystal Points
    ctx.moveTo(0, -this.radius);
    ctx.lineTo(this.radius * 0.7, 0);
    ctx.lineTo(0, this.radius);
    ctx.lineTo(-this.radius * 0.7, 0);
    ctx.closePath();
    ctx.stroke();

    // Semi-translucent body fill
    ctx.fillStyle = 'rgba(57, 255, 20, 0.18)';
    ctx.fill();

    // High contrast white core
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -this.radius * 0.4);
    ctx.lineTo(this.radius * 0.28, 0);
    ctx.lineTo(0, this.radius * 0.4);
    ctx.lineTo(-this.radius * 0.28, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
