const { Deck } = require('./Deck');
const { determineWinner, getWinExplanation, determineGameWinner } = require('./rules');
const Timer = require('../utils/Timer');

const TIMERS = {
  SEQUENCE: 60,  // 60 seconds to set sequence
  SWAP: 20,      // 20 seconds for swap decision
  REVEAL: 3      // 3 seconds to show round result
};

const GamePhase = {
  WAITING: 'waiting',
  SEQUENCE: 'sequence',
  ROUND_START: 'round_start',
  SWAP: 'swap',
  REVEAL: 'reveal',
  GAME_OVER: 'game_over',
  PAUSED: 'paused'
};

class GameSession {
  constructor(players, io, lobbyId) {
    this.players = players; // Array of 2 Player objects
    this.io = io;
    this.lobbyId = lobbyId;
    this.currentRound = 0;
    this.totalRounds = 6;
    this.phase = GamePhase.WAITING;
    this.previousPhase = null;
    this.roundHistory = [];
    this.timer = null;
    this.paused = false;
  }

  /**
   * Start the game session
   */
  start() {
    // Deal cards to both players
    this.players.forEach(player => {
      player.hand = Deck.deal();
    });
    
    this.phase = GamePhase.SEQUENCE;
    
    // Emit game start event with dealt cards
    this.players.forEach(player => {
      this.io.to(player.socketId).emit('gameStart', {
        hand: player.hand,
        opponentName: this.getOpponent(player.id).name,
        timeLimit: TIMERS.SEQUENCE
      });
    });
    
    // Start sequence timer
    this.startSequenceTimer();
  }

  /**
   * Start timer for sequence setting phase
   */
  startSequenceTimer() {
    this.timer = new Timer(
      TIMERS.SEQUENCE,
      () => this.onSequenceTimeout(),
      (remaining) => this.broadcastTimer(remaining)
    );
    this.timer.start();
  }

  /**
   * Handle sequence timeout - auto-set random sequence
   */
  onSequenceTimeout() {
    this.players.forEach(player => {
      if (!player.sequenceSet) {
        // Auto-set the sequence in random order
        player.sequence = Deck.shuffle([...player.hand]);
        player.sequenceSet = true;
      }
    });
    
    this.startRound();
  }

  /**
   * Set player's card sequence
   */
  setPlayerSequence(playerId, sequence) {
    if (this.phase !== GamePhase.SEQUENCE) return;
    
    const player = this.getPlayer(playerId);
    if (!player) return;
    
    if (player.setSequence(sequence)) {
      this.io.to(player.socketId).emit('sequenceConfirmed');
      
      // Check if both players have set their sequence
      if (this.players.every(p => p.sequenceSet)) {
        this.timer.clear();
        this.startRound();
      }
    }
  }

  /**
   * Start a new round
   */
  startRound() {
    if (this.currentRound >= this.totalRounds) {
      this.endGame();
      return;
    }
    
    this.phase = GamePhase.ROUND_START;
    
    // Reset round-specific player flags
    this.players.forEach(p => p.resetRound());
    
    // Emit round start
    this.broadcast('roundStart', {
      round: this.currentRound + 1,
      totalRounds: this.totalRounds,
      swapTimeLimit: TIMERS.SWAP
    });
    
    // Move to swap phase
    this.phase = GamePhase.SWAP;
    this.startSwapTimer();
  }

  /**
   * Start timer for swap phase
   */
  startSwapTimer() {
    this.timer = new Timer(
      TIMERS.SWAP,
      () => this.onSwapTimeout(),
      (remaining) => this.broadcastTimer(remaining)
    );
    this.timer.start();
  }

  /**
   * Handle swap timeout - reveal cards
   */
  onSwapTimeout() {
    this.players.forEach(player => {
      player.ready = true;
    });
    this.revealCards();
  }

  /**
   * Handle player swap action
   */
  handleSwap(playerId, positions) {
    if (this.phase !== GamePhase.SWAP) return;
    
    const player = this.getPlayer(playerId);
    if (!player || player.ready) return;
    
    const { pos1, pos2 } = positions;
    
    // Only allow swapping future cards (not current round card)
    if (pos1 <= this.currentRound || pos2 <= this.currentRound) {
      this.io.to(player.socketId).emit('swapError', {
        message: 'Cannot swap cards that have already been played or current round card'
      });
      return;
    }
    
    if (player.swapCards(pos1, pos2)) {
      player.ready = true;
      
      this.io.to(player.socketId).emit('swapConfirmed', {
        sequence: player.sequence,
        swapsRemaining: 3 - player.swapsUsed
      });
      
      // Notify opponent that player made a swap
      const opponent = this.getOpponent(playerId);
      this.io.to(opponent.socketId).emit('opponentSwapped');
      
      this.checkSwapPhaseComplete();
    } else {
      this.io.to(player.socketId).emit('swapError', {
        message: 'Invalid swap (must be adjacent cards, max 3 swaps per game)'
      });
    }
  }

  /**
   * Handle player skipping swap
   */
  handleSkipSwap(playerId) {
    if (this.phase !== GamePhase.SWAP) return;
    
    const player = this.getPlayer(playerId);
    if (!player || player.ready) return;
    
    player.ready = true;
    this.io.to(player.socketId).emit('skipConfirmed');
    
    this.checkSwapPhaseComplete();
  }

