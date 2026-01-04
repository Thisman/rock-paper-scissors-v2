/**
 * Game configuration constants
 * Centralized location for all magic numbers and game settings
 */

const GAME_CONFIG = {
  // Player limits
  MAX_PLAYERS: 2,
  
  // Card/Round settings
  TOTAL_ROUNDS: 6,
  CARDS_PER_PLAYER: 6,
  CARDS_IN_FULL_DECK: 9,
  CARDS_PER_TYPE: 3,
  
  // Swap limits
  MAX_SWAPS_PER_GAME: 3,
  MAX_SWAPS_PER_ROUND: 1,
  
  // Timer durations (in seconds)
  TIMERS: {
    PREVIEW: 30,      // Time to view cards before arrangement
    SEQUENCE: 60,     // Time to set card sequence
    SWAP: 20,         // Time for swap decision each round
    CONTINUE: 5,      // Time before next round auto-starts
    RECONNECT: 120,   // Time to reconnect after disconnect
    DISCONNECT_NOTIFY_DELAY: 2  // Delay before notifying opponent of disconnect
  },
  
  // Delays (in milliseconds)
  DELAYS: {
    ROUND_START_AFTER_RESUME: 100  // Delay before starting round after resume
  }
};

/**
 * Game phases enum
 */
const GamePhase = {
  WAITING: 'waiting',
  PREVIEW: 'preview',
  SEQUENCE: 'sequence',
  ROUND_START: 'round_start',
  SWAP: 'swap',
  REVEAL: 'reveal',
  GAME_OVER: 'game_over',
  PAUSED: 'paused'
};

/**
 * Lobby ID character set (excludes ambiguous characters like 0/O, 1/I/L)
 */
const LOBBY_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOBBY_ID_LENGTH = 6;

/**
 * Player name constraints
 */
const PLAYER_NAME = {
  MAX_LENGTH: 20,
  DEFAULT_PLAYER_1: 'Player 1',
  DEFAULT_PLAYER_2: 'Player 2'
};

module.exports = {
  GAME_CONFIG,
  GamePhase,
  LOBBY_ID_CHARS,
  LOBBY_ID_LENGTH,
  PLAYER_NAME
};

