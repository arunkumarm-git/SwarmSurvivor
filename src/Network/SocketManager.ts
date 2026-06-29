import { io, Socket } from 'socket.io-client';
import type { Game } from '../Game';
import { RivalPlayer } from '../Entities/RivalPlayer';
import { CrazyGamesManager } from '../SDK/CrazyGamesManager';

export class SocketManager {
  private static instance: SocketManager | null = null;
  private socket: Socket | null = null;
  private game: Game | null = null;
  private rivals: Map<string, RivalPlayer> = new Map();

  private constructor() { }

  public static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  /**
   * Connects to the server with username and roomId passed in handshake query parameters
   */
  public connect(game: Game, username: string, roomId: string): void {
    this.game = game;
    const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3000'
      : 'https://swarmsurvivor.onrender.com';

    // Connect with name and room handshake
    this.socket = io(serverUrl, {
      query: {
        name: username,
        roomId: roomId
      }
    });

    this.socket.on('connect', () => {
      console.log('Connected to server with ID:', this.socket?.id, 'in room:', roomId);
      // Update room state and invite button in SDK
      CrazyGamesManager.getInstance().updateRoom(roomId);
      CrazyGamesManager.getInstance().showInviteButton(roomId);
    });

    this.socket.on('init', (data: { id: string }) => {
      console.log('Initialized client ID:', data.id);
    });

    // Handle state update with players and leaderboard list
    this.socket.on('stateUpdate', (data: { players: Record<string, any>; leaderboard: any[] }) => {
      if (!this.socket) return;
      const myId = this.socket.id;
      const serverPlayers = data.players || {};

      // Update competitive leaderboard HUD
      if (this.game && data.leaderboard) {
        this.game.updateLeaderboardUI(data.leaderboard, myId || '');
      }

      for (const id in serverPlayers) {
        if (id === myId) {
          // Synchronize local health with server values
          const serverSelf = serverPlayers[id];
          if (this.game && serverSelf) {
            this.game.syncSelfHealth(serverSelf.health);
          }
          continue;
        }

        const dataPlayer = serverPlayers[id];
        let rival = this.rivals.get(id);
        if (!rival) {
          rival = new RivalPlayer(id, dataPlayer.x, dataPlayer.y, dataPlayer.angle || 0, dataPlayer.health, dataPlayer.level || 1);
          this.rivals.set(id, rival);
        } else {
          rival.updateState(dataPlayer.x, dataPlayer.y, dataPlayer.angle || 0, dataPlayer.health, dataPlayer.level || 1);
        }
      }

      // Remove players that disconnected from list
      for (const id of this.rivals.keys()) {
        if (!serverPlayers[id]) {
          this.rivals.delete(id);
        }
      }
    });

    // Handle projectile spawns from other players
    this.socket.on('projectileSpawn', (data: {
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      speed: number;
      damage: number;
      maxDistance: number;
      color: string;
    }) => {
      if (this.game) {
        this.game.spawnRivalProjectile(data.x, data.y, data.targetX, data.targetY, data.speed, data.damage, data.maxDistance, data.color);
      }
    });

    // Handle other player death events
    this.socket.on('playerDeath', (data: { id: string; x: number; y: number }) => {
      if (this.game) {
        this.game.handleRivalDeath(data.id, data.x, data.y);
      }
      if (this.rivals.has(data.id)) {
        this.rivals.delete(data.id);
      }
    });

    // Handle respawn event response from server
    this.socket.on('respawn', (data: { x: number; y: number }) => {
      if (this.game) {
        this.game.respawnPlayer(data.x, data.y);
      }
    });
  }

  /**
   * Emits local player input/position state to server
   */
  public sendInput(dx: number, dy: number, angle: number, x: number, y: number, health: number, level: number, score: number): void {
    if (this.socket?.connected) {
      this.socket.emit('playerInput', { dx, dy, angle, x, y, health, level, score });
    }
  }

  /**
   * Emits shoot projectile parameters to server
   */
  public shoot(projectileData: {
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    speed: number;
    damage: number;
    maxDistance: number;
    color: string;
  }): void {
    if (this.socket?.connected) {
      this.socket.emit('shoot', projectileData);
    }
  }

  /**
   * Emits hits detected locally against other rival players to server
   */
  public hitPlayer(targetId: string, damage: number): void {
    if (this.socket?.connected) {
      this.socket.emit('playerHit', { targetId, damage });
    }
  }

  /**
   * Requests a fresh spawn coordinate from the server
   */
  public requestRespawn(): void {
    if (this.socket?.connected) {
      this.socket.emit('requestRespawn');
    }
  }

  /**
   * Gets the client's current connection socket ID
   */
  public getSocketId(): string | null {
    return this.socket?.id || null;
  }

  /**
   * Gets list of active Rival Players
   */
  public getRivals(): RivalPlayer[] {
    return Array.from(this.rivals.values());
  }

  /**
   * Cleans up sockets and players on resets
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.rivals.clear();
    CrazyGamesManager.getInstance().hideInviteButton();
  }
}
