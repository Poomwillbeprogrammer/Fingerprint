/**
 * Tests for User Edit & Cascading Data Integrity (TDD)
 * Tests UserRepository.updateUser, schedules_manager.updateUserDetails,
 * 12-digit Student ID Format Validation (XXXXXXXXXXX-X), and duplicate student_id prevention.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { UserRepository } = require('../server/repositories/UserRepository');
const schedulesManager = require('../server/schedules_manager');

describe('User Update & Cascading Data Integrity (TDD)', () => {
  let mockUsersTable = [];
  let mockAttendanceTable = [];
  let mockLogsTable = [];

  // Create a mock Supabase client
  function createMockSupabase() {
    return {
      from: (tableName) => {
        return {
          update: (updates) => {
            return {
              eq: (col, val) => {
                let targetArray;
                if (tableName === 'users') targetArray = mockUsersTable;
                else if (tableName === 'session_attendance') targetArray = mockAttendanceTable;
                else if (tableName === 'access_logs') targetArray = mockLogsTable;

                if (targetArray) {
                  targetArray.forEach(item => {
                    if (item[col] === val) {
                      Object.assign(item, updates);
                    }
                  });
                }
                return Promise.resolve({ error: null });
              }
            };
          },
          select: () => ({
            eq: (col, val) => ({
              maybeSingle: () => {
                const found = mockUsersTable.find(u => u[col] === val);
                return Promise.resolve({ data: found || null, error: null });
              }
            })
          })
        };
      }
    };
  }

  beforeEach(() => {
    mockUsersTable = [
      { id: 1, student_id: '66041013010-1', name: 'Original Name 1' },
      { id: 2, student_id: '66041013020-2', name: 'Original Name 2' }
    ];
    mockAttendanceTable = [
      { id: 101, user_id: 1, student_id: '66041013010-1', user_name: 'Original Name 1', week_number: 1 },
      { id: 102, user_id: 1, student_id: '66041013010-1', user_name: 'Original Name 1', week_number: 2 },
      { id: 103, user_id: 2, student_id: '66041013020-2', user_name: 'Original Name 2', week_number: 1 }
    ];
    mockLogsTable = [
      { id: 201, user_id: 1, student_id: '66041013010-1', user_name: 'Original Name 1', status: 'GRANTED' },
      { id: 202, user_id: 2, student_id: '66041013020-2', user_name: 'Original Name 2', status: 'GRANTED' }
    ];
  });

  test('UserRepository.updateUser updates users table and cascades to session_attendance & access_logs', async () => {
    const mockDb = createMockSupabase();
    const repo = new UserRepository(mockDb);

    const result = await repo.updateUser(1, {
      name: '  New Name 1  ',
      studentId: '  66041099990-9  '
    });

    assert.strictEqual(result.changes, 1);

    // Verify users table
    const updatedUser = mockUsersTable.find(u => u.id === 1);
    assert.strictEqual(updatedUser.name, 'New Name 1', 'User name must be trimmed and updated in users table');
    assert.strictEqual(updatedUser.student_id, '66041099990-9', 'Student ID must be trimmed and updated in users table');

    // Verify session_attendance cascade
    const user1Attendance = mockAttendanceTable.filter(r => r.user_id === 1);
    assert.strictEqual(user1Attendance.length, 2);
    user1Attendance.forEach(record => {
      assert.strictEqual(record.user_name, 'New Name 1', 'Cascade must update user_name in session_attendance');
      assert.strictEqual(record.student_id, '66041099990-9', 'Cascade must update student_id in session_attendance');
    });

    // Verify untouched other users in session_attendance
    const user2Attendance = mockAttendanceTable.find(r => r.user_id === 2);
    assert.strictEqual(user2Attendance.user_name, 'Original Name 2');
    assert.strictEqual(user2Attendance.student_id, '66041013020-2');

    // Verify access_logs cascade
    const user1Log = mockLogsTable.find(l => l.user_id === 1);
    assert.strictEqual(user1Log.user_name, 'New Name 1', 'Cascade must update user_name in access_logs');
    assert.strictEqual(user1Log.student_id, '66041099990-9', 'Cascade must update student_id in access_logs');
  });

  test('schedules_manager.updateUserDetails updates in-memory attendance records', () => {
    // Seed in-memory attendance records in schedules_manager
    const testRecords = [
      { id: 1, user_id: 1, student_id: '66041013010-1', user_name: 'Original 1' },
      { id: 2, user_id: 1, student_id: '66041013010-1', user_name: 'Original 1' },
      { id: 3, user_id: 2, student_id: '66041013020-2', user_name: 'Original 2' }
    ];
    schedulesManager.loadAttendanceRecords(testRecords);

    schedulesManager.updateUserDetails(1, {
      name: 'Updated Name 1',
      studentId: '66041099990-9'
    });

    const currentRecords = schedulesManager.loadAttendanceRecords(null);
    const user1Records = currentRecords.filter(r => r.user_id === 1);
    assert.strictEqual(user1Records.length, 2);
    user1Records.forEach(r => {
      assert.strictEqual(r.user_name, 'Updated Name 1');
      assert.strictEqual(r.student_id, '66041099990-9');
    });

    const user2Record = currentRecords.find(r => r.user_id === 2);
    assert.strictEqual(user2Record.user_name, 'Original 2');
    assert.strictEqual(user2Record.student_id, '66041013020-2');
  });

  test('PUT /api/users/:id enforces 12-digit format (XXXXXXXXXXX-X) and duplicate check', async () => {
    const createUsersRouter = require('../server/routes/users');
    const userRepo = require('../server/repositories/UserRepository');

    const originalFindById = userRepo.findById;
    const originalFindByStudentId = userRepo.findByStudentId;
    const originalUpdateUser = userRepo.updateUser;

    let userUpdatedEmitted = false;
    let cacheBroadcasted = false;
    const mockIo = {
      emit: (event) => {
        if (event === 'user_updated') userUpdatedEmitted = true;
      }
    };
    const mockSerial = {
      broadcastUsersCache: () => {
        cacheBroadcasted = true;
      }
    };

    const router = createUsersRouter({ serialController: mockSerial, io: mockIo });
    const routeLayer = router.stack.find(s => s.route && s.route.path === '/:id' && s.route.methods.put);
    assert.ok(routeLayer, 'PUT /:id route must exist in router');
    const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;

    try {
      // 1. Missing fields (400)
      let res1 = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ params: { id: '1' }, body: { name: '', student_id: '' } }, res1);
      assert.strictEqual(res1.statusCode, 400);

      // 2. Format validation: Too short (less than 12 digits) (400)
      let resShort = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ params: { id: '1' }, body: { name: 'Bob', student_id: '6604101311' } }, resShort);
      assert.strictEqual(resShort.statusCode, 400);
      assert.ok(resShort.body.error.includes('12 หลัก'));

      // 3. Format validation: Missing dash (400)
      let resNoDash = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ params: { id: '1' }, body: { name: 'Bob', student_id: '660410131101' } }, resNoDash);
      assert.strictEqual(resNoDash.statusCode, 400);
      assert.ok(resNoDash.body.error.includes('XXXXXXXXXXX-X'));

      // 4. Format validation: Too many digits (400)
      let resLong = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ params: { id: '1' }, body: { name: 'Bob', student_id: '6604101311012-3' } }, resLong);
      assert.strictEqual(resLong.statusCode, 400);

      // 5. User not found (404)
      userRepo.findById = async (id) => null;
      let resNotFound = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ params: { id: '99' }, body: { name: 'Bob', student_id: '66041013990-9' } }, resNotFound);
      assert.strictEqual(resNotFound.statusCode, 404);

      // 6. Duplicate student_id on ANOTHER user (400)
      userRepo.findById = async (id) => ({ id: 1, student_id: '66041013010-1', name: 'Alice' });
      userRepo.findByStudentId = async (sid) => ({ id: 2, student_id: '66041013020-2', name: 'Charlie' });
      let resDup = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ params: { id: '1' }, body: { name: 'Alice New', student_id: '66041013020-2' } }, resDup);
      assert.strictEqual(resDup.statusCode, 400);
      assert.ok(resDup.body.error.includes('ซ้ำ'));

      // 7. Success case: Valid 12-digit student_id (same user or unique) (200)
      userRepo.findByStudentId = async (sid) => ({ id: 1, student_id: '66041013010-1', name: 'Alice' });
      let updatedPayload = null;
      userRepo.updateUser = async (id, payload) => {
        updatedPayload = { id, ...payload };
        return { changes: 1 };
      };

      let resSuccess = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ params: { id: '1' }, body: { name: 'Alice Updated', student_id: '66041013010-1' } }, resSuccess);
      assert.strictEqual(resSuccess.body.success, true);
      assert.strictEqual(updatedPayload.id, 1);
      assert.strictEqual(updatedPayload.name, 'Alice Updated');
      assert.strictEqual(updatedPayload.studentId, '66041013010-1');
      assert.strictEqual(userUpdatedEmitted, true);
      assert.strictEqual(cacheBroadcasted, true);
    } finally {
      userRepo.findById = originalFindById;
      userRepo.findByStudentId = originalFindByStudentId;
      userRepo.updateUser = originalUpdateUser;
    }
  });

  test('POST /api/users enforces 12-digit format and duplicate check on new enrollment', async () => {
    const createUsersRouter = require('../server/routes/users');
    const userRepo = require('../server/repositories/UserRepository');

    const originalFindByStudentId = userRepo.findByStudentId;
    const originalFindAllOrderById = userRepo.findAllOrderById;
    const originalInsertUser = userRepo.insertUser;

    const mockIo = { emit: () => {} };
    const mockSerial = { broadcastUsersCache: () => {} };
    const router = createUsersRouter({ serialController: mockSerial, io: mockIo });

    const routeLayer = router.stack.find(s => s.route && s.route.path === '/' && s.route.methods.post);
    assert.ok(routeLayer, 'POST / route must exist in router');
    const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;

    try {
      // 1. Reject invalid format (missing dash / not 12 digits)
      let resBad = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ body: { name: 'Dave', student_id: '6604101311' } }, resBad);
      assert.strictEqual(resBad.statusCode, 400);
      assert.ok(resBad.body.error.includes('12 หลัก'));

      // 2. Reject duplicate student ID
      userRepo.findByStudentId = async (sid) => ({ id: 1, student_id: '66041013010-1', name: 'Alice' });
      let resDup = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ body: { name: 'Dave', student_id: '66041013010-1' } }, resDup);
      assert.strictEqual(resDup.statusCode, 400);
      assert.ok(resDup.body.error.includes('มีในระบบแล้ว'));

      // 3. Accept valid 12-digit format and unique student ID
      userRepo.findByStudentId = async (sid) => null;
      userRepo.findAllOrderById = async () => [];
      let insertedObj = null;
      userRepo.insertUser = async (obj) => {
        insertedObj = obj;
        return { lastID: obj.id, changes: 1 };
      };

      let resOk = { status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
      await handler({ body: { name: 'Dave', student_id: '66041013110-1' } }, resOk);
      assert.strictEqual(resOk.body.success, true);
      assert.strictEqual(insertedObj.studentId, '66041013110-1');
      assert.strictEqual(insertedObj.name, 'Dave');
    } finally {
      userRepo.findByStudentId = originalFindByStudentId;
      userRepo.findAllOrderById = originalFindAllOrderById;
      userRepo.insertUser = originalInsertUser;
    }
  });
});
