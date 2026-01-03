class Timer {
  constructor(duration, onComplete, onTick = null) {
    this.duration = duration;
    this.remaining = duration;
    this.onComplete = onComplete;
    this.onTick = onTick;
    this.interval = null;
    this.timeout = null;
    this.paused = false;
    this.startTime = null;
  }

  /**
   * Start the timer
   */
  start() {
    if (this.interval) this.clear();
    
    this.startTime = Date.now();
    this.paused = false;
    
    // Set up completion timeout
    this.timeout = setTimeout(() => {
      this.clear();
      if (this.onComplete) this.onComplete();
    }, this.remaining * 1000);
    
    // Set up tick interval (every second)
    if (this.onTick) {
      // Send initial tick
      this.onTick(Math.ceil(this.remaining));
      
      this.interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const currentRemaining = Math.max(0, Math.ceil(this.duration - elapsed));
        this.onTick(currentRemaining);
      }, 1000);
    }
  }

  /**
   * Pause the timer
   */
  pause() {
    if (this.paused) return;
    
    const elapsed = (Date.now() - this.startTime) / 1000;
    this.remaining = Math.max(0, Math.ceil(this.remaining - elapsed));
    this.clear();
    this.paused = true;
  }

  /**
   * Resume a paused timer
   */
  resume() {
    if (!this.paused) return;
    
    this.paused = false;
    this.startTime = Date.now();
    this.duration = this.remaining; // Reset duration to remaining for accurate calculation
    
    this.timeout = setTimeout(() => {
      this.clear();
      if (this.onComplete) this.onComplete();
    }, this.remaining * 1000);
    
    if (this.onTick) {
      // Send initial tick on resume
      this.onTick(Math.ceil(this.remaining));
      
      this.interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const currentRemaining = Math.max(0, Math.ceil(this.duration - elapsed));
        this.onTick(currentRemaining);
      }, 1000);
    }
  }

  /**
   * Clear all timers
   */
  clear() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Get remaining time in seconds (always integer)
   */
  getRemaining() {
    if (this.paused) return Math.ceil(this.remaining);
    
    if (this.startTime) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      return Math.max(0, Math.ceil(this.remaining - elapsed));
    }
    
    return Math.ceil(this.remaining);
  }

  /**
   * Check if timer is running
   */
  isRunning() {
    return this.timeout !== null && !this.paused;
  }
}

module.exports = Timer;

