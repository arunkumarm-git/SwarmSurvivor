export class OrbitalWeapon {
  public count: number = 0; // Starts at 0, increased by upgrades
  public radius: number = 100;
  private angle: number = 0;
  public rotationSpeed: number = 2.5; // Radians per second
  public orbiterRadius: number = 9;
  public damage: number = 25; // Base damage per hit

  /**
   * Updates current orbital rotation angle based on elapsed delta time.
   */
  public update(dt: number): void {
    if (this.count === 0) return;
    this.angle += this.rotationSpeed * dt;
    if (this.angle > Math.PI * 2) {
      this.angle -= Math.PI * 2;
    }
  }

  /**
   * Retrieves world coordinates of all active orbiters spaced out evenly
   */
  public getOrbiterPositions(playerX: number, playerY: number): { x: number; y: number; angle: number }[] {
    const positions: { x: number; y: number; angle: number }[] = [];
    for (let i = 0; i < this.count; i++) {
      const orbAngle = this.angle + (i * Math.PI * 2) / this.count;
      positions.push({
        x: playerX + Math.cos(orbAngle) * this.radius,
        y: playerY + Math.sin(orbAngle) * this.radius,
        angle: orbAngle
      });
    }
    return positions;
  }

  /**
   * Draws a faint guidance circle and glowing neon orbiters
   */
  public draw(ctx: CanvasRenderingContext2D, playerX: number, playerY: number): void {
    if (this.count === 0) return;

    ctx.save();
    
    // Draw the faint dashed orbital guide ring
    ctx.strokeStyle = 'rgba(255, 0, 208, 0.05)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(playerX, playerY, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();

    // Render individual orbiters
    const positions = this.getOrbiterPositions(playerX, playerY);
    positions.forEach((pos) => {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      // Spin the individual orbiter diamond
      ctx.rotate(pos.angle + Math.PI / 4);

      // Glowing Neon border
      ctx.shadowColor = '#ff00d0'; // Neon Pink/Purple
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ff00d0';
      ctx.lineWidth = 2.5;
      
      // Semitranslucent pink fill
      ctx.fillStyle = 'rgba(255, 0, 208, 0.16)';

      ctx.beginPath();
      ctx.moveTo(0, -this.orbiterRadius);
      ctx.lineTo(this.orbiterRadius, 0);
      ctx.lineTo(0, this.orbiterRadius);
      ctx.lineTo(-this.orbiterRadius, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Core white bullet center
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }
}
