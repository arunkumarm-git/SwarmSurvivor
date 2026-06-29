export class RivalPlayer {
  public id: string;
  public x: number;
  public y: number;
  public radius: number = 18;
  public health: number = 100;
  public maxHealth: number = 100;
  public level: number = 1;
  public angle: number = 0;
  public color: string = '#ff4400'; // Neon Orange-Red
  public glowColor: string = '#ff4400';
  
  // Orbiter hit protection cooldown on this client (similar to Enemy)
  public orbitalHitCooldown: number = 0;

  // Interpolation targets
  private targetX: number;
  private targetY: number;
  private targetAngle: number;

  constructor(id: string, x: number, y: number, angle: number, health: number, level: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.angle = angle;
    this.targetAngle = angle;
    this.health = health;
    this.level = level;
  }

  /**
   * Updates state with target positions for client-side interpolation
   */
  public updateState(x: number, y: number, angle: number, health: number, level: number): void {
    this.targetX = x;
    this.targetY = y;
    this.targetAngle = angle;
    this.health = health;
    this.level = level;
  }

  /**
   * Lerps current coordinates towards target coordinates to smooth out network ticks at 60 FPS
   */
  public update(dt: number): void {
    // Smooth position interpolation
    this.x += (this.targetX - this.x) * Math.min(1, dt * 10);
    this.y += (this.targetY - this.y) * Math.min(1, dt * 10);

    // Smooth angle interpolation wrapping
    let diff = this.targetAngle - this.angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.angle += diff * Math.min(1, dt * 10);

    // Cooldown ticks
    if (this.orbitalHitCooldown > 0) {
      this.orbitalHitCooldown -= dt;
    }
  }

  /**
   * Renders the Rival Player as a sleek glowing red/orange hostile triangle ship
   */
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // 1. Hostile Neon Glow Outline (Neon Orange/Red)
    ctx.shadowColor = this.glowColor;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    // Tip of ship
    ctx.moveTo(this.radius, 0);
    // Back-left wing
    ctx.lineTo(-this.radius * 0.8, -this.radius * 0.7);
    // Rear indented center point
    ctx.lineTo(-this.radius * 0.4, 0);
    // Back-right wing
    ctx.lineTo(-this.radius * 0.8, this.radius * 0.7);
    ctx.closePath();
    ctx.stroke();

    // 2. Translucent red/orange fill
    ctx.fillStyle = 'rgba(255, 68, 0, 0.15)';
    ctx.fill();

    ctx.shadowBlur = 0;

    // 3. Highlighted engine glowing core (purple/magenta)
    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.arc(-this.radius * 0.4, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // 4. White cabin glass cockpit
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(this.radius * 0.3, 0);
    ctx.lineTo(-this.radius * 0.1, -this.radius * 0.2);
    ctx.lineTo(-this.radius * 0.1, this.radius * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Draw HUD metrics above the ship
    this.drawHUD(ctx);
  }

  /**
   * Renders a small health bar and level badge above the rival player
   */
  private drawHUD(ctx: CanvasRenderingContext2D): void {
    const barWidth = 32;
    const barHeight = 4;
    const x = this.x - barWidth / 2;
    const y = this.y - this.radius - 12;

    ctx.save();
    
    // Background bar
    ctx.fillStyle = 'rgba(7, 7, 12, 0.6)';
    ctx.fillRect(x, y, barWidth, barHeight);

    // Health filled bar
    const pct = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = '#ff3300';
    ctx.fillRect(x, y, barWidth * pct, barHeight);

    // Level label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = 'bold 9px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Lv.${this.level}`, this.x, y - 4);

    ctx.restore();
  }
}
