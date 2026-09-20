const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

let supabase = null;
try {
  supabase = require('./database').supabase;
} catch (e) {}

function setSupabaseClient(client) {
  supabase = client;
}

// Initial Seed Path (read-only for cold-start bootstrap when Supabase is completely empty)
const SEED_FILE = path.join(__dirname, 'room_schedules.seed.json');

// In-Memory Storage Cache (Sub-millisecond RAM access for Uno Q & Web clients)
let store = null;
let attendanceRecords = [];

const DAY_MAP = {
  'จันทร์': 1,
  'อังคาร': 2,
  'พุธ': 3,
  'พฤหัสบดี': 4,
  'ศุกร์': 5,
  'เสาร์': 6,
  'อาทิตย์': 7
};

const DAY_NAMES = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

// Short name generator for OLED display (fits 128px screen)
function generateShortName(fullName) {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  const map = {
    'Discrete Mathematics for Engineering': 'Discrete Math',
    'Advanced Computer Programming': 'Adv Programming',
    'Computer Programming': 'Comp Programming',
    'การออกแบบวงจรอิเล็กทรอนิกส์': 'Circuit Design',
    'Digital Systems Design': 'Digital Systems',
    'Computer System Architectures and Organizations': 'Comp Architecture',
    'Basic Computer Engineering Training': 'Basic Comp Eng',
    'Digital Communication': 'Digital Comm',
    'System Analysis and Design for Engineering': 'System Analysis',
    'Database and Information Systems': 'Database Systems',
    'Object Oriented Programming': 'OOP Programming',
    'การโปรแกรมคอมพิวเตอร์': 'Computer Program',
    'Embedded Systems': 'Embedded Systems'
  };
  if (map[trimmed]) return map[trimmed];
  return trimmed.length > 16 ? trimmed.substring(0, 16) : trimmed;
}

// Read Excel file (accepts file path or memory Buffer)
function readExcelBuffer(filePathOrBuffer) {
  const buf = Buffer.isBuffer(filePathOrBuffer) ? filePathOrBuffer : fs.readFileSync(filePathOrBuffer);
  return XLSX.read(buf, { type: 'buffer' });
}

// Parse Excel sheet to array of schedule objects
function parseExcelData(filePathOrBuffer, customRoomName = '', customBuilding = '') {
  const wb = readExcelBuffer(filePathOrBuffer);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let roomName = customRoomName || 'ทค.1-101';
  let buildingName = customBuilding || 'เทคนิคคอมพิวเตอร์';

  // Attempt to extract header info if not custom
  if (!customRoomName || !customBuilding) {
    for (let r = 0; r < Math.min(10, rawData.length); r++) {
      const rowStr = (rawData[r] || []).join(' ');
      if (!customRoomName && rowStr.includes('ห้อง')) {
        const match = rowStr.match(/ห้อง\s*([^\s]+)/);
        if (match) roomName = match[1].trim();
      }
      if (!customBuilding && rowStr.includes('อาคาร')) {
        const match = rowStr.match(/อาคาร\s*([^\s]+)/);
        if (match) buildingName = match[1].trim();
      }
    }
  }

  let currentDay = '';
  let currentDayOfWeek = 0;
  const schedules = [];

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    // Check for day in column A
    const dayCell = (row[0] || '').toString().trim();
    if (dayCell && DAY_MAP[dayCell]) {
      currentDay = dayCell;
      currentDayOfWeek = DAY_MAP[dayCell];
    }

    const timeStr = (row[3] || '').toString().trim();
    const subjectCode = (row[7] || '').toString().trim();
    const subjectName = (row[10] || '').toString().trim();
    const typeCell = (row[18] || '').toString().trim();
    const sectionGroup = (row[20] || '').toString().trim();
    const instructor = (row[25] || '').toString().trim();

    if (!timeStr || !subjectCode) continue;

    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!timeMatch) continue;

    const startH = timeMatch[1].padStart(2, '0');
    const startM = timeMatch[2];
    const endH = timeMatch[3].padStart(2, '0');
    const endM = timeMatch[4];

    let classType = 'T';
    if (typeCell.toUpperCase().includes('P') || typeCell.includes('ป')) {
      classType = 'P';
    }

    schedules.push({
      id: schedules.length + 1,
      room_name: roomName,
      building: buildingName,
      day_of_week: currentDayOfWeek,
      day_name: currentDay || DAY_NAMES[currentDayOfWeek] || 'ไม่ระบุ',
      start_time: `${startH}:${startM}:00`,
      end_time: `${endH}:${endM}:00`,
      time_display: `${startH}:${startM} - ${endH}:${endM} น.`,
      subject_code: subjectCode,
      subject_name: subjectName,
      short_name: generateShortName(subjectName),
      class_type: classType,
      section_group: sectionGroup,
      instructor: instructor,
      late_threshold_mins: 15,
      is_active: true
    });
  }

  return schedules;
}

