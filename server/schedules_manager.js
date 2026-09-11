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
function parseExcelData(filePathOrBuffer) {
  const wb = readExcelBuffer(filePathOrBuffer);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let roomName = 'ทค.1-101';
  let buildingName = 'เทคนิคคอมพิวเตอร์';

  // Attempt to extract header info
  for (let r = 0; r < Math.min(10, rawData.length); r++) {
    const rowStr = (rawData[r] || []).join(' ');
    if (rowStr.includes('ห้อง')) {
      const match = rowStr.match(/ห้อง\s*([^\s]+)/);
      if (match) roomName = match[1].trim();
    }
    if (rowStr.includes('อาคาร')) {
      const match = rowStr.match(/อาคาร\s*([^\s]+)/);
      if (match) buildingName = match[1].trim();
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

// Ingest from default Excel file or fallback
function initSchedules() {
  if (fs.existsSync(SCHEDULES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0 && data[0].day_of_week > 0) {
        console.log(`📅 [Room Schedules] โหลดตารางเรียนห้อง ทค.1-101 สำเร็จ: ${data.length} คาบ`);
        return data;
      }
    } catch (e) {
      console.warn('⚠️ [Room Schedules] ไฟล์ตารางเรียนเสียหาย กำลังนำเข้าใหม่...');
    }
  }

  if (fs.existsSync(DEFAULT_EXCEL_PATH)) {
    try {
      console.log(`📥 [Room Schedules] กำลังนำเข้าตารางเรียนจาก: ${DEFAULT_EXCEL_PATH}`);
      const schedules = parseExcelData(DEFAULT_EXCEL_PATH);
      fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf8');
      console.log(`✅ [Room Schedules] นำเข้าสำเร็จ: ${schedules.length} คาบเรียน`);
      return schedules;
    } catch (err) {
      console.error('Error parsing default Excel file:', err);
    }
  }

  if (fs.existsSync(SEED_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✅ [Room Schedules] โหลดตารางเรียนเริ่มต้นสำเร็จ: ${data.length} คาบ`);
        return data;
      }
    } catch (err) {
      console.error('Error reading seed schedules:', err);
    }
  }

  return [];
}

let loadedSchedules = initSchedules();

// Get all schedules
function getAllSchedules() {
  if (!loadedSchedules || loadedSchedules.length === 0 || loadedSchedules[0].day_of_week === 0) {
    loadedSchedules = initSchedules();
  }
  return loadedSchedules;
}

// Save imported schedules
function saveImportedSchedules(schedules) {
  loadedSchedules = schedules;
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf8');
  return loadedSchedules;
}

// Determine active schedule based on current time in UTC+7 (Bangkok)
function getActiveSchedule(dateObj = new Date()) {
  const all = getAllSchedules();
  if (!all || all.length === 0) {
    return { schedule: null, attendanceStatus: 'OUT_OF_SCHEDULE', isOutsideSchedule: true };
  }

  // Convert to Thai Time (UTC+7)
  const utc = dateObj.getTime() + dateObj.getTimezoneOffset() * 60000;
  const thaiDate = new Date(utc + 7 * 3600000);

  const dayOfWeek = thaiDate.getDay() === 0 ? 7 : thaiDate.getDay(); // 1=Mon ... 7=Sun
  const currentMinutes = thaiDate.getHours() * 60 + thaiDate.getMinutes();

  // Find schedules for today
  const todaySchedules = all.filter(s => s.day_of_week === dayOfWeek && s.is_active);

  const parseMin = (timeStr) => {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  };

  // Rule 1: Early check-in allowed 15 mins before start.
  // Rule 2: Consecutive classes rule: If Class 1 ends at 11:00 and Class 2 starts at 11:00,
  // during 10:45 to 11:00 (15 mins prior), priority goes to Class 2 (upcoming class)!
  for (const s of todaySchedules) {
    const startM = parseMin(s.start_time);
    const earlyStartM = startM - 15;
    if (currentMinutes >= earlyStartM && currentMinutes < startM) {
      return {
        schedule: s,
        attendanceStatus: 'ON_TIME',
        isEarly: true,
        isOutsideSchedule: false,
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
        thaiTimeStr: `${String(thaiDate.getHours()).padStart(2, '0')}:${String(thaiDate.getMinutes()).padStart(2, '0')}`
      };
    }
  }

  // No active class right now
  return {
    schedule: null,
    attendanceStatus: 'OUT_OF_SCHEDULE',
    isOutsideSchedule: true,
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
  const schedules = getAllSchedules();
  const schedule = schedules.find(s => s.id === parseInt(scheduleId));
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

  const rows = [
    ['ระบบลงเวลาด้วยลายนิ้วมืออัจฉริยะ (IoT Biometric Attendance System)'],
    ['ห้อง ทค.1-101 อาคารเทคนิคคอมพิวเตอร์'],
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
  initSchedules,
  getAllSchedules,
  saveImportedSchedules,
  getActiveSchedule,
  checkAlreadyCheckedIn,
  recordSessionAttendance,
  getSessionAttendance,
  exportAttendanceExcel,
  generateShortName
};
