const { v4: uuidv4 } = require('uuid');
const GameSession = require('../game/GameSession');
const Player = require('../game/Player');
const ReconnectManager = require('./ReconnectManager');
const InputValidator = require('../utils/InputValidator');
const { GAME_CONFIG, GamePhase, LOBBY_ID_CHARS, LOBBY_ID_LENGTH } = require('../game/constants');

class LobbyManager {
  constructor(io) {
    this.io = io;
    this.lobbies = new Map(); // lobbyId -> Lobby
    this.playerToLobby = new Map(); // socketId -> lobbyId
    this.reconnectManager = new ReconnectManager();
  }

  // ==================== Lobby Validation ====================

  /**
   * Validate lobby state - cleanup if invalid
   */
  validateLobby(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    
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
   * Get validated lobby and player context for socket
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

  // ==================== Lobby Creation/Joining ====================

  /**
   * Create a new lobby
   */
  createLobby(socket, data) {
    const { playerName, playerId: clientPlayerId } = InputValidator.createLobbyData(data);
    
    const lobbyId = this.generateLobbyId();
    const playerId = clientPlayerId || uuidv4();
    const player = new Player(playerId, socket.id, playerName);
    
    this.lobbies.set(lobbyId, {
      players: [player],
      session: null,
      createdAt: Date.now(),
      allowedPlayerIds: new Set([playerId])
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
    // Validate input
    const validatedData = InputValidator.joinLobbyData(lobbyId, playerName, clientPlayerId);
    if (!validatedData) {
      socket.emit('error', { message: 'Invalid lobby ID format' });
      return;
    }
    
    const lobby = this.validateLobby(validatedData.lobbyId);
    if (!lobby) {
      socket.emit('error', { message: 'Lobby not found' });
      return;
    }
    
    // Try to handle as rejoin first
    if (this.tryRejoinLobby(socket, lobby, validatedData)) {
      return;
    }
    
    // Handle as new player join
    this.handleNewPlayerJoin(socket, lobby, validatedData);
  }

  /**
   * Try to rejoin lobby as existing player
   */
  tryRejoinLobby(socket, lobby, { lobbyId, playerId }) {
    const existingPlayer = lobby.players.find(p => p.id === playerId);
    if (!existingPlayer) return false;
    
    // Clear any pending reconnect timeout for this player
    this.reconnectManager.clear(existingPlayer.id);
    
    // Update socket connection
    existingPlayer.markConnected(socket.id);
    this.playerToLobby.set(socket.id, lobbyId);
    socket.join(lobbyId);
    
    const opponent = lobby.players.find(p => p.id !== playerId);
    
    socket.emit('lobbyJoined', {
      lobbyId,
      playerId: existingPlayer.id,
      playerName: existingPlayer.name,
      opponentName: opponent ? opponent.name : null
    });
    
    console.log(`${existingPlayer.name} rejoined lobby ${lobbyId}`);
    
    // Handle active game session
    if (lobby.session) {
      if (lobby.session.isCompleted()) {
        socket.emit('error', { message: 'Game has ended' });
        this.cleanupLobby(lobbyId);
        return true;
      }
      
      socket.emit('reconnected', lobby.session.getStateForPlayer(existingPlayer.id));
      
      if (opponent && !opponent.disconnected) {
        lobby.session.resume();
        this.io.to(opponent.socketId).emit('opponentReconnected');
      } else if (opponent && opponent.disconnected) {
        socket.emit('opponentDisconnected', {
          reconnectTimeout: this.reconnectManager.getRemainingTime(opponent.id)
        });
      }
    }
    
    return true;
  }

  /**
   * Handle new player joining lobby
   */
  handleNewPlayerJoin(socket, lobby, { lobbyId, playerName, playerId: clientPlayerId }) {
    // Check lobby capacity
    if (lobby.players.length >= GAME_CONFIG.MAX_PLAYERS) {
      socket.emit('error', { message: 'Lobby is full' });
      return;
    }
    
    if (lobby.session) {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }
    
    // Clean up disconnected first player if needed
    this.cleanupDisconnectedFirstPlayer(lobby, lobbyId);
    
    const playerId = clientPlayerId || uuidv4();
    
    // Security: only original players can rejoin in-progress games
    if (lobby.session && lobby.allowedPlayerIds && !lobby.allowedPlayerIds.has(playerId)) {
      socket.emit('error', { message: 'Only original players can rejoin this game' });
      return;
    }
    
    const player = new Player(playerId, socket.id, playerName);
    lobby.players.push(player);
    
    if (lobby.allowedPlayerIds) {
      lobby.allowedPlayerIds.add(playerId);
    }
    
    this.playerToLobby.set(socket.id, lobbyId);
    socket.join(lobbyId);
    
    // If we're now alone (first player left)
    if (lobby.players.length === 1) {
      socket.emit('lobbyCreated', {
        lobbyId,
        playerId,
        playerName: player.name
      });
      console.log(`${player.name} is now waiting alone in lobby ${lobbyId}`);
      return;
    }
    
    // Notify both players and start game
    const firstPlayer = lobby.players[0];
    
    socket.emit('lobbyJoined', {
      lobbyId,
      playerId,
      playerName: player.name,
      opponentName: firstPlayer.name
    });
    
    this.io.to(firstPlayer.socketId).emit('playerJoined', {
      opponentName: player.name
    });
    
    console.log(`${player.name} joined lobby ${lobbyId} (${playerId})`);
    this.startGame(lobbyId);
  }

  /**
   * Clean up disconnected first player from lobby
   */
  cleanupDisconnectedFirstPlayer(lobby, lobbyId) {
    if (lobby.players.length !== 1) return;
    
    const existingPlayerSocket = this.io.sockets.sockets.get(lobby.players[0].socketId);
    if (!existingPlayerSocket || !existingPlayerSocket.connected) {
      const disconnectedPlayer = lobby.players[0];
      lobby.players = [];
      this.playerToLobby.delete(disconnectedPlayer.socketId);
      console.log(`Removed disconnected player ${disconnectedPlayer.name} from lobby ${lobbyId}`);
    }
  }

  // ==================== Game Management ====================

  /**
   * Start a new game session
   */
  startGame(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.players.length !== GAME_CONFIG.MAX_PLAYERS) return;
    
    // Verify all players are connected
    const disconnectedPlayers = this.findDisconnectedPlayers(lobby);
    
    if (disconnectedPlayers.length > 0) {
      this.removeDisconnectedPlayers(lobby, lobbyId, disconnectedPlayers);
      return;
    }
    
    const session = new GameSession(lobby.players, this.io, lobbyId);
    lobby.session = session;
    session.start();
    
    console.log(`Game started in lobby ${lobbyId}`);
  }

  /**
   * Find disconnected players in lobby
   */
  findDisconnectedPlayers(lobby) {
    return lobby.players.filter(player => {
      const socket = this.io.sockets.sockets.get(player.socketId);
      return !socket || !socket.connected;
    });
  }

  /**
   * Remove disconnected players from lobby
   */
  removeDisconnectedPlayers(lobby, lobbyId, disconnectedPlayers) {
    disconnectedPlayers.forEach(player => {
      lobby.players = lobby.players.filter(p => p.id !== player.id);
      this.playerToLobby.delete(player.socketId);
      console.log(`Removed disconnected player ${player.name} from lobby ${lobbyId} before game start`);
    });
    
    if (lobby.players.length === 1) {
      const remainingPlayer = lobby.players[0];
      this.io.to(remainingPlayer.socketId).emit('opponentLeft', {
        message: 'Соперник отключился до начала игры'
      });
    }
  }

  // ==================== Game Event Handlers ====================

  handleSetSequence(socket, sequence) {
    const ctx = this.getValidatedContext(socket);
    if (!ctx || !ctx.lobby.session) return;
    
    // Validate sequence before passing to game session
    const validSequence = InputValidator.sequence(sequence, ctx.player.hand);
    if (!validSequence) {
      socket.emit('error', { message: 'Invalid card sequence' });
      return;
    }
    
    ctx.lobby.session.setPlayerSequence(ctx.player.id, validSequence);
  }

  handlePreviewReady(socket) {
    const ctx = this.getValidatedContext(socket);
    if (!ctx || !ctx.lobby.session) return;
    
    ctx.lobby.session.handlePreviewReady(ctx.player.id);
  }

  handleSwapCards(socket, positions) {
    const ctx = this.getValidatedContext(socket);
    if (!ctx || !ctx.lobby.session) return;
    
    // Validate swap positions
    const validPositions = InputValidator.swapPositions(
      positions,
      ctx.lobby.session.currentRound,
      GAME_CONFIG.CARDS_PER_PLAYER
    );
    
    if (!validPositions) {
      socket.emit('swapError', { message: 'Invalid swap positions' });
      return;
    }
    
    ctx.lobby.session.handleSwap(ctx.player.id, validPositions);
  }

  handleSkipSwap(socket) {
    const ctx = this.getValidatedContext(socket);
    if (!ctx || !ctx.lobby.session) return;
    
    ctx.lobby.session.handleSkipSwap(ctx.player.id);
  }

  handleContinueRound(socket) {
    const ctx = this.getValidatedContext(socket);
    if (!ctx || !ctx.lobby.session) return;
    
    ctx.lobby.session.handleContinue(ctx.player.id);
  }

  // ==================== Leave/Disconnect ====================

  /**
   * Handle player leaving lobby voluntarily
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
    
    this.reconnectManager.clear(player.id);
    this.removePlayerFromLobby(lobby, lobbyId, player, socket);
  }

  /**
   * Remove player from lobby and handle consequences
   */
  removePlayerFromLobby(lobby, lobbyId, player, socket) {
    lobby.players = lobby.players.filter(p => p.id !== player.id);
    this.playerToLobby.delete(socket.id);
    socket.leave(lobbyId);
    
    console.log(`Player ${player.name} left lobby ${lobbyId}`);
    
    if (lobby.players.length === 0) {
      this.cleanupLobby(lobbyId);
      return;
    }
    
    if (lobby.session && !lobby.session.isCompleted()) {
      this.handlePlayerLeftDuringGame(lobby, lobbyId, player);
    } else if (!lobby.session) {
      this.cleanupLobby(lobbyId);
    }
  }

  /**
   * Handle player leaving during active game
   */
  handlePlayerLeftDuringGame(lobby, lobbyId, leavingPlayer) {
    const otherPlayer = lobby.players[0];
    
    if (otherPlayer && !otherPlayer.disconnected) {
      lobby.session.endGameByDisconnect(otherPlayer.id);
      this.cleanupLobby(lobbyId);
    } else {
      lobby.session.completed = true;
      if (lobby.session.timer) {
        lobby.session.timer.clear();
      }
      
      if (otherPlayer) {
        this.reconnectManager.clear(otherPlayer.id);
      }
      this.cleanupLobby(lobbyId);
    }
  }

  handlePlayAgain(socket) {
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
    
    // Game not started - just remove player
    if (!lobby.session) {
      this.handleDisconnectBeforeGame(lobby, lobbyId, player, socket);
      return;
    }
    
    // Handle disconnect during game
    this.handleDisconnectDuringGame(lobby, lobbyId, player, socket);
  }

  /**
   * Handle disconnect before game started
   */
  handleDisconnectBeforeGame(lobby, lobbyId, player, socket) {
    lobby.players = lobby.players.filter(p => p.id !== player.id);
    this.playerToLobby.delete(socket.id);
    
    if (lobby.players.length === 0) {
      this.cleanupLobby(lobbyId);
    }
    
    console.log(`Player ${player.name} left lobby ${lobbyId} (game not started)`);
  }

  /**
   * Handle disconnect during active game
   */
  handleDisconnectDuringGame(lobby, lobbyId, player, socket) {
    const currentPhase = lobby.session.stateMachine.getActualPhase();
    
    // During reveal phase - don't pause, game continues
    if (currentPhase === GamePhase.REVEAL) {
      this.handleDisconnectDuringReveal(lobby, lobbyId, player, socket);
      return;
    }
    
    // Standard disconnect handling
    this.handleStandardDisconnect(lobby, lobbyId, player, socket);
  }

  /**
   * Handle disconnect during reveal phase (no pause)
   */
  handleDisconnectDuringReveal(lobby, lobbyId, player, socket) {
    console.log(`Player ${player.name} disconnected during reveal phase - not pausing`);
    
    player.markDisconnected();
    this.playerToLobby.delete(socket.id);
    
    this.reconnectManager.trackSilent(
      player.id,
      lobbyId,
      (playerId) => this.handleReconnectTimeout(playerId, lobbyId)
    );
  }

  /**
   * Handle standard disconnect (with pause)
   */
  handleStandardDisconnect(lobby, lobbyId, player, socket) {
    player.markDisconnected();
    this.playerToLobby.delete(socket.id);
    
    const otherPlayer = lobby.players.find(p => p.id !== player.id);
    
    this.reconnectManager.track(
      player.id,
      lobbyId,
      (playerId) => this.handleReconnectTimeout(playerId, lobbyId),
      otherPlayer && !otherPlayer.disconnected
        ? (remaining) => this.io.to(otherPlayer.socketId).emit('opponentDisconnected', { reconnectTimeout: remaining })
        : null
    );
    
    lobby.session.pause();
    
    console.log(`Player ${player.name} disconnected from lobby ${lobbyId}`);
    
    // Both players disconnected - cleanup
    if (lobby.players.every(p => p.disconnected)) {
      console.log(`Both players disconnected in lobby ${lobbyId}, cleaning up`);
      lobby.session.completed = true;
      lobby.session.clearTimer();
      this.cleanupLobby(lobbyId);
    }
  }

  // ==================== Reconnection ====================

  /**
   * Handle player reconnection
   */
  handleReconnect(socket, lobbyId, playerId) {
    // Validate inputs
    const validLobbyId = InputValidator.lobbyId(lobbyId);
    const validPlayerId = InputValidator.playerId(playerId);
    
    if (!validLobbyId || !validPlayerId) {
      socket.emit('error', { message: 'Invalid reconnection data' });
      return;
    }
    
    if (!this.reconnectManager.isValidReconnect(validPlayerId, validLobbyId)) {
      socket.emit('error', { message: 'Invalid reconnection attempt' });
      return;
    }
    
    const lobby = this.validateLobby(validLobbyId);
    if (!lobby) {
      socket.emit('error', { message: 'Lobby no longer exists' });
      this.reconnectManager.clear(validPlayerId);
      return;
    }
    
    const player = lobby.players.find(p => p.id === validPlayerId);
    if (!player) {
      socket.emit('error', { message: 'Player not found' });
      this.reconnectManager.clear(validPlayerId);
      return;
    }
    
    const otherPlayer = lobby.players.find(p => p.id !== validPlayerId);
    if (!otherPlayer) {
      socket.emit('error', { message: 'Opponent left the game' });
      this.reconnectManager.clear(validPlayerId);
      this.cleanupLobby(validLobbyId);
      return;
    }
    
    this.completeReconnection(socket, lobby, validLobbyId, player, otherPlayer);
  }

  /**
   * Complete the reconnection process
   */
  completeReconnection(socket, lobby, lobbyId, player, otherPlayer) {
    this.reconnectManager.clear(player.id);
    
    player.markConnected(socket.id);
    this.playerToLobby.set(socket.id, lobbyId);
    socket.join(lobbyId);
    
    if (lobby.session) {
      socket.emit('reconnected', lobby.session.getStateForPlayer(player.id));
      
      if (!otherPlayer.disconnected) {
        lobby.session.resume();
        this.io.to(otherPlayer.socketId).emit('opponentReconnected');
      } else {
        socket.emit('opponentDisconnected', {
          reconnectTimeout: this.reconnectManager.getRemainingTime(otherPlayer.id)
        });
      }
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
    
    if (lobby.session) {
      const otherPlayer = lobby.players.find(p => p.id !== playerId);
      if (otherPlayer) {
        lobby.session.endGameByDisconnect(otherPlayer.id);
      }
    }
    
    this.reconnectManager.clear(playerId);
    this.cleanupLobby(lobbyId);
    
    console.log(`Player ${player.name} reconnection timeout in lobby ${lobbyId}`);
  }

  // ==================== Cleanup ====================

  /**
   * Clean up a lobby
   */
  cleanupLobby(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    
    if (lobby.session) {
      lobby.session.clearTimer();
    }
    
    lobby.players.forEach(player => {
      this.playerToLobby.delete(player.socketId);
      this.reconnectManager.clear(player.id);
    });
    
    this.lobbies.delete(lobbyId);
    console.log(`Lobby ${lobbyId} cleaned up`);
  }

  // ==================== Utilities ====================

  /**
   * Generate a short, memorable lobby ID
   */
  generateLobbyId() {
    let result = '';
    for (let i = 0; i < LOBBY_ID_LENGTH; i++) {
      result += LOBBY_ID_CHARS.charAt(Math.floor(Math.random() * LOBBY_ID_CHARS.length));
    }
    
    if (this.lobbies.has(result)) {
      return this.generateLobbyId();
    }
    
    return result;
  }
}

module.exports = LobbyManager;