// Persist store to in-memory state and Supabase Cloud (Single Source of Truth)
function persistStore(current) {
  store = current;

  // Cloud Sync: อัปเดตขึ้น Supabase Cloud ทันที (Background Safe Async)
  if (supabase) {
    supabase
      .from('room_schedules')
      .upsert({ id: 1, data: current, updated_at: new Date().toISOString() })
      .then(({ error }) => {
        if (!error) {
          console.log('☁️ [Supabase] ซิงก์ตารางเรียนขึ้น Cloud สำเร็จ');
        } else if (error.code !== '42P01') {
          console.warn('⚠️ [Supabase] ซิงก์ตารางเรียนขึ้น Cloud ไม่สำเร็จ:', error.message);
        }
      })
      .catch(() => {});
  }
}

// โหลดข้อมูลตารางเรียนตั้งต้นจาก Seed File (ใช้เฉพาะกรณีเซิร์ฟเวอร์เปิดครั้งแรกสุดที่ Supabase ยังว่างเปล่า)
function getInitialSeed() {
  if (fs.existsSync(SEED_FILE)) {
    try {
      const seedRaw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      if (seedRaw && Array.isArray(seedRaw.rooms) && Array.isArray(seedRaw.schedules)) {
        return seedRaw;
      }
    } catch (e) {
      console.warn('⚠️ [Multi-Room] ไม่สามารถอ่านไฟล์ Seed ได้:', e.message);
    }
  }
  return { rooms: [], active_device_room: null, schedules: [] };
}

// ซิงก์ข้อมูลตารางเรียนและประวัติการเข้าเรียนจาก Supabase Cloud เมื่อบู๊ตเซิร์ฟเวอร์
async function syncFromSupabase() {
  if (!supabase) return;
  try {
    // 1. ซิงก์ตารางเรียนจาก Supabase
    const { data: schedData, error: schedErr } = await supabase
      .from('room_schedules')
      .select('data')
      .eq('id', 1)
      .maybeSingle();

    if (!schedErr && schedData && schedData.data && Array.isArray(schedData.data.rooms) && schedData.data.rooms.length > 0) {
      store = schedData.data;
      console.log(`☁️ [Supabase] โหลดตารางเรียนจาก Cloud สำเร็จ: ${store.rooms.length} ห้อง (${store.schedules.length} คาบ)`);
    } else if (!schedErr && (!schedData || !schedData.data)) {
      // หากตารางบน Cloud ยังว่างเปล่า ให้หยอดข้อมูลตั้งต้นจาก Seed เข้าไปเป็นค่าเริ่มต้น
      store = getInitialSeed();
      await supabase.from('room_schedules').upsert({ id: 1, data: store, updated_at: new Date().toISOString() });
      console.log('☁️ [Supabase] เริ่มต้นบันทึกตารางเรียนตั้งต้นขึ้น Cloud สำเร็จ');
    }

    // 2. ซิงก์ประวัติการเช็คชื่อตามคาบเรียนจาก Supabase
    const { data: attData, error: attErr } = await supabase
      .from('session_attendance')
      .select('*')
      .order('id', { ascending: true });

    if (!attErr && Array.isArray(attData) && attData.length > 0) {
      attendanceRecords = attData.map(r => ({
        id: r.id,
        schedule_id: r.schedule_id,
        room_name: r.room_name,
        subject_code: r.subject_code,
        subject_name: r.subject_name,
        short_name: r.short_name,
        class_type: r.class_type,
        user_id: r.user_id,
        student_id: r.student_id,
        user_name: r.user_name,
        fingerprint_id: r.fingerprint_id || 0,
        date: r.date,
        time: r.time,
        timestamp: r.timestamp,
        week_number: r.week_number,
        year: r.year,
        year_week: r.year_week,
        attendance_status: r.attendance_status,
        score: r.score || 0
      }));
      console.log(`☁️ [Supabase] โหลดประวัติการเข้าเรียนจาก Cloud สำเร็จ: ${attendanceRecords.length} รายการ`);
    }
  } catch (err) {
    if (err && err.code !== '42P01') {
      console.warn('⚠️ [Supabase] การซิงก์ข้อมูลตารางเรียน/เข้าเรียนจาก Cloud ล้มเหลว:', err.message);
    }
  }
}

// Ingest from memory store or seed file with backward compatibility
function initStore() {
  if (store && Array.isArray(store.rooms) && Array.isArray(store.schedules)) {
    return store;
  }
  store = getInitialSeed();
  return store;
}

store = initStore();

function getStore() {
  if (!store || !Array.isArray(store.rooms) || !Array.isArray(store.schedules)) {
    store = initStore();
  }
  return store;
}

// Get all rooms list & active device room
function getRooms() {
  const current = getStore();
  const roomsWithCount = (current.rooms || []).map(r => {
    const roomName = r.room_name || r.name;
    const count = current.schedules.filter(s => s.room_name === roomName).length;
    return {
      name: roomName,
      room_name: roomName,
      building: r.building || 'เทคนิคคอมพิวเตอร์',
      schedule_count: count,
      created_at: r.created_at
    };
  });
  return {
    rooms: roomsWithCount,
    active_device_room: current.active_device_room || (roomsWithCount[0] ? roomsWithCount[0].name : 'ทค.1-101')
  };
}

// Get active device room name
function getActiveDeviceRoom() {
  const current = getStore();
  return current.active_device_room || (current.rooms[0] ? current.rooms[0].room_name : 'ทค.1-101');
}

