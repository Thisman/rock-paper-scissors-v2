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
   * Validate lobby state - cleanup if invalid
   * Returns lobby if valid, null if cleaned up
   */
  validateLobby(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    
    // Check if lobby should be cleaned up
    const shouldCleanup = 
      lobby.players.length === 0 || 
      (lobby.session && lobby.session.isCompleted());
    
    if (shouldCleanup) {
      this.cleanupLobby(lobbyId);
      return null;
    }
    
    return lobby;
  }

  /**
   * Get validated lobby and player for socket
   * Returns { lobby, player } or null if invalid
   */
  getValidatedContext(socket) {
    const lobbyId = this.playerToLobby.get(socket.id);
    if (!lobbyId) return null;
    
    const lobby = this.validateLobby(lobbyId);
    if (!lobby) return null;
    
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) return null;
    
    return { lobby, player, lobbyId };
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
      createdAt: Date.now(),
      allowedPlayerIds: new Set([playerId]) // Track allowed players from start
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
    const lobby = this.validateLobby(lobbyId);
    
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
      
      // If game is in progress and not completed, send reconnected state
      if (lobby.session) {
        // Check if game is completed - don't allow reconnection to completed game
        if (lobby.session.isCompleted()) {
          socket.emit('error', { message: 'Game has ended' });
          this.cleanupLobby(lobbyId);
          return;
        }
        
        socket.emit('reconnected', lobby.session.getStateForPlayer(existingPlayer.id));
        
        // Only resume if the other player is connected
        if (opponent && !opponent.disconnected) {
          lobby.session.resume();
          this.io.to(opponent.socketId).emit('opponentReconnected');
        } else if (opponent && opponent.disconnected) {
          // Other player is still disconnected - show waiting overlay
          socket.emit('opponentDisconnected', {
            reconnectTimeout: this.getRemainingReconnectTime(opponent.id)
          });
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
    
    // Check if existing player in lobby is still connected
    if (lobby.players.length === 1) {
      const existingPlayerSocket = this.io.sockets.sockets.get(lobby.players[0].socketId);
      if (!existingPlayerSocket || !existingPlayerSocket.connected) {
        // First player disconnected, remove them
        const disconnectedPlayer = lobby.players[0];
        lobby.players = [];
        this.playerToLobby.delete(disconnectedPlayer.socketId);
        console.log(`Removed disconnected player ${disconnectedPlayer.name} from lobby ${lobbyId}`);
      }
    }
    
    const playerId = clientPlayerId || uuidv4();
    
    // If game is in progress, only allow original players to rejoin
    if (lobby.session && lobby.allowedPlayerIds && !lobby.allowedPlayerIds.has(playerId)) {
      socket.emit('error', { message: 'Only original players can rejoin this game' });
      return;
    }
    
    const player = new Player(playerId, socket.id, playerName || 'Player 2');
    lobby.players.push(player);
    
    // Add this player to allowed players list
    if (lobby.allowedPlayerIds) {
      lobby.allowedPlayerIds.add(playerId);
    }
    
    this.playerToLobby.set(socket.id, lobbyId);
    socket.join(lobbyId);
    
    // Check if there's another player or if we're now alone in the lobby
    if (lobby.players.length === 1) {
      // We're the only player (the original player disconnected)
      // Treat this as creating a new lobby
      socket.emit('lobbyCreated', {
        lobbyId,
        playerId,
        playerName: player.name
      });
      console.log(`${player.name} is now waiting alone in lobby ${lobbyId} (original player left)`);
      return;
    }
    
    // There's another player - proceed with game start
    const firstPlayer = lobby.players[0];
    
    socket.emit('lobbyJoined', {
      lobbyId,
      playerId,
      playerName: player.name,
      opponentName: firstPlayer.name
    });
    
    // Notify first player that someone joined
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
    
    // Check if all players are connected before starting
    const allConnected = lobby.players.every(player => {
      const socket = this.io.sockets.sockets.get(player.socketId);
      return socket && socket.connected;
    });
    
    if (!allConnected) {
      // Remove disconnected players
      const disconnectedPlayers = lobby.players.filter(player => {
        const socket = this.io.sockets.sockets.get(player.socketId);
        return !socket || !socket.connected;
      });
      
      disconnectedPlayers.forEach(player => {
        lobby.players = lobby.players.filter(p => p.id !== player.id);
        this.playerToLobby.delete(player.socketId);
        console.log(`Removed disconnected player ${player.name} from lobby ${lobbyId} before game start`);
      });
      
      // Notify remaining player that they're waiting
      if (lobby.players.length === 1) {
        const remainingPlayer = lobby.players[0];
        this.io.to(remainingPlayer.socketId).emit('opponentLeft', {
          message: 'Соперник отключился до начала игры'
        });
      }
      
      // Don't start the game
      return;
    }
    
    const session = new GameSession(lobby.players, this.io, lobbyId);
    lobby.session = session;
    
    session.start();
    
    console.log(`Game started in lobby ${lobbyId}`);
  }

  /**
   * Handle player setting their card sequence
   */
  handleSetSequence(socket, sequence) {
    const ctx = this.getValidatedContext(socket);
    if (!ctx || !ctx.lobby.session) return;
    
    ctx.lobby.session.setPlayerSequence(ctx.player.id, sequence);
  }

  /**
   * Handle preview ready action
   */
  handlePreviewReady(socket) {
    const ctx = this.getValidatedContext(socket);
    if (!ctx || !ctx.lobby.session) return;
    
    ctx.lobby.session.handlePreviewReady(ctx.player.id);
  }

  /**
   * Handle card swap action
   */
  handleSwapCards(socket, positions) {
    const ctx = this.getValidatedContext(socket);
    if (!ctx || !ctx.lobby.session) return;
    
    ctx.lobby.session.handleSwap(ctx.player.id, positions);
  }

  /**
   * Handle skip swap action
   */
  handleSkipSwap(socket) {
    const ctx = this.getValidatedContext(socket);
    if (!ctx || !ctx.lobby.session) return;
    
    ctx.lobby.session.handleSkipSwap(ctx.player.id);
  }

  /**
   * Handle continue round action
   */
  handleContinueRound(socket) {
    const ctx = this.getValidatedContext(socket);
    if (!ctx || !ctx.lobby.session) return;
    
    ctx.lobby.session.handleContinue(ctx.player.id);
  }

  /**
   * Handle player leaving lobby voluntarily (permanent - like disconnect timeout)
   */
  handleLeaveLobby(socket) {
    const lobbyId = this.playerToLobby.get(socket.id);
    if (!lobbyId) return;
    
    const lobby = this.validateLobby(lobbyId);
    if (!lobby) {
      this.playerToLobby.delete(socket.id);
      return;
    }
    
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) {
      this.playerToLobby.delete(socket.id);
      return;
    }
    
    // Clear any disconnect timeout for this player
    const disconnectInfo = this.disconnectedPlayers.get(player.id);
    if (disconnectInfo) {
      clearTimeout(disconnectInfo.timeout);
      this.disconnectedPlayers.delete(player.id);
    }
    
    // Remove player from lobby first
    lobby.players = lobby.players.filter(p => p.id !== player.id);
    this.playerToLobby.delete(socket.id);
    socket.leave(lobbyId);
    
    console.log(`Player ${player.name} left lobby ${lobbyId}`);
    
    // If lobby is now empty, cleanup immediately
    if (lobby.players.length === 0) {
      this.cleanupLobby(lobbyId);
      return;
    }
    
    // If game is in progress, handle it
    if (lobby.session && !lobby.session.isCompleted()) {
      const otherPlayer = lobby.players[0]; // Only one player left
      
      if (otherPlayer && !otherPlayer.disconnected) {
        // Other player wins by forfeit
        lobby.session.endGameByDisconnect(otherPlayer.id);
        // Cleanup lobby after game ends
        this.cleanupLobby(lobbyId);
      } else {
        // Other player is also disconnected - mark completed and cleanup
        lobby.session.completed = true;
        if (lobby.session.timer) {
          lobby.session.timer.clear();
        }
        // Clear the other player's disconnect timeout and cleanup
        const otherDisconnectInfo = this.disconnectedPlayers.get(otherPlayer.id);
        if (otherDisconnectInfo) {
          clearTimeout(otherDisconnectInfo.timeout);
          this.disconnectedPlayers.delete(otherPlayer.id);
        }
        this.cleanupLobby(lobbyId);
      }
    } else if (!lobby.session) {
      // Game hasn't started yet - just cleanup the lobby
      this.cleanupLobby(lobbyId);
    }
  }

  /**
   * Handle player clicking "Play Again" - clears their session
   */
  handlePlayAgain(socket) {
    // Use the same logic as handleLeaveLobby
    this.handleLeaveLobby(socket);
  }

  /**
   * Handle player disconnection
   */
  handleDisconnect(socket) {
    const lobbyId = this.playerToLobby.get(socket.id);
    if (!lobbyId) return;
    
    const lobby = this.validateLobby(lobbyId);
    if (!lobby) {
      this.playerToLobby.delete(socket.id);
      return;
    }
    
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) {
      this.playerToLobby.delete(socket.id);
      return;
    }
    
    // If game hasn't started yet, just clean up the lobby
    if (!lobby.session) {
      // Remove player from lobby
      lobby.players = lobby.players.filter(p => p.id !== player.id);
      this.playerToLobby.delete(socket.id);
      
      // If lobby is now empty, delete it
      if (lobby.players.length === 0) {
        this.cleanupLobby(lobbyId);
      }
      
      console.log(`Player ${player.name} left lobby ${lobbyId} (game not started)`);
      return;
    }
    
    // Get the current game phase
    const currentPhase = lobby.session.previousPhase || lobby.session.phase;
    
    // During reveal phase (showing round results), don't pause - just continue
    // The game will proceed to next round automatically
    if (currentPhase === 'reveal') {
      console.log(`Player ${player.name} disconnected during reveal phase - not pausing`);
      
      // Mark player as disconnected but don't pause
      player.disconnected = true;
      player.disconnectedAt = Date.now();
      this.playerToLobby.delete(socket.id);
      
      // Set up reconnection timeout
      const timeout = setTimeout(() => {
        this.handleReconnectTimeout(player.id, lobbyId);
      }, 120000);
      this.disconnectedPlayers.set(player.id, { lobbyId, timeout, disconnectedAt: player.disconnectedAt });
      
      // Don't notify other player - game continues normally
      return;
    }
    
    // Set up reconnection timeout (120 seconds)
    const disconnectedAt = Date.now();
    const timeout = setTimeout(() => {
      this.handleReconnectTimeout(player.id, lobbyId);
    }, 120000);
    
    this.disconnectedPlayers.set(player.id, { lobbyId, timeout, disconnectedAt });
    player.disconnected = true;
    player.disconnectedAt = disconnectedAt;
    
    // Pause the game if in progress
    lobby.session.pause();
    
    // Notify other player after a 2 second delay (to allow quick reconnects)
    const otherPlayer = lobby.players.find(p => p.id !== player.id);
    if (otherPlayer && !otherPlayer.disconnected) {
      const notifyTimeout = setTimeout(() => {
        // Check if player is still disconnected after 2 seconds
        if (player.disconnected) {
          this.io.to(otherPlayer.socketId).emit('opponentDisconnected', {
            reconnectTimeout: Math.max(0, 120 - 2) // Subtract the 2 second delay
          });
        }
      }, 2000);
      
      // Store the notify timeout so we can cancel it on reconnect
      const disconnectInfo = this.disconnectedPlayers.get(player.id);
      if (disconnectInfo) {
        disconnectInfo.notifyTimeout = notifyTimeout;
      }
    }
    
    this.playerToLobby.delete(socket.id);
    
    console.log(`Player ${player.name} disconnected from lobby ${lobbyId}`);
    
    // Check if both players are now disconnected - cleanup immediately
    const allDisconnected = lobby.players.every(p => p.disconnected);
    if (allDisconnected) {
      console.log(`Both players disconnected in lobby ${lobbyId}, cleaning up`);
      // Mark session as completed
      lobby.session.completed = true;
      if (lobby.session.timer) {
        lobby.session.timer.clear();
      }
      this.cleanupLobby(lobbyId);
    }
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
    
    const lobby = this.validateLobby(lobbyId);
    if (!lobby) {
      socket.emit('error', { message: 'Lobby no longer exists' });
      clearTimeout(disconnectInfo.timeout);
      this.disconnectedPlayers.delete(playerId);
      return;
    }
    
    const player = lobby.players.find(p => p.id === playerId);
    if (!player) {
      socket.emit('error', { message: 'Player not found' });
      clearTimeout(disconnectInfo.timeout);
      this.disconnectedPlayers.delete(playerId);
      return;
    }
    
    // Check if other player is still in the lobby
    const otherPlayer = lobby.players.find(p => p.id !== playerId);
    if (!otherPlayer) {
      // Other player left completely, end the session
      socket.emit('error', { message: 'Opponent left the game' });
      clearTimeout(disconnectInfo.timeout);
      this.disconnectedPlayers.delete(playerId);
      this.cleanupLobby(lobbyId);
      return;
    }
    
    // Check if other player is also disconnected
    if (otherPlayer.disconnected) {
      // Check if their socket is actually gone
      const otherSocket = this.io.sockets.sockets.get(otherPlayer.socketId);
      if (!otherSocket || !otherSocket.connected) {
        // Both players were disconnected, the other hasn't reconnected
        // We reconnect, but the game is still paused waiting for the other
        console.log(`Player ${player.name} reconnected, but opponent ${otherPlayer.name} is still disconnected`);
      }
    }
    
    // Clear the timeouts
    clearTimeout(disconnectInfo.timeout);
    if (disconnectInfo.notifyTimeout) {
      clearTimeout(disconnectInfo.notifyTimeout);
    }
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
      
      // Only resume if the other player is connected
      if (!otherPlayer.disconnected) {
        lobby.session.resume();
        this.io.to(otherPlayer.socketId).emit('opponentReconnected');
      } else {
        // Show disconnect overlay to the reconnecting player
        socket.emit('opponentDisconnected', {
          reconnectTimeout: this.getRemainingReconnectTime(otherPlayer.id)
        });
      }
    }
    
    console.log(`Player ${player.name} reconnected to lobby ${lobbyId}`);
  }

  /**
   * Get remaining reconnect time for a disconnected player
   */
  getRemainingReconnectTime(playerId) {
    const info = this.disconnectedPlayers.get(playerId);
    if (!info || !info.disconnectedAt) return 120;
    
    const elapsed = Math.floor((Date.now() - info.disconnectedAt) / 1000);
    return Math.max(0, 120 - elapsed);
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
    
    // Clear timers in session
    if (lobby.session && lobby.session.timer) {
      lobby.session.timer.clear();
    }
    
    // Remove player socket mappings and clear disconnect timeouts
    lobby.players.forEach(player => {
      this.playerToLobby.delete(player.socketId);
      const disconnectInfo = this.disconnectedPlayers.get(player.id);
      if (disconnectInfo) {
        clearTimeout(disconnectInfo.timeout);
        if (disconnectInfo.notifyTimeout) {
          clearTimeout(disconnectInfo.notifyTimeout);
        }
        this.disconnectedPlayers.delete(player.id);
      }
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

