const { CardType } = require('./Deck');

/**
 * Determine the winner of a round
 * @param {object} card1 - First player's card
 * @param {object} card2 - Second player's card
 * @returns {number} 1 if player1 wins, 2 if player2 wins, 0 if draw
 */
function determineWinner(card1, card2) {
  if (card1.type === card2.type) {
    return 0; // Draw
  }
  
  // Rock beats Scissors
  // Scissors beats Paper
  // Paper beats Rock
  const wins = {
    [CardType.ROCK]: CardType.SCISSORS,
    [CardType.SCISSORS]: CardType.PAPER,
    [CardType.PAPER]: CardType.ROCK
  };
  
  if (wins[card1.type] === card2.type) {
    return 1; // Player 1 wins
  }
  
  return 2; // Player 2 wins
}

/**
 * Get the name of what beats what
 */
function getWinExplanation(winnerType, loserType) {
  const explanations = {
    [`${CardType.ROCK}-${CardType.SCISSORS}`]: 'Камень бьёт Ножницы',
    [`${CardType.SCISSORS}-${CardType.PAPER}`]: 'Ножницы режут Бумагу',
    [`${CardType.PAPER}-${CardType.ROCK}`]: 'Бумага покрывает Камень'
  };
  
  return explanations[`${winnerType}-${loserType}`] || '';
}

/**
 * Determine the final game winner
 * @param {object} player1 - First player
 * @param {object} player2 - Second player
 * @returns {object} Result object with winner info
 */
function determineGameWinner(player1, player2) {
  if (player1.score > player2.score) {
    return {
      winner: player1.id,
      winnerName: player1.name,
      loserName: player2.name,
      score: `${player1.score}:${player2.score}`,
      isDraw: false
    };
  } else if (player2.score > player1.score) {
    return {
      winner: player2.id,
      winnerName: player2.name,
      loserName: player1.name,
      score: `${player2.score}:${player1.score}`,
      isDraw: false
    };
  } else {
    return {
      winner: null,
      winnerName: null,
      loserName: null,
      score: `${player1.score}:${player2.score}`,
      isDraw: true
    };
  }
}

module.exports = {
  determineWinner,
  getWinExplanation,
  determineGameWinner
};

