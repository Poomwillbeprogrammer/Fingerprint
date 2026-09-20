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

  test('intermediate finger success sets status to AWAITING_NEXT and startNextFinger arms next finger', () => {
    const session = new EnrollmentSession(1, 'Alice');
    const res = session.onSlotSuccess(1);

    assert.strictEqual(session.status, 'AWAITING_NEXT');
    assert.strictEqual(res.isComplete, false);

    const nextInfo = session.startNextFinger();
    assert.strictEqual(session.status, 'IN_PROGRESS');
    assert.strictEqual(nextInfo.fingerNum, 2);
    assert.strictEqual(nextInfo.slot, 2);
    assert.strictEqual(nextInfo.command, 'ENROLL 2');
  });

  test('startNextFinger returns null if session is not in AWAITING_NEXT status', () => {
    const session = new EnrollmentSession(1, 'Alice');
    assert.strictEqual(session.status, 'IN_PROGRESS');
    const result = session.startNextFinger();
    assert.strictEqual(result, null);
  });
});

const { createSerialController } = require('../server/controllers/serial_controller');

describe('SerialController Event-Driven Enrollment Handshake (TDD)', () => {
  test('advances to finger 2 upon receiving RESP:ENROLL_SLOT_DONE without blind timer', async () => {
    const emittedEvents = [];
    const mockIo = {
      emit: (event, data) => {
        emittedEvents.push({ event, data });
      }
    };
    const mockSched = { getAllSchedules: () => [] };
    const controller = createSerialController({
      io: mockIo,
      schedulesManager: mockSched,
      serialEnabled: false
    });

    const bridgeCallbacks = {};
    const bridgeSentCommands = [];
    const mockBridgeSocket = {
      id: 'mock-bridge-socket',
      role: 'bridge',
      connected: true,
      on: (ev, cb) => { bridgeCallbacks[ev] = cb; },
      emit: (ev, data) => { bridgeSentCommands.push({ ev, data }); }
    };
    controller.handleSocketConnection(mockBridgeSocket);
    await bridgeCallbacks['register_bridge']({ r307_connected: true, oled_connected: true });

    const socketCallbacks = {};
    const mockSocket = {
      id: 'mock-admin-socket',
      role: 'admin',
      on: (ev, cb) => { socketCallbacks[ev] = cb; },
      emit: (ev, data) => {}
    };
    controller.handleSocketConnection(mockSocket);

    // 1. Arm R307 as ready
    await controller.handleSerialData('STATUS:R307_READY');

    // 2. Start enroll for User 1
    await socketCallbacks['start_enroll']({ id: 1, name: 'Alice' });
    const startEvent = emittedEvents.find(e => e.event === 'enroll_step_update' && e.data.status === 'FINGER_START');
    assert.ok(startEvent, 'Must emit FINGER_START for finger 1');
    assert.strictEqual(startEvent.data.fingerNum, 1);
    assert.strictEqual(startEvent.data.slotId, 1);

    // 3. Finger 1 completes: MCU reports RESP:ENROLL_OK ID=1
    await controller.handleSerialData('RESP:ENROLL_OK ID=1');
    const doneEvent = emittedEvents.find(e => e.event === 'enroll_step_update' && e.data.status === 'FINGER_DONE');
    assert.ok(doneEvent, 'Must emit FINGER_DONE for finger 1');
    assert.strictEqual(doneEvent.data.fingerNum, 1);
    assert.strictEqual(doneEvent.data.nextFinger, 2);

    // Clear recorded events to verify next step
    emittedEvents.length = 0;

    // 4. MCU finishes template backup and signals slot completion (RESP:ENROLL_SLOT_DONE ID=1)
    await controller.handleSerialData('RESP:ENROLL_SLOT_DONE ID=1');

    // Must immediately advance to finger 2 without waiting for a timer
    const finger2Start = emittedEvents.find(e => e.event === 'enroll_step_update' && e.data.status === 'FINGER_START');
    assert.ok(finger2Start, 'Must emit FINGER_START for finger 2 upon RESP:ENROLL_SLOT_DONE');
    assert.strictEqual(finger2Start.data.fingerNum, 2);
    assert.strictEqual(finger2Start.data.slotId, 2);

    // 5. Finger 2 completes: MCU reports RESP:ENROLL_OK ID=2
    emittedEvents.length = 0;
    await controller.handleSerialData('RESP:ENROLL_OK ID=2');
    const done2Event = emittedEvents.find(e => e.event === 'enroll_step_update' && e.data.status === 'FINGER_DONE');
    assert.ok(done2Event, 'Must emit FINGER_DONE for finger 2');
    assert.strictEqual(done2Event.data.fingerNum, 2);
    assert.strictEqual(done2Event.data.nextFinger, 3);

    // 6. MCU finishes slot 2 and signals RESP:ENROLL_SLOT_DONE ID=2
    emittedEvents.length = 0;
    await controller.handleSerialData('RESP:ENROLL_SLOT_DONE ID=2');
    const finger3Start = emittedEvents.find(e => e.event === 'enroll_step_update' && e.data.status === 'FINGER_START');
    assert.ok(finger3Start, 'Must emit FINGER_START for finger 3 upon RESP:ENROLL_SLOT_DONE ID=2');
    assert.strictEqual(finger3Start.data.fingerNum, 3);
    assert.strictEqual(finger3Start.data.slotId, 3);

    // 7. Finger 3 completes: MCU reports RESP:ENROLL_OK ID=3
    emittedEvents.length = 0;
    await controller.handleSerialData('RESP:ENROLL_OK ID=3');
    const finalSuccess = emittedEvents.find(e => e.event === 'enroll_step_update' && e.data.status === 'SUCCESS');
    assert.ok(finalSuccess, 'Must emit SUCCESS for the entire user upon finger 3 completion');
    assert.strictEqual(finalSuccess.data.id, 1);
    assert.deepStrictEqual(finalSuccess.data.slots, [1, 2, 3]);
  });
});

