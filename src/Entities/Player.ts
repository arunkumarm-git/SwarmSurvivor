export class Player {
  public x: number;
  public y: number;
  public radius: number = 18;
  public speed: number = 300; // Pixels per second
  
  // Game stats
  public health: number = 100;
  public maxHealth: number = 100;
  public xp: number = 0;
  public maxXp: number = 100;
  public level: number = 1;
  public magnetRadius: number = 160; // Initial item vacuum/collection radius
  
  // Visual orientation
  public angle: number = -Math.PI / 2; // Face upwards initially
  public color: string = '#00f3ff'; // Neon Cyan
  public glowColor: string = '#00f3ff';
  public isMoving: boolean = false;
  
  // Spawning coordinates
  constructor(startX: number, startY: number) {
    this.x = startX;
    this.y = startY;
  }

  /**
   * Updates player position based on keyboard input keys and delta time.
   * Clamps player to the map boundaries.
   */
  public update(
    dt: number,
    keys: Record<string, boolean>,
    mapWidth: number,
    mapHeight: number,
    spawnTrailCallback?: (x: number, y: number, angle: number) => void
  ): void {
    let dx = 0;
    let dy = 0;

    // Support both WASD and Arrow Keys
    if (keys['w'] || keys['W'] || keys['ArrowUp'] || keys['KeyW']) dy -= 1;
    if (keys['s'] || keys['S'] || keys['ArrowDown'] || keys['KeyS']) dy += 1;
    if (keys['a'] || keys['A'] || keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
    if (keys['d'] || keys['D'] || keys['ArrowRight'] || keys['KeyD']) dx += 1;

    if (dx !== 0 || dy !== 0) {
      // Normalize to prevent faster diagonal movement
      const length = Math.sqrt(dx * dx + dy * dy);
      dx /= length;
      dy /= length;

      this.x += dx * this.speed * dt;
      this.y += dy * this.speed * dt;

      // Smoothly rotate towards movement direction
      const targetAngle = Math.atan2(dy, dx);
      // Simple rotation interpolation
      this.angle = targetAngle;
      this.isMoving = true;

      // Spawn movement trail particles if callback provided
      if (spawnTrailCallback) {
        // Emit trail from the back of the player ship
        const tailX = this.x - Math.cos(this.angle) * this.radius;
        const tailY = this.y - Math.sin(this.angle) * this.radius;
        spawnTrailCallback(tailX, tailY, this.angle + Math.PI + (Math.random() - 0.5) * 0.5);
      }
    } else {
      this.isMoving = false;
    }

    // Clamp inside world boundaries
    this.x = Math.max(this.radius, Math.min(mapWidth - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(mapHeight - this.radius, this.y));
  }

  /**
   * Renders the player as a sleek, glowing neon cyberpunk triangle ship
   */
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // 1. Sleek Neon Glow Outline
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

    // 2. Translucent cyan body fill
    ctx.fillStyle = 'rgba(0, 243, 255, 0.15)';
    ctx.fill();

    // Remove glow for high-contrast interior styling
    ctx.shadowBlur = 0;

    // 3. Highlighted engine glowing core
    ctx.fillStyle = '#ff0055'; // Neon Magenta
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
  }

  /**
   * Add XP to player.
   */
  public addXp(amount: number): void {
    this.xp += amount;
  }

  /**
   * Processes player level-up state scaling and heals player.
   */
  public levelUp(): void {
    this.xp -= this.maxXp;
    this.level++;
    this.maxXp = Math.floor(this.maxXp * 1.4); // Scale level requirements
    this.maxHealth = Math.floor(this.maxHealth * 1.15); // Scale maximum health
    this.health = this.maxHealth; // Full heal
  }

  /**
   * Take damage, clamp to 0. Returns true if dead.
   */
  public takeDamage(amount: number): boolean {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }
}
