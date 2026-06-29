import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
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

// Calculate leaderboard for a specific room
const getRankedLeaderboard = (roomId) => {
  const roomPlayers = Object.values(players).filter(p => p.roomId === roomId);
  return roomPlayers
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5)
    .map(p => ({
      id: p.id,
      name: p.name || 'Survivor',
      score: p.score || 0,
      level: p.level || 1
    }));
};

// Broadcast updates partitioned by rooms
const broadcastState = () => {
  const rooms = new Set();
  Object.values(players).forEach(p => {
    if (p.roomId) rooms.add(p.roomId);
  });
  if (rooms.size === 0) rooms.add('global');

  rooms.forEach(rId => {
    // Filter players in this room
    const roomPlayers = {};
    Object.keys(players).forEach(id => {
      if (players[id].roomId === rId) {
        roomPlayers[id] = players[id];
      }
    });

    io.to(rId).emit('stateUpdate', {
      players: roomPlayers,
      leaderboard: getRankedLeaderboard(rId)
    });
  });
};

io.on('connection', (socket) => {
  const username = socket.handshake.query.name || 'Survivor';
  const roomId = socket.handshake.query.roomId || 'global';
  
  // Join socket.io room
  socket.join(roomId);
  console.log(`Player connected: ${socket.id} (${username}) joined room [${roomId}]`);
  
  // Spawn player at random coordinate
  const radius = 18;
  const spawnX = radius + Math.random() * (mapWidth - radius * 2);
  const spawnY = radius + Math.random() * (mapHeight - radius * 2);
  
  players[socket.id] = {
    id: socket.id,
    name: username,
    roomId: roomId,
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
  
  // Handle shoot event within player's room
  socket.on('shoot', (projectileData) => {
    const player = players[socket.id];
    if (player) {
      socket.to(player.roomId).emit('projectileSpawn', projectileData);
    }
  });
  
  // Handle hit event within player's room
  socket.on('playerHit', (data) => {
    const targetId = data.targetId;
    const damage = data.damage || 0;
    const targetPlayer = players[targetId];
    const player = players[socket.id];
    
    if (targetPlayer && player && targetPlayer.roomId === player.roomId) {
      targetPlayer.health = Math.max(0, targetPlayer.health - damage);
      
      // Check if player died
      if (targetPlayer.health <= 0) {
        // Broadcast player death only to players in the same room
        io.to(player.roomId).emit('playerDeath', { id: targetId, x: targetPlayer.x, y: targetPlayer.y });
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
    const player = players[socket.id];
    const uName = player ? player.name : 'Unknown';
    const rId = player ? player.roomId : 'global';
    console.log(`Player disconnected: ${socket.id} (${uName}) from room [${rId}]`);
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
