const { v4: uuidv4 } = require('uuid');
const GameSession = require('../game/GameSession');
const Player = require('../game/Player');

class LobbyManager {
  constructor(io) {
    this.io = io;
    this.lobbies = new Map(); // lobbyId -> { players: [], session: GameSession }
    this.playerToLobby = new Map(); // socketId -> lobbyId
    this.disconnectedPlayers = new Map(); // playerId -> { lobbyId, timeout }
  }

  /**
   * Create a new lobby
   */
  createLobby(socket, data) {
    const playerName = typeof data === 'string' ? data : data.playerName;
    const clientPlayerId = typeof data === 'object' ? data.playerId : null;
    
    const lobbyId = this.generateLobbyId();
    const playerId = clientPlayerId || uuidv4();
    const player = new Player(playerId, socket.id, playerName || 'Player 1');
    
    this.lobbies.set(lobbyId, {
      players: [player],
      session: null,
      createdAt: Date.now()
    });
    
    this.playerToLobby.set(socket.id, lobbyId);
    socket.join(lobbyId);
    
    socket.emit('lobbyCreated', {
      lobbyId,
      playerId,
      playerName: player.name
    });
    
    console.log(`Lobby ${lobbyId} created by ${player.name} (${playerId})`);
  }

  /**
   * Join an existing lobby
   */
  joinLobby(socket, lobbyId, playerName, clientPlayerId = null) {
    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      socket.emit('error', { message: 'Lobby not found' });
      return;
    }
    
    // Check if this player is already in the lobby (rejoin case)
    const existingPlayer = lobby.players.find(p => p.id === clientPlayerId);
    if (existingPlayer) {
      // Player is rejoining - update their socket
      existingPlayer.socketId = socket.id;
      existingPlayer.disconnected = false;
      existingPlayer.disconnectedAt = null;
      
      this.playerToLobby.set(socket.id, lobbyId);
      socket.join(lobbyId);
      
      // Get opponent
      const opponent = lobby.players.find(p => p.id !== clientPlayerId);
      
      socket.emit('lobbyJoined', {
        lobbyId,
        playerId: existingPlayer.id,
        playerName: existingPlayer.name,
        opponentName: opponent ? opponent.name : null
      });
      
      console.log(`${existingPlayer.name} rejoined lobby ${lobbyId}`);
      
      // If game is in progress, send reconnected state
      if (lobby.session) {
        socket.emit('reconnected', lobby.session.getStateForPlayer(existingPlayer.id));
        lobby.session.resume();
        
        // Notify opponent
        if (opponent && !opponent.disconnected) {
          this.io.to(opponent.socketId).emit('opponentReconnected');
        }
      }
      return;
    }
    
    if (lobby.players.length >= 2) {
      socket.emit('error', { message: 'Lobby is full' });
      return;
    }
    
    if (lobby.session) {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }
    
    const playerId = clientPlayerId || uuidv4();
    const player = new Player(playerId, socket.id, playerName || 'Player 2');
    lobby.players.push(player);
    
    this.playerToLobby.set(socket.id, lobbyId);
    socket.join(lobbyId);
    
    socket.emit('lobbyJoined', {
      lobbyId,
      playerId,
      playerName: player.name,
      opponentName: lobby.players[0].name
    });
    
    // Notify first player that someone joined
    const firstPlayer = lobby.players[0];
    this.io.to(firstPlayer.socketId).emit('playerJoined', {
      opponentName: player.name
    });
    
    console.log(`${player.name} joined lobby ${lobbyId} (${playerId})`);
    
