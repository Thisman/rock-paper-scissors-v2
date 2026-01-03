/**
 * Game State Manager
 * Handles game logic and state on the client side
 */
class GameManager {
  constructor() {
    this.state = {
      phase: 'lobby',
      playerId: null,
      playerName: '',
      opponentName: '',
      lobbyId: null,
      hand: [],
      sequence: [],
      currentRound: 0,
      playerScore: 0,
      opponentScore: 0,
      swapsRemaining: 3,
      opponentSwapsRemaining: 3,
      sequenceTimer: 60,
      swapTimer: 20,
      swapMode: false,
      selectedCardIndex: null
    };
    
    this.maxSequenceTime = 60;
    this.maxSwapTime = 20;
  }

  /**
   * Initialize game manager
   */
  init() {
    this.bindSocketEvents();
  }

  /**
   * Bind socket event handlers
   */
  bindSocketEvents() {
    socketHandler
      .on('lobbyCreated', (data) => this.onLobbyCreated(data))
      .on('lobbyJoined', (data) => this.onLobbyJoined(data))
      .on('playerJoined', (data) => this.onPlayerJoined(data))
      .on('gameStart', (data) => this.onGameStart(data))
      .on('sequenceConfirmed', () => this.onSequenceConfirmed())
      .on('roundStart', (data) => this.onRoundStart(data))
      .on('timerUpdate', (data) => this.onTimerUpdate(data))
      .on('swapConfirmed', (data) => this.onSwapConfirmed(data))
      .on('swapError', (data) => this.onSwapError(data))
      .on('skipConfirmed', () => this.onSkipConfirmed())
      .on('opponentSwapped', () => this.onOpponentSwapped())
      .on('roundResult', (data) => this.onRoundResult(data))
      .on('gameEnd', (data) => this.onGameEnd(data))
      .on('opponentDisconnected', (data) => this.onOpponentDisconnected(data))
      .on('opponentReconnected', () => this.onOpponentReconnected())
      .on('reconnected', (data) => this.onReconnected(data))
      .on('error', (data) => this.onError(data));
  }

  /**
   * Create a new lobby
   */
  createLobby() {
    this.state.playerName = ui.getPlayerName();
    socketHandler.createLobby(this.state.playerName);
  }

  /**
   * Join an existing lobby
   */
  joinLobby() {
    const code = ui.getLobbyCode();
    if (!code || code.length !== 6) {
      ui.showToast('Введите 6-значный код комнаты');
      return;
    }
    
    this.state.playerName = ui.getPlayerName();
    socketHandler.joinLobby(code, this.state.playerName);
  }

  /**
   * Handle lobby created event
   */
  onLobbyCreated(data) {
    this.state.lobbyId = data.lobbyId;
    this.state.playerId = data.playerId;
    socketHandler.saveSession(data.lobbyId, data.playerId);
    
    ui.showWaiting(data.lobbyId);
  }

  /**
   * Handle lobby joined event
   */
  onLobbyJoined(data) {
    this.state.lobbyId = data.lobbyId;
    this.state.playerId = data.playerId;
    this.state.opponentName = data.opponentName;
    socketHandler.saveSession(data.lobbyId, data.playerId);
    
    ui.showToast(`Подключились к игре против ${data.opponentName}`);
  }

  /**
   * Handle player joined event
   */
  onPlayerJoined(data) {
    this.state.opponentName = data.opponentName;
    ui.hideWaiting();
    ui.showToast(`${data.opponentName} присоединился!`);
  }

  /**
   * Handle game start event
   */
  onGameStart(data) {
    this.state.phase = 'sequence';
    this.state.hand = data.hand;
    this.state.opponentName = data.opponentName || this.state.opponentName;
    this.state.sequenceTimer = data.timeLimit;
    this.maxSequenceTime = data.timeLimit;
    
    // Set up sequence screen
    ui.createSequenceSlots(6);
    ui.renderHandCards(data.hand);
    ui.updateTimer('sequence-timer', data.timeLimit, this.maxSequenceTime);
    ui.showScreen('sequence');
    
    // Initialize drag and drop
    dragDrop.init(data.hand, (sequence) => this.onSequenceChange(sequence));
  }