// Set active device room
function setActiveDeviceRoom(roomName) {
  const current = getStore();
  const exists = current.rooms.some(r => r.room_name === roomName);
  if (!exists) {
    throw new Error(`ไม่พบห้อง "${roomName}" ในระบบ`);
  }
  current.active_device_room = roomName;
  persistStore(current);
  console.log(`📍 [Device Room] สลับห้องประจำเครื่อง Uno Q เป็น: "${roomName}"`);
  return current.active_device_room;
}

// Get schedules filtered by room name (defaults to active_device_room if omitted)
function getSchedulesByRoom(roomName) {
  const current = getStore();
  const targetRoom = roomName || getActiveDeviceRoom();
  return current.schedules.filter(s => s.room_name === targetRoom);
}

// Compatibility getter
function getAllSchedules(roomName) {
  return getSchedulesByRoom(roomName);
}

// Find schedule by ID across all rooms
function getScheduleById(id) {
  const current = getStore();
  const numId = parseInt(id, 10);
  return current.schedules.find(s => s.id === numId) || null;
}

// Preview parsed Excel data without saving
function previewExcelData(filePathOrBuffer) {
  const wb = readExcelBuffer(filePathOrBuffer);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let detectedRoom = 'ทค.1-101';
  let detectedBuilding = 'เทคนิคคอมพิวเตอร์';

  for (let r = 0; r < Math.min(10, rawData.length); r++) {
    const rowStr = (rawData[r] || []).join(' ');
    if (rowStr.includes('ห้อง')) {
      const match = rowStr.match(/ห้อง\s*([^\s]+)/);
      if (match) detectedRoom = match[1].trim();
    }
    if (rowStr.includes('อาคาร')) {
      const match = rowStr.match(/อาคาร\s*([^\s]+)/);
      if (match) detectedBuilding = match[1].trim();
    }
  }

  const parsed = parseExcelData(filePathOrBuffer, detectedRoom, detectedBuilding);
  const current = getStore();
  const is_existing = current.rooms.some(r => r.room_name === detectedRoom);

  const existingCount = current.schedules.filter(s => s.room_name === detectedRoom).length;
  return {
    detected_room_name: detectedRoom,
    detected_building: detectedBuilding,
    room_name: detectedRoom,
    building: detectedBuilding,
    action: is_existing ? 'REPLACE' : 'CREATE_NEW',
    is_existing: is_existing,
    is_existing_room: is_existing,
    existing_schedule_count: existingCount,
    new_schedule_count: parsed.length,
    count: parsed.length,
    preview: parsed.slice(0, 5),
    sample_schedules: parsed.slice(0, 5),
    schedules: parsed
  };
}

// Save imported room schedules (replaces that room if existing, creates new room if different)
function saveRoomSchedules(parsedSchedules, roomName, building) {
  const current = getStore();
  const targetRoom = roomName || (parsedSchedules[0] ? parsedSchedules[0].room_name : 'ทค.1-101');
  const targetBuilding = building || (parsedSchedules[0] ? parsedSchedules[0].building : 'เทคนิคคอมพิวเตอร์');

  // Update attributes on parsed schedules
  parsedSchedules.forEach(s => {
    s.room_name = targetRoom;
    s.building = targetBuilding;
  });

  const is_existing = current.rooms.some(r => r.room_name === targetRoom);

  // 1. Remove old schedules for this specific room only
  current.schedules = current.schedules.filter(s => s.room_name !== targetRoom);

  // 2. Assign unique sequential IDs
  let maxId = current.schedules.reduce((m, s) => Math.max(m, s.id || 0), 0);
  parsedSchedules.forEach(s => {
    maxId++;
    s.id = maxId;
  });
  current.schedules.push(...parsedSchedules);

  // 3. Update or add room to rooms list
  if (!is_existing) {
    current.rooms.push({
      room_name: targetRoom,
      building: targetBuilding,
      created_at: new Date().toISOString()
    });
    console.log(`✨ [Multi-Room] สร้างแดชบอร์ดห้องเรียนใหม่: "${targetRoom}" (${parsedSchedules.length} คาบ)`);
  } else {
    console.log(`🔄 [Multi-Room] แทนที่ตารางเรียนเดิมของห้อง: "${targetRoom}" (${parsedSchedules.length} คาบ)`);
  }

  // If no active room yet, set to this room
  if (!current.active_device_room) {
    current.active_device_room = targetRoom;
  }

  // Persist
  persistStore(current);

  return {
    success: true,
    room_name: targetRoom,
    building: targetBuilding,
    count: parsedSchedules.length,
    is_new_room: !is_existing,
    rooms: current.rooms,
    active_device_room: current.active_device_room
  };
}

