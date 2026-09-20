/**
 * Tests for Role-Based Access Control (RBAC), Multi-Account System, and Attendance Scoping (TDD)
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('../server/node_modules/bcryptjs');
const { AdminRepository } = require('../server/repositories/AdminRepository');
const schedulesManager = require('../server/schedules_manager');
const { requireRole, authRequired } = require('../server/middleware/auth');

describe('RBAC & Multi-Account System (TDD)', () => {
  let mockAdminsTable = [];

  function createMockSupabase() {
    return {
      from: (tableName) => {
        return {
          select: (cols) => {
            return {
              order: () => Promise.resolve({ data: [...mockAdminsTable], error: null }),
              eq: (col, val) => {
                const found = mockAdminsTable.find(a => a[col] === val);
                return {
                  maybeSingle: () => Promise.resolve({ data: found ? { ...found } : null, error: null })
                };
              }
            };
          },
          insert: (rows) => {
            return {
              select: () => {
                return {
                  single: () => {
                    const row = rows[0];
                    if (mockAdminsTable.some(a => a.username === row.username)) {
                      return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
                    }
                    const newId = (mockAdminsTable.reduce((m, a) => Math.max(m, a.id || 0), 0)) + 1;
                    const inserted = { id: newId, ...row, created_at: new Date().toISOString() };
                    mockAdminsTable.push(inserted);
                    return Promise.resolve({ data: inserted, error: null });
                  }
                };
              }
            };
          },
          update: (payload) => {
            return {
              eq: (col, val) => {
                const idx = mockAdminsTable.findIndex(a => a[col] === val);
                if (idx !== -1) {
                  mockAdminsTable[idx] = { ...mockAdminsTable[idx], ...payload };
                }
                return {
                  select: () => ({
                    maybeSingle: () => Promise.resolve({ data: mockAdminsTable[idx] || null, error: null })
                  })
                };
              }
            };
          },
          delete: () => {
            return {
              eq: (col, val) => {
                mockAdminsTable = mockAdminsTable.filter(a => a[col] !== val);
                return Promise.resolve({ error: null });
              }
            };
          }
        };
      }
    };
  }

  beforeEach(() => {
    mockAdminsTable = [
      {
        id: 1,
        username: 'admin',
        password_hash: bcrypt.hashSync('admin123', 10),
        role: 'super_admin',
        instructor_name: '',
        assigned_subjects: [],
        created_at: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 2,
        username: 'aj_jakpob',
        password_hash: bcrypt.hashSync('pass1234', 10),
        role: 'teacher',
        instructor_name: 'อ.จักรภพ  ใหม่เสน',
        assigned_subjects: ['32090305'],
        created_at: '2026-01-02T00:00:00.000Z'
      }
    ];
  });

  // 1. Repository Tests
  test('AdminRepository.findAll returns accounts with safe defaults and without sensitive data leak', async () => {
    const mockDb = createMockSupabase();
    const repo = new AdminRepository(mockDb);

    const accounts = await repo.findAll();
    assert.strictEqual(accounts.length, 2);
    assert.strictEqual(accounts[0].role, 'super_admin');
    assert.strictEqual(accounts[1].role, 'teacher');
    assert.strictEqual(accounts[0].password_hash, undefined, 'password_hash must be excluded from findAll');
  });

  test('AdminRepository.createAccount creates teacher with normalized data and subject_codes', async () => {
    const mockDb = createMockSupabase();
    const repo = new AdminRepository(mockDb);

    const created = await repo.createAccount({
      username: 'aj_somnuk',
      password: 'password123',
      role: 'teacher',
      instructor_name: 'อ.สมนึก  สุระธง',
      assigned_subjects: ['32090104']
    });

    assert.strictEqual(created.username, 'aj_somnuk');
    assert.strictEqual(created.role, 'teacher');
    assert.strictEqual(created.instructor_name, 'อ.สมนึก  สุระธง');
    assert.deepStrictEqual(created.assigned_subjects, ['32090104']);
  });

  test('AdminRepository.createAccount rejects duplicate username', async () => {
    const mockDb = createMockSupabase();
    const repo = new AdminRepository(mockDb);

    await assert.rejects(
      async () => {
        await repo.createAccount({
          username: 'admin',
          password: 'password123',
          role: 'teacher'
        });
      },
      /มีอยู่ในระบบแล้ว/
    );
  });

  test('AdminRepository.deleteAccount prevents self-deletion', async () => {
    const mockDb = createMockSupabase();
    const repo = new AdminRepository(mockDb);

    await assert.rejects(
      async () => {
        await repo.deleteAccount(1, 1);
      },
      /ไม่สามารถลบบัญชีของตนเองได้/
    );
  });

  test('AdminRepository.deleteAccount prevents deleting last super admin', async () => {
    const mockDb = createMockSupabase();
    const repo = new AdminRepository(mockDb);

    // ID 1 is the only super_admin. Someone (say ID 2, if attempted) cannot delete ID 1
    await assert.rejects(
      async () => {
        await repo.deleteAccount(1, 2);
      },
      /ไม่สามารถลบผู้ดูแลระบบ \(Super Admin\) บัญชีสุดท้ายของระบบได้/
    );
  });

  test('AdminRepository.updateAccount prevents demoting last super admin', async () => {
    const mockDb = createMockSupabase();
    const repo = new AdminRepository(mockDb);

    await assert.rejects(
      async () => {
        // Trying to demote ID 1 to teacher when it is the only super admin
        await repo.updateAccount(1, { role: 'teacher' }, 99);
      },
      /ไม่สามารถลดระดับผู้ดูแลระบบ \(Super Admin\) บัญชีสุดท้ายของระบบได้/
    );
  });

  // 2. Auth Middleware Tests
  test('requireRole middleware permits authorized role and rejects unauthorized with 403', () => {
    const guard = requireRole('super_admin');

    // Test 1: Super admin allowed
    let nextCalled = false;
    const reqSuper = { admin: { id: 1, role: 'super_admin' } };
    const resMock = {
      status: (code) => ({
        json: (data) => ({ code, data })
      })
    };
    guard(reqSuper, resMock, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);

    // Test 2: Teacher rejected
    let rejectedCode = 0;
    const reqTeacher = { admin: { id: 2, role: 'teacher' } };
    const resReject = {
      status: (code) => {
        rejectedCode = code;
        return { json: (data) => ({ code, data }) };
      }
    };
    guard(reqTeacher, resReject, () => {});
    assert.strictEqual(rejectedCode, 403, 'Teacher must receive 403 when accessing super_admin route');
  });

  test('requireRole middleware falls back to super_admin when admin has no role column (migration transition)', () => {
    const guard = requireRole('super_admin');
    let nextCalled = false;
    const reqLegacy = { admin: { id: 1 } }; // No role field
    const resMock = {};
    guard(reqLegacy, resMock, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Legacy admin record must fallback to super_admin');
  });

  // 3. Subject Scoping & Normalization Tests
  test('isTeacherAuthorizedForSchedule matches assigned subject_code', () => {
    const teacher = {
      role: 'teacher',
      instructor_name: 'อ.จักรภพ ใหม่เสน',
      assigned_subjects: ['32090305']
    };

    const schedMatched = { subject_code: '32090305', instructor: 'อาจารย์ท่านอื่น' };
    const schedNotMatched = { subject_code: '99999999', instructor: 'อาจารย์ท่านอื่น' };

    assert.strictEqual(schedulesManager.isTeacherAuthorizedForSchedule(teacher, schedMatched), true);
    assert.strictEqual(schedulesManager.isTeacherAuthorizedForSchedule(teacher, schedNotMatched), false);
  });

  test('isTeacherAuthorizedForSchedule normalizes whitespace in instructor names', () => {
    const teacher = {
      role: 'teacher',
      instructor_name: 'อ.จักรภพ  ใหม่เสน', // 2 spaces
      assigned_subjects: []
    };

    const schedWith1Space = { subject_code: '32090207', instructor: 'อ.จักรภพ ใหม่เสน' }; // 1 space
    const schedWith2Spaces = { subject_code: '32090207', instructor: 'อ.จักรภพ  ใหม่เสน' }; // 2 spaces

    assert.strictEqual(schedulesManager.isTeacherAuthorizedForSchedule(teacher, schedWith1Space), true);
    assert.strictEqual(schedulesManager.isTeacherAuthorizedForSchedule(teacher, schedWith2Spaces), true);
  });

  test('isTeacherAuthorizedForSchedule always returns true for super_admin', () => {
    const superAdmin = { role: 'super_admin' };
    const randomSched = { subject_code: '12345678', instructor: 'ใครก็ได้' };
    assert.strictEqual(schedulesManager.isTeacherAuthorizedForSchedule(superAdmin, randomSched), true);
  });

  // 4. Attendance Override & ID Collision Fix Test
  test('overrideAttendanceRecord creates or updates record with correct status and score without collision', () => {
    // Setup store with initial schedule
    schedulesManager.initStore();
    const schedules = schedulesManager.getAllSchedules();
    if (schedules.length > 0) {
      const schedId = schedules[0].id;
      const rec = schedulesManager.overrideAttendanceRecord({
        schedule_id: schedId,
        student_id: '66041013110-1',
        week: '2026-W38',
        status: 'ON_TIME',
        updated_by: 'teacher_test'
      });

      assert.strictEqual(rec.attendance_status, 'ON_TIME');
      assert.strictEqual(rec.score, 1.0);
      assert.strictEqual(rec.updated_by, 'teacher_test');

      // Update same record to LATE
      const recLate = schedulesManager.overrideAttendanceRecord({
        schedule_id: schedId,
        student_id: '66041013110-1',
        week: '2026-W38',
        status: 'LATE',
        updated_by: 'teacher_test'
      });

      assert.strictEqual(recLate.id, rec.id, 'Must update the exact same record without creating duplicate');
      assert.strictEqual(recLate.attendance_status, 'LATE');
      assert.strictEqual(recLate.score, 0.5);
    }
  });
});
