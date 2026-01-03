/**
 * Card types representing Rock, Paper, Scissors
 */
const CardType = {
  ROCK: 'rock',      // Red
  SCISSORS: 'scissors', // Green
  PAPER: 'paper'     // Blue
};

const CardColors = {
  [CardType.ROCK]: 'red',
  [CardType.SCISSORS]: 'green',
  [CardType.PAPER]: 'blue'
};

class Deck {
  /**
   * Create a full deck of 9 cards (3 of each type)
   */
  static createFullDeck() {
    const deck = [];
    let cardId = 0;
    
    for (const type of Object.values(CardType)) {
      for (let i = 0; i < 3; i++) {
        deck.push({
          id: `${type}-${cardId++}`,
          type: type,
          color: CardColors[type],
          index: i
        });
      }
    }
    
    return deck;
  }

  /**
   * Shuffle an array using Fisher-Yates algorithm
   */
  static shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Deal 6 random cards from a deck of 9
   */
  static deal() {
    const fullDeck = this.createFullDeck();
    const shuffled = this.shuffle(fullDeck);
    return shuffled.slice(0, 6);
  }
}

module.exports = { Deck, CardType, CardColors };