  /**
   * Handle sequence change from drag and drop
   */
  onSequenceChange(sequence) {
    this.state.sequence = sequence;
    ui.setConfirmEnabled(dragDrop.isComplete());
  }

  /**
   * Confirm the card sequence
   */
  confirmSequence() {
    if (!dragDrop.isComplete()) {
      ui.showToast('Расставьте все карты');
      return;
    }
    
    const sequence = dragDrop.getSequence();
    
    // Convert to full card objects
    const fullSequence = sequence.map(card => {
      return this.state.hand.find(h => h.id === card.id);
    });
    
    this.state.sequence = fullSequence;
    socketHandler.setSequence(fullSequence);
  }

  /**
   * Handle sequence confirmed
   */
  onSequenceConfirmed() {
    ui.showToast('Последовательность принята!');
    ui.setConfirmEnabled(false);
    ui.elements.confirmSequenceBtn.textContent = 'Ожидание соперника...';
  }

  /**
   * Handle round start event
   */
  onRoundStart(data) {
    this.state.phase = 'swap';
    this.state.currentRound = data.round;
    this.maxSwapTime = data.swapTimeLimit;
    
    // Switch to game screen if not already there
    if (ui.currentScreen !== 'game') {
      ui.setupGameScreen(this.state.playerName, this.state.opponentName);
      ui.showScreen('game');
    }
    
    ui.updateRound(data.round);
    ui.renderPlayerCards(this.state.sequence, data.round - 1);
    ui.renderOpponentCards(6, data.round - 1);
    ui.resetBattleCards();
    ui.setActionsEnabled(this.state.swapsRemaining > 0);
    ui.updateSwaps(this.state.swapsRemaining);
    
    this.state.swapMode = false;
    this.state.selectedCardIndex = null;
  }

  /**
   * Handle timer update
   */
  onTimerUpdate(data) {
    if (this.state.phase === 'sequence') {
      ui.updateTimer('sequence-timer', data.remaining, this.maxSequenceTime);
    } else if (this.state.phase === 'swap') {
      ui.updateTimer('game-timer', data.remaining, this.maxSwapTime);
    }
  }

  /**
   * Enter swap mode
   */
  enterSwapMode() {
    if (this.state.swapsRemaining <= 0) {
      ui.showToast('Свапы закончились');
      return;
    }
    
    this.state.swapMode = true;
    ui.showToast('Выберите карту для обмена');
    
    // Highlight swappable cards
    const cards = document.querySelectorAll('#player-cards .card');
    cards.forEach((card, index) => {
      if (index > this.state.currentRound - 1) {
        card.classList.add('swap-candidate');
        card.onclick = () => this.selectCardForSwap(index);
      }
    });
  }

  /**
   * Select a card for swapping
   */
  selectCardForSwap(index) {
    if (!this.state.swapMode) return;
    
    const cards = document.querySelectorAll('#player-cards .card');
    
    if (this.state.selectedCardIndex === null) {
      // First card selected
      this.state.selectedCardIndex = index;
      cards[index].classList.add('selected');
      ui.showToast('Выберите соседнюю карту');
    } else {
      // Second card selected - try to swap
      const pos1 = this.state.selectedCardIndex;
      const pos2 = index;
      
      if (Math.abs(pos1 - pos2) === 1) {
        socketHandler.swapCards(pos1, pos2);
      } else {
        ui.showToast('Можно менять только соседние карты');
      }
      
      // Reset selection
      this.exitSwapMode();
    }
  }

  /**
   * Exit swap mode
   */
  exitSwapMode() {
    this.state.swapMode = false;
    this.state.selectedCardIndex = null;
    
    const cards = document.querySelectorAll('#player-cards .card');
    cards.forEach(card => {
      card.classList.remove('swap-candidate', 'selected');
      card.onclick = null;
    });
  }

  /**
   * Skip swap action
   */
  skipSwap() {
    this.exitSwapMode();
    socketHandler.skipSwap();
  }