// Delete room & its schedules and session attendance (Full Purge)
function deleteRoom(roomName) {
  const current = getStore();
  const roomIdx = current.rooms.findIndex(r => r.room_name === roomName);
  if (roomIdx === -1) {
    throw new Error(`ไม่พบห้อง "${roomName}" ในระบบ`);
  }

  // Collect schedule IDs of this room to purge attendance
  const deletedScheduleIds = new Set(
    current.schedules.filter(s => s.room_name === roomName).map(s => s.id)
  );

  // 1. Remove room
  current.rooms.splice(roomIdx, 1);

  // 2. Remove schedules
  current.schedules = current.schedules.filter(s => s.room_name !== roomName);

  // 3. Fallback active device room if the deleted room was active
  if (current.active_device_room === roomName) {
    current.active_device_room = current.rooms[0] ? current.rooms[0].room_name : null;
  }

  persistStore(current);

  // 4. Full Purge: remove session attendance records matching this room from RAM and Supabase Cloud
  attendanceRecords = attendanceRecords.filter(r => !deletedScheduleIds.has(r.schedule_id) && r.room_name !== roomName);

  if (supabase) {
    supabase
      .from('session_attendance')
      .delete()
      .eq('room_name', roomName)
      .then(() => {})
      .catch(() => {});
  }

  console.log(`🗑️ [Multi-Room] ลบห้อง "${roomName}" และล้างข้อมูลตาราง/ประวัติการเช็คชื่อเรียบร้อยแล้ว (Full Purge)`);

  return {
    success: true,
    deleted_room: roomName,
    remaining_rooms: current.rooms,
    active_device_room: current.active_device_room
  };
}

// Determine active schedule based on current time in UTC+7 (Bangkok) for a specific room
function getActiveSchedule(dateObj = new Date(), roomName = null) {
  const targetRoom = roomName || getActiveDeviceRoom();
  const roomSchedules = getSchedulesByRoom(targetRoom);

  if (!roomSchedules || roomSchedules.length === 0) {
    return { schedule: null, attendanceStatus: 'OUT_OF_SCHEDULE', isOutsideSchedule: true, room_name: targetRoom };
  }

  // Convert to Thai Time (UTC+7)
  const utc = dateObj.getTime() + dateObj.getTimezoneOffset() * 60000;
  const thaiDate = new Date(utc + 7 * 3600000);

  const dayOfWeek = thaiDate.getDay() === 0 ? 7 : thaiDate.getDay(); // 1=Mon ... 7=Sun
  const currentMinutes = thaiDate.getHours() * 60 + thaiDate.getMinutes();

  // Find schedules for today for this room
  const todaySchedules = roomSchedules.filter(s => s.day_of_week === dayOfWeek && s.is_active);

  const parseMin = (timeStr) => {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  };

  // Rule 1: Early check-in allowed 15 mins before start.
  // Rule 2: Consecutive classes rule: Priority goes to upcoming class during 15-min handoff
  for (const s of todaySchedules) {
    const startM = parseMin(s.start_time);
    const earlyStartM = startM - 15;
    if (currentMinutes >= earlyStartM && currentMinutes < startM) {
      return {
        schedule: s,
        attendanceStatus: 'ON_TIME',
        isEarly: true,
        isOutsideSchedule: false,
        room_name: targetRoom,
        thaiTimeStr: `${String(thaiDate.getHours()).padStart(2, '0')}:${String(thaiDate.getMinutes()).padStart(2, '0')}`
      };
    }
  }

  // Then check ongoing classes (start_time <= current < end_time)
  for (const s of todaySchedules) {
    const startM = parseMin(s.start_time);
    const endM = parseMin(s.end_time);

    if (currentMinutes >= startM && currentMinutes < endM) {
      const lateThreshold = startM + (s.late_threshold_mins || 15);
      const isLate = currentMinutes > lateThreshold;
      return {
        schedule: s,
        attendanceStatus: isLate ? 'LATE' : 'ON_TIME',
        isEarly: false,
        isOutsideSchedule: false,
        room_name: targetRoom,
        thaiTimeStr: `${String(thaiDate.getHours()).padStart(2, '0')}:${String(thaiDate.getMinutes()).padStart(2, '0')}`
      };
    }
  }

  // No active class right now
  return {
    schedule: null,
    attendanceStatus: 'OUT_OF_SCHEDULE',
    isOutsideSchedule: true,
    room_name: targetRoom,
    thaiTimeStr: `${String(thaiDate.getHours()).padStart(2, '0')}:${String(thaiDate.getMinutes()).padStart(2, '0')}`
  };
}

// Load attendance records from in-memory cache (synchronized with Supabase Cloud)
function loadAttendanceRecords(seed = undefined) {
  if (seed !== undefined && seed !== null) {
    attendanceRecords = seed;
  }
  return attendanceRecords;
}

// Update user details (name and/or student_id) in in-memory attendance records
function updateUserDetails(userId, { name, studentId }) {
  const uid = parseInt(userId);
  attendanceRecords.forEach(r => {
    if (r.user_id === uid) {
      if (name !== undefined) r.user_name = name.trim();
      if (studentId !== undefined) r.student_id = studentId.trim();
    }
  });
}

// ISO Week Calculation (ปฏิทินสากล ISO-8601 Week 1-52)
function getIsoWeekDetails(d = new Date()) {
  let date;
  if (typeof d === 'string') {
    date = new Date(d.includes('T') ? d : d + 'T12:00:00+07:00');
  } else {
    date = new Date(d.getTime());
  }

  // Adjust for Bangkok UTC+7
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  const year = utc.getUTCFullYear();
  const yearWeek = `${year}-W${String(weekNo).padStart(2, '0')}`;
  return { weekNo, year, yearWeek };
}

