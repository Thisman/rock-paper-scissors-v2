/**
 * Application Entry Point
 * Initializes all components and binds UI events
 */
(function() {
  'use strict';

  /**
   * Initialize the application
   */
  function init() {
    // Connect to server
    socketHandler.connect();
    
    // Initialize game manager
    game.init();
    
    // Bind UI events
    bindEvents();
    
    // Handle connection events for loading screen
    socketHandler.on('connected', () => {
      ui.hideLoadingScreen();
      // Show lobby screen if not reconnecting
      if (game.state.phase === 'lobby') {
        ui.showScreen('lobby');
      }
      // Check URL for room code after connection
      game.checkUrlForRoom();
    });
    
    // Load and display saved user ID
    const savedId = ui.loadSavedUserId();
    if (savedId) {
      ui.showUserId(savedId);
    }
    
    console.log('Rock-Paper-Scissors Online initialized');
  }

  /**
   * Bind UI event handlers
   */
  function bindEvents() {
    // Lobby events
    ui.elements.createLobbyBtn.addEventListener('click', () => {
      game.createLobby();
    });

    ui.elements.joinLobbyBtn.addEventListener('click', () => {
      game.joinLobby();
    });

    ui.elements.copyCodeBtn.addEventListener('click', () => {
      ui.copyLobbyLink();
    });

    // Click on share link input also copies
    ui.elements.shareLink.addEventListener('click', () => {
      ui.copyLobbyLink();
    });

    // Leave lobby button
    ui.elements.leaveLobbyBtn.addEventListener('click', () => {
      game.leaveLobby();
    });

    // Leave game button (during disconnect)
    ui.elements.leaveGameBtn.addEventListener('click', () => {
      game.leaveLobby();
    });

    // Enter key support for inputs
    ui.elements.playerNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        ui.elements.createLobbyBtn.click();
      }
    });

    ui.elements.lobbyCodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        game.joinLobby();
      }
    });

    // Auto-uppercase lobby code
    ui.elements.lobbyCodeInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });

    // Preview ready button
    ui.elements.previewReadyBtn.addEventListener('click', () => {
      game.previewReady();
    });

    // Sequence confirmation
    ui.elements.confirmSequenceBtn.addEventListener('click', () => {
      game.confirmSequence();
    });

    // Game actions
    ui.elements.swapBtn.addEventListener('click', () => {
      game.enterSwapMode();
    });

    ui.elements.skipBtn.addEventListener('click', () => {
      game.skipSwap();
    });

    // Continue button after round result
    ui.elements.continueBtn.addEventListener('click', () => {
      game.continueRound();
    });

    // Play again
    ui.elements.playAgainBtn.addEventListener('click', () => {
      game.playAgain();
    });

    // Theme toggle
    ui.elements.themeToggle.addEventListener('click', () => {
      ui.toggleTheme();
    });

    // Handle visibility change for reconnection
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !socketHandler.connected) {
        socketHandler.connect();
      }
    });

    // Prevent context menu on cards (for mobile)
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.card')) {
        e.preventDefault();
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

