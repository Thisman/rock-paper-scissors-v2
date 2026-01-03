class Player {
  constructor(id, socketId, name) {
    this.id = id;
    this.socketId = socketId;
    this.name = name;
    this.hand = []; // Cards dealt to player (6 cards)
    this.sequence = []; // Player's chosen sequence
    this.sequenceSet = false;
    this.swapsUsed = 0;
    this.swappedThisRound = false;
    this.score = 0;
    this.disconnected = false;
    this.disconnectedAt = null;
    this.ready = false; // For swap phase readiness
  }

  /**
   * Set the player's card sequence
   */
  setSequence(sequence) {
    if (this.sequenceSet) return false;
    
    // Filter out null values and validate
    const validSequence = sequence.filter(c => c !== null && c !== undefined);
    
    // Validate that sequence contains exactly the cards in hand
    if (validSequence.length !== this.hand.length) return false;
    
    const handSet = new Set(this.hand.map(c => c.id));
    const seqSet = new Set(validSequence.map(c => c.id));
    
    if (handSet.size !== seqSet.size) return false;
    for (const id of handSet) {
      if (!seqSet.has(id)) return false;
    }
    
    this.sequence = validSequence;
    this.sequenceSet = true;
    return true;
  }

  /**
   * Perform a swap of adjacent cards
   */
  swapCards(pos1, pos2) {
    // Check if swap is valid
    if (this.swapsUsed >= 3) return false;
    if (this.swappedThisRound) return false;
    if (Math.abs(pos1 - pos2) !== 1) return false;
    if (pos1 < 0 || pos2 < 0 || pos1 >= this.sequence.length || pos2 >= this.sequence.length) {
      return false;
    }
    
    // Perform swap
    const temp = this.sequence[pos1];
    this.sequence[pos1] = this.sequence[pos2];
    this.sequence[pos2] = temp;
    
    this.swapsUsed++;
    this.swappedThisRound = true;
    return true;
  }

  /**
   * Reset round-specific flags
   */
  resetRound() {
    this.swappedThisRound = false;
    this.ready = false;
  }

  /**
   * Add points to player's score
   */
  addScore(points) {
    this.score += points;
  }

  /**
   * Get current card for a round
   */
  getCardForRound(roundIndex) {
    return this.sequence[roundIndex] || null;
  }

  /**
   * Get state that can be shared with this player
   */
  getState() {
    return {
      id: this.id,
      name: this.name,
      score: this.score,
      swapsUsed: this.swapsUsed,
      swapsRemaining: 3 - this.swapsUsed,
      sequenceSet: this.sequenceSet
    };
  }
}

module.exports = Player;

