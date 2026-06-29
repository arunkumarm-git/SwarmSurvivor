import { Player } from './Entities/Player';
import { ObjectPool } from './Engine/ObjectPool';
import { Particle } from './Entities/Particle';
import { Enemy } from './Entities/Enemy';
import type { EnemyType } from './Entities/Enemy';
import { Projectile } from './Entities/Projectile';
import { ExperienceGem } from './Entities/ExperienceGem';
import { OrbitalWeapon } from './Weapons/OrbitalWeapon';
import { SocketManager } from './Network/SocketManager';
import { CrazyGamesManager } from './SDK/CrazyGamesManager';
import './style.css';

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private logicalWidth: number = 0;
  private logicalHeight: number = 0;

  // Game configuration
  private mapWidth: number = 3000;
  private mapHeight: number = 3000;
  private score: number = 0;
  private playerName: string = 'Survivor';
  private isGameOver: boolean = false;
  private isLevelingUp: boolean = false;
  private gameOverTimer: number = 0;
  private gameTimer: number = 0; // Accumulated game time in seconds

  // Entities and systems
  private player: Player;
  private particlePool: ObjectPool<Particle>;
  private enemyPool: ObjectPool<Enemy>;
  private projectilePool: ObjectPool<Projectile>;
  private gemPool: ObjectPool<ExperienceGem>;
  private orbitalWeapon: OrbitalWeapon;
  private camera = { x: 1500, y: 1500, lerpSpeed: 0.08 };

  // Inputs
  private keys: Record<string, boolean> = {};

  // Timing
  private lastTime: number = 0;
  private enemySpawnTimer: number = 0;
  private shootTimer: number = 0;
  public shootInterval: number = 0.45; // Auto-shoot rate (altered by upgrades)
  
  // Visual effects
  private screenShake: number = 0;

  constructor() {
    this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error('Canvas element #gameCanvas not found');
    }

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get 2D context from canvas');
    }
    this.ctx = context;

    // Initialize systems
    this.player = new Player(this.mapWidth / 2, this.mapHeight / 2);
    this.particlePool = new ObjectPool<Particle>(() => new Particle(), 800);
    this.enemyPool = new ObjectPool<Enemy>(() => new Enemy(), 250);
    this.projectilePool = new ObjectPool<Projectile>(() => new Projectile(), 150);
    this.gemPool = new ObjectPool<ExperienceGem>(() => new ExperienceGem(), 350);
    this.orbitalWeapon = new OrbitalWeapon();

    // Initial camera placement on player
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;

    // Event listeners
    this.setupInputListeners();
    this.setupResizeListener();

    // Set canvas dimension for first frame
    this.resize();

    // Parse invite roomId from URL params or SDK getInviteParam
    const urlParams = new URLSearchParams(window.location.search);
    const inviteRoomId = urlParams.get('roomId') || 
                         CrazyGamesManager.getInstance().getInviteParam('roomId') || 
                         'global';

    // Notify SDK loading start
    CrazyGamesManager.getInstance().loadingStart();

    // Bind pilot identity/username overlay
    const userOverlay = document.getElementById('username-overlay');
    const submitBtn = document.getElementById('username-submit-btn');
    const nameInput = document.getElementById('username-input') as HTMLInputElement;

    if (submitBtn && nameInput && userOverlay) {
      submitBtn.addEventListener('click', () => {
        const username = nameInput.value.trim() || 'Survivor_' + Math.floor(Math.random() * 1000);
        this.playerName = username;
        userOverlay.style.display = 'none';

        // Connect SocketManager passing name and room ID
        SocketManager.getInstance().connect(this, this.playerName, inviteRoomId);

        // Stop loading and transition gameplay state in SDK
        CrazyGamesManager.getInstance().loadingStop();
        CrazyGamesManager.getInstance().gameplayStart();
      });
    }

    // Set up Game Over overlays buttons
    const respawnBtn = document.getElementById('respawn-btn') as HTMLButtonElement;
    const rewardAdBtn = document.getElementById('reward-ad-btn') as HTMLButtonElement;

    if (respawnBtn) {
      respawnBtn.addEventListener('click', () => {
        respawnBtn.disabled = true;
        // Request a fresh spawn coordinate from server
        SocketManager.getInstance().requestRespawn();
      });
    }

    if (rewardAdBtn) {
      rewardAdBtn.addEventListener('click', () => {
        rewardAdBtn.disabled = true;
        CrazyGamesManager.getInstance().requestAd('rewarded', {
          adStarted: () => {
            console.log('Rewarded ad started.');
          },
          adFinished: () => {
            console.log('Rewarded ad completed. Doubling score...');
            this.score *= 2;
            const scoreVal = document.getElementById('final-score-val');
            if (scoreVal) scoreVal.innerText = this.score.toString().padStart(6, '0');
            
            // Re-sync UI
            this.updateUI();

            rewardAdBtn.innerText = 'SCORE DOUBLED';
          },
          adError: (err) => {
            console.error('Rewarded ad error:', err);
            rewardAdBtn.disabled = false;
          }
        });
      });
    }

    // Bind invite friend button click handler
    const inviteBtn = document.getElementById('invite-btn');
    if (inviteBtn) {
      inviteBtn.addEventListener('click', () => {
        const socketId = SocketManager.getInstance().getSocketId();
        if (!socketId) {
          console.warn('Socket not connected yet.');
          return;
        }
        CrazyGamesManager.getInstance().getInviteLink({ roomId: socketId }).then((link) => {
          navigator.clipboard.writeText(link).then(() => {
            inviteBtn.innerText = 'LINK COPIED!';
            setTimeout(() => {
              inviteBtn.innerText = '🔗 INVITE FRIEND';
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy invite link to clipboard:', err);
            alert('Share this invite link: ' + link);
          });
        });
      });
    }

    // Register join room event listener from CrazyGames SDK
    CrazyGamesManager.getInstance().registerJoinRoomListener((params) => {
      if (params.roomId) {
        console.log('SDK requested room switch to:', params.roomId);
        SocketManager.getInstance().disconnect();
        SocketManager.getInstance().connect(this, this.playerName, params.roomId);

        // Update URL to match room ID
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('roomId', params.roomId);
        window.history.replaceState({}, '', newUrl.toString());
      }
    });

    // Register audio mute settings listener from CrazyGames SDK
    CrazyGamesManager.getInstance().registerAudioSettingsListener((mute) => {
      console.log(`[Audio compliance] Game sound is now ${mute ? 'MUTED' : 'UNMUTED'} globally.`);
    });

    // Start game loop
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  /**
   * Set up keyboard event handlers
   */
  private setupInputListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
      this.keys[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.keys = {};
    });
  }

  /**
   * Handle high-DPI resolution resizing
   */
  private setupResizeListener(): void {
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.logicalWidth = window.innerWidth;
    this.logicalHeight = window.innerHeight;
  }

  /**
   * Spawns a glowing particle, retrieving it from the memory pool
   */
  private spawnParticle(
    x: number,
    y: number,
    angle: number,
    speed: number,
    size: number,
    life: number,
    color: string
  ): void {
    this.particlePool.get(x, y, angle, speed, size, life, color);
  }

  /**
   * Spawns an enemy outside the current camera viewport, driven by the Difficulty Director
   */
  private spawnEnemyWithDirector(elapsedMinutes: number): void {
    const halfW = this.logicalWidth / 2;
    const halfH = this.logicalHeight / 2;
    const spawnDist = Math.max(halfW, halfH) + 120;
    
    const angle = Math.random() * Math.PI * 2;
    let spawnX = this.camera.x + Math.cos(angle) * spawnDist;
    let spawnY = this.camera.y + Math.sin(angle) * spawnDist;

    const borderPadding = 40;
    spawnX = Math.max(borderPadding, Math.min(this.mapWidth - borderPadding, spawnX));
    spawnY = Math.max(borderPadding, Math.min(this.mapHeight - borderPadding, spawnY));

    // Wave/Time Director: Calculate spawning ratios
    let type: EnemyType = 'Basic';
    const rand = Math.random();

    if (elapsedMinutes >= 2.0) {
      // 2+ Minutes: Basic 55%, Swarmer 30%, Bruiser 15%
      if (rand < 0.15) {
        type = 'Bruiser';
      } else if (rand < 0.45) {
        type = 'Swarmer';
      }
    } else if (elapsedMinutes >= 1.0) {
      // 1-2 Minutes: Basic 70%, Swarmer 30%
      if (rand < 0.3) {
        type = 'Swarmer';
      }
    }

    // Dynamic stats scalar scaling based on clock time
    const speedBoost = Math.min(60, elapsedMinutes * 12);
    const hpMultiplier = 1.0 + elapsedMinutes * 0.22;

    this.enemyPool.get(
      spawnX,
      spawnY,
      type,
      speedBoost,
      hpMultiplier
    );
  }

  /**
   * Fires a projectile at the closest active enemy
   */
  private autoShoot(): void {
    const activeEnemies = this.enemyPool.getActiveObjects();
    const rivals = SocketManager.getInstance().getRivals();
    
    if (activeEnemies.length === 0 && rivals.length === 0) return;

    let closestTarget: { x: number; y: number } | null = null;
    let minDist = Infinity;

    for (const enemy of activeEnemies) {
      const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
      if (dist < minDist) {
        minDist = dist;
        closestTarget = enemy;
      }
    }

    for (const rival of rivals) {
      const dist = Math.hypot(rival.x - this.player.x, rival.y - this.player.y);
      if (dist < minDist) {
        minDist = dist;
        closestTarget = rival;
      }
    }

    if (closestTarget) {
      const speed = 850;
      const damage = 20;
      const maxDistance = 900;
      const color = '#00f3ff';

      const projectile = this.projectilePool.get(
        this.player.x,
        this.player.y,
        closestTarget.x,
        closestTarget.y,
        speed,
        damage,
        maxDistance,
        color
      );
      projectile.isLocal = true;

      // Broadcast shot to other players
      SocketManager.getInstance().shoot({
        x: this.player.x,
        y: this.player.y,
        targetX: closestTarget.x,
        targetY: closestTarget.y,
        speed,
        damage,
        maxDistance,
        color: '#ff4400' // Render as hostile neon orange-red for others
      });
    }
  }



  /**
   * Initiates GameOver sequence
   */
  private handleGameOver(): void {
    this.isGameOver = true;
    this.gameOverTimer = 2.5;
    this.screenShake = 24;

    // Notify SDK gameplay has stopped
    CrazyGamesManager.getInstance().gameplayStop();

    // 1. Spawning particle explosion
    for (let i = 0; i < 70; i++) {
      const pAngle = Math.random() * Math.PI * 2;
      const pSpeed = 100 + Math.random() * 250;
      const pSize = 3 + Math.random() * 6;
      const pLife = 0.5 + Math.random() * 0.8;
      const pColor = Math.random() > 0.4 ? '#ff0055' : '#ffffff';
      this.spawnParticle(this.player.x, this.player.y, pAngle, pSpeed, pSize, pLife, pColor);
    }

    // 2. Set up and display gameover HUD overlay
    const respawnBtn = document.getElementById('respawn-btn') as HTMLButtonElement;
    const rewardAdBtn = document.getElementById('reward-ad-btn') as HTMLButtonElement;
    
    if (respawnBtn) respawnBtn.disabled = true;
    if (rewardAdBtn) {
      rewardAdBtn.disabled = true;
      rewardAdBtn.innerText = '💾 DOUBLE SCORE (WATCH AD)';
    }

    const gameoverOverlay = document.getElementById('gameover-overlay');
    const finalScoreVal = document.getElementById('final-score-val');
    const finalLevelVal = document.getElementById('final-level-val');

    if (finalScoreVal) finalScoreVal.innerText = this.score.toString().padStart(6, '0');
    if (finalLevelVal) finalLevelVal.innerText = this.player.level.toString();
    if (gameoverOverlay) gameoverOverlay.style.display = 'flex';

    // 3. Request midroll ad before enabling interaction
    CrazyGamesManager.getInstance().requestAd('midroll', {
      adStarted: () => {
        console.log('Midroll ad started');
      },
      adFinished: () => {
        console.log('Midroll ad finished. Enabling buttons...');
        this.enableGameOverInteraction();
      },
      adError: (err) => {
        console.error('Midroll ad failed/error:', err);
        this.enableGameOverInteraction();
      }
    });
  }

  /**
   * Triggers the level up interactive pause menu overlay
   */
  private triggerLevelUp(): void {
    this.isLevelingUp = true;
    this.keys = {}; // Clear active key inputs to prevent key sticking during pause

    const overlay = document.getElementById('upgrade-overlay') as HTMLElement;
    const cardsWrapper = document.querySelector('.cards-wrapper') as HTMLElement;
    if (!overlay || !cardsWrapper) return;

    cardsWrapper.innerHTML = '';
    overlay.style.display = 'flex';

    // Set of enhancement options
    const options = [
      {
        id: 'overclock',
        name: 'Overclock Core',
        desc: 'Reduces laser fire weapon cooldown speed by 15%',
        icon: '⚡',
        colorClass: 'card-yellow',
        action: () => {
          this.shootInterval = Math.max(0.08, this.shootInterval * 0.85);
        }
      },
      {
        id: 'thruster',
        name: 'Thruster Tune-up',
        desc: 'Increases flight speed limits by 20%',
        icon: '🚀',
        colorClass: 'card-cyan',
        action: () => {
          this.player.speed *= 1.20;
        }
      },
      {
        id: 'plating',
        name: 'Plasma Plating',
        desc: 'Heals 30% and upgrades maximum durability threshold by 15%',
        icon: '🛡️',
        colorClass: 'card-magenta',
        action: () => {
          this.player.maxHealth = Math.floor(this.player.maxHealth * 1.15);
          this.player.health = Math.min(this.player.maxHealth, this.player.health + this.player.maxHealth * 0.3);
        }
      },
      {
        id: 'gravity',
        name: 'Gravity Well',
        desc: 'Increases XP particle vacuum pull boundary limits by 40%',
        icon: '🧲',
        colorClass: 'card-cyan',
        action: () => {
          this.player.magnetRadius *= 1.40;
        }
      }
    ];

    // Card 5: Orbital weapon addition / expansion
    const orbitersCount = this.orbitalWeapon.count;
    options.push({
      id: 'orbiter',
      name: orbitersCount === 0 ? 'Plasma Orbiters' : 'Expand Orbiters',
      desc: orbitersCount === 0
        ? 'Spawns a plasma sphere orbiting your ship with infinite piercing'
        : `Adds an additional orbiter to the rotation (Total: ${orbitersCount + 1})`,
      icon: '🔮',
      colorClass: 'card-magenta',
      action: () => {
        this.orbitalWeapon.count++;
      }
    });

    // Pick 3 random, unique options
    const shuffled = [...options].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    selected.forEach((opt) => {
      const card = document.createElement('div');
      card.className = `upgrade-card ${opt.colorClass}`;
      
      const themeColor = opt.colorClass === 'card-yellow' 
        ? 'var(--neon-yellow)' 
        : opt.colorClass === 'card-magenta' 
          ? 'var(--neon-magenta)' 
          : 'var(--neon-cyan)';

      card.innerHTML = `
        <div class="card-icon" style="color: ${themeColor}">${opt.icon}</div>
        <div class="card-name">${opt.name}</div>
        <div class="card-desc">${opt.desc}</div>
      `;

      card.addEventListener('click', () => {
        opt.action();
        this.player.levelUp();
        this.isLevelingUp = false;
        overlay.style.display = 'none';

        this.screenShake = 12;

        for (let i = 0; i < 30; i++) {
          const pAngle = Math.random() * Math.PI * 2;
          const pSpeed = 110 + Math.random() * 140;
          const pSize = 2.5 + Math.random() * 3.5;
          const pLife = 0.35 + Math.random() * 0.25;
          const pColor = opt.colorClass === 'card-yellow' 
            ? '#ffe600' 
            : opt.colorClass === 'card-magenta' 
              ? '#ff0055' 
              : '#00f3ff';
          this.spawnParticle(this.player.x, this.player.y, pAngle, pSpeed, pSize, pLife, pColor);
        }
      });

      cardsWrapper.appendChild(card);
    });
  }

  /**
   * Foundational requestAnimationFrame loop
   */
  private loop(timestamp: number): void {
    if (!this.lastTime) {
      this.lastTime = timestamp;
    }
    let dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // Cap delta time to avoid physics breakages on lag spikes
    if (dt > 0.1) dt = 0.1;

    this.update(dt);
    this.draw();

    requestAnimationFrame((ts) => this.loop(ts));
  }

  /**
   * Core update cycle
   */
  private update(dt: number): void {
    if (this.isLevelingUp) return;

    // 1. Handle Game Over update freezes
    if (this.isGameOver) {
      this.gameOverTimer -= dt;
      
      const activeParticles = this.particlePool.getActiveObjects();
      activeParticles.forEach((particle) => {
        particle.update(dt);
        if (!particle.active) this.particlePool.release(particle);
      });

      this.screenShake *= Math.pow(0.88, dt * 60);

      if (this.gameOverTimer <= 0) {
        this.gameOverTimer = 0;
      }
      return;
    }

    // 2. Increment global clock timer
    this.gameTimer += dt;

    // 3. Update Player movement and trail particles
    this.player.update(
      dt,
      this.keys,
      this.mapWidth,
      this.mapHeight,
      (x, y, angle) => {
        const speed = 40 + Math.random() * 40;
        const size = 2.5 + Math.random() * 2.5;
        const life = 0.25 + Math.random() * 0.15;
        const color = Math.random() > 0.5 ? '#ff0055' : '#ffaa00';
        this.spawnParticle(x, y, angle, speed, size, life, color);
      }
    );

    // Send position and input changes to network server
    let dx = 0;
    let dy = 0;
    if (this.keys['w'] || this.keys['W'] || this.keys['ArrowUp'] || this.keys['KeyW']) dy -= 1;
    if (this.keys['s'] || this.keys['S'] || this.keys['ArrowDown'] || this.keys['KeyS']) dy += 1;
    if (this.keys['a'] || this.keys['A'] || this.keys['ArrowLeft'] || this.keys['KeyA']) dx -= 1;
    if (this.keys['d'] || this.keys['D'] || this.keys['ArrowRight'] || this.keys['KeyD']) dx += 1;
    SocketManager.getInstance().sendInput(
      dx,
      dy,
      this.player.angle,
      this.player.x,
      this.player.y,
      this.player.health,
      this.player.level,
      this.score
    );

    // 4. Update Camera positioning
    this.camera.x += (this.player.x - this.camera.x) * this.camera.lerpSpeed;
    this.camera.y += (this.player.y - this.camera.y) * this.camera.lerpSpeed;

    // 5. Update Orbital Weapons positioning
    this.orbitalWeapon.update(dt);

    // 6. Time director spawning parameters
    const elapsedMinutes = this.gameTimer / 60;
    this.enemySpawnTimer += dt;
    // Gradually decrease spawn intervals as timer climbs
    const spawnRateMultiplier = Math.max(0.25, 1.0 - elapsedMinutes * 0.22);
    const currentInterval = 1.1 * spawnRateMultiplier;
    
    if (this.enemySpawnTimer >= currentInterval) {
      this.enemySpawnTimer = 0;
      this.spawnEnemyWithDirector(elapsedMinutes);
    }

    // 7. Weapon Auto-Firing cycle
    this.shootTimer += dt;
    if (this.shootTimer >= this.shootInterval) {
      this.shootTimer = 0;
      this.autoShoot();
    }

    // 8. Update Entities (Enemies, Projectiles, Particles, Gems)
    const activeEnemies = this.enemyPool.getActiveObjects();
    const activeProjectiles = this.projectilePool.getActiveObjects();
    const activeParticles = this.particlePool.getActiveObjects();
    const activeGems = this.gemPool.getActiveObjects();

    activeEnemies.forEach((enemy) => enemy.update(dt, this.player.x, this.player.y));
    
    // Update Rival Players
    const rivals = SocketManager.getInstance().getRivals();
    rivals.forEach((rival) => rival.update(dt));
    
    activeProjectiles.forEach((projectile) => {
      projectile.update(dt);
      if (!projectile.active) {
        this.projectilePool.release(projectile);
      }
    });

    activeParticles.forEach((particle) => {
      particle.update(dt);
      if (!particle.active) {
        this.particlePool.release(particle);
      }
    });

    activeGems.forEach((gem) => {
      gem.update(dt, this.player.x, this.player.y, this.player.magnetRadius);
      if (!gem.active) {
        this.gemPool.release(gem);
      }
    });

    // 9. Collision Detection Loops
    this.checkCollisions(dt);

    // 10. Decelerate visual screen shake
    if (this.screenShake > 0) {
      this.screenShake *= Math.pow(0.9, dt * 60);
      if (this.screenShake < 0.1) this.screenShake = 0;
    }

    // 11. Update HTML HUD displays
    this.updateUI();
  }

  /**
   * Performs high-speed collision loops
   */
  private checkCollisions(dt: number): void {
    const enemies = this.enemyPool.getActiveObjects();
    const projectiles = this.projectilePool.getActiveObjects();
    const gems = this.gemPool.getActiveObjects();
    const rivals = SocketManager.getInstance().getRivals();

    // 1. Orbital weapon vs. Enemy and RivalPlayer checks (piercing contact damage)
    if (this.orbitalWeapon.count > 0) {
      const orbiters = this.orbitalWeapon.getOrbiterPositions(this.player.x, this.player.y);
      
      // Orbitals vs. AI Enemies
      for (const enemy of enemies) {
        if (!enemy.active || enemy.orbitalHitCooldown > 0) continue;

        for (const orb of orbiters) {
          const dist = Math.hypot(enemy.x - orb.x, enemy.y - orb.y);
          const minDist = enemy.radius + this.orbitalWeapon.orbiterRadius;

          if (dist < minDist) {
            enemy.orbitalHitCooldown = 0.35; // 350ms damage tick rate
            const isEnemyDead = enemy.takeDamage(this.orbitalWeapon.damage);

            // Spawn purple hit particles
            for (let i = 0; i < 5; i++) {
              const pAngle = Math.random() * Math.PI * 2;
              const pSpeed = 60 + Math.random() * 60;
              const pSize = 1.5 + Math.random() * 1.5;
              const pLife = 0.15 + Math.random() * 0.15;
              this.spawnParticle(enemy.x, enemy.y, pAngle, pSpeed, pSize, pLife, '#ff00d0');
            }

            if (isEnemyDead) {
              // Debris explosion
              for (let i = 0; i < 15; i++) {
                const pAngle = Math.random() * Math.PI * 2;
                const pSpeed = 80 + Math.random() * 120;
                const pSize = 2 + Math.random() * 3;
                const pLife = 0.35 + Math.random() * 0.25;
                this.spawnParticle(enemy.x, enemy.y, pAngle, pSpeed, pSize, pLife, enemy.color);
              }

              this.gemPool.get(enemy.x, enemy.y, enemy.type === 'Bruiser' ? 75 : enemy.type === 'Swarmer' ? 15 : 25, '#39ff14');
              this.score += enemy.type === 'Bruiser' ? 300 : enemy.type === 'Swarmer' ? 75 : 100;
              this.enemyPool.release(enemy);
            }
            break; // Stop checking this enemy against other orbiters in this frame
          }
        }
      }

      // Orbitals vs. Rival Players
      for (const rival of rivals) {
        if (rival.orbitalHitCooldown > 0) continue;

        for (const orb of orbiters) {
          const dist = Math.hypot(rival.x - orb.x, rival.y - orb.y);
          const minDist = rival.radius + this.orbitalWeapon.orbiterRadius;

          if (dist < minDist) {
            rival.orbitalHitCooldown = 0.35; // 350ms damage tick rate
            SocketManager.getInstance().hitPlayer(rival.id, this.orbitalWeapon.damage);
            this.score += 2;

            // Spawn purple hit particles
            for (let i = 0; i < 5; i++) {
              const pAngle = Math.random() * Math.PI * 2;
              const pSpeed = 60 + Math.random() * 60;
              const pSize = 1.5 + Math.random() * 1.5;
              const pLife = 0.15 + Math.random() * 0.15;
              this.spawnParticle(rival.x, rival.y, pAngle, pSpeed, pSize, pLife, '#ff00d0');
            }
            break;
          }
        }
      }
    }

    // 2. Projectile vs. Enemy and RivalPlayer collisions
    for (const projectile of projectiles) {
      if (!projectile.active) continue;
      if (!projectile.isLocal) continue; // Only check local projectiles for collisions on this client

      let hit = false;

      // Check against AI Enemies
      for (const enemy of enemies) {
        if (!enemy.active) continue;

        const dist = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);
        const minDist = projectile.radius + enemy.radius;

        if (dist < minDist) {
          const isEnemyDead = enemy.takeDamage(projectile.damage);
          this.projectilePool.release(projectile);
          hit = true;

          for (let i = 0; i < 6; i++) {
            const pAngle = Math.random() * Math.PI * 2;
            const pSpeed = 60 + Math.random() * 80;
            const pSize = 1.5 + Math.random() * 1.5;
            const pLife = 0.15 + Math.random() * 0.15;
            this.spawnParticle(projectile.x, projectile.y, pAngle, pSpeed, pSize, pLife, '#ffe600');
          }

          if (isEnemyDead) {
            for (let i = 0; i < 15; i++) {
              const pAngle = Math.random() * Math.PI * 2;
              const pSpeed = 80 + Math.random() * 120;
              const pSize = 2 + Math.random() * 3;
              const pLife = 0.35 + Math.random() * 0.25;
              this.spawnParticle(enemy.x, enemy.y, pAngle, pSpeed, pSize, pLife, enemy.color);
            }

            this.gemPool.get(enemy.x, enemy.y, enemy.type === 'Bruiser' ? 75 : enemy.type === 'Swarmer' ? 15 : 25, '#39ff14');
            this.score += enemy.type === 'Bruiser' ? 300 : enemy.type === 'Swarmer' ? 75 : 100;
            this.enemyPool.release(enemy);
          }
          break;
        }
      }

      if (hit) continue;

      // Check against Rival Players
      for (const rival of rivals) {
        const dist = Math.hypot(projectile.x - rival.x, projectile.y - rival.y);
        const minDist = projectile.radius + rival.radius;

        if (dist < minDist) {
          // Emit hit to server
          SocketManager.getInstance().hitPlayer(rival.id, projectile.damage);
          this.score += 5;
          this.projectilePool.release(projectile);

          // Spawn hit particles
          for (let i = 0; i < 6; i++) {
            const pAngle = Math.random() * Math.PI * 2;
            const pSpeed = 60 + Math.random() * 80;
            const pSize = 1.5 + Math.random() * 1.5;
            const pLife = 0.15 + Math.random() * 0.15;
            this.spawnParticle(projectile.x, projectile.y, pAngle, pSpeed, pSize, pLife, '#ffe600');
          }
          break;
        }
      }
    }

    // 3. Enemy vs. Player contact collisions
    for (const enemy of enemies) {
      if (!enemy.active) continue;

      const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
      const minDist = enemy.radius + this.player.radius;

      if (dist < minDist) {
        const isDead = this.player.takeDamage(enemy.damage * dt);
        this.screenShake = Math.max(this.screenShake, enemy.type === 'Bruiser' ? 9 : 5);

        if (Math.random() < 0.2) {
          const sparkAngle = Math.random() * Math.PI * 2;
          const sparkSpeed = 70 + Math.random() * 80;
          const sparkSize = 2 + Math.random() * 2;
          const sparkLife = 0.2 + Math.random() * 0.15;
          const hitX = (enemy.x + this.player.x) / 2;
          const hitY = (enemy.y + this.player.y) / 2;
          this.spawnParticle(hitX, hitY, sparkAngle, sparkSpeed, sparkSize, sparkLife, '#ff0055');
        }

        if (isDead) {
          this.handleGameOver();
          break;
        }
      }
    }

    // 4. Player vs. Experience Gem collection check
    for (const gem of gems) {
      if (!gem.active) continue;

      const dist = Math.hypot(gem.x - this.player.x, gem.y - this.player.y);
      const minDist = gem.radius + this.player.radius;

      if (dist < minDist) {
        this.player.addXp(gem.xpValue);
        this.gemPool.release(gem);

        for (let i = 0; i < 5; i++) {
          const pAngle = Math.random() * Math.PI * 2;
          const pSpeed = 50 + Math.random() * 60;
          const pSize = 1.5 + Math.random() * 1.5;
          const pLife = 0.2 + Math.random() * 0.1;
          this.spawnParticle(gem.x, gem.y, pAngle, pSpeed, pSize, pLife, '#39ff14');
        }

        this.score += 15;

        if (this.player.xp >= this.player.maxXp) {
          this.triggerLevelUp();
          break;
        }
      }
    }
  }

  /**
   * Render cycle
   */
  private draw(): void {
    const ctx = this.ctx;

    ctx.save();
    
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    // Clear background
    ctx.fillStyle = '#07070c';
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

    // Apply Camera translation to world coordinates
    ctx.save();
    ctx.translate(this.logicalWidth / 2 - this.camera.x, this.logicalHeight / 2 - this.camera.y);

    // 1. Draw Arena Grid Lines
    this.drawGrid(this.camera.x, this.camera.y);

    // 2. Draw active entities / particles / weapons
    const activeGems = this.gemPool.getActiveObjects();
    activeGems.forEach((gem) => gem.draw(ctx));

    const activeProjectiles = this.projectilePool.getActiveObjects();
    activeProjectiles.forEach((projectile) => projectile.draw(ctx));

    const activeEnemies = this.enemyPool.getActiveObjects();
    activeEnemies.forEach((enemy) => enemy.draw(ctx));

    const activeParticles = this.particlePool.getActiveObjects();
    activeParticles.forEach((particle) => particle.draw(ctx));

    // Draw Rival Players
    const rivals = SocketManager.getInstance().getRivals();
    rivals.forEach((rival) => rival.draw(ctx));

    // Draw Orbiting weapons centered on the player
    this.orbitalWeapon.draw(ctx, this.player.x, this.player.y);

    // 3. Draw Player (if alive)
    if (!this.isGameOver) {
      this.player.draw(ctx);
    }

    ctx.restore(); // Restores camera coordinate translation

    // 4. Render visual overlays when game over
    if (this.isGameOver) {
      this.drawGameOverOverlay();
    }

    ctx.restore(); // Restores screen shake translation
  }

  /**
   * Renders the big neon Game Over text overlays
   */
  private drawGameOverOverlay(): void {
    const ctx = this.ctx;
    
    ctx.fillStyle = 'rgba(7, 7, 12, 0.75)';
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
    
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '800 48px "Outfit", sans-serif';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ff0055';
    ctx.fillText('SYSTEM OVERLOAD', this.logicalWidth / 2, this.logicalHeight / 2 - 25);

    ctx.shadowBlur = 10;
    ctx.font = '600 20px "Outfit", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('REBOOTING ENGINE...', this.logicalWidth / 2, this.logicalHeight / 2 + 30);

    ctx.restore();
  }

  /**
   * Dynamic HUD overlay updates
   */
  private updateUI(): void {
    const xpFill = document.querySelector('.xp-bar-fill') as HTMLElement;
    const levelBadge = document.querySelector('.level-badge') as HTMLElement;
    const healthFill = document.querySelector('.health-bar-fill') as HTMLElement;
    const healthVal = document.querySelector('.health-val') as HTMLElement;
    const scoreVal = document.querySelector('.score-val') as HTMLElement;
    const timerBadge = document.querySelector('.timer-badge') as HTMLElement;

    if (xpFill) {
      const pct = (this.player.xp / this.player.maxXp) * 100;
      xpFill.style.width = `${pct}%`;
    }
    if (levelBadge) {
      levelBadge.textContent = `LEVEL ${this.player.level}`;
    }
    if (healthFill) {
      const pct = (this.player.health / this.player.maxHealth) * 100;
      healthFill.style.width = `${pct}%`;
    }
    if (healthVal) {
      healthVal.textContent = `${Math.ceil(this.player.health)}/${this.player.maxHealth}`;
    }
    if (scoreVal) {
      scoreVal.textContent = this.score.toString().padStart(6, '0');
    }
    if (timerBadge) {
      const min = Math.floor(this.gameTimer / 60);
      const sec = Math.floor(this.gameTimer % 60);
      timerBadge.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Syncs local player health with the server authoritative value
   */
  public syncSelfHealth(health: number): void {
    if (this.isGameOver) return;
    this.player.health = health;
    if (this.player.health <= 0) {
      this.handleGameOver();
    }
  }

  /**
   * Spawns a rival's projectile visually (doesn't trigger collision detection locally)
   */
  public spawnRivalProjectile(
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    speed: number,
    damage: number,
    maxDistance: number,
    color: string
  ): void {
    const proj = this.projectilePool.get(
      x,
      y,
      targetX,
      targetY,
      speed,
      damage,
      maxDistance,
      color
    );
    proj.isLocal = false;
  }

  /**
   * Spawns particle explosion and high-value experience gems when a rival player dies
   */
  public handleRivalDeath(_id: string, x: number, y: number): void {
    // 1. Particle explosion
    for (let i = 0; i < 40; i++) {
      const pAngle = Math.random() * Math.PI * 2;
      const pSpeed = 120 + Math.random() * 200;
      const pSize = 2.5 + Math.random() * 4.5;
      const pLife = 0.4 + Math.random() * 0.6;
      const pColor = Math.random() > 0.4 ? '#ff3300' : '#ffffff';
      this.spawnParticle(x, y, pAngle, pSpeed, pSize, pLife, pColor);
    }

    // 2. Drop cluster of high-value experience gems
    const gemCount = 10 + Math.floor(Math.random() * 6); // 10-15 gems
    for (let i = 0; i < gemCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 45;
      const gemX = x + Math.cos(angle) * dist;
      const gemY = y + Math.sin(angle) * dist;
      this.gemPool.get(gemX, gemY, 100, '#ffd700'); // Gold gems worth 100 XP
    }
  }

  /**
   * Enables overlays interaction after ad complete
   */
  private enableGameOverInteraction(): void {
    const respawnBtn = document.getElementById('respawn-btn') as HTMLButtonElement;
    const rewardAdBtn = document.getElementById('reward-ad-btn') as HTMLButtonElement;
    if (respawnBtn) respawnBtn.disabled = false;
    if (rewardAdBtn) rewardAdBtn.disabled = false;
  }

  /**
   * Resets local pools, resets local player state, and transitions back to gameplay active state
   */
  public respawnPlayer(x: number, y: number): void {
    // 1. Reset local stats
    this.score = 0;
    this.isGameOver = false;
    this.gameOverTimer = 0;
    this.shootTimer = 0;
    this.shootInterval = 0.45;
    this.gameTimer = 0;

    // 2. Teleport and scale health/level
    this.player.x = x;
    this.player.y = y;
    this.player.health = 100;
    this.player.maxHealth = 100;
    this.player.level = 1;
    this.player.xp = 0;
    this.player.maxXp = 100;

    // Center camera immediately
    this.camera.x = x;
    this.camera.y = y;

    // 3. Reset weapons / orbiters
    this.orbitalWeapon.count = 0;

    // 4. Clear entity pools
    this.enemyPool.clear();
    this.projectilePool.clear();
    this.particlePool.clear();
    this.gemPool.clear();

    // 5. Update HTML overlays display
    const gameoverOverlay = document.getElementById('gameover-overlay');
    if (gameoverOverlay) gameoverOverlay.style.display = 'none';

    const upgradeOverlay = document.getElementById('upgrade-overlay');
    if (upgradeOverlay) upgradeOverlay.style.display = 'none';

    // 6. Notify SDK gameplay has resumed
    CrazyGamesManager.getInstance().gameplayStart();

    // Sync HUD UI display
    this.updateUI();
  }

  /**
   * Updates real-time leaderboard widget UI
   */
  public updateLeaderboardUI(leaderboard: any[], myId: string): void {
    const listElement = document.querySelector('.leaderboard-list');
    if (!listElement) return;

    let html = '';
    leaderboard.forEach((entry, idx) => {
      const isSelf = entry.id === myId;
      const rowClass = isSelf ? 'leaderboard-row self' : 'leaderboard-row';
      const displayName = entry.name || 'Survivor';
      html += `
        <li class="${rowClass}">
          <span class="rank-name">${idx + 1}. ${displayName}</span>
          <span class="score">${entry.score}</span>
        </li>
      `;
    });
    listElement.innerHTML = html;
  }

  /**
   * Renders grid lines visible inside the current camera viewport
   */
  private drawGrid(cameraX: number, cameraY: number): void {
    const ctx = this.ctx;
    const gridSize = 80;

    const startX = Math.floor((cameraX - this.logicalWidth / 2) / gridSize) * gridSize;
    const endX = Math.ceil((cameraX + this.logicalWidth / 2) / gridSize) * gridSize;
    const startY = Math.floor((cameraY - this.logicalHeight / 2) / gridSize) * gridSize;
    const endY = Math.ceil((cameraY + this.logicalHeight / 2) / gridSize) * gridSize;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
    ctx.lineWidth = 1;

    for (let x = startX; x <= endX; x += gridSize) {
      if (x < 0 || x > this.mapWidth) continue;
      ctx.beginPath();
      ctx.moveTo(x, Math.max(0, startY));
      ctx.lineTo(x, Math.min(this.mapHeight, endY));
      ctx.stroke();
    }

    for (let y = startY; y <= endY; y += gridSize) {
      if (y < 0 || y > this.mapHeight) continue;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, startX), y);
      ctx.lineTo(Math.min(this.mapWidth, endX), y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 0, 85, 0.4)';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 12;
    ctx.strokeRect(0, 0, this.mapWidth, this.mapHeight);

    ctx.restore();
  }
}

// Auto-start when script loads
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
