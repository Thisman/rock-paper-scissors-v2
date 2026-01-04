const { GAME_CONFIG } = require('../game/constants');

/**
 * ReconnectManager - Handles player disconnection tracking and reconnection logic
 * Extracted from LobbyManager for better separation of concerns
 */
class ReconnectManager {
  constructor(timeoutMs = GAME_CONFIG.TIMERS.RECONNECT * 1000) {
    this.timeoutMs = timeoutMs;
    this.notifyDelayMs = GAME_CONFIG.TIMERS.DISCONNECT_NOTIFY_DELAY * 1000;
    this.disconnected = new Map(); // playerId -> DisconnectInfo
  }

  /**
   * Start tracking a disconnected player
   * @param {string} playerId - Player's ID
   * @param {string} lobbyId - Lobby ID
   * @param {Function} onTimeout - Callback when reconnect timeout expires
   * @param {Function} onNotify - Callback to notify opponent (called after delay)
   * @returns {Object} DisconnectInfo object
   */
  track(playerId, lobbyId, onTimeout, onNotify = null) {
    // Clear any existing tracking
    this.clear(playerId);

    const disconnectedAt = Date.now();
    
    const timeout = setTimeout(() => {
      onTimeout(playerId, lobbyId);
    }, this.timeoutMs);

    const info = {
      lobbyId,
      timeout,
      notifyTimeout: null,
      disconnectedAt
    };

    // Set up delayed notification to opponent
    if (onNotify) {
      info.notifyTimeout = setTimeout(() => {
        // Check if player is still disconnected
        if (this.isTracked(playerId)) {
          const remaining = this.getRemainingTime(playerId);
          onNotify(remaining);
        }
      }, this.notifyDelayMs);
    }

    this.disconnected.set(playerId, info);
    return info;
  }

  /**
   * Track a player without setting up reconnect timeout
   * Used for disconnect during reveal phase
   * @param {string} playerId - Player's ID
   * @param {string} lobbyId - Lobby ID
   * @param {Function} onTimeout - Callback when reconnect timeout expires
   */
  trackSilent(playerId, lobbyId, onTimeout) {
    // Clear any existing tracking
    this.clear(playerId);

    const disconnectedAt = Date.now();
    
    const timeout = setTimeout(() => {
      onTimeout(playerId, lobbyId);
    }, this.timeoutMs);

    const info = {
      lobbyId,
      timeout,
      notifyTimeout: null,
      disconnectedAt
    };

    this.disconnected.set(playerId, info);
    return info;
  }

  /**
   * Clear tracking for a player (on reconnect or cleanup)
   * @param {string} playerId - Player's ID
   */
  clear(playerId) {
    const info = this.disconnected.get(playerId);
    if (info) {
      if (info.timeout) {
        clearTimeout(info.timeout);
      }
      if (info.notifyTimeout) {
        clearTimeout(info.notifyTimeout);
      }
      this.disconnected.delete(playerId);
    }
  }

  /**
   * Get remaining reconnection time for a player
   * @param {string} playerId - Player's ID
   * @returns {number} Seconds remaining (0 if not tracked)
   */
  getRemainingTime(playerId) {
    const info = this.disconnected.get(playerId);
    if (!info || !info.disconnectedAt) return 0;
    
    const elapsed = Date.now() - info.disconnectedAt;
    return Math.max(0, Math.ceil((this.timeoutMs - elapsed) / 1000));
  }

  /**
   * Check if a player is being tracked
   * @param {string} playerId - Player's ID
   * @param {string} [lobbyId] - Optional lobby ID to verify
   * @returns {boolean} True if player is tracked (and in specified lobby if provided)
   */
  isTracked(playerId, lobbyId = null) {
    const info = this.disconnected.get(playerId);
    if (!info) return false;
    if (lobbyId && info.lobbyId !== lobbyId) return false;
    return true;
  }

  /**
   * Get disconnect info for a player
   * @param {string} playerId - Player's ID
   * @returns {Object|null} DisconnectInfo or null
   */
  getInfo(playerId) {
    return this.disconnected.get(playerId) || null;
  }

  /**
   * Check if player's tracking matches lobby
   * @param {string} playerId - Player's ID
   * @param {string} lobbyId - Lobby ID to check
   * @returns {boolean} True if player is tracked for this lobby
   */
  isValidReconnect(playerId, lobbyId) {
    const info = this.disconnected.get(playerId);
    return info && info.lobbyId === lobbyId;
  }

  /**
   * Clear all tracking for players in a specific lobby
   * @param {Array} playerIds - Array of player IDs to clear
   */
  clearAll(playerIds) {
    playerIds.forEach(playerId => this.clear(playerId));
  }
}

module.exports = ReconnectManager;

