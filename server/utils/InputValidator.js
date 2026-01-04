/**
 * Input validation utilities for sanitizing and validating client data
 */
class InputValidator {
  /**
   * Validate and sanitize player name
   * @param {*} name - Raw name input from client
   * @param {string} defaultName - Default name if validation fails
   * @returns {string} Sanitized player name
   */
  static playerName(name, defaultName = 'Player') {
    if (typeof name !== 'string') return defaultName;
    
    // Trim whitespace and limit length
    const sanitized = name.trim().slice(0, 20);
    
    // Remove potentially dangerous characters (basic XSS prevention)
    const safe = sanitized.replace(/[<>\"\'&]/g, '');
    
    return safe || defaultName;
  }

  /**
   * Validate card sequence from client
   * @param {*} sequence - Raw sequence input from client
   * @param {Array} expectedCards - Cards the player should have
   * @returns {Array|null} Valid sequence or null if invalid
   */
  static sequence(sequence, expectedCards) {
    if (!Array.isArray(sequence)) return null;
    if (!Array.isArray(expectedCards) || expectedCards.length === 0) return null;
    
    // Filter out null/undefined values and validate card structure
    const validSequence = sequence.filter(card => 
      card !== null && 
      card !== undefined && 
      typeof card === 'object' &&
      typeof card.id === 'string'
    );
    
    // Must have same number of cards
    if (validSequence.length !== expectedCards.length) return null;
    
    // Build sets of card IDs
    const expectedIds = new Set(expectedCards.map(c => c.id));
    const sequenceIds = new Set(validSequence.map(c => c.id));
    
    // Must have same cards (no duplicates, no foreign cards)
    if (expectedIds.size !== sequenceIds.size) return null;
    
    for (const id of expectedIds) {
      if (!sequenceIds.has(id)) return null;
    }
    
    return validSequence;
  }

  /**
   * Validate swap positions from client
   * @param {*} positions - Raw positions input { pos1, pos2 }
   * @param {number} currentRound - Current round index
   * @param {number} totalCards - Total number of cards in sequence
   * @returns {Object|null} Valid positions or null if invalid
   */
  static swapPositions(positions, currentRound, totalCards) {
    if (!positions || typeof positions !== 'object') return null;
    
    const { pos1, pos2 } = positions;
    
    // Must be integers
    if (!Number.isInteger(pos1) || !Number.isInteger(pos2)) return null;
    
    // Must be non-negative
    if (pos1 < 0 || pos2 < 0) return null;
    
    // Must be within remaining cards range
    const remainingCards = totalCards - currentRound;
    if (pos1 >= remainingCards || pos2 >= remainingCards) return null;
    
    // Must be adjacent
    if (Math.abs(pos1 - pos2) !== 1) return null;
    
    return { pos1, pos2 };
  }

  /**
   * Validate lobby ID format
   * @param {*} lobbyId - Raw lobby ID from client
   * @returns {string|null} Valid lobby ID or null
   */
  static lobbyId(lobbyId) {
    if (typeof lobbyId !== 'string') return null;
    
    // Lobby IDs are 6 uppercase alphanumeric characters
    const trimmed = lobbyId.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(trimmed)) return null;
    
    return trimmed;
  }

  /**
   * Validate player ID (UUID or client-generated format)
   * @param {*} playerId - Raw player ID from client
   * @returns {string|null} Valid player ID or null
   */
  static playerId(playerId) {
    if (typeof playerId !== 'string') return null;
    
    const trimmed = playerId.trim();
    if (trimmed.length === 0 || trimmed.length > 100) return null;
    
    // Allow UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const isUUID = /^[a-f0-9-]{36}$/i.test(trimmed);
    
    // Allow client format: player_xxxxxxxxx_xxxxxxx (alphanumeric with underscores)
    const isClientFormat = /^player_[a-z0-9]+_[a-z0-9]+$/i.test(trimmed);
    
    // Allow any reasonable alphanumeric ID with common separators
    const isGenericId = /^[a-z0-9_-]+$/i.test(trimmed);
    
    if (!isUUID && !isClientFormat && !isGenericId) return null;
    
    return trimmed;
  }

  /**
   * Parse createLobby data from client
   * @param {*} data - Raw data (can be string or object)
   * @returns {Object} Parsed data with playerName and optional playerId
   */
  static createLobbyData(data) {
    if (typeof data === 'string') {
      return {
        playerName: this.playerName(data, 'Player 1'),
        playerId: null
      };
    }
    
    if (typeof data === 'object' && data !== null) {
      return {
        playerName: this.playerName(data.playerName, 'Player 1'),
        playerId: data.playerId ? this.playerId(data.playerId) : null
      };
    }
    
    return {
      playerName: 'Player 1',
      playerId: null
    };
  }

  /**
   * Parse joinLobby data from client
   * @param {*} lobbyId - Lobby ID
   * @param {*} playerName - Player name
   * @param {*} playerId - Optional player ID for reconnection
   * @returns {Object|null} Parsed data or null if lobbyId is invalid
   */
  static joinLobbyData(lobbyId, playerName, playerId) {
    const validLobbyId = this.lobbyId(lobbyId);
    if (!validLobbyId) return null;
    
    return {
      lobbyId: validLobbyId,
      playerName: this.playerName(playerName, 'Player 2'),
      playerId: playerId ? this.playerId(playerId) : null
    };
  }
}

module.exports = InputValidator;