// Get Thai string representing the week date range (เช่น "7 - 13 ก.ย. 2569")
function getWeekRangeText(year, weekNo) {
  const simple = new Date(Date.UTC(year, 0, 1 + (weekNo - 1) * 7));
  const dayOfWeek = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  if (dayOfWeek <= 4) {
    monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
  } else {
    monday.setUTCDate(simple.getUTCDate() + 8 - dayOfWeek);
  }
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const monthsTh = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const mDay = monday.getUTCDate();
  const mMonth = monthsTh[monday.getUTCMonth() + 1];
  const sDay = sunday.getUTCDate();
  const sMonth = monthsTh[sunday.getUTCMonth() + 1];
  const yearTh = sunday.getUTCFullYear() + 543;

  return `${mDay} ${mMonth === sMonth ? '' : mMonth + ' '}- ${sDay} ${sMonth} ${yearTh}`;
}

// Check if user already checked in to this schedule in this week (1 ครั้งต่อสัปดาห์ต่อวิชา)
function checkAlreadyCheckedIn(userId, scheduleId, yearWeek, dateStr) {
  if (!scheduleId || !userId) return false;
  const records = loadAttendanceRecords();
  return records.some(r => {
    if (r.user_id !== userId || r.schedule_id !== parseInt(scheduleId)) return false;
    if (yearWeek && r.year_week) {
      return r.year_week === yearWeek;
    }
    if (dateStr && r.date) {
      return r.date === dateStr;
    }
    return false;
  });
}

// Record a session attendance log with weekly metadata
function recordSessionAttendance(record) {
  if (!record.year_week || !record.week_number) {
    const d = record.date ? new Date(record.date + 'T12:00:00+07:00') : new Date();
    const iso = getIsoWeekDetails(d);
    record.week_number = iso.weekNo;
    record.year = iso.year;
    record.year_week = iso.yearWeek;
  }

  // ป้องกันการบันทึกซ้ำในแคชความจำ
  const isDuplicate = attendanceRecords.some(r => 
    r.user_id === record.user_id && 
    r.schedule_id === record.schedule_id && 
    r.year_week === record.year_week
  );
  if (isDuplicate) {
    return record;
  }

  const maxId = attendanceRecords.reduce((m, r) => Math.max(m, r.id || 0), 0);
  record.id = maxId + 1;
  attendanceRecords.push(record);

  // Asynchronous cloud sync to Supabase (Background Safe Async)
  if (supabase) {
    const row = {
      schedule_id: record.schedule_id,
      room_name: record.room_name,
      subject_code: record.subject_code,
      subject_name: record.subject_name,
      short_name: record.short_name,
      class_type: record.class_type,
      user_id: record.user_id,
      student_id: record.student_id,
      user_name: record.user_name,
      fingerprint_id: record.fingerprint_id || 0,
      date: record.date,
      time: record.time,
      timestamp: record.timestamp,
      week_number: record.week_number,
      year: record.year,
      year_week: record.year_week,
      attendance_status: record.attendance_status,
      score: record.score || 0
    };
    supabase
      .from('session_attendance')
      .insert(row)
      .then(({ error }) => {
        if (error && error.code !== '42P01') {
          console.warn('⚠️ [Supabase] บันทึกเวลาเข้าเรียนขึ้น Cloud ไม่สำเร็จ:', error.message);
        }
      })
      .catch(() => {});
  }

  return record;
}

