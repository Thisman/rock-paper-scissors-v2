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
      resultWaitText: document.getElementById('result-wait-text'),
      resultCountdown: document.getElementById('result-countdown'),
      continueBtn: document.getElementById('continue-btn'),
      
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
      toast: document.getElementById('toast'),
      
      // Theme
      themeToggle: document.getElementById('theme-toggle'),
      themeIcon: document.querySelector('.theme-icon'),
      
      // Share link
      shareLink: document.getElementById('share-link')
    };
    
    this.currentScreen = 'lobby';
    this.timerInterval = null;
    this.opponentPlayedCards = []; // Track revealed opponent cards
    this.playerPlayedCards = []; // Track player's played cards
    
    // Initialize theme
    this.initTheme();
  }

  /**
   * Initialize theme from localStorage or system preference
   */
  initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      this.setTheme(savedTheme);
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.setTheme(prefersDark ? 'dark' : 'light');
    }
  }

  /**
   * Toggle between light and dark theme
   */
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  /**
   * Set the theme
   */
  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    if (this.elements.themeIcon) {
      this.elements.themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }
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
    
    // Update URL with room code
    this.updateUrlWithRoom(lobbyCode);
    
    // Set share link
    const url = new URL(window.location.origin);
    url.searchParams.set('room', lobbyCode);
    this.elements.shareLink.value = url.toString();
  }

  /**
   * Update URL with room ID for sharing
   */
  updateUrlWithRoom(roomId) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    window.history.replaceState({}, '', url);
  }

  /**
   * Get room ID from URL
   */
  getRoomFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get('room');
  }

  /**
   * Clear room from URL
   */
  clearRoomFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
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
      // Always show integer
      const displaySeconds = Math.ceil(seconds);
      timerEl.textContent = displaySeconds;
      
      // Update progress circle
      const container = timerEl.closest('.timer-container');
      if (container) {
        const progress = container.querySelector('.timer-progress');
        if (progress) {
          const offset = 283 * (1 - displaySeconds / maxSeconds);
          progress.style.strokeDashoffset = offset;
        }
        
        // Add warning class if low time
        if (displaySeconds <= 5) {
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
   * Render player cards in game view (includes played cards)
   */
  renderPlayerCards(cards, currentRound = 0, showPlayed = true) {
    this.elements.playerCards.innerHTML = '';
    
    // First render played cards if showPlayed is true
    if (showPlayed && this.playerPlayedCards.length > 0) {
      this.playerPlayedCards.forEach((card, index) => {
        const cardEl = this.createCardElement(card, { simple: true });
        cardEl.classList.add('used');
        cardEl.dataset.index = index;
        this.elements.playerCards.appendChild(cardEl);
      });
    }
    
    // Then render remaining cards
    const startIndex = showPlayed ? this.playerPlayedCards.length : 0;
    cards.forEach((card, index) => {
      const cardEl = this.createCardElement(card, { simple: true });
      if (index === 0 && showPlayed) {
        cardEl.classList.add('current');
      }
      cardEl.dataset.index = startIndex + index;
      this.elements.playerCards.appendChild(cardEl);
    });
  }

  /**
   * Add player's played card
   */
  addPlayerPlayedCard(card) {
    this.playerPlayedCards.push(card);
  }

  /**
   * Clear player's played cards
   */
  clearPlayerPlayedCards() {
    this.playerPlayedCards = [];
  }

  /**
   * Render opponent cards (face down, with revealed cards showing)
   */
  renderOpponentCards(count, currentRound = 0, playedCards = []) {
    this.elements.opponentCards.innerHTML = '';
    
    // Use stored played cards if not provided
    const revealedCards = playedCards.length > 0 ? playedCards : this.opponentPlayedCards;
    
    for (let i = 0; i < count; i++) {
      let cardEl;
      
      if (i < revealedCards.length && revealedCards[i]) {
        // Show revealed card
        cardEl = this.createCardElement(revealedCards[i], { simple: true });
        cardEl.classList.add('revealed', 'used');
      } else {
        // Show card back
        cardEl = document.createElement('div');
        cardEl.className = 'card card-back';
        if (i < currentRound) {
          cardEl.classList.add('used');
        }
      }
      
      this.elements.opponentCards.appendChild(cardEl);
    }
  }

  /**
   * Add opponent's played card to revealed list
   */
  addOpponentPlayedCard(card) {
    this.opponentPlayedCards.push(card);
  }

  /**
   * Clear opponent's played cards
   */
  clearOpponentPlayedCards() {
    this.opponentPlayedCards = [];
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
   * Update swap button state based on remaining swaps
   */
  updateSwapButtonState(swapsRemaining) {
    if (swapsRemaining <= 0) {
      this.elements.swapBtn.disabled = true;
      this.elements.swapBtn.classList.add('btn-disabled');
    } else {
      this.elements.swapBtn.classList.remove('btn-disabled');
    }
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
   * Show round result overlay with continue button
   */
  showRoundResult(title, message, type = 'draw') {
    this.elements.resultTitle.textContent = title;
    this.elements.resultTitle.className = `result-${type}`;
    this.elements.resultMessage.textContent = message;
    this.elements.resultCountdown.textContent = '5';
    this.elements.continueBtn.classList.remove('waiting');
    this.elements.continueBtn.textContent = 'Продолжить';
    this.elements.resultWaitText.textContent = 'Ожидание соперника... 5с';
    this.elements.roundResult.classList.remove('hidden');
    
    // Don't auto-hide - server will trigger next round
  }

  /**
   * Hide round result overlay
   */
  hideRoundResult() {
    this.elements.roundResult.classList.add('hidden');
  }

  /**
   * Update continue countdown
   */
  updateContinueCountdown(seconds) {
    this.elements.resultCountdown.textContent = seconds;
    const text = this.elements.resultWaitText.textContent;
    // Keep the "Ожидание соперника..." or "Соперник готов!" part
    if (text.includes('Соперник готов')) {
      this.elements.resultWaitText.innerHTML = `Соперник готов! <span id="result-countdown">${seconds}</span>с`;
    } else {
      this.elements.resultWaitText.innerHTML = `Ожидание соперника... <span id="result-countdown">${seconds}</span>с`;
    }
  }

  /**
   * Show that opponent has pressed continue
   */
  showOpponentContinued() {
    this.elements.resultWaitText.innerHTML = `Соперник готов! <span id="result-countdown">${this.elements.resultCountdown.textContent}</span>с`;
  }

  /**
   * Set continue button to waiting state
   */
  setContinueButtonWaiting(waiting) {
    if (waiting) {
      this.elements.continueBtn.classList.add('waiting');
      this.elements.continueBtn.textContent = 'Ожидание...';
    } else {
      this.elements.continueBtn.classList.remove('waiting');
      this.elements.continueBtn.textContent = 'Продолжить';
    }
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
    
    // Render round history with explicit player ID
    this.renderRoundHistory(data.roundHistory, data, game.state.playerId);
    
    this.showScreen('gameover');
  }

  /**
   * Render round history in game over screen
   */
  renderRoundHistory(history, gameData, playerId) {
    this.elements.roundHistory.innerHTML = '';
    
    if (!history) return;
    
    // Use the passed playerId or fallback to game state
    const myPlayerId = playerId || game.state.playerId || socketHandler.playerId;
    
    history.forEach((round, index) => {
      const item = document.createElement('div');
      item.className = 'round-history-item';
      
      const myCard = round.cards[myPlayerId];
      if (round.isDraw) {
        item.classList.add('draw');
        item.textContent = '=';
      } else if (round.winner === myPlayerId) {
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
   * Copy lobby link to clipboard
   */
  async copyLobbyLink() {
    try {
      const linkText = this.elements.shareLink.value;
      await navigator.clipboard.writeText(linkText);
      this.showToast('Ссылка скопирована!');
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
    this.clearOpponentPlayedCards();
    this.clearPlayerPlayedCards();
    this.clearRoomFromUrl();
    this.showScreen('lobby');
  }
}

// Global UI manager
window.ui = new UIManager();

