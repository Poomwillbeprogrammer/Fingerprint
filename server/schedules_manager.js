const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DATA_DIR = path.join(__dirname, 'data');
const SCHEDULES_FILE = path.join(DATA_DIR, 'room_schedules.json');
const SEED_FILE = path.join(__dirname, 'room_schedules.seed.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'session_attendance.json');
const DEFAULT_EXCEL_PATH = 'C:\\Users\\poomw\\Documents\\101.xlsx';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

// Read Excel file with support for files currently open in Excel
function readExcelBuffer(filePathOrBuffer) {
  if (Buffer.isBuffer(filePathOrBuffer)) {
    return XLSX.read(filePathOrBuffer, { type: 'buffer' });
  }
  const fd = fs.openSync(filePathOrBuffer, 'r');
  const stats = fs.fstatSync(fd);
  const buffer = Buffer.alloc(stats.size);
  fs.readSync(fd, buffer, 0, stats.size, 0);
  fs.closeSync(fd);
  return XLSX.read(buffer, { type: 'buffer' });
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

// Ingest from storage or seed file with backward compatibility
function initStore() {
  if (fs.existsSync(SCHEDULES_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
      if (Array.isArray(raw)) {
        // Migrate array to multi-room object
        const roomsSet = new Set();
        const roomsList = [];
        raw.forEach(s => {
          const rName = s.room_name || 'ทค.1-101';
          if (!roomsSet.has(rName)) {
            roomsSet.add(rName);
            roomsList.push({
              room_name: rName,
              building: s.building || 'เทคนิคคอมพิวเตอร์',
              created_at: new Date().toISOString()
            });
          }
        });
        if (roomsList.length === 0) {
          roomsList.push({ room_name: 'ทค.1-101', building: 'เทคนิคคอมพิวเตอร์', created_at: new Date().toISOString() });
        }
        const store = {
          rooms: roomsList,
          active_device_room: roomsList[0].room_name,
          schedules: raw
        };
        fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(store, null, 2), 'utf8');
        return store;
      } else if (raw && Array.isArray(raw.rooms) && Array.isArray(raw.schedules)) {
        return raw;
      }
    } catch (e) {
      console.warn('⚠️ [Multi-Room] ไฟล์ตารางเรียนเสียหาย กำลังโหลดใหม่...');
    }
  }

  // Fallback 1: Seed file
  if (fs.existsSync(SEED_FILE)) {
    try {
      const seedRaw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      const seedSchedules = Array.isArray(seedRaw) ? seedRaw : (seedRaw.schedules || []);
      const defaultRoom = (seedSchedules[0] && seedSchedules[0].room_name) || 'ทค.1-101';
      const store = {
        rooms: [{ room_name: defaultRoom, building: 'เทคนิคคอมพิวเตอร์', created_at: new Date().toISOString() }],
        active_device_room: defaultRoom,
        schedules: seedSchedules
      };
      fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(store, null, 2), 'utf8');
      return store;
    } catch (e) {}
  }

  // Fallback 2: Default Excel file
  if (fs.existsSync(DEFAULT_EXCEL_PATH)) {
    try {
      const parsed = parseExcelData(DEFAULT_EXCEL_PATH);
      const defaultRoom = (parsed[0] && parsed[0].room_name) || 'ทค.1-101';
      const store = {
        rooms: [{ room_name: defaultRoom, building: 'เทคนิคคอมพิวเตอร์', created_at: new Date().toISOString() }],
        active_device_room: defaultRoom,
        schedules: parsed
      };
      fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(store, null, 2), 'utf8');
      return store;
    } catch (e) {}
  }

  return { rooms: [], active_device_room: null, schedules: [] };
}