  /**
   * Handle swap confirmed
   */
  onSwapConfirmed(data) {
    this.state.sequence = data.sequence;
    this.state.swapsRemaining = data.swapsRemaining;
    
    ui.renderPlayerCards(this.state.sequence, this.state.currentRound - 1);
    ui.updateSwaps(this.state.swapsRemaining);
    ui.setActionsEnabled(false);
    ui.showToast('Свап выполнен!');
  }

  /**
   * Handle swap error
   */
  onSwapError(data) {
    ui.showToast(data.message);
    this.exitSwapMode();
  }

  /**
   * Handle skip confirmed
   */
  onSkipConfirmed() {
    ui.setActionsEnabled(false);
  }

  /**
   * Handle opponent swapped
   */
  onOpponentSwapped() {
    ui.showToast('Соперник сделал свап');
  }

  /**
   * Handle round result
   */
  onRoundResult(data) {
    this.state.phase = 'reveal';
    this.state.playerScore = data.yourScore;
    this.state.opponentScore = data.opponentScore;
    this.state.swapsRemaining = data.yourSwapsRemaining;
    this.state.sequence = data.upcomingCards;
    
    // Determine winner type
    let winner = null;
    if (!data.isDraw) {
      winner = data.youWon ? 'player' : 'opponent';
    }
    
    // Show battle cards
    ui.showBattleCards(data.yourCard, data.opponentCard, winner);
    ui.updateScores(data.yourScore, data.opponentScore);
    
    // Show result overlay
    let title, type;
    if (data.isDraw) {
      title = 'Ничья!';
      type = 'draw';
    } else if (data.youWon) {
      title = 'Вы выиграли раунд!';
      type = 'win';
    } else {
      title = 'Соперник выиграл раунд';
      type = 'lose';
    }
    
    ui.showRoundResult(title, data.explanation, type);
  }

  /**
   * Handle game end
   */
  onGameEnd(data) {
    this.state.phase = 'gameover';
    socketHandler.clearSession();
    
    ui.showGameOver(data);
  }

  /**
   * Handle opponent disconnected
   */
  onOpponentDisconnected(data) {
    ui.showDisconnectOverlay(data.reconnectTimeout);
  }

  /**
   * Handle opponent reconnected
   */
  onOpponentReconnected() {
    ui.hideDisconnectOverlay();
    ui.showToast('Соперник переподключился');
  }

  /**
   * Handle reconnection to game
   */
  onReconnected(data) {
    this.state.phase = data.phase;
    this.state.currentRound = data.currentRound;
    this.state.sequence = data.yourSequence;
    this.state.playerScore = data.yourScore;
    this.state.opponentScore = data.opponentScore;
    this.state.swapsRemaining = data.yourSwapsRemaining;
    
    // Restore appropriate screen
    if (data.phase === 'sequence') {
      ui.showScreen('sequence');
    } else if (data.phase === 'swap' || data.phase === 'reveal' || data.phase === 'round_start') {
      ui.setupGameScreen(this.state.playerName, this.state.opponentName);
      ui.updateRound(data.currentRound + 1);
      ui.updateScores(data.yourScore, data.opponentScore);
      ui.renderPlayerCards(data.yourSequence, data.currentRound);
      ui.renderOpponentCards(6, data.currentRound);
      ui.showScreen('game');
    }
    
    ui.showToast('Переподключение успешно');
  }

  /**
   * Handle error
   */
  onError(data) {
    ui.showToast(data.message);
  }

  /**
   * Play again - reset and return to lobby
   */
  playAgain() {
    this.state = {
      phase: 'lobby',
      playerId: null,
      playerName: '',
      opponentName: '',
      lobbyId: null,
      hand: [],
      sequence: [],
      currentRound: 0,
      playerScore: 0,
      opponentScore: 0,
      swapsRemaining: 3,
      opponentSwapsRemaining: 3,
      sequenceTimer: 60,
      swapTimer: 20,
      swapMode: false,
      selectedCardIndex: null
    };
    
    ui.reset();
  }
}

// Global game manager
window.game = new GameManager();