// Get session attendance summary for a schedule, grouped or filtered by week
function getSessionAttendance(scheduleId, options = {}) {
  const current = getStore();
  const schedule = current.schedules.find(s => s.id === parseInt(scheduleId));
  const records = loadAttendanceRecords();
  const schedRecords = records.filter(r => r.schedule_id === parseInt(scheduleId));

  // Current Week
  const nowThai = new Date(Date.now() + 7 * 3600000);
  const currentIso = getIsoWeekDetails(nowThai);

  // Parse filter options
  let targetWeek = null;
  let targetDate = null;
  if (typeof options === 'string') {
    if (options.includes('-W')) {
      targetWeek = options;
    } else if (options.includes('-')) {
      targetDate = options;
    }
  } else if (typeof options === 'object' && options !== null) {
    targetWeek = options.week || null;
    targetDate = options.date || null;
  }

  // If no week or date is specified, default to the current week
  if (!targetWeek && !targetDate) {
    targetWeek = currentIso.yearWeek;
  }

  // Find all distinct weeks that exist for this schedule
  const weekMap = new Map();
  // Always include current week
  weekMap.set(currentIso.yearWeek, {
    yearWeek: currentIso.yearWeek,
    weekNo: currentIso.weekNo,
    year: currentIso.year,
    label: `สัปดาห์ที่ ${currentIso.weekNo} (${getWeekRangeText(currentIso.year, currentIso.weekNo)})`,
    isCurrent: true,
    totalAttendees: 0
  });

  schedRecords.forEach(r => {
    const yw = r.year_week || (r.date ? getIsoWeekDetails(r.date).yearWeek : currentIso.yearWeek);
    const wn = r.week_number || (r.date ? getIsoWeekDetails(r.date).weekNo : currentIso.weekNo);
    const yr = r.year || (r.date ? getIsoWeekDetails(r.date).year : currentIso.year);
    if (!weekMap.has(yw)) {
      weekMap.set(yw, {
        yearWeek: yw,
        weekNo: wn,
        year: yr,
        label: `สัปดาห์ที่ ${wn} (${getWeekRangeText(yr, wn)})`,
        isCurrent: (yw === currentIso.yearWeek),
        totalAttendees: 0
      });
    }
    const item = weekMap.get(yw);
    item.totalAttendees += 1;
  });

  // Sort available weeks descending (latest first)
  const availableWeeks = Array.from(weekMap.values()).sort((a, b) => b.yearWeek.localeCompare(a.yearWeek));

  // Filter records for the requested week / date
  let filtered = schedRecords;
  if (targetWeek) {
    filtered = filtered.filter(r => (r.year_week === targetWeek || (!r.year_week && r.date && getIsoWeekDetails(r.date).yearWeek === targetWeek)));
  } else if (targetDate) {
    filtered = filtered.filter(r => r.date === targetDate);
  }

  const onTimeCount = filtered.filter(r => r.attendance_status === 'ON_TIME').length;
  const lateCount = filtered.filter(r => r.attendance_status === 'LATE').length;

  return {
    schedule: schedule || null,
    selectedWeek: targetWeek,
    selectedDate: targetDate,
    currentWeek: currentIso.yearWeek,
    availableWeeks,
    totalAttendees: filtered.length,
    onTimeCount,
    lateCount,
    attendees: filtered
  };
}