let store = initStore();

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
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(current, null, 2), 'utf8');
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
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(current, null, 2), 'utf8');

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

  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(current, null, 2), 'utf8');

  // 4. Full Purge: remove session attendance records matching this room
  try {
    if (fs.existsSync(ATTENDANCE_FILE)) {
      const records = JSON.parse(fs.readFileSync(ATTENDANCE_FILE, 'utf8'));
      if (Array.isArray(records)) {
        const filtered = records.filter(r => !deletedScheduleIds.has(r.schedule_id) && r.room_name !== roomName);
        fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(filtered, null, 2), 'utf8');
      }
    }
  } catch (e) {
    console.error('Error purging session attendance on room delete:', e);
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

// Load attendance records from persistent file
function loadAttendanceRecords() {
  if (fs.existsSync(ATTENDANCE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ATTENDANCE_FILE, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

// Check if user already checked in to this schedule today
function checkAlreadyCheckedIn(userId, scheduleId, dateStr) {
  if (!scheduleId) return false;
  const records = loadAttendanceRecords();
  return records.some(r => r.user_id === userId && r.schedule_id === scheduleId && r.date === dateStr);
}

// Record a session attendance log
function recordSessionAttendance(record) {
  const records = loadAttendanceRecords();
  record.id = records.length + 1;
  records.push(record);
  fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(records, null, 2), 'utf8');
  return record;
}

// Get session attendance summary for a schedule on a date
function getSessionAttendance(scheduleId, dateStr) {
  const current = getStore();
  const schedule = current.schedules.find(s => s.id === parseInt(scheduleId));
  const records = loadAttendanceRecords();

  const filtered = records.filter(r => r.schedule_id === parseInt(scheduleId) && (!dateStr || r.date === dateStr));

  const onTimeCount = filtered.filter(r => r.attendance_status === 'ON_TIME').length;
  const lateCount = filtered.filter(r => r.attendance_status === 'LATE').length;

  return {
    schedule: schedule || null,
    date: dateStr,
    totalAttendees: filtered.length,
    onTimeCount,
    lateCount,
    attendees: filtered
  };
}

// Export attendance report as Excel Buffer
function exportAttendanceExcel(scheduleId, dateStr) {
  const { schedule, attendees, totalAttendees, onTimeCount, lateCount } = getSessionAttendance(scheduleId, dateStr);

  const title = schedule 
    ? `ใบเช็คชื่อวิชา ${schedule.subject_code} ${schedule.subject_name} [${schedule.class_type}]` 
    : 'ใบเช็คชื่อการเข้าใช้ห้องเรียน';

  const roomLabel = schedule ? `ห้อง ${schedule.room_name} อาคาร${schedule.building}` : 'ห้อง ทค.1-101 อาคารเทคนิคคอมพิวเตอร์';

  const rows = [
    ['ระบบลงเวลาด้วยลายนิ้วมืออัจฉริยะ (IoT Biometric Attendance System)'],
    [roomLabel],
    [title],
    [`วันที่: ${dateStr || 'ทุกวัน'}, เวลาคาบ: ${schedule ? schedule.time_display : '-'}`],
    [`อาจารย์ผู้สอน: ${schedule ? schedule.instructor : '-'}, แผนก/ชั้นปี: ${schedule ? schedule.section_group : '-'}`],
    [`สรุปยอด: มาเรียนทั้งหมด ${totalAttendees} คน | ทันเวลา ${onTimeCount} คน | มาสาย ${lateCount} คน`],
    [],
    ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'เวลาที่สแกน', 'สถานะการเข้าเรียน', 'ความแม่นยำ (Score)']
  ];

  attendees.forEach((att, idx) => {
    const statusText = att.attendance_status === 'ON_TIME' ? 'ทันเวลา' : (att.attendance_status === 'LATE' ? 'มาสาย' : 'นอกเวลาเรียน');
    rows.push([
      idx + 1,
      att.student_id || '-',
      att.user_name || '-',
      att.time || att.timestamp || '-',
      statusText,
      att.score || 0
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 30 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Sheet');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
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
  previewExcelData,
  saveRoomSchedules,
  deleteRoom,
  getActiveSchedule,
  checkAlreadyCheckedIn,
  recordSessionAttendance,
  loadAttendanceRecords,
  getSessionAttendance,
  exportAttendanceExcel,
  generateShortName
};
