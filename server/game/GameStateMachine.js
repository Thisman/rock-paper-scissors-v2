const { GamePhase } = require('./constants');

/**
 * GameStateMachine - Manages game phase transitions
 * Provides clean pause/resume logic without scattered boolean flags
 */
class GameStateMachine {
  constructor(initialPhase = GamePhase.WAITING) {
    this.phase = initialPhase;
    this.savedPhase = null;
    this._isPaused = false;
    this.pendingAction = null; // For deferred actions after resume
  }

  /**
   * Get current phase
   * @returns {string} Current phase
   */
  getPhase() {
    return this.phase;
  }

  /**
   * Get the actual phase (saved phase if paused)
   * @returns {string} Actual phase ignoring pause state
   */
  getActualPhase() {
    return this._isPaused && this.savedPhase ? this.savedPhase : this.phase;
  }

  /**
   * Check if currently in a specific phase
   * @param {string} phase - Phase to check
   * @returns {boolean} True if in that phase
   */
  is(phase) {
    return this.phase === phase;
  }

  /**
   * Check if actual phase (ignoring pause) is a specific phase
   * @param {string} phase - Phase to check
   * @returns {boolean} True if actual phase matches
   */
  actuallyIs(phase) {
    return this.getActualPhase() === phase;
  }

  /**
   * Check if game is paused
   * @returns {boolean} True if paused
   */
  isPaused() {
    return this._isPaused;
  }

  /**
   * Check if game is over
   * @returns {boolean} True if game is over
   */
  isGameOver() {
    return this.phase === GamePhase.GAME_OVER;
  }

  /**
   * Transition to a new phase
   * @param {string} newPhase - New phase to transition to
   * @throws {Error} If trying to transition while paused
   * @returns {boolean} True if transition succeeded
   */
  transition(newPhase) {
    if (this._isPaused) {
      throw new Error(`Cannot transition to ${newPhase} while game is paused`);
    }
    
    if (this.phase === GamePhase.GAME_OVER && newPhase !== GamePhase.GAME_OVER) {
      throw new Error('Cannot transition out of GAME_OVER phase');
    }

    this.phase = newPhase;
    return true;
  }

  /**
   * Pause the game
   * @returns {boolean} True if pause succeeded, false if already paused or game over
   */
  pause() {
    if (this._isPaused || this.phase === GamePhase.GAME_OVER) {
      return false;
    }

    this.savedPhase = this.phase;
    this.phase = GamePhase.PAUSED;
    this._isPaused = true;
    return true;
  }

  /**
   * Resume the game
   * @returns {boolean} True if resume succeeded, false if not paused
   */
  resume() {
    if (!this._isPaused || this.phase !== GamePhase.PAUSED) {
      return false;
    }

    this.phase = this.savedPhase;
    this.savedPhase = null;
    this._isPaused = false;
    return true;
  }

  /**
   * Set a pending action to be executed after resume
   * @param {string} action - Action identifier
   */
  setPendingAction(action) {
    this.pendingAction = action;
  }

  /**
   * Get and clear pending action
   * @returns {string|null} Pending action or null
   */
  consumePendingAction() {
    const action = this.pendingAction;
    this.pendingAction = null;
    return action;
  }

  /**
   * Check if there's a pending action
   * @returns {boolean} True if there's a pending action
   */
  hasPendingAction() {
    return this.pendingAction !== null;
  }

  /**
   * End the game
   */
  endGame() {
    if (this._isPaused) {
      this._isPaused = false;
      this.savedPhase = null;
    }
    this.phase = GamePhase.GAME_OVER;
  }

  /**
   * Reset state machine
   * @param {string} initialPhase - Initial phase for reset
   */
  reset(initialPhase = GamePhase.WAITING) {
    this.phase = initialPhase;
    this.savedPhase = null;
    this._isPaused = false;
    this.pendingAction = null;
  }

  /**
   * Get state for serialization (e.g., for reconnection)
   * @returns {Object} Serializable state
   */
  getState() {
    return {
      phase: this.getActualPhase(),
      isPaused: this._isPaused,
      pendingAction: this.pendingAction
    };
  }
}

module.exports = GameStateMachine;

