/**
 * Unit Tests for Node.js Schedules & Attendance Manager (server/schedules_manager.js)
 * Uses Node.js native test runner (node:test and node:assert).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  getIsoWeekDetails,
  getWeekRangeText,
  generateShortName,
  DAY_MAP,
  DAY_NAMES,
  checkAlreadyCheckedIn,
  recordSessionAttendance,
  loadAttendanceRecords,
  setSupabaseClient
} = require('../server/schedules_manager');

// Isolate unit tests from network calls to Supabase Cloud
setSupabaseClient(null);

describe('ISO-8601 Week Calculation (getIsoWeekDetails)', () => {
  test('correctly calculates ISO week for September 16, 2026', () => {
    const details = getIsoWeekDetails('2026-09-16');
    assert.strictEqual(details.year, 2026);
    assert.strictEqual(details.weekNo, 38);
    assert.strictEqual(details.yearWeek, '2026-W38');
  });

  test('Monday and Sunday of the same calendar week have identical yearWeek', () => {
    // 2026-09-14 is Monday of Week 38, 2026-09-20 is Sunday of Week 38
    const monday = getIsoWeekDetails('2026-09-14');
    const sunday = getIsoWeekDetails('2026-09-20');
    assert.strictEqual(monday.weekNo, 38);
    assert.strictEqual(sunday.weekNo, 38);
    assert.strictEqual(monday.yearWeek, sunday.yearWeek);
  });

  test('Monday of next week transitions to next ISO week number', () => {
    // 2026-09-21 is Monday of Week 39
    const nextMonday = getIsoWeekDetails('2026-09-21');
    assert.strictEqual(nextMonday.weekNo, 39);
    assert.strictEqual(nextMonday.yearWeek, '2026-W39');
  });

  test('handles Date object input', () => {
    const d = new Date('2026-01-07T12:00:00Z');
    const details = getIsoWeekDetails(d);
    assert.strictEqual(details.weekNo, 2);
    assert.strictEqual(details.year, 2026);
    assert.strictEqual(details.yearWeek, '2026-W02');
  });
});

describe('Thai Week Date Range Formatting (getWeekRangeText)', () => {
  test('formats week date range in Thai Buddhist calendar era (+543 years)', () => {
    // Week 38 of 2026 is 14 - 20 ก.ย. 2569
    const text = getWeekRangeText(2026, 38);
    assert.ok(text.includes('2569'), `Expected Buddhist era 2569 in "${text}"`);
    assert.ok(text.includes('ก.ย.'), `Expected Thai month abbreviation in "${text}"`);
  });

  test('formats cross-month week range correctly', () => {
    // Week 5 of 2026 crosses from Jan into Feb (26 ม.ค. - 1 ก.พ. 2569)
    const text = getWeekRangeText(2026, 5);
    assert.ok(text.includes('2569'), `Expected Buddhist era 2569 in "${text}"`);
  });
});

describe('Display Short Name Generation (generateShortName)', () => {
  test('maps known lengthy subject names to compact OLED-friendly labels', () => {
    assert.strictEqual(
      generateShortName('Advanced Computer Programming'),
      'Adv Programming'
    );
    assert.strictEqual(
      generateShortName('Discrete Mathematics for Engineering'),
      'Discrete Math'
    );
    assert.strictEqual(
      generateShortName('Embedded Systems'),
      'Embedded Systems'
    );
  });

  test('truncates unknown subject names exceeding 16 characters', () => {
    const longName = 'This Is A Very Long Subject Name For Testing';
    const shortName = generateShortName(longName);
    assert.strictEqual(shortName.length, 16);
    assert.strictEqual(shortName, 'This Is A Very L');
  });

  test('returns empty string for null, undefined, or empty input', () => {
    assert.strictEqual(generateShortName(''), '');
    assert.strictEqual(generateShortName(null), '');
    assert.strictEqual(generateShortName(undefined), '');
  });
});

describe('Thai Day Mapping (DAY_MAP & DAY_NAMES)', () => {
  test('maps all 7 Thai days to ISO 1-7 numbers', () => {
    assert.strictEqual(DAY_MAP['จันทร์'], 1);
    assert.strictEqual(DAY_MAP['อังคาร'], 2);
    assert.strictEqual(DAY_MAP['พุธ'], 3);
    assert.strictEqual(DAY_MAP['พฤหัสบดี'], 4);
    assert.strictEqual(DAY_MAP['ศุกร์'], 5);
    assert.strictEqual(DAY_MAP['เสาร์'], 6);
    assert.strictEqual(DAY_MAP['อาทิตย์'], 7);
  });

  test('DAY_NAMES array matches 1-indexed days', () => {
    assert.strictEqual(DAY_NAMES[1], 'จันทร์');
    assert.strictEqual(DAY_NAMES[5], 'ศุกร์');
    assert.strictEqual(DAY_NAMES[7], 'อาทิตย์');
  });
});

describe('Academic Weekly Attendance Isolation (checkAlreadyCheckedIn)', () => {
  test('allows scan when no prior attendance exists', () => {
    const isDup = checkAlreadyCheckedIn(999, 888, '2026-W38', '2026-09-16');
    assert.strictEqual(isDup, false);
  });

  test('detects duplicate scan within the same ISO week for the same course', () => {
    const userId = 77;
    const scheduleId = 44;
    const yearWeek = '2026-W38';

    recordSessionAttendance({
      user_id: userId,
      schedule_id: scheduleId,
      year_week: yearWeek,
      date: '2026-09-16',
      status: 'ON_TIME'
    });

    // In the same week: should be detected as duplicate
    const isDupSameWeek = checkAlreadyCheckedIn(userId, scheduleId, yearWeek, '2026-09-16');
    assert.strictEqual(isDupSameWeek, true);

    // In a different week (e.g. Week 39): must NOT be blocked (Rule 2: Weekly Isolation)
    const isDupNextWeek = checkAlreadyCheckedIn(userId, scheduleId, '2026-W39', '2026-09-23');
    assert.strictEqual(isDupNextWeek, false);

    // In a different course/schedule: must NOT be blocked
    const isDupOtherCourse = checkAlreadyCheckedIn(userId, 9999, yearWeek, '2026-09-16');
    assert.strictEqual(isDupOtherCourse, false);

    // Different student: must NOT be blocked
    const isDupOtherStudent = checkAlreadyCheckedIn(8888, scheduleId, yearWeek, '2026-09-16');
    assert.strictEqual(isDupOtherStudent, false);
  });

  test('recordSessionAttendance uses Math.max over existing IDs to prevent collisions when gaps exist', () => {
    loadAttendanceRecords([
      { id: 10, user_id: 1, schedule_id: 1, year_week: '2026-W30' }
    ]);
    const newRecord = recordSessionAttendance({
      user_id: 2,
      schedule_id: 1,
      year_week: '2026-W30',
      date: '2026-07-20',
      status: 'ON_TIME'
    });
    assert.strictEqual(newRecord.id, 11, 'New record ID must be Math.max(existing ids) + 1 (11), not length + 1');
  });
});

