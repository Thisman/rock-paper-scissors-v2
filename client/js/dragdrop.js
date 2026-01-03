/**
 * Drag and Drop Manager
 * Handles card dragging for sequence setup
 */
class DragDropManager {
  constructor() {
    this.draggedElement = null;
    this.draggedCard = null;
    this.slots = [];
    this.sequence = [];
    this.onSequenceChange = null;
  }

  /**
   * Initialize drag and drop for sequence setup
   */
  init(cards, onSequenceChange) {
    this.sequence = new Array(6).fill(null);
    this.onSequenceChange = onSequenceChange;
    
    this.setupSlots();
    this.setupCards();
  }

  /**
   * Set up drop zones (sequence slots)
   */
  setupSlots() {
    const slots = document.querySelectorAll('.sequence-slot');
    this.slots = Array.from(slots);
    
    slots.forEach((slot, index) => {
      slot.addEventListener('dragover', (e) => this.handleDragOver(e, slot));
      slot.addEventListener('dragleave', (e) => this.handleDragLeave(e, slot));
      slot.addEventListener('drop', (e) => this.handleDrop(e, slot, index));
    });
  }

  /**
   * Set up draggable cards
   */
  setupCards() {
    const cards = document.querySelectorAll('#hand-cards .card');
    
    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => this.handleDragStart(e, card));
      card.addEventListener('dragend', (e) => this.handleDragEnd(e, card));
      
      // Touch support
      card.addEventListener('touchstart', (e) => this.handleTouchStart(e, card), { passive: false });
      card.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
      card.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    });

    // Also make cards in slots draggable
    const slotCards = document.querySelectorAll('.sequence-slot .card');
    slotCards.forEach(card => {
      this.makeCardDraggable(card);
    });
  }

  /**
   * Make a card element draggable
   */
  makeCardDraggable(card) {
    card.draggable = true;
    card.addEventListener('dragstart', (e) => this.handleDragStart(e, card));
    card.addEventListener('dragend', (e) => this.handleDragEnd(e, card));
    
    // Touch support
    card.addEventListener('touchstart', (e) => this.handleTouchStart(e, card), { passive: false });
    card.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    card.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
  }

  /**
   * Handle drag start
   */
  handleDragStart(e, card) {
    this.draggedElement = card;
    this.draggedCard = {
      id: card.dataset.cardId,
      type: card.dataset.type
    };
    
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.cardId);
    
    // Find if card is in a slot
    const parentSlot = card.closest('.sequence-slot');
    if (parentSlot) {
      const slotIndex = parseInt(parentSlot.dataset.index);
      this.sequence[slotIndex] = null;
      parentSlot.classList.remove('filled');
    }
  }

  /**
   * Handle drag end
   */
  handleDragEnd(e, card) {
    card.classList.remove('dragging');
    this.slots.forEach(slot => slot.classList.remove('drag-over'));
    
    // If card wasn't dropped in a slot, return it to hand
    if (!card.closest('.sequence-slot')) {
      const handCards = document.getElementById('hand-cards');
      if (!handCards.contains(card)) {
        handCards.appendChild(card);
      }
    }
    
    this.draggedElement = null;
    this.draggedCard = null;
  }

  /**
   * Handle drag over slot
   */
  handleDragOver(e, slot) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    slot.classList.add('drag-over');
  }

  /**
   * Handle drag leave slot
   */
  handleDragLeave(e, slot) {
    slot.classList.remove('drag-over');
  }

  /**
   * Handle drop on slot
   */
  handleDrop(e, slot, index) {
    e.preventDefault();
    slot.classList.remove('drag-over');
    
    if (!this.draggedElement) return;
    
    // Check if slot already has a card
    const existingCard = slot.querySelector('.card');
    if (existingCard && existingCard !== this.draggedElement) {
      // Move existing card back to hand
      const handCards = document.getElementById('hand-cards');
      handCards.appendChild(existingCard);
      this.makeCardDraggable(existingCard);
    }
    
    // Place dragged card in slot
    slot.appendChild(this.draggedElement);
    slot.classList.add('filled');
    this.sequence[index] = this.draggedCard;
    
    this.makeCardDraggable(this.draggedElement);
    
    // Notify about sequence change
    if (this.onSequenceChange) {
      this.onSequenceChange(this.sequence);
    }
  }

  // Touch support for mobile devices
  
  handleTouchStart(e, card) {
    this.draggedElement = card;
    this.draggedCard = {
      id: card.dataset.cardId,
      type: card.dataset.type
    };
    
    card.classList.add('dragging');
    
    // Find if card is in a slot
    const parentSlot = card.closest('.sequence-slot');
    if (parentSlot) {
      const slotIndex = parseInt(parentSlot.dataset.index);
      this.sequence[slotIndex] = null;
      parentSlot.classList.remove('filled');
    }
    
    // Store initial touch position
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.initialCardRect = card.getBoundingClientRect();
  }

  handleTouchMove(e) {
    if (!this.draggedElement) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;
    
    this.draggedElement.style.position = 'fixed';
    this.draggedElement.style.left = `${this.initialCardRect.left + deltaX}px`;
    this.draggedElement.style.top = `${this.initialCardRect.top + deltaY}px`;
    this.draggedElement.style.zIndex = '1000';
    
    // Check which slot we're over
    this.slots.forEach(slot => {
      const rect = slot.getBoundingClientRect();
      if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
          touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        slot.classList.add('drag-over');
      } else {
        slot.classList.remove('drag-over');
      }
    });
  }

  handleTouchEnd(e) {
    if (!this.draggedElement) return;
    
    // Reset position styles
    this.draggedElement.style.position = '';
    this.draggedElement.style.left = '';
    this.draggedElement.style.top = '';
    this.draggedElement.style.zIndex = '';
    this.draggedElement.classList.remove('dragging');
    
    // Find the slot we dropped on
    const touch = e.changedTouches[0];
    let droppedSlot = null;
    let droppedIndex = -1;
    
    this.slots.forEach((slot, index) => {
      slot.classList.remove('drag-over');
      const rect = slot.getBoundingClientRect();
      if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
          touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        droppedSlot = slot;
        droppedIndex = index;
      }
    });
    
    if (droppedSlot) {
      // Check if slot already has a card
      const existingCard = droppedSlot.querySelector('.card');
      if (existingCard && existingCard !== this.draggedElement) {
        const handCards = document.getElementById('hand-cards');
        handCards.appendChild(existingCard);
        this.makeCardDraggable(existingCard);
      }
      
      droppedSlot.appendChild(this.draggedElement);
      droppedSlot.classList.add('filled');
      this.sequence[droppedIndex] = this.draggedCard;
    } else {
      // Return to hand
      const handCards = document.getElementById('hand-cards');
      handCards.appendChild(this.draggedElement);
    }
    
    this.makeCardDraggable(this.draggedElement);
    
    if (this.onSequenceChange) {
      this.onSequenceChange(this.sequence);
    }
    
    this.draggedElement = null;
    this.draggedCard = null;
  }

  /**
   * Get current sequence (only filled slots)
   */
  getSequence() {
    return this.sequence.filter(card => card !== null);
  }

  /**
   * Check if all slots are filled
   */
  isComplete() {
    return this.sequence.every(card => card !== null);
  }

  /**
   * Clear the sequence
   */
  clear() {
    this.sequence = new Array(6).fill(null);
    this.slots.forEach(slot => {
      slot.classList.remove('filled');
      const card = slot.querySelector('.card');
      if (card) {
        document.getElementById('hand-cards').appendChild(card);
      }
    });
  }
}

// Global drag drop manager
window.dragDrop = new DragDropManager();

