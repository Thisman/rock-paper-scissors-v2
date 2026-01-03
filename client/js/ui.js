/**
 * UI Manager - Handles DOM manipulation and screen transitions
 */
class UIManager {
  constructor() {
    this.screens = {
      lobby: document.getElementById('lobby-screen'),
      sequence: document.getElementById('sequence-screen'),
      game: document.getElementById('game-screen'),
      gameover: document.getElementById('gameover-screen')
    };
    
    this.elements = {
      // Lobby
      playerNameInput: document.getElementById('player-name'),
      createLobbyBtn: document.getElementById('create-lobby-btn'),
      lobbyCodeInput: document.getElementById('lobby-code'),
      joinLobbyBtn: document.getElementById('join-lobby-btn'),
      waitingSection: document.getElementById('waiting-section'),
      displayLobbyCode: document.getElementById('display-lobby-code'),
      copyCodeBtn: document.getElementById('copy-code-btn'),
      
      // Sequence
      sequenceSlots: document.getElementById('sequence-slots'),
      handCards: document.getElementById('hand-cards'),
      sequenceTimer: document.getElementById('sequence-timer'),
      confirmSequenceBtn: document.getElementById('confirm-sequence-btn'),
      
      // Game
      opponentName: document.getElementById('opponent-name'),
      opponentScore: document.getElementById('opponent-score'),
      opponentSwaps: document.getElementById('opponent-swaps'),
      playerNameDisplay: document.getElementById('player-name-display'),
      playerScore: document.getElementById('player-score'),
      playerSwaps: document.getElementById('player-swaps'),
      currentRound: document.getElementById('current-round'),
      gameTimer: document.getElementById('game-timer'),
      opponentCards: document.getElementById('opponent-cards'),
      playerCards: document.getElementById('player-cards'),
      opponentBattleCard: document.getElementById('opponent-battle-card'),
      playerBattleCard: document.getElementById('player-battle-card'),
      swapBtn: document.getElementById('swap-btn'),
      skipBtn: document.getElementById('skip-btn'),
      roundResult: document.getElementById('round-result'),
      resultTitle: document.getElementById('result-title'),
      resultMessage: document.getElementById('result-message'),
      
      // Game Over
      gameoverIcon: document.getElementById('gameover-icon'),
      gameoverTitle: document.getElementById('gameover-title'),
      gameoverScore: document.getElementById('gameover-score'),
      gameoverMessage: document.getElementById('gameover-message'),
      roundHistory: document.getElementById('round-history'),
      playAgainBtn: document.getElementById('play-again-btn'),
      
      // Overlay
      disconnectOverlay: document.getElementById('disconnect-overlay'),
      reconnectTimer: document.getElementById('reconnect-timer'),
      
      // Toast
      toast: document.getElementById('toast')
    };
    
    this.currentScreen = 'lobby';
    this.timerInterval = null;
  }

  /**
   * Switch to a different screen
   */
  showScreen(screenName) {
    Object.values(this.screens).forEach(screen => {
      screen.classList.remove('active');
    });
    
    if (this.screens[screenName]) {
      this.screens[screenName].classList.add('active');
      this.currentScreen = screenName;
    }
  }

  /**
   * Show waiting for opponent section
   */
  showWaiting(lobbyCode) {
    this.elements.waitingSection.classList.remove('hidden');
    this.elements.displayLobbyCode.textContent = lobbyCode;
    this.elements.createLobbyBtn.disabled = true;
    this.elements.joinLobbyBtn.disabled = true;
  }

  /**
   * Hide waiting section
   */
  hideWaiting() {
    this.elements.waitingSection.classList.add('hidden');
    this.elements.createLobbyBtn.disabled = false;
    this.elements.joinLobbyBtn.disabled = false;
  }

  /**
   * Get player name from input
   */
  getPlayerName() {
    return this.elements.playerNameInput.value.trim() || 'Player';
  }

  /**
   * Get lobby code from input
   */
  getLobbyCode() {
    return this.elements.lobbyCodeInput.value.trim().toUpperCase();
  }

