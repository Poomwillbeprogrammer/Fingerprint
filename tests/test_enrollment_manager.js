/**
 * TDD Tests for Multi-Finger Resilient Enrollment Manager (server/enrollment_manager.js)
 * Uses Node.js native test runner (node:test and node:assert).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const { EnrollmentSession } = require('../server/enrollment_manager');

describe('Multi-Finger Resilient Enrollment Session (TDD)', () => {
  test('initializes session for a user with correct 3 slots', () => {
    const userId = 2; // Slots 4, 5, 6
    const session = new EnrollmentSession(userId, 'Test Student');

    assert.strictEqual(session.userId, 2);
    assert.strictEqual(session.name, 'Test Student');
    assert.strictEqual(session.fingerNum, 1);
    assert.deepStrictEqual(session.slots, [4, 5, 6]);
    assert.deepStrictEqual(session.enrolledSlots, []);
    assert.strictEqual(session.getCurrentSlot(), 4);
    assert.strictEqual(session.status, 'IN_PROGRESS');
  });

  test('slot 1 success advances to finger 2 without completing', () => {
    const session = new EnrollmentSession(1, 'Alice'); // Slots 1, 2, 3
    const result = session.onSlotSuccess(1);

    assert.strictEqual(result.isComplete, false);
    assert.strictEqual(result.completedFinger, 1);
    assert.strictEqual(result.nextFinger, 2);
    assert.strictEqual(result.nextSlot, 2);
    assert.strictEqual(session.fingerNum, 2);
    assert.deepStrictEqual(session.enrolledSlots, [1]);
  });

  test('finger 2 failure preserves previously enrolled slot 1 and allows retry', () => {
    const session = new EnrollmentSession(1, 'Alice'); // Slots 1, 2, 3
    session.onSlotSuccess(1); // Finger 1 done, now on finger 2

    // Finger 2 fails (e.g. Mismatch or Image blurry)
    const failResult = session.onSlotFailure('MISMATCH', 'Fingerprints differ');

    assert.strictEqual(session.status, 'FINGER_FAILED');
    assert.strictEqual(failResult.canRetry, true);
    assert.strictEqual(failResult.failedFinger, 2);
    assert.strictEqual(failResult.failedSlot, 2);
    // Slot 1 must NOT be lost!
    assert.deepStrictEqual(failResult.enrolledSlots, [1]);
    assert.deepStrictEqual(session.enrolledSlots, [1]);
  });

  test('retryCurrentFinger resets state to IN_PROGRESS on the exact failed slot', () => {
    const session = new EnrollmentSession(1, 'Alice');
    session.onSlotSuccess(1);
    session.onSlotFailure('IMAGE2', 'Image 2 blurry');

    const retryResult = session.retryCurrentFinger();

    assert.strictEqual(session.status, 'IN_PROGRESS');
    assert.strictEqual(retryResult.fingerNum, 2);
    assert.strictEqual(retryResult.slot, 2);
    assert.strictEqual(session.getCurrentSlot(), 2);
    // Enrolled slots from finger 1 remain safe
    assert.deepStrictEqual(session.enrolledSlots, [1]);
  });

  test('completing retried finger 2 advances to finger 3', () => {
    const session = new EnrollmentSession(1, 'Alice');
    session.onSlotSuccess(1);
    session.onSlotFailure('MISMATCH', 'Fingerprints differ');
    session.retryCurrentFinger();

    // Now finger 2 succeeds on retry
    const res = session.onSlotSuccess(2);

    assert.strictEqual(res.isComplete, false);
    assert.strictEqual(res.completedFinger, 2);
    assert.strictEqual(res.nextFinger, 3);
    assert.strictEqual(res.nextSlot, 3);
    assert.strictEqual(session.fingerNum, 3);
    assert.deepStrictEqual(session.enrolledSlots, [1, 2]);
  });

  test('finger 3 success marks session as completed with all 3 slots', () => {
    const session = new EnrollmentSession(1, 'Alice');
    session.onSlotSuccess(1);
    session.onSlotSuccess(2);
    const finalRes = session.onSlotSuccess(3);

    assert.strictEqual(finalRes.isComplete, true);
    assert.strictEqual(finalRes.completedFinger, 3);
    assert.strictEqual(session.status, 'COMPLETED');
    assert.deepStrictEqual(session.enrolledSlots, [1, 2, 3]);
  });

  test('cancel returns enrolled slots so server can clean up only what was written', () => {
    const session = new EnrollmentSession(1, 'Alice');
    session.onSlotSuccess(1);
    // Cancelled while on finger 2
    const slotsToClean = session.getSlotsForCleanup();

    assert.deepStrictEqual(slotsToClean, [1]);
    session.cancel();
    assert.strictEqual(session.status, 'CANCELLED');
  });
});
