const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const LobbyManager = require('./lobby/LobbyManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Initialize lobby manager
const lobbyManager = new LobbyManager(io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Create a new lobby
  socket.on('createLobby', (playerName) => {
    lobbyManager.createLobby(socket, playerName);
  });
  
  // Join an existing lobby
  socket.on('joinLobby', ({ lobbyId, playerName }) => {
    lobbyManager.joinLobby(socket, lobbyId, playerName);
  });
  
  // Player sets their card sequence
  socket.on('setSequence', (sequence) => {
    lobbyManager.handleSetSequence(socket, sequence);
  });
  
  // Player performs a swap
  socket.on('swapCards', (positions) => {
    lobbyManager.handleSwapCards(socket, positions);
  });
  
  // Player skips swap
  socket.on('skipSwap', () => {
    lobbyManager.handleSkipSwap(socket);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    lobbyManager.handleDisconnect(socket);
  });
  
  // Handle reconnection
  socket.on('reconnect', ({ lobbyId, playerId }) => {
    lobbyManager.handleReconnect(socket, lobbyId, playerId);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

