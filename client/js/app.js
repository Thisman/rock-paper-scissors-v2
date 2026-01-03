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
      const code = ui.elements.displayLobbyCode.textContent;
      ui.copyLobbyCode(code);
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

    // Play again
    ui.elements.playAgainBtn.addEventListener('click', () => {
      game.playAgain();
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