  /**
   * Check if swap phase is complete
   */
  checkSwapPhaseComplete() {
    if (this.players.every(p => p.ready)) {
      this.timer.clear();
      this.revealCards();
    }
  }

  /**
   * Reveal cards and determine round winner
   */
  revealCards() {
    this.phase = GamePhase.REVEAL;
    
    const player1 = this.players[0];
    const player2 = this.players[1];
    
    const card1 = player1.getCardForRound(this.currentRound);
    const card2 = player2.getCardForRound(this.currentRound);
    
    const result = determineWinner(card1, card2);
    
    let roundWinner = null;
    if (result === 1) {
      player1.addScore(1);
      roundWinner = player1.id;
    } else if (result === 2) {
      player2.addScore(1);
      roundWinner = player2.id;
    }
    
    const roundResult = {
      round: this.currentRound + 1,
      cards: {
        [player1.id]: card1,
        [player2.id]: card2
      },
      winner: roundWinner,
      isDraw: result === 0,
      explanation: result !== 0 ? getWinExplanation(
        result === 1 ? card1.type : card2.type,
        result === 1 ? card2.type : card1.type
      ) : 'Ничья',
      scores: {
        [player1.id]: player1.score,
        [player2.id]: player2.score
      }
    };
    
    this.roundHistory.push(roundResult);
    
    // Send result to each player
    this.players.forEach(player => {
      const opponent = this.getOpponent(player.id);
      this.io.to(player.socketId).emit('roundResult', {
        ...roundResult,
        yourCard: player.getCardForRound(this.currentRound),
        opponentCard: opponent.getCardForRound(this.currentRound),
        youWon: roundWinner === player.id,
        yourScore: player.score,
        opponentScore: opponent.score,
        yourSwapsRemaining: 3 - player.swapsUsed,
        upcomingCards: player.sequence.slice(this.currentRound + 1)
      });
    });
    
    this.currentRound++;
    
    // Start next round after delay or end game
    setTimeout(() => {
      if (this.phase === GamePhase.REVEAL) {
        this.startRound();
      }
    }, TIMERS.REVEAL * 1000);
  }

  /**
   * End the game
   */
  endGame() {
    this.phase = GamePhase.GAME_OVER;
    
    const player1 = this.players[0];
    const player2 = this.players[1];
    
    const gameResult = determineGameWinner(player1, player2);
    
    this.players.forEach(player => {
      const opponent = this.getOpponent(player.id);
      this.io.to(player.socketId).emit('gameEnd', {
        ...gameResult,
        youWon: gameResult.winner === player.id,
        yourFinalScore: player.score,
        opponentFinalScore: opponent.score,
        roundHistory: this.roundHistory
      });
    });
  }

  /**
   * End game due to disconnect timeout
   */
  endGameByDisconnect(winnerId) {
    this.phase = GamePhase.GAME_OVER;
    
    const winner = this.getPlayer(winnerId);
    const loser = this.getOpponent(winnerId);
    
    this.io.to(winner.socketId).emit('gameEnd', {
      winner: winnerId,
      winnerName: winner.name,
      youWon: true,
      byDisconnect: true,
      message: 'Opponent disconnected - you win!'
    });
    
    if (!loser.disconnected) {
      this.io.to(loser.socketId).emit('gameEnd', {
        winner: winnerId,
        winnerName: winner.name,
        youWon: false,
        byDisconnect: true,
        message: 'You were disconnected too long - you lose!'
      });
    }
  }

  /**
   * Pause the game
   */
  pause() {
    if (this.phase === GamePhase.GAME_OVER || this.phase === GamePhase.PAUSED) return;
    
    this.previousPhase = this.phase;
    this.phase = GamePhase.PAUSED;
    this.paused = true;
    
    if (this.timer) {
      this.timer.pause();
    }
  }

  /**
   * Resume the game
   */
  resume() {
    if (!this.paused || this.phase !== GamePhase.PAUSED) return;
    
    this.phase = this.previousPhase;
    this.paused = false;
    
    if (this.timer) {
      this.timer.resume();
    }
    
    this.broadcast('gameResumed', {
      phase: this.phase,
      timeRemaining: this.timer ? Math.ceil(this.timer.getRemaining()) : 0
    });
  }

  /**
   * Get current game state for a player (for reconnection)
   */
  getStateForPlayer(playerId) {
    const player = this.getPlayer(playerId);
    const opponent = this.getOpponent(playerId);
    
    return {
      phase: this.phase,
      currentRound: this.currentRound,
      yourSequence: player.sequence,
      yourScore: player.score,
      opponentScore: opponent.score,
      yourSwapsRemaining: 3 - player.swapsUsed,
      opponentSwapsRemaining: 3 - opponent.swapsUsed,
      roundHistory: this.roundHistory,
      timeRemaining: this.timer ? Math.ceil(this.timer.getRemaining()) : 0,
      upcomingCards: player.sequence.slice(this.currentRound)
    };
  }

  /**
   * Broadcast message to all players in lobby
   */
  broadcast(event, data) {
    this.io.to(this.lobbyId).emit(event, data);
  }

  /**
   * Broadcast timer update
   */
  broadcastTimer(remaining) {
    this.broadcast('timerUpdate', { remaining });
  }

  /**
   * Get player by ID
   */
  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId);
  }

  /**
   * Get opponent of a player
   */
  getOpponent(playerId) {
    return this.players.find(p => p.id !== playerId);
  }
}

module.exports = GameSession;

