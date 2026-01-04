/**
 * GameNotifier - Abstraction layer for Socket.IO communication
 * Separates transport concerns from game logic for better testability
 */
class GameNotifier {
  constructor(io, lobbyId) {
    this.io = io;
    this.lobbyId = lobbyId;
  }

  /**
   * Send event to a specific player
   * @param {string} socketId - Player's socket ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  toPlayer(socketId, event, data) {
    this.io.to(socketId).emit(event, data);
  }

  /**
   * Broadcast event to all players in lobby
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  toAll(event, data) {
    this.io.to(this.lobbyId).emit(event, data);
  }

  /**
   * Send cards preview to players
   * @param {Array} players - Array of player objects
   * @param {number} timeLimit - Time limit for preview phase
   */
  sendCardsPreview(players, timeLimit) {
    players.forEach(player => {
      const opponent = players.find(p => p.id !== player.id);
      this.toPlayer(player.socketId, 'cardsPreview', {
        yourCards: player.hand,
        opponentCards: opponent.hand,
        opponentName: opponent.name,
        timeLimit
      });
    });
  }

  /**
   * Send game start event to players
   * @param {Array} players - Array of player objects
   * @param {number} timeLimit - Time limit for sequence phase
   */
  sendGameStart(players, timeLimit) {
    players.forEach(player => {
      const opponent = players.find(p => p.id !== player.id);
      this.toPlayer(player.socketId, 'gameStart', {
        hand: player.hand,
        opponentName: opponent.name,
        timeLimit
      });
    });
  }

  /**
   * Notify player that opponent is ready in preview
   * @param {string} socketId - Opponent's socket ID
   */
  sendOpponentPreviewReady(socketId) {
    this.toPlayer(socketId, 'opponentPreviewReady', {});
  }

  /**
   * Send round start notification
   * @param {number} round - Current round (1-based)
   * @param {number} totalRounds - Total number of rounds
   * @param {number} swapTimeLimit - Time limit for swap phase
   */
  sendRoundStart(round, totalRounds, swapTimeLimit) {
    this.toAll('roundStart', {
      round,
      totalRounds,
      swapTimeLimit
    });
  }

  /**
   * Send sequence confirmation to player
   * @param {string} socketId - Player's socket ID
   */
  sendSequenceConfirmed(socketId) {
    this.toPlayer(socketId, 'sequenceConfirmed', {});
  }

  /**
   * Send swap confirmation to player
   * @param {string} socketId - Player's socket ID
   * @param {Array} sequence - Updated sequence (remaining cards)
   * @param {number} swapsRemaining - Number of swaps remaining
   */
  sendSwapConfirmed(socketId, sequence, swapsRemaining) {
    this.toPlayer(socketId, 'swapConfirmed', {
      sequence,
      swapsRemaining
    });
  }

  /**
   * Notify opponent that player swapped
   * @param {string} socketId - Opponent's socket ID
   */
  sendOpponentSwapped(socketId) {
    this.toPlayer(socketId, 'opponentSwapped', {});
  }

  /**
   * Send swap error to player
   * @param {string} socketId - Player's socket ID
   * @param {string} message - Error message
   */
  sendSwapError(socketId, message) {
    this.toPlayer(socketId, 'swapError', { message });
  }

  /**
   * Send skip confirmation to player
   * @param {string} socketId - Player's socket ID
   */
  sendSkipConfirmed(socketId) {
    this.toPlayer(socketId, 'skipConfirmed', {});
  }

  /**
   * Send round result to all players
   * @param {Array} players - Array of player objects
   * @param {Object} roundResult - Round result data
   * @param {number} currentRound - Current round index (0-based)
   */
  sendRoundResult(players, roundResult, currentRound) {
    players.forEach(player => {
      const opponent = players.find(p => p.id !== player.id);
      this.toPlayer(player.socketId, 'roundResult', {
        ...roundResult,
        round: currentRound + 1,
        yourCard: player.getCardForRound(currentRound),
        opponentCard: opponent.getCardForRound(currentRound),
        youWon: roundResult.winner === player.id,
        yourScore: player.score,
        opponentScore: opponent.score,
        yourSwapsRemaining: player.getSwapsRemaining(),
        opponentSwapsRemaining: opponent.getSwapsRemaining(),
        upcomingCards: player.sequence.slice(currentRound + 1)
      });
    });
  }

  /**
   * Notify opponent that player continued
   * @param {string} socketId - Opponent's socket ID
   */
  sendOpponentContinued(socketId) {
    this.toPlayer(socketId, 'opponentContinued', {});
  }

  /**
   * Send game end to all players
   * @param {Array} players - Array of player objects
   * @param {Object} gameResult - Game result data
   * @param {Array} roundHistory - History of all rounds
   */
  sendGameEnd(players, gameResult, roundHistory) {
    players.forEach(player => {
      const opponent = players.find(p => p.id !== player.id);
      this.toPlayer(player.socketId, 'gameEnd', {
        ...gameResult,
        youWon: gameResult.winner === player.id,
        yourFinalScore: player.score,
        opponentFinalScore: opponent.score,
        roundHistory
      });
    });
  }

  /**
   * Send game end by disconnect
   * @param {Object} winner - Winner player object
   * @param {Object} loser - Loser player object
   */
  sendGameEndByDisconnect(winner, loser) {
    this.toPlayer(winner.socketId, 'gameEnd', {
      winner: winner.id,
      winnerName: winner.name,
      youWon: true,
      byDisconnect: true,
      message: 'Opponent disconnected - you win!'
    });

    if (!loser.disconnected) {
      this.toPlayer(loser.socketId, 'gameEnd', {
        winner: winner.id,
        winnerName: winner.name,
        youWon: false,
        byDisconnect: true,
        message: 'You were disconnected too long - you lose!'
      });
    }
  }

  /**
   * Send opponent disconnected notification
   * @param {string} socketId - Socket ID of connected player
   * @param {number} reconnectTimeout - Time remaining for reconnection
   */
  sendOpponentDisconnected(socketId, reconnectTimeout) {
    this.toPlayer(socketId, 'opponentDisconnected', { reconnectTimeout });
  }

  /**
   * Send opponent reconnected notification
   * @param {string} socketId - Socket ID of connected player
   */
  sendOpponentReconnected(socketId) {
    this.toPlayer(socketId, 'opponentReconnected', {});
  }

  /**
   * Send game resumed notification
   * @param {string} phase - Current game phase
   * @param {number} timeRemaining - Time remaining on current timer
   */
  sendGameResumed(phase, timeRemaining) {
    this.toAll('gameResumed', { phase, timeRemaining });
  }

  /**
   * Send reconnection state to player
   * @param {string} socketId - Player's socket ID
   * @param {Object} state - Full game state for player
   */
  sendReconnected(socketId, state) {
    this.toPlayer(socketId, 'reconnected', state);
  }

  /**
   * Send timer update
   * @param {string} event - Timer event name
   * @param {number} remaining - Seconds remaining
   */
  sendTimerUpdate(event, remaining) {
    this.toAll(event, { remaining });
  }

  /**
   * Send error to player
   * @param {string} socketId - Player's socket ID
   * @param {string} message - Error message
   */
  sendError(socketId, message) {
    this.toPlayer(socketId, 'error', { message });
  }
}

module.exports = GameNotifier;