// Export attendance report as Excel Buffer (Single Week / Date)
function exportAttendanceExcel(scheduleId, options = {}) {
  const { schedule, attendees, totalAttendees, onTimeCount, lateCount, selectedWeek, selectedDate } = getSessionAttendance(scheduleId, options);

  const title = schedule 
    ? `ใบเช็คชื่อวิชา ${schedule.subject_code} ${schedule.subject_name} [${schedule.class_type}]` 
    : 'ใบเช็คชื่อการเข้าใช้ห้องเรียน';

  const roomLabel = schedule ? `ห้อง ${schedule.room_name} อาคาร${schedule.building}` : 'ห้อง ทค.1-101 อาคารเทคนิคคอมพิวเตอร์';
  let periodLabel = 'ทุกสัปดาห์';
  if (selectedWeek) {
    const parts = selectedWeek.split('-W');
    const yr = parseInt(parts[0]);
    const wn = parseInt(parts[1]);
    periodLabel = `สัปดาห์ที่ ${wn} (${getWeekRangeText(yr, wn)})`;
  } else if (selectedDate) {
    periodLabel = `วันที่: ${selectedDate}`;
  }

  const rows = [
    ['ระบบลงเวลาด้วยลายนิ้วมืออัจฉริยะ (IoT Biometric Attendance System - RMUTL)'],
    [roomLabel],
    [title],
    [`รอบเวลา: ${periodLabel}, เวลาคาบเรียน: ${schedule ? schedule.time_display : '-'}`],
    [`อาจารย์ผู้สอน: ${schedule ? schedule.instructor : '-'}, แผนก/กลุ่มเรียน: ${schedule ? schedule.section_group : '-'}`],
    [`สรุปยอด: มาเรียนทั้งหมด ${totalAttendees} คน | ตรงเวลา ${onTimeCount} คน | มาสาย ${lateCount} คน`],
    [],
    ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'วันที่สแกน', 'เวลาที่สแกน', 'สัปดาห์', 'สถานะการเข้าเรียน', 'ความแม่นยำ (Score)']
  ];

  attendees.forEach((att, idx) => {
    const statusText = att.attendance_status === 'ON_TIME' ? 'ตรงเวลา' : (att.attendance_status === 'LATE' ? 'มาสาย' : 'นอกเวลาเรียน');
    rows.push([
      idx + 1,
      att.student_id || '-',
      att.user_name || '-',
      att.date || '-',
      att.time || '-',
      att.week_number ? `W${att.week_number}` : '-',
      statusText,
      att.score || 0
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 30 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Weekly Attendance');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Export attendance Matrix Excel (ภาพรวมทุกสัปดาห์ทั้งภาคการศึกษา)
function exportAttendanceMatrixExcel(scheduleId, allUsers = []) {
  const current = getStore();
  const schedule = current.schedules.find(s => s.id === parseInt(scheduleId));
  const records = loadAttendanceRecords();
  const schedRecords = records.filter(r => r.schedule_id === parseInt(scheduleId));

  // Current ISO week
  const nowThai = new Date(Date.now() + 7 * 3600000);
  const currentIso = getIsoWeekDetails(nowThai);

  // Collect all distinct weeks that exist
  const weekSet = new Set();
  schedRecords.forEach(r => {
    const yw = r.year_week || (r.date ? getIsoWeekDetails(r.date).yearWeek : currentIso.yearWeek);
    weekSet.add(yw);
  });
  // Always include current week
  weekSet.add(currentIso.yearWeek);

  // Sort weeks chronologically ascending
  const sortedWeeks = Array.from(weekSet).sort();

  // Header rows
  const title = schedule 
    ? `ใบสรุปการเข้าเรียนภาพรวมรายสัปดาห์ (Academic Matrix) - วิชา ${schedule.subject_code} ${schedule.subject_name} [${schedule.class_type}]` 
    : 'ใบสรุปการเข้าเรียนภาพรวมรายสัปดาห์';
  const roomLabel = schedule ? `ห้อง ${schedule.room_name} อาคาร${schedule.building}` : 'ห้อง ทค.1-101 อาคารเทคนิคคอมพิวเตอร์';

  const rows = [
    ['ระบบลงเวลาด้วยลายนิ้วมืออัจฉริยะ (IoT Biometric Attendance System - RMUTL)'],
    [title],
    [roomLabel],
    [`อาจารย์ผู้สอน: ${schedule ? schedule.instructor : '-'}, แผนก/กลุ่มเรียน: ${schedule ? schedule.section_group : '-'}, เวลาคาบเรียน: ${schedule ? schedule.time_display : '-'}`],
    [`จำนวนสัปดาห์ที่มีการบันทึก: ${sortedWeeks.length} สัปดาห์ | ข้อมูล ณ วันที่: ${nowThai.toISOString().split('T')[0]}`],
    []
  ];

  // Table header
  const headerRow = ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล'];
  sortedWeeks.forEach(yw => {
    const parts = yw.split('-W');
    const wn = parseInt(parts[1]);
    const yr = parseInt(parts[0]);
    headerRow.push(`W${wn} (${getWeekRangeText(yr, wn)})`);
  });
  headerRow.push('รวมมาตรงเวลา (ครั้ง)', 'รวมมาสาย (ครั้ง)', 'รวมเข้าเรียนทั้งหมด (ครั้ง)');
  rows.push(headerRow);

  // Collect students: only students who actually attended this specific subject (schedRecords)
  const userMap = new Map();
  schedRecords.forEach(r => {
    if (r.user_id && !userMap.has(r.user_id)) {
      userMap.set(r.user_id, {
        id: r.user_id,
        student_id: r.student_id || '',
        name: r.user_name || ''
      });
    }
  });
  const students = Array.from(userMap.values()).sort((a, b) => {
    return (a.student_id || '').localeCompare(b.student_id || '', undefined, { numeric: true });
  });

  // Populate row for each student
  if (students.length === 0) {
    rows.push(['-', '-', 'ยังไม่มีข้อมูลการเข้าเรียนในวิชานี้']);
  } else {
    students.forEach((u, idx) => {
      const row = [idx + 1, u.student_id || '-', u.name || '-'];
      let presentCount = 0;
      let lateCount = 0;

      sortedWeeks.forEach(yw => {
        const match = schedRecords.find(r => r.user_id === u.id && (r.year_week === yw || (!r.year_week && r.date && getIsoWeekDetails(r.date).yearWeek === yw)));
        if (match) {
          if (match.attendance_status === 'ON_TIME') {
            row.push('✓');
            presentCount++;
          } else if (match.attendance_status === 'LATE') {
            row.push('สาย');
            lateCount++;
          } else {
            row.push('✓');
            presentCount++;
          }
        } else {
          row.push('-');
        }
      });

      const totalAttended = presentCount + lateCount;
      row.push(presentCount, lateCount, totalAttended);
      rows.push(row);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Calculate column widths
  const colWidths = [
    { wch: 8 },
    { wch: 18 },
    { wch: 28 }
  ];
  sortedWeeks.forEach(() => {
    colWidths.push({ wch: 18 });
  });
  colWidths.push({ wch: 22 }, { wch: 18 }, { wch: 24 });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Matrix');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function normalizeText(str) {
  return (str || '').toString().replace(/\s+/g, ' ').trim().toLowerCase();
}

function isTeacherAuthorizedForSchedule(admin, schedule) {
  if (!admin) return false;
  const role = admin.role || 'super_admin';
  if (role === 'super_admin') return true;
  if (!schedule) return false;

  // 1. Check assigned_subjects (subject_code array)
  const assigned = Array.isArray(admin.assigned_subjects) ? admin.assigned_subjects : [];
  if (assigned.includes(schedule.subject_code)) {
    return true;
  }

  // 2. Check instructor_name (normalized equality or contains)
  const adminInstructor = normalizeText(admin.instructor_name);
  const schedInstructor = normalizeText(schedule.instructor);
  if (adminInstructor && schedInstructor) {
    if (schedInstructor === adminInstructor || schedInstructor.includes(adminInstructor) || adminInstructor.includes(schedInstructor)) {
      return true;
    }
  }

  return false;
}

function getSchedulesForAdmin(admin, room) {
  const all = getAllSchedules(room);
  if (!admin) return all;
  const role = admin.role || 'super_admin';
  if (role === 'super_admin') return all;
  return all.filter(s => isTeacherAuthorizedForSchedule(admin, s));
}

function getRoomsForAdmin(admin) {
  const roomsData = getRooms();
  if (!admin) return roomsData;
  const role = admin.role || 'super_admin';
  if (role === 'super_admin') return roomsData;

  const teacherSchedules = getSchedulesForAdmin(admin);
  const teacherRooms = new Set(teacherSchedules.map(s => s.room_name));

  return {
    ...roomsData,
    rooms: (roomsData.rooms || []).filter(r => teacherRooms.has(r.room_name))
  };
}

function getUniqueInstructors() {
  const current = getStore();
  const set = new Set();
  (current.schedules || []).forEach(s => {
    const inst = (s.instructor || '').replace(/\s+/g, ' ').trim();
    if (inst) set.add(inst);
  });
  return Array.from(set).sort();
}

function getUniqueSubjects() {
  const current = getStore();
  const map = new Map();
  (current.schedules || []).forEach(s => {
    if (s.subject_code && !map.has(s.subject_code)) {
      map.set(s.subject_code, {
        subject_code: s.subject_code,
        subject_name: s.subject_name,
        short_name: s.short_name,
        instructor: (s.instructor || '').replace(/\s+/g, ' ').trim()
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.subject_code.localeCompare(b.subject_code));
}

function overrideAttendanceRecord({ schedule_id, student_id, week, status, updated_by }) {
  const current = getStore();
  const sched = (current.schedules || []).find(s => s.id === parseInt(schedule_id));
  if (!sched) {
    throw new Error('ไม่พบข้อมูลตารางเรียน');
  }

  const targetWeek = week || getIsoWeekDetails(new Date()).year_week;
  let rec = attendanceRecords.find(r => 
    r.schedule_id === parseInt(schedule_id) && 
    r.student_id === student_id && 
    r.year_week === targetWeek
  );

  const cleanStatus = status === 'ON_TIME' ? 'ON_TIME' : (status === 'LATE' ? 'LATE' : 'ABSENT');
  const scoreVal = cleanStatus === 'ON_TIME' ? 1.0 : (cleanStatus === 'LATE' ? 0.5 : 0.0);

  if (rec) {
    rec.attendance_status = cleanStatus;
    rec.score = scoreVal;
    rec.updated_at = new Date().toISOString();
    rec.updated_by = updated_by;
  } else {
    const maxId = attendanceRecords.reduce((m, r) => Math.max(m, r.id || 0), 0);
    const now = new Date();
    const isoDetails = getIsoWeekDetails(now);
    rec = {
      id: maxId + 1,
      schedule_id: parseInt(schedule_id),
      room_name: sched.room_name,
      subject_code: sched.subject_code,
      subject_name: sched.subject_name,
      short_name: sched.short_name,
      class_type: sched.class_type,
      user_id: null,
      student_id: student_id,
      user_name: student_id,
      fingerprint_id: 0,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      timestamp: now.toISOString(),
      week_number: isoDetails.week,
      year: isoDetails.year,
      year_week: targetWeek,
      attendance_status: cleanStatus,
      score: scoreVal,
      created_at: now.toISOString(),
      updated_by: updated_by
    };
    attendanceRecords.push(rec);
  }

  // Cloud Sync to Supabase (Background Safe Async)
  if (supabase) {
    supabase
      .from('session_attendance')
      .upsert({
        schedule_id: rec.schedule_id,
        room_name: rec.room_name,
        subject_code: rec.subject_code,
        subject_name: rec.subject_name,
        short_name: rec.short_name,
        class_type: rec.class_type,
        user_id: rec.user_id,
        student_id: rec.student_id,
        user_name: rec.user_name,
        fingerprint_id: rec.fingerprint_id,
        date: rec.date,
        time: rec.time,
        timestamp: rec.timestamp,
        week_number: rec.week_number,
        year: rec.year,
        year_week: rec.year_week,
        attendance_status: rec.attendance_status,
        score: rec.score
      })
      .then(({ error }) => {
        if (error && error.code !== '42P01') {
          console.warn('⚠️ [Supabase] ซิงก์ override attendance ไม่สำเร็จ:', error.message);
        }
      })
      .catch(() => {});
  }

  return rec;
}

module.exports = {
  DAY_MAP,
  DAY_NAMES,
  parseExcelData,
  initStore,
  getRooms,
  getActiveDeviceRoom,
  setActiveDeviceRoom,
  getSchedulesByRoom,
  getAllSchedules,
  getScheduleById,
  persistStore,
  syncFromSupabase,
  previewExcelData,
  saveRoomSchedules,
  deleteRoom,
  getActiveSchedule,
  checkAlreadyCheckedIn,
  recordSessionAttendance,
  loadAttendanceRecords,
  updateUserDetails,
  getSessionAttendance,
  exportAttendanceExcel,
  exportAttendanceMatrixExcel,
  getIsoWeekDetails,
  getWeekRangeText,
  generateShortName,
  setSupabaseClient,
  normalizeText,
  isTeacherAuthorizedForSchedule,
  getSchedulesForAdmin,
  getRoomsForAdmin,
  getUniqueInstructors,
  getUniqueSubjects,
  overrideAttendanceRecord
};
