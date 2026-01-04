const { Deck } = require('./Deck');
const { determineWinner, getWinExplanation, determineGameWinner } = require('./rules');
const Timer = require('../utils/Timer');
const GameNotifier = require('./GameNotifier');
const GameStateMachine = require('./GameStateMachine');
const { GAME_CONFIG, GamePhase } = require('./constants');

class GameSession {
  constructor(players, io, lobbyId) {
    this.players = players; // Array of 2 Player objects
    this.lobbyId = lobbyId;
    this.currentRound = 0;
    this.roundHistory = [];
    this.timer = null;
    this.completed = false;
    
    // Use dedicated state machine for phase management
    this.stateMachine = new GameStateMachine(GamePhase.WAITING);
    
    // Use dedicated notifier for Socket.IO communication
    this.notifier = new GameNotifier(io, lobbyId);
    
    // Track player readiness states
    this.continueReady = new Set();
    this.previewReady = new Set();
  }

  // ==================== Getters ====================

  /**
   * Get current phase
   */
  get phase() {
    return this.stateMachine.getPhase();
  }

  /**
   * Check if the game session is completed
   */
  isCompleted() {
    return this.completed || this.stateMachine.isGameOver();
  }

  /**
   * Check if any player is disconnected
   */
  hasDisconnectedPlayer() {
    return this.players.some(p => p.disconnected);
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

  // ==================== Game Flow ====================

  /**
   * Start the game session - first show preview
   */
  start() {
    // Deal cards to both players
    this.players.forEach(player => {
      player.hand = Deck.deal();
    });
    
    this.stateMachine.transition(GamePhase.PREVIEW);
    this.notifier.sendCardsPreview(this.players, GAME_CONFIG.TIMERS.PREVIEW);
    this.startTimer(GAME_CONFIG.TIMERS.PREVIEW, () => this.onPreviewTimeout(), 'previewTimerUpdate');
  }

  /**
   * Handle player clicking ready in preview
   */
  handlePreviewReady(playerId) {
    if (!this.stateMachine.is(GamePhase.PREVIEW)) return;
    
    this.previewReady.add(playerId);
    
    const opponent = this.getOpponent(playerId);
    this.notifier.sendOpponentPreviewReady(opponent.socketId);
    
    if (this.previewReady.size >= GAME_CONFIG.MAX_PLAYERS) {
      this.clearTimer();
      this.startSequencePhase();
    }
  }

  /**
   * Handle preview timeout - move to sequence phase
   */
  onPreviewTimeout() {
    this.startSequencePhase();
  }

  /**
   * Start the sequence setup phase
   */
  startSequencePhase() {
    this.stateMachine.transition(GamePhase.SEQUENCE);
    this.previewReady.clear();
    
    this.notifier.sendGameStart(this.players, GAME_CONFIG.TIMERS.SEQUENCE);
    this.startTimer(GAME_CONFIG.TIMERS.SEQUENCE, () => this.onSequenceTimeout(), 'timerUpdate');
  }

  /**
   * Handle sequence timeout - auto-set random sequence
   */
  onSequenceTimeout() {
    this.players.forEach(player => {
      if (!player.sequenceSet) {
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
    if (!this.stateMachine.is(GamePhase.SEQUENCE)) return;
    
    const player = this.getPlayer(playerId);
    if (!player) return;
    
    if (player.setSequence(sequence)) {
      this.notifier.sendSequenceConfirmed(player.socketId);
      
      if (this.players.every(p => p.sequenceSet)) {
        this.clearTimer();
        this.startRound();
      }
    }
  }

  /**
   * Start a new round
   */
  startRound() {
    if (this.currentRound >= GAME_CONFIG.TOTAL_ROUNDS) {
      this.endGame();
      return;
    }
    
    // Check if any player is disconnected - pause and wait
    if (this.hasDisconnectedPlayer()) {
      this.stateMachine.setPendingAction('startRound');
      this.stateMachine.transition(GamePhase.ROUND_START);
      this.pause();
      this.notifyDisconnectedState();
      return;
    }
    
    this.stateMachine.transition(GamePhase.ROUND_START);
    
    // Reset round-specific player flags
    this.players.forEach(p => p.resetRound());
    
    this.notifier.sendRoundStart(
      this.currentRound + 1,
      GAME_CONFIG.TOTAL_ROUNDS,
      GAME_CONFIG.TIMERS.SWAP
    );
    
    this.stateMachine.transition(GamePhase.SWAP);
    this.startTimer(GAME_CONFIG.TIMERS.SWAP, () => this.onSwapTimeout(), 'timerUpdate');
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
    if (!this.stateMachine.is(GamePhase.SWAP)) return;
    
    const player = this.getPlayer(playerId);
    if (!player || player.ready) return;
    
    const { pos1, pos2 } = positions;
    
    // Convert positions relative to remaining cards
    const actualPos1 = pos1 + this.currentRound;
    const actualPos2 = pos2 + this.currentRound;
    
    // Validate not swapping already played cards
    if (actualPos1 < this.currentRound || actualPos2 < this.currentRound) {
      this.notifier.sendSwapError(player.socketId, 'Нельзя менять уже сыгранные карты');
      return;
    }
    
    if (player.swapCards(actualPos1, actualPos2)) {
      player.ready = true;
      
      this.notifier.sendSwapConfirmed(
        player.socketId,
        player.sequence.slice(this.currentRound),
        player.getSwapsRemaining()
      );
      
      const opponent = this.getOpponent(playerId);
      this.notifier.sendOpponentSwapped(opponent.socketId);
      
      this.checkSwapPhaseComplete();
    } else {
      this.notifier.sendSwapError(
        player.socketId,
        'Некорректный свап (только соседние карты, макс. 3 за игру)'
      );
    }
  }

  /**
   * Handle player skipping swap
   */
  handleSkipSwap(playerId) {
    if (!this.stateMachine.is(GamePhase.SWAP)) return;
    
    const player = this.getPlayer(playerId);
    if (!player || player.ready) return;
    
    player.ready = true;
    this.notifier.sendSkipConfirmed(player.socketId);
    this.checkSwapPhaseComplete();
  }

  /**
   * Check if swap phase is complete
   */
  checkSwapPhaseComplete() {
    if (this.players.every(p => p.ready)) {
      this.clearTimer();
      this.revealCards();
    }
  }

  /**
   * Reveal cards and determine round winner
   */
  revealCards() {
    this.stateMachine.transition(GamePhase.REVEAL);
    
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
    this.notifier.sendRoundResult(this.players, roundResult, this.currentRound);
    
    this.currentRound++;
    this.continueReady.clear();
    
    this.startTimer(GAME_CONFIG.TIMERS.CONTINUE, () => this.onContinueTimeout(), 'continueCountdown');
  }

  /**
   * Handle continue timeout - start next round
   */
  onContinueTimeout() {
    if (this.stateMachine.is(GamePhase.REVEAL)) {
      this.startRound();
    }
  }

  /**
   * Handle player clicking continue button
   */
  handleContinue(playerId) {
    if (!this.stateMachine.is(GamePhase.REVEAL)) return;
    
    this.continueReady.add(playerId);
    
    const opponent = this.getOpponent(playerId);
    this.notifier.sendOpponentContinued(opponent.socketId);
    
    if (this.continueReady.size >= GAME_CONFIG.MAX_PLAYERS) {
      this.clearTimer();
      this.startRound();
    }
  }

  // ==================== Game End ====================

  /**
   * End the game normally
   */
  endGame() {
    this.stateMachine.endGame();
    this.completed = true;
    this.clearTimer();
    
    const gameResult = determineGameWinner(this.players[0], this.players[1]);
    this.notifier.sendGameEnd(this.players, gameResult, this.roundHistory);
  }

  /**
   * End game due to disconnect timeout
   */
  endGameByDisconnect(winnerId) {
    this.stateMachine.endGame();
    this.completed = true;
    this.clearTimer();
    
    const winner = this.getPlayer(winnerId);
    const loser = this.getOpponent(winnerId);
    
    this.notifier.sendGameEndByDisconnect(winner, loser);
  }

  // ==================== Pause/Resume ====================

  /**
   * Pause the game
   */
  pause() {
    if (!this.stateMachine.pause()) return;
    
    if (this.timer) {
      this.timer.pause();
    }
  }

  /**
   * Resume the game
   */
  resume() {
    if (!this.stateMachine.resume()) return;
    
    // Check for pending actions
    const pendingAction = this.stateMachine.consumePendingAction();
    if (pendingAction === 'startRound') {
      this.notifier.sendGameResumed(this.stateMachine.getPhase(), 0);
      setTimeout(() => this.startRound(), GAME_CONFIG.DELAYS.ROUND_START_AFTER_RESUME);
      return;
    }
    
    if (this.timer) {
      this.timer.resume();
    }
    
    this.notifier.sendGameResumed(
      this.stateMachine.getPhase(),
      this.timer ? Math.ceil(this.timer.getRemaining()) : 0
    );
  }

  /**
   * Notify connected player about disconnected opponent
   */
  notifyDisconnectedState() {
    this.players.forEach(player => {
      if (!player.disconnected) {
        this.notifier.sendOpponentDisconnected(player.socketId, GAME_CONFIG.TIMERS.RECONNECT);
      }
    });
  }

  // ==================== Timer Management ====================

  /**
   * Start a timer with unified interface
   */
  startTimer(duration, onComplete, tickEvent) {
    this.clearTimer();
    this.timer = new Timer(
      duration,
      onComplete,
      (remaining) => this.notifier.sendTimerUpdate(tickEvent, remaining)
    );
    this.timer.start();
  }

  /**
   * Clear current timer
   */
  clearTimer() {
    if (this.timer) {
      this.timer.clear();
      this.timer = null;
    }
  }

  // ==================== State Serialization ====================

  /**
   * Get current game state for a player (for reconnection)
   */
  getStateForPlayer(playerId) {
    const player = this.getPlayer(playerId);
    const opponent = this.getOpponent(playerId);
    
    const actualPhase = this.stateMachine.getActualPhase();
    
    // Determine readiness based on phase
    let isReady = player.ready;
    let opponentReady = opponent.ready;
    
    if (actualPhase === GamePhase.REVEAL) {
      isReady = this.continueReady.has(playerId);
      opponentReady = this.continueReady.has(opponent.id);
    } else if (actualPhase === GamePhase.PREVIEW) {
      isReady = this.previewReady.has(playerId);
      opponentReady = this.previewReady.has(opponent.id);
    }
    
    return {
      lobbyId: this.lobbyId,
      phase: actualPhase,
      currentRound: this.currentRound,
      yourSequence: player.sequence,
      yourScore: player.score,
      opponentScore: opponent.score,
      yourSwapsRemaining: player.getSwapsRemaining(),
      opponentSwapsRemaining: opponent.getSwapsRemaining(),
      roundHistory: this.roundHistory,
      timeRemaining: this.timer ? Math.ceil(this.timer.getRemaining()) : 0,
      upcomingCards: player.sequence.slice(this.currentRound),
      hand: player.hand,
      playerName: player.name,
      opponentName: opponent.name,
      playerId: playerId,
      opponentId: opponent.id,
      isReady: isReady,
      opponentReady: opponentReady,
      sequenceSet: player.sequenceSet,
      opponentSequenceSet: opponent.sequenceSet,
      opponentCards: actualPhase === GamePhase.PREVIEW ? opponent.hand : null
    };
  }
}

module.exports = GameSession;