    // Start the game since we have 2 players
    this.startGame(lobbyId);
  }

  /**
   * Start a new game session
   */
  startGame(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.players.length !== 2) return;
    
    const session = new GameSession(lobby.players, this.io, lobbyId);
    lobby.session = session;
    
    session.start();
    
    console.log(`Game started in lobby ${lobbyId}`);
  }

  /**
   * Handle player setting their card sequence
   */
  handleSetSequence(socket, sequence) {
    const lobbyId = this.playerToLobby.get(socket.id);
    if (!lobbyId) return;
    
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.session) return;
    
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) return;
    
    lobby.session.setPlayerSequence(player.id, sequence);
  }

  /**
   * Handle preview ready action
   */
  handlePreviewReady(socket) {
    const lobbyId = this.playerToLobby.get(socket.id);
    if (!lobbyId) return;
    
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.session) return;
    
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) return;
    
    lobby.session.handlePreviewReady(player.id);
  }

  /**
   * Handle card swap action
   */
  handleSwapCards(socket, positions) {
    const lobbyId = this.playerToLobby.get(socket.id);
    if (!lobbyId) return;
    
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.session) return;
    
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) return;
    
    lobby.session.handleSwap(player.id, positions);
  }

  /**
   * Handle skip swap action
   */
  handleSkipSwap(socket) {
    const lobbyId = this.playerToLobby.get(socket.id);
    if (!lobbyId) return;
    
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.session) return;
    
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) return;
    
    lobby.session.handleSkipSwap(player.id);
  }

  /**
   * Handle continue round action
   */
  handleContinueRound(socket) {
    const lobbyId = this.playerToLobby.get(socket.id);
    if (!lobbyId) return;
    
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.session) return;
    
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) return;
    
    lobby.session.handleContinue(player.id);
  }

  /**
   * Handle player leaving lobby voluntarily
   */
  handleLeaveLobby(socket) {
    const lobbyId = this.playerToLobby.get(socket.id);
    if (!lobbyId) return;
    
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) return;
    
    // Remove player from lobby
    lobby.players = lobby.players.filter(p => p.id !== player.id);
    this.playerToLobby.delete(socket.id);
    socket.leave(lobbyId);
    
    // If lobby is now empty or game hasn't started, delete the lobby
    if (lobby.players.length === 0 || !lobby.session) {
      this.lobbies.delete(lobbyId);
      console.log(`Lobby ${lobbyId} deleted - player left`);
    }
    
    console.log(`Player ${player.name} left lobby ${lobbyId}`);
  }

  /**
   * Handle player disconnection
   */
  handleDisconnect(socket) {
    const lobbyId = this.playerToLobby.get(socket.id);
    if (!lobbyId) return;
    
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) return;
    
    // If game hasn't started yet, just clean up the lobby
    if (!lobby.session) {
      // Remove player from lobby
      lobby.players = lobby.players.filter(p => p.id !== player.id);
      this.playerToLobby.delete(socket.id);
      
      // If lobby is now empty, delete it
      if (lobby.players.length === 0) {
        this.lobbies.delete(lobbyId);
      }
      
      console.log(`Player ${player.name} left lobby ${lobbyId} (game not started)`);
      return;
    }
    
    // Set up reconnection timeout (120 seconds)
    const timeout = setTimeout(() => {
      this.handleReconnectTimeout(player.id, lobbyId);
    }, 120000);
    
    this.disconnectedPlayers.set(player.id, { lobbyId, timeout });
    player.disconnected = true;
    player.disconnectedAt = Date.now();
    
    // Pause the game if in progress
    if (lobby.session) {
      lobby.session.pause();
    }
    
    // Notify other player
    const otherPlayer = lobby.players.find(p => p.id !== player.id);
    if (otherPlayer && !otherPlayer.disconnected) {
      this.io.to(otherPlayer.socketId).emit('opponentDisconnected', {
        reconnectTimeout: 120
      });
    }
    
    this.playerToLobby.delete(socket.id);
    
    console.log(`Player ${player.name} disconnected from lobby ${lobbyId}`);
  }

  /**
   * Handle player reconnection
   */
  handleReconnect(socket, lobbyId, playerId) {
    const disconnectInfo = this.disconnectedPlayers.get(playerId);
    if (!disconnectInfo || disconnectInfo.lobbyId !== lobbyId) {
      socket.emit('error', { message: 'Invalid reconnection attempt' });
      return;
    }
    
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      socket.emit('error', { message: 'Lobby no longer exists' });
      return;
    }
    
    const player = lobby.players.find(p => p.id === playerId);
    if (!player) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }
    
    // Clear the timeout
    clearTimeout(disconnectInfo.timeout);
    this.disconnectedPlayers.delete(playerId);
    
    // Update player socket
    player.socketId = socket.id;
    player.disconnected = false;
    player.disconnectedAt = null;
    
    this.playerToLobby.set(socket.id, lobbyId);
    socket.join(lobbyId);
    
    // Send current game state
    if (lobby.session) {
      socket.emit('reconnected', lobby.session.getStateForPlayer(playerId));
      lobby.session.resume();
    }
    
    // Notify other player
    const otherPlayer = lobby.players.find(p => p.id !== playerId);
    if (otherPlayer && !otherPlayer.disconnected) {
      this.io.to(otherPlayer.socketId).emit('opponentReconnected');
    }
    
    console.log(`Player ${player.name} reconnected to lobby ${lobbyId}`);
  }

  /**
   * Handle reconnection timeout
   */
  handleReconnectTimeout(playerId, lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    
    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return;
    
    // End the game with the other player as winner
    if (lobby.session) {
      const otherPlayer = lobby.players.find(p => p.id !== playerId);
      if (otherPlayer) {
        lobby.session.endGameByDisconnect(otherPlayer.id);
      }
    }
    
    this.disconnectedPlayers.delete(playerId);
    this.cleanupLobby(lobbyId);
    
    console.log(`Player ${player.name} reconnection timeout in lobby ${lobbyId}`);
  }

  /**
   * Clean up a lobby after game ends
   */
  cleanupLobby(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    
    // Remove player socket mappings
    lobby.players.forEach(player => {
      this.playerToLobby.delete(player.socketId);
      this.disconnectedPlayers.delete(player.id);
    });
    
    this.lobbies.delete(lobbyId);
    console.log(`Lobby ${lobbyId} cleaned up`);
  }

  /**
   * Generate a short, memorable lobby ID
   */
  generateLobbyId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    if (this.lobbies.has(result)) {
      return this.generateLobbyId();
    }
    return result;
  }
}

module.exports = LobbyManager;

