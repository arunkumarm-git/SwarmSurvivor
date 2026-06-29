import type { Poolable } from '../Engine/ObjectPool';

export type EnemyType = 'Basic' | 'Swarmer' | 'Bruiser';

export class Enemy implements Poolable {
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  
  public speed: number = 100;
  public radius: number = 14;
  public health: number = 20;
  public maxHealth: number = 20;
  public damage: number = 15; // Contact damage dealt per second
  
  public angle: number = 0;
  public color: string = '#ff0055'; // Neon Magenta
  public glowColor: string = '#ff0055';
  public type: EnemyType = 'Basic';

  // Orbiter weapon hit protection timer
  public orbitalHitCooldown: number = 0;

  /**
   * Initializes enemy attributes when retrieved from the object pool.
   * Adjusts stats dynamically based on EnemyType and game level/time multipliers.
   */
  public spawn(
    x: number,
    y: number,
    type: EnemyType = 'Basic',
    speedBoost: number = 0,
    hpMultiplier: number = 1
  ): void {
    this.x = x;
    this.y = y;
    this.type = type;
    this.orbitalHitCooldown = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.active = true;

    // Apply base attributes by type
    switch (type) {
      case 'Swarmer':
        this.radius = 10;
        this.maxHealth = Math.floor(8 * hpMultiplier);
        this.speed = 170 + Math.random() * 30 + speedBoost;
        this.damage = 10;
        this.color = '#ffe600'; // Neon Yellow
        break;

      case 'Bruiser':
        this.radius = 24;
        this.maxHealth = Math.floor(80 * hpMultiplier);
        this.speed = 50 + Math.random() * 15 + speedBoost * 0.4;
        this.damage = 45;
        this.color = '#ff5500'; // Neon Orange
        break;

      case 'Basic':
      default:
        this.radius = 14;
        this.maxHealth = Math.floor(20 * hpMultiplier);
        this.speed = 85 + Math.random() * 35 + speedBoost;
        this.damage = 18;
        this.color = '#ff0055'; // Neon Magenta-Red
        break;
    }

    this.health = this.maxHealth;
    this.glowColor = this.color;
  }

  /**
   * Resets active flag on despawn.
   */
  public despawn(): void {
    this.active = false;
  }

  /**
   * AI pathing: moves towards player coordinates, updates orientation, and ticks cooldowns.
   */
  public update(dt: number, playerX: number, playerY: number): void {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0) {
      this.x += (dx / distance) * this.speed * dt;
      this.y += (dy / distance) * this.speed * dt;
    }

    // Swarmers align visual angle with trajectory; others rotate animation frames
    if (this.type === 'Swarmer') {
      this.angle = Math.atan2(dy, dx);
    } else {
      this.angle += 1.8 * dt;
    }

    // Tick down invulnerability frames
    if (this.orbitalHitCooldown > 0) {
      this.orbitalHitCooldown -= dt;
    }
  }

  /**
   * Renders the enemy visually based on its subclass type
   */
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Glowing Neon Stroke
    ctx.shadowColor = this.glowColor;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.type === 'Bruiser' ? 3.5 : 2.5;
    ctx.lineJoin = 'round';

    if (this.type === 'Swarmer') {
      // Swarmer: Sleek glowing triangle arrowhead
      ctx.beginPath();
      ctx.moveTo(this.radius, 0);
      ctx.lineTo(-this.radius * 0.8, -this.radius * 0.6);
      ctx.lineTo(-this.radius * 0.4, 0);
      ctx.lineTo(-this.radius * 0.8, this.radius * 0.6);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 230, 0, 0.15)';
      ctx.fill();

      // White dot core core
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.radius * 0.15, 0, 2, 0, Math.PI * 2);
      ctx.fill();

    } else if (this.type === 'Bruiser') {
      // Bruiser: Giant heavy vector Octagon
      const r = this.radius;
      const offset = r * 0.4;
      ctx.beginPath();
      ctx.moveTo(r, offset);
      ctx.lineTo(offset, r);
      ctx.lineTo(-offset, r);
      ctx.lineTo(-r, offset);
      ctx.lineTo(-r, -offset);
      ctx.lineTo(-offset, -r);
      ctx.lineTo(offset, -r);
      ctx.lineTo(r, -offset);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 85, 0, 0.12)';
      ctx.fill();

      // Heavy white inner square
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9);

    } else {
      // Basic: Diamond
      ctx.beginPath();
      ctx.moveTo(this.radius, 0);
      ctx.lineTo(0, -this.radius);
      ctx.lineTo(-this.radius, 0);
      ctx.lineTo(0, this.radius);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 0, 85, 0.12)';
      ctx.fill();

      // White crosshair
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-this.radius * 0.45, 0);
      ctx.lineTo(this.radius * 0.45, 0);
      ctx.moveTo(0, -this.radius * 0.45);
      ctx.lineTo(0, this.radius * 0.45);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Subtracts health, returns true if dead.
   */
  public takeDamage(amount: number): boolean {
    this.health -= amount;
    return this.health <= 0;
  }
}
