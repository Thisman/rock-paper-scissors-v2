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
      .on('continueCountdown', (data) => this.onContinueCountdown(data))
      .on('opponentContinued', () => this.onOpponentContinued())
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
    
    // Update URL for second player too
    ui.updateUrlWithRoom(data.lobbyId);
    
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
    
    // Clear played cards for new game
    ui.clearOpponentPlayedCards();
    ui.clearPlayerPlayedCards();
    
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
    
    // Hide the round result overlay if visible
    ui.hideRoundResult();
    
    // Switch to game screen if not already there
    if (ui.currentScreen !== 'game') {
      ui.setupGameScreen(this.state.playerName, this.state.opponentName);
      ui.showScreen('game');
    }
    
    ui.updateRound(data.round);
    // Show all remaining cards (including current round's card at index 0)
    ui.renderPlayerCards(this.state.sequence, 0);
    ui.renderOpponentCards(6, data.round - 1);
    ui.resetBattleCards();
    ui.setActionsEnabled(this.state.swapsRemaining > 0);
    ui.updateSwaps(this.state.swapsRemaining);
    ui.updateSwapButtonState(this.state.swapsRemaining);
    
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
    
    // Get only non-used cards
    const allCards = document.querySelectorAll('#player-cards .card');
    const availableCards = Array.from(allCards).filter(card => !card.classList.contains('used'));
    
    // Highlight all available cards for first selection
    availableCards.forEach((card, idx) => {
      card.classList.add('swap-candidate');
      card.onclick = () => this.selectCardForSwap(idx, availableCards);
    });
  }

  /**
   * Select a card for swapping
   */
  selectCardForSwap(index, availableCards) {
    if (!this.state.swapMode) return;
    
    if (this.state.selectedCardIndex === null) {
      // First card selected
      this.state.selectedCardIndex = index;
      
      // Remove highlight from all cards
      availableCards.forEach(card => {
        card.classList.remove('swap-candidate');
        card.onclick = null;
      });
      
      // Add selected class to chosen card
      availableCards[index].classList.add('selected');
      
      // Only highlight adjacent cards that can be swapped
      if (index > 0) {
        availableCards[index - 1].classList.add('swap-adjacent');
        availableCards[index - 1].onclick = () => this.selectCardForSwap(index - 1, availableCards);
      }
      if (index < availableCards.length - 1) {
        availableCards[index + 1].classList.add('swap-adjacent');
        availableCards[index + 1].onclick = () => this.selectCardForSwap(index + 1, availableCards);
      }
      
      ui.showToast('Выберите соседнюю карту');
    } else {
      // Second card selected - try to swap
      const pos1 = this.state.selectedCardIndex;
      const pos2 = index;
      
      if (Math.abs(pos1 - pos2) === 1) {
        // Send positions as relative to remaining cards (0-indexed from current card)
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
      card.classList.remove('swap-candidate', 'selected', 'swap-adjacent');
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
    // Server sends remaining cards only
    this.state.sequence = data.sequence;
    this.state.swapsRemaining = data.swapsRemaining;
    
    // Render cards - all are remaining so no used cards
    ui.renderPlayerCards(this.state.sequence, 0);
    ui.updateSwaps(this.state.swapsRemaining);
    ui.updateSwapButtonState(this.state.swapsRemaining);
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
    
    // Track played cards
    ui.addOpponentPlayedCard(data.opponentCard);
    ui.addPlayerPlayedCard(data.yourCard);
    
    // Determine winner type
    let winner = null;
    if (!data.isDraw) {
      winner = data.youWon ? 'player' : 'opponent';
    }
    
    // Show battle cards
    ui.showBattleCards(data.yourCard, data.opponentCard, winner);
    ui.updateScores(data.yourScore, data.opponentScore);
    
    // Update cards display to show revealed/played cards
    ui.renderOpponentCards(6, data.round);
    ui.renderPlayerCards(this.state.sequence, 0, true);
    
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
   * Handle continue countdown from server
   */
  onContinueCountdown(data) {
    ui.updateContinueCountdown(data.remaining);
  }

  /**
   * Handle opponent pressed continue
   */
  onOpponentContinued() {
    ui.showOpponentContinued();
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
    this.state.sequence = data.upcomingCards || data.yourSequence;
    this.state.playerScore = data.yourScore;
    this.state.opponentScore = data.opponentScore;
    this.state.swapsRemaining = data.yourSwapsRemaining;
    this.state.opponentName = data.opponentName || this.state.opponentName;
    this.state.playerName = data.playerName || this.state.playerName;
    
    // Restore played cards from history
    ui.clearOpponentPlayedCards();
    ui.clearPlayerPlayedCards();
    if (data.roundHistory) {
      data.roundHistory.forEach(round => {
        // Find opponent's and player's cards
        Object.entries(round.cards).forEach(([playerId, card]) => {
          if (playerId === this.state.playerId) {
            ui.addPlayerPlayedCard(card);
          } else {
            ui.addOpponentPlayedCard(card);
          }
        });
      });
    }
    
    // Restore appropriate screen
    if (data.phase === 'sequence') {
      // Restore sequence screen
      ui.createSequenceSlots(6);
      if (data.hand) {
        ui.renderHandCards(data.hand);
        dragDrop.init(data.hand, (sequence) => this.onSequenceChange(sequence));
      }
      ui.showScreen('sequence');
    } else if (data.phase === 'swap' || data.phase === 'reveal' || data.phase === 'round_start' || data.phase === 'paused') {
      ui.setupGameScreen(this.state.playerName, this.state.opponentName);
      ui.updateRound(data.currentRound + 1);
      ui.updateScores(data.yourScore, data.opponentScore);
      ui.renderPlayerCards(this.state.sequence, 0, true);
      ui.renderOpponentCards(6, data.currentRound);
      ui.updateSwaps(this.state.swapsRemaining);
      ui.setActionsEnabled(this.state.swapsRemaining > 0 && data.phase === 'swap');
      ui.showScreen('game');
    }
    
    ui.showToast('Переподключение успешно');
  }

  /**
   * Handle error
   */
  onError(data) {
    ui.showToast(data.message);
    
    // If reconnection failed, clear session and show lobby
    if (data.message === 'Invalid reconnection attempt' || 
        data.message === 'Lobby no longer exists' ||
        data.message === 'Player not found') {
      socketHandler.clearSession();
      ui.clearRoomFromUrl();
      ui.showScreen('lobby');
    }
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

  /**
   * Check URL for room code and auto-join
   */
  checkUrlForRoom() {
    const roomCode = ui.getRoomFromUrl();
    if (roomCode && roomCode.length === 6) {
      ui.elements.lobbyCodeInput.value = roomCode;
      // Auto-join after a short delay to let player see what's happening
      setTimeout(() => {
        if (ui.getPlayerName()) {
          this.joinLobby();
        } else {
          ui.showToast(`Комната ${roomCode} - введите имя для подключения`);
        }
      }, 500);
    }
  }

  /**
   * Player pressed continue button after round result
   */
  continueRound() {
    socketHandler.socket.emit('continueRound');
    ui.setContinueButtonWaiting(true);
  }
}

// Global game manager
window.game = new GameManager();

