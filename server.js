import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = reportExpressErrors(express());
function reportExpressErrors(expressApp) {
  // Simple wrapper or just direct app, let's keep it clean
  return expressApp;
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Track connected clients
const players = {};
const mapWidth = 3000;
const mapHeight = 3000;

const getRankedLeaderboard = () => {
  return Object.values(players)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5)
    .map(p => ({
      id: p.id,
      name: p.name || 'Survivor',
      score: p.score || 0,
      level: p.level || 1
    }));
};

const broadcastState = () => {
  io.emit('stateUpdate', {
    players,
    leaderboard: getRankedLeaderboard()
  });
};

io.on('connection', (socket) => {
  const username = socket.handshake.query.name || 'Survivor';
  console.log(`Player connected: ${socket.id} (${username})`);
  
  // Spawn player at random coordinate
  const radius = 18;
  const spawnX = radius + Math.random() * (mapWidth - radius * 2);
  const spawnY = radius + Math.random() * (mapHeight - radius * 2);
  
  players[socket.id] = {
    id: socket.id,
    name: username,
    x: spawnX,
    y: spawnY,
    health: 100,
    maxHealth: 100,
    level: 1,
    score: 0,
    angle: 0,
    speed: 300
  };
  
  // Send init event
  socket.emit('init', { id: socket.id });
  
  // Broadcast state update immediately
  broadcastState();
  
  // Handle directional movement/state from client
  socket.on('playerInput', (data) => {
    const player = players[socket.id];
    if (!player) return;
    
    player.angle = data.angle;
    if (data.x !== undefined && data.y !== undefined) {
      player.x = data.x;
      player.y = data.y;
    }
    if (data.health !== undefined) {
      player.health = data.health;
    }
    if (data.level !== undefined) {
      player.level = data.level;
    }
    if (data.score !== undefined) {
      player.score = data.score;
    }
  });
  
  // Handle shoot event
  socket.on('shoot', (projectileData) => {
    // Broadcast to all other clients
    socket.broadcast.emit('projectileSpawn', projectileData);
  });
  
  // Handle hit event
  socket.on('playerHit', (data) => {
    const targetId = data.targetId;
    const damage = data.damage || 0;
    const targetPlayer = players[targetId];
    
    if (targetPlayer) {
      targetPlayer.health = Math.max(0, targetPlayer.health - damage);
      
      // Check if player died
      if (targetPlayer.health <= 0) {
        // Broadcast player death
        io.emit('playerDeath', { id: targetId, x: targetPlayer.x, y: targetPlayer.y });
        
        // Note: We don't automatically respawn the player now.
        // They will watch an ad and then call requestRespawn!
      }
    }
  });

  // Handle request respawn
  socket.on('requestRespawn', () => {
    const player = players[socket.id];
    if (!player) return;

    // Reset stats
    player.health = 100;
    player.maxHealth = 100;
    player.level = 1;
    player.score = 0;
    
    // Choose random spawn coordinates
    player.x = radius + Math.random() * (mapWidth - radius * 2);
    player.y = radius + Math.random() * (mapHeight - radius * 2);

    // Teleport client
    socket.emit('respawn', { x: player.x, y: player.y });

    // Broadcast state update immediately
    broadcastState();
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id} (${username})`);
    delete players[socket.id];
    broadcastState();
  });
});

// Broadcast game state 30 times a second
const TICK_RATE = 30;
setInterval(() => {
  broadcastState();
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
