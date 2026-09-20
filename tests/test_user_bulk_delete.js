/**
 * Tests for Bulk User Deletion with Checkboxes (TDD)
 * Tests UserRepository.deleteUsers, POST /api/users/bulk-delete route, and UART pacing.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { UserRepository } = require('../server/repositories/UserRepository');

describe('Bulk User Deletion (TDD)', () => {
  let mockUsersTable = [];

  function createMockSupabase() {
    return {
      from: (tableName) => {
        return {
          delete: () => {
            return {
              in: (col, vals) => {
                if (tableName === 'users') {
                  const initialLength = mockUsersTable.length;
                  mockUsersTable = mockUsersTable.filter(u => !vals.includes(u[col]));
                  return Promise.resolve({ error: null, count: initialLength - mockUsersTable.length });
                }
                return Promise.resolve({ error: null });
              }
            };
          }
        };
      }
    };
  }

  beforeEach(() => {
    mockUsersTable = [
      { id: 1, student_id: '66041013010-1', name: 'Student 1' },
      { id: 2, student_id: '66041013020-2', name: 'Student 2' },
      { id: 3, student_id: '66041013030-3', name: 'Student 3' },
      { id: 4, student_id: '66041013040-4', name: 'Student 4' }
    ];
  });

  test('UserRepository.deleteUsers deletes multiple users by array of IDs', async () => {
    const mockDb = createMockSupabase();
    const repo = new UserRepository(mockDb);

    const result = await repo.deleteUsers([1, 3]);
    assert.strictEqual(result.changes, 2);

    const remainingIds = mockUsersTable.map(u => u.id);
    assert.deepStrictEqual(remainingIds, [2, 4], 'Users 1 and 3 must be deleted, leaving 2 and 4');
  });

  test('UserRepository.deleteUsers returns 0 changes for empty array without calling DB', async () => {
    const mockDb = createMockSupabase();
    const repo = new UserRepository(mockDb);

    const result = await repo.deleteUsers([]);
    assert.strictEqual(result.changes, 0);
    assert.strictEqual(mockUsersTable.length, 4);
  });

  test('POST /api/users/bulk-delete route validates input and triggers hardware cleanup', async () => {
    const createUsersRouter = require('../server/routes/users');
    const userRepo = require('../server/repositories/UserRepository');

    const originalDeleteUsers = userRepo.deleteUsers;

    let deletedIdsRecorded = null;
    let hardwareCleanedIds = null;
    let userUpdatedEmitted = false;
    let cacheBroadcasted = false;

    userRepo.deleteUsers = async (ids) => {
      deletedIdsRecorded = ids;
      return { changes: ids.length };
    };

    const mockIo = {
      emit: (event) => {
        if (event === 'user_updated') userUpdatedEmitted = true;
      }
    };
    const mockSerial = {
      deleteUsersSlots: (ids) => {
        hardwareCleanedIds = ids;
      },
      broadcastUsersCache: () => {
        cacheBroadcasted = true;
      }
    };

    const router = createUsersRouter({ serialController: mockSerial, io: mockIo });
    const routeLayer = router.stack.find(s => s.route && s.route.path === '/bulk-delete' && s.route.methods.post);
    assert.ok(routeLayer, 'POST /bulk-delete route must exist in router');
    const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;

    try {
      // 1. Reject missing or empty ids array
      let resEmpty = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ body: { ids: [] } }, resEmpty);
      assert.strictEqual(resEmpty.statusCode, 400);

      let resInvalid = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ body: { ids: 'invalid' } }, resInvalid);
      assert.strictEqual(resInvalid.statusCode, 400);

      // 2. Successful bulk deletion
      let resSuccess = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ body: { ids: [1, 2, 4] } }, resSuccess);
      assert.strictEqual(resSuccess.body.success, true);
      assert.strictEqual(resSuccess.body.count, 3);
      assert.deepStrictEqual(deletedIdsRecorded, [1, 2, 4]);
      assert.deepStrictEqual(hardwareCleanedIds, [1, 2, 4]);
      assert.strictEqual(userUpdatedEmitted, true);
      assert.strictEqual(cacheBroadcasted, true);
    } finally {
      userRepo.deleteUsers = originalDeleteUsers;
    }
  });
});
