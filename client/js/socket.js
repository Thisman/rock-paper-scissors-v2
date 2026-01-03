/**
 * Socket.IO connection handler
 */
class SocketHandler {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.playerId = null;
    this.lobbyId = null;
    this.callbacks = {};
  }

  /**
   * Connect to the server
   */
  connect() {
    this.socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    this.setupBaseListeners();
    return this;
  }

  /**
   * Set up base connection listeners
   */
  setupBaseListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connected = true;
      this.emit('connected');
      
      // Try to reconnect to game if we have stored session
      this.tryReconnectToGame();
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.connected = false;
      this.emit('disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.emit('connectionError', error);
    });

    this.socket.on('error', (data) => {
      console.error('Server error:', data.message);
      this.emit('error', data);
    });

    // Game events
    this.socket.on('lobbyCreated', (data) => this.emit('lobbyCreated', data));
    this.socket.on('lobbyJoined', (data) => this.emit('lobbyJoined', data));
    this.socket.on('playerJoined', (data) => this.emit('playerJoined', data));
    this.socket.on('gameStart', (data) => this.emit('gameStart', data));
    this.socket.on('sequenceConfirmed', () => this.emit('sequenceConfirmed'));
    this.socket.on('roundStart', (data) => this.emit('roundStart', data));
    this.socket.on('timerUpdate', (data) => this.emit('timerUpdate', data));
    this.socket.on('swapConfirmed', (data) => this.emit('swapConfirmed', data));
    this.socket.on('swapError', (data) => this.emit('swapError', data));
    this.socket.on('skipConfirmed', () => this.emit('skipConfirmed'));
    this.socket.on('opponentSwapped', () => this.emit('opponentSwapped'));
    this.socket.on('roundResult', (data) => this.emit('roundResult', data));
    this.socket.on('gameEnd', (data) => this.emit('gameEnd', data));
    this.socket.on('opponentDisconnected', (data) => this.emit('opponentDisconnected', data));
    this.socket.on('opponentReconnected', () => this.emit('opponentReconnected'));
    this.socket.on('reconnected', (data) => this.emit('reconnected', data));
    this.socket.on('gameResumed', (data) => this.emit('gameResumed', data));
  }

  /**
   * Try to reconnect to an existing game
   */
  tryReconnectToGame() {
    const savedSession = localStorage.getItem('gameSession');
    if (savedSession) {
      try {
        const { lobbyId, playerId } = JSON.parse(savedSession);
        this.socket.emit('reconnect', { lobbyId, playerId });
      } catch (e) {
        localStorage.removeItem('gameSession');
      }
    }
  }

  /**
   * Save session for reconnection
   */
  saveSession(lobbyId, playerId) {
    this.lobbyId = lobbyId;
    this.playerId = playerId;
    localStorage.setItem('gameSession', JSON.stringify({ lobbyId, playerId }));
  }

  /**
   * Clear saved session
   */
  clearSession() {
    this.lobbyId = null;
    this.playerId = null;
    localStorage.removeItem('gameSession');
  }

  /**
   * Create a new lobby
   */
  createLobby(playerName) {
    this.socket.emit('createLobby', playerName);
  }

  /**
   * Join an existing lobby
   */
  joinLobby(lobbyId, playerName) {
    this.socket.emit('joinLobby', { lobbyId: lobbyId.toUpperCase(), playerName });
  }

  /**
   * Set player's card sequence
   */
  setSequence(sequence) {
    this.socket.emit('setSequence', sequence);
  }

  /**
   * Perform a card swap
   */
  swapCards(pos1, pos2) {
    this.socket.emit('swapCards', { pos1, pos2 });
  }

  /**
   * Skip swap action
   */
  skipSwap() {
    this.socket.emit('skipSwap');
  }

  /**
   * Register event callback
   */
  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
    return this;
  }

  /**
   * Remove event callback
   */
  off(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
    }
    return this;
  }

  /**
   * Emit event to callbacks
   */
  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(callback => callback(data));
    }
  }
}

// Global socket handler
window.socketHandler = new SocketHandler();