  /**
   * Create sequence slots
   */
  createSequenceSlots(count) {
    this.elements.sequenceSlots.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const slot = document.createElement('div');
      slot.className = 'sequence-slot';
      slot.dataset.round = `Раунд ${i + 1}`;
      slot.dataset.index = i;
      this.elements.sequenceSlots.appendChild(slot);
    }
  }

  /**
   * Create card element
   */
  createCardElement(card, options = {}) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.type}`;
    cardEl.dataset.cardId = card.id;
    cardEl.dataset.type = card.type;
    
    if (options.simple) {
      cardEl.classList.add('card-simple');
      cardEl.innerHTML = `
        <span class="card-icon"></span>
        <span class="card-label">${this.getCardLabel(card.type)}</span>
      `;
    } else if (options.flippable) {
      cardEl.innerHTML = `
        <div class="card-inner">
          <div class="card-face back"></div>
          <div class="card-face card-front ${card.type}">
            <span class="card-icon"></span>
            <span class="card-label">${this.getCardLabel(card.type)}</span>
          </div>
        </div>
      `;
    } else {
      cardEl.innerHTML = `
        <span class="card-icon"></span>
        <span class="card-label">${this.getCardLabel(card.type)}</span>
      `;
      cardEl.classList.add('card-simple');
    }
    
    if (options.draggable) {
      cardEl.draggable = true;
      cardEl.classList.add('card-deal');
    }
    
    if (options.disabled) {
      cardEl.classList.add('disabled');
    }
    
    return cardEl;
  }

  /**
   * Get localized card label
   */
  getCardLabel(type) {
    const labels = {
      rock: 'Камень',
      scissors: 'Ножницы',
      paper: 'Бумага'
    };
    return labels[type] || type;
  }

  /**
   * Render hand cards
   */
  renderHandCards(cards) {
    this.elements.handCards.innerHTML = '';
    cards.forEach(card => {
      const cardEl = this.createCardElement(card, { simple: true, draggable: true });
      this.elements.handCards.appendChild(cardEl);
    });
  }

  /**
   * Enable/disable confirm button
   */
  setConfirmEnabled(enabled) {
    this.elements.confirmSequenceBtn.disabled = !enabled;
  }

  /**
   * Update timer display
   */
  updateTimer(elementId, seconds, maxSeconds) {
    const timerEl = document.getElementById(elementId);
    if (timerEl) {
      timerEl.textContent = seconds;
      
      // Update progress circle
      const container = timerEl.closest('.timer-container');
      if (container) {
        const progress = container.querySelector('.timer-progress');
        if (progress) {
          const offset = 283 * (1 - seconds / maxSeconds);
          progress.style.strokeDashoffset = offset;
        }
        
        // Add warning class if low time
        if (seconds <= 5) {
          container.classList.add('timer-warning');
        } else {
          container.classList.remove('timer-warning');
        }
      }
    }
  }

  /**
   * Set up game screen with player info
   */
  setupGameScreen(playerName, opponentName) {
    this.elements.playerNameDisplay.textContent = playerName;
    this.elements.opponentName.textContent = opponentName;
    this.elements.playerScore.textContent = '0';
    this.elements.opponentScore.textContent = '0';
  }

  /**
   * Render player cards in game view
   */
  renderPlayerCards(cards, currentRound = 0) {
    this.elements.playerCards.innerHTML = '';
    cards.forEach((card, index) => {
      const cardEl = this.createCardElement(card, { simple: true });
      if (index < currentRound) {
        cardEl.classList.add('used');
      }
      if (index === currentRound) {
        cardEl.classList.add('current');
      }
      cardEl.dataset.index = index;
      this.elements.playerCards.appendChild(cardEl);
    });
  }

  /**
   * Render opponent cards (face down)
   */
  renderOpponentCards(count, currentRound = 0) {
    this.elements.opponentCards.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const cardEl = document.createElement('div');
      cardEl.className = 'card card-back';
      if (i < currentRound) {
        cardEl.classList.add('used');
      }
      this.elements.opponentCards.appendChild(cardEl);
    }
  }

  /**
   * Update scores
   */
  updateScores(playerScore, opponentScore) {
    this.elements.playerScore.textContent = playerScore;
    this.elements.opponentScore.textContent = opponentScore;
    
    this.elements.playerScore.classList.add('score-change');
    this.elements.opponentScore.classList.add('score-change');
    
    setTimeout(() => {
      this.elements.playerScore.classList.remove('score-change');
      this.elements.opponentScore.classList.remove('score-change');
    }, 300);
  }

  /**
   * Update round display
   */
  updateRound(round) {
    this.elements.currentRound.textContent = round;
  }

  /**
   * Update swaps remaining
   */
  updateSwaps(playerSwaps, opponentSwaps = null) {
    const swapIcons = '⚡'.repeat(playerSwaps) + '○'.repeat(3 - playerSwaps);
    this.elements.playerSwaps.textContent = swapIcons;
    
    if (opponentSwaps !== null) {
      const oppSwapIcons = '⚡'.repeat(opponentSwaps) + '○'.repeat(3 - opponentSwaps);
      this.elements.opponentSwaps.textContent = oppSwapIcons;
    }
  }

  /**
   * Enable/disable action buttons
   */
  setActionsEnabled(enabled) {
    this.elements.swapBtn.disabled = !enabled;
    this.elements.skipBtn.disabled = !enabled;
  }

  /**
   * Show battle cards
   */
  showBattleCards(playerCard, opponentCard, winner) {
    // Player card
    this.elements.playerBattleCard.innerHTML = '';
    const playerCardEl = this.createCardElement(playerCard, { simple: true });
    playerCardEl.classList.add('battle-card');
    if (winner === 'player') playerCardEl.classList.add('winner');
    if (winner === 'opponent') playerCardEl.classList.add('loser');
    this.elements.playerBattleCard.appendChild(playerCardEl);
    
    // Opponent card
    this.elements.opponentBattleCard.innerHTML = '';
    const opponentCardEl = this.createCardElement(opponentCard, { simple: true });
    opponentCardEl.classList.add('battle-card');
    if (winner === 'opponent') opponentCardEl.classList.add('winner');
    if (winner === 'player') opponentCardEl.classList.add('loser');
    this.elements.opponentBattleCard.appendChild(opponentCardEl);
  }

  /**
   * Reset battle cards
   */
  resetBattleCards() {
    this.elements.playerBattleCard.innerHTML = '<div class="card card-back"></div>';
    this.elements.opponentBattleCard.innerHTML = '<div class="card card-back"></div>';
  }

  /**
   * Show round result overlay
   */
  showRoundResult(title, message, type = 'draw') {
    this.elements.resultTitle.textContent = title;
    this.elements.resultTitle.className = `result-${type}`;
    this.elements.resultMessage.textContent = message;
    this.elements.roundResult.classList.remove('hidden');
    
    setTimeout(() => {
      this.elements.roundResult.classList.add('hidden');
    }, 2500);
  }

  /**
   * Show game over screen
   */
  showGameOver(data) {
    if (data.youWon) {
      this.elements.gameoverIcon.textContent = '🏆';
      this.elements.gameoverTitle.textContent = 'Победа!';
      this.elements.gameoverTitle.style.color = 'var(--accent-secondary)';
    } else if (data.isDraw) {
      this.elements.gameoverIcon.textContent = '🤝';
      this.elements.gameoverTitle.textContent = 'Ничья!';
      this.elements.gameoverTitle.style.color = 'var(--accent-warning)';
    } else {
      this.elements.gameoverIcon.textContent = '😢';
      this.elements.gameoverTitle.textContent = 'Поражение';
      this.elements.gameoverTitle.style.color = 'var(--card-rock)';
    }
    
    this.elements.gameoverScore.textContent = `${data.yourFinalScore} : ${data.opponentFinalScore}`;
    
    if (data.byDisconnect) {
      this.elements.gameoverMessage.textContent = data.message;
    } else {
      this.elements.gameoverMessage.textContent = data.youWon 
        ? 'Поздравляем с победой!' 
        : data.isDraw 
          ? 'Отличная игра!' 
          : 'Повезёт в следующий раз!';
    }
    
    // Render round history
    this.renderRoundHistory(data.roundHistory, data);
    
    this.showScreen('gameover');
  }

  /**
   * Render round history in game over screen
   */
  renderRoundHistory(history, gameData) {
    this.elements.roundHistory.innerHTML = '';
    
    if (!history) return;
    
    history.forEach((round, index) => {
      const item = document.createElement('div');
      item.className = 'round-history-item';
      
      const myCard = round.cards[socketHandler.playerId];
      if (round.isDraw) {
        item.classList.add('draw');
        item.textContent = '=';
      } else if (round.winner === socketHandler.playerId) {
        item.classList.add('win');
        item.textContent = '✓';
      } else {
        item.classList.add('lose');
        item.textContent = '✗';
      }
      
      item.title = `Раунд ${index + 1}: ${this.getCardLabel(myCard?.type || 'unknown')}`;
      
      this.elements.roundHistory.appendChild(item);
    });
  }

  /**
   * Show disconnect overlay
   */
  showDisconnectOverlay(timeout) {
    this.elements.disconnectOverlay.classList.remove('hidden');
    this.startReconnectTimer(timeout);
  }

  /**
   * Hide disconnect overlay
   */
  hideDisconnectOverlay() {
    this.elements.disconnectOverlay.classList.add('hidden');
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
  }

  /**
   * Start reconnect timer countdown
   */
  startReconnectTimer(seconds) {
    this.elements.reconnectTimer.textContent = seconds;
    
    this.reconnectInterval = setInterval(() => {
      seconds--;
      this.elements.reconnectTimer.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(this.reconnectInterval);
      }
    }, 1000);
  }

  /**
   * Show toast notification
   */
  showToast(message, duration = 3000) {
    this.elements.toast.textContent = message;
    this.elements.toast.classList.remove('hidden');
    this.elements.toast.classList.add('visible');
    
    setTimeout(() => {
      this.elements.toast.classList.remove('visible');
    }, duration);
  }

  /**
   * Copy lobby code to clipboard
   */
  async copyLobbyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      this.showToast('Код скопирован!');
    } catch (err) {
      this.showToast('Не удалось скопировать');
    }
  }

  /**
   * Reset UI to initial state
   */
  reset() {
    this.hideWaiting();
    this.elements.playerNameInput.value = '';
    this.elements.lobbyCodeInput.value = '';
    this.elements.sequenceSlots.innerHTML = '';
    this.elements.handCards.innerHTML = '';
    this.resetBattleCards();
    this.showScreen('lobby');
  }
}

// Global UI manager
window.ui = new UIManager();

