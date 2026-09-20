/**
 * Multi-Finger Resilient Enrollment Manager
 * Manages per-finger enrollment state machine with non-destructive retry support.
 */

class EnrollmentSession {
  /**
   * @param {number} userId - The user ID to enroll
   * @param {string} name - Student/user full name
   * @param {number[]} [slots] - Optional 3 slot IDs (defaults to 3 slots based on userId)
   */
  constructor(userId, name, slots) {
    this.userId = parseInt(userId);
    this.name = name || 'User';
    this.slots = slots || [
      (this.userId - 1) * 3 + 1,
      (this.userId - 1) * 3 + 2,
      (this.userId - 1) * 3 + 3
    ];
    this.fingerNum = 1;
    this.enrolledSlots = [];
    this.status = 'IN_PROGRESS'; // 'IN_PROGRESS' | 'FINGER_FAILED' | 'COMPLETED' | 'CANCELLED'
  }

  /**
   * Returns current slot ID being enrolled.
   */
  getCurrentSlot() {
    return this.slots[this.fingerNum - 1];
  }

  /**
   * Called when MCU finishes enrolling current slot successfully.
   * @param {number} slotId
   */
  onSlotSuccess(slotId) {
    const sId = parseInt(slotId);
    if (!this.enrolledSlots.includes(sId)) {
      this.enrolledSlots.push(sId);
    }

    if (this.fingerNum < this.slots.length) {
      const completedFinger = this.fingerNum;
      this.fingerNum++;
      this.status = 'AWAITING_NEXT';
      return {
        completedFinger,
        nextFinger: this.fingerNum,
        nextSlot: this.getCurrentSlot(),
        isComplete: false
      };
    } else {
      this.status = 'COMPLETED';
      return {
        completedFinger: this.fingerNum,
        isComplete: true
      };
    }
  }

  /**
   * Called when hardware signals it is idle/ready for the next finger.
   * Transitions status from AWAITING_NEXT to IN_PROGRESS.
   */
  startNextFinger() {
    if (this.status !== 'AWAITING_NEXT') {
      return null;
    }
    this.status = 'IN_PROGRESS';
    return {
      fingerNum: this.fingerNum,
      slot: this.getCurrentSlot(),
      command: `ENROLL ${this.getCurrentSlot()}`
    };
  }

  /**
   * Called when MCU reports failure for current slot.
   * Preserves previous successful slots and transitions to FINGER_FAILED.
   * @param {string} code
   * @param {string} message
   */
  onSlotFailure(code, message) {
    this.status = 'FINGER_FAILED';
    return {
      canRetry: true,
      failedFinger: this.fingerNum,
      failedSlot: this.getCurrentSlot(),
      enrolledSlots: [...this.enrolledSlots],
      code,
      message
    };
  }

  /**
   * Called when client requests retry for current finger.
   * Resets status to IN_PROGRESS for current slot.
   */
  retryCurrentFinger() {
    this.status = 'IN_PROGRESS';
    return {
      fingerNum: this.fingerNum,
      slot: this.getCurrentSlot()
    };
  }

  /**
   * Returns enrolled slots that need hardware cleanup upon explicit cancellation.
   */
  getSlotsForCleanup() {
    return [...this.enrolledSlots];
  }

  /**
   * Explicitly cancel session.
   */
  cancel() {
    this.status = 'CANCELLED';
  }
}

module.exports = {
  EnrollmentSession
};
