const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { dbAsync, initDatabase } = require('./database');
const schedulesManager = require('./schedules_manager');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ [Security Fatal Error] Missing JWT_SECRET in environment variables.');
  process.exit(1);
}
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'fingerprint_unoq_bridge_secure_token_2026';
const TARGET_PORT = process.env.SERIAL_PORT || 'COM12';
const SERIAL_ENABLED = process.env.SERIAL_ENABLED !== 'false';
const BAUD_RATE = 115200;

// Rate Limiter สำหรับป้องกัน Brute Force บนหน้าล็อกอิน
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 นาที
  max: 5, // สูงสุด 5 ครั้งต่อนาทีต่อ IP
  message: { error: 'ลองเข้าสู่ระบบถี่เกินไป กรุณารอ 1 นาทีแล้วลองใหม่อีกครั้ง' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
function authRequired(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง' });
  }
}

// บรอดแคสต์แคชรายชื่อนักศึกษาให้ทุก Bridge และ Client
async function broadcastUsersCache() {
  try {
    const users = await dbAsync.all('SELECT id, name, student_id FROM users');
    io.emit('sync_users_cache', users || []);
    console.log(`📦 [Sync Cache] ส่งแคชรายชื่อนักศึกษา (${users.length} คน) ให้ทุก Client แล้ว`);
  } catch (err) {
    console.error('Error broadcasting users cache:', err);
  }
}

// บรอดแคสต์ตารางเรียนให้ทุก Bridge และ Client
function broadcastSchedulesCache() {
  try {
    const schedules = schedulesManager.getAllSchedules();
    io.emit('sync_schedules_cache', schedules || []);
    console.log(`📅 [Sync Schedules] ส่งตารางเรียน (${schedules.length} คาบ) ให้ทุก Client แล้ว`);
  } catch (err) {
    console.error('Error broadcasting schedules cache:', err);
  }
}

// ==========================================
// 1. SerialPort Hardware Bridge (Arduino UNO Q & R307)
// ==========================================
let serialPort = null;
let serialParser = null;
let currentEnrollId = null;
let currentEnrollSession = null;
let serialConnected = false;
let reconnectTimer = null;

function initSerial() {
  if (serialPort && serialPort.isOpen) return;

  console.log(`🔌 [Serial] กำลังเชื่อมต่อไปยัง Arduino บนพอร์ต ${TARGET_PORT}...`);

  try {
    serialPort = new SerialPort({
      path: TARGET_PORT,
      baudRate: BAUD_RATE,
      autoOpen: false
    });

    serialParser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    serialPort.open((err) => {
      if (err) {
        serialConnected = false;
        console.warn(`⚠️ [Serial] ไม่สามารถเปิดพอร์ต ${TARGET_PORT}: ${err.message}`);
        if (err.message.includes('Access denied')) {
          console.warn(`💡 [คำแนะนำ] พอร์ต ${TARGET_PORT} กำลังถูกใช้งานโดยโปรแกรมอื่น (เช่น Serial Monitor ใน Arduino IDE) กรุณาปิด Serial Monitor ก่อน`);
        }
        scheduleReconnect();
        return;
      }

      serialConnected = true;
      console.log(`✅ [Serial] เชื่อมต่อบอร์ด Arduino บน ${TARGET_PORT} สำเร็จ!`);
      io.emit('serial_status', { connected: true, port: TARGET_PORT });
    });

    serialParser.on('data', handleSerialData);

    serialPort.on('error', (err) => {
      console.error(`❌ [Serial Error] ${err.message}`);
      serialConnected = false;
      io.emit('serial_status', { connected: false, port: TARGET_PORT, error: err.message });
      scheduleReconnect();
    });

    serialPort.on('close', () => {
      console.warn(`🔌 [Serial] พอร์ต ${TARGET_PORT} ปิดการเชื่อมต่อ`);
      serialConnected = false;
      io.emit('serial_status', { connected: false, port: TARGET_PORT });
      scheduleReconnect();
    });

  } catch (err) {
    console.error(`❌ [Serial Exception] ${err.message}`);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!serialConnected) {
      initSerial();
    }
  }, 4000);
}

let hardwareBridgeSocket = null;

function sendSerialCommand(cmd) {
  if (serialPort && serialPort.isOpen) {
    const fullCmd = cmd + '\n';
    console.log(`📤 [Serial Send] -> ${cmd.length > 50 ? cmd.substring(0, 35) + '... (' + cmd.length + ' chars)' : cmd}`);
    if (fullCmd.length > 60) {
      let offset = 0;
      const writeSlice = () => {
        if (offset < fullCmd.length) {
          const slice = fullCmd.substring(offset, offset + 48);
          offset += 48;
          serialPort.write(slice, (err) => {
            if (!err) setTimeout(writeSlice, 10);
          });
        } else {
          console.log('✅ [Serial Write Done]');
        }
      };
      writeSlice();
    } else {
      serialPort.write(fullCmd, (err) => {
        if (err) console.error(`❌ [Serial Write Error] ${err.message}`);
      });
    }
    return true;
  } else if (hardwareBridgeSocket && hardwareBridgeSocket.connected) {
    console.log(`📡 [Bridge Send] -> ${cmd.length > 50 ? cmd.substring(0, 35) + '... (' + cmd.length + ' chars)' : cmd}`);
    hardwareBridgeSocket.emit('bridge_command', cmd);
    return true;
  } else {
    console.warn(`⚠️ [Hardware] ไม่มีอุปกรณ์เชื่อมต่อ (Serial Offline & Bridge Offline) ไม่สามารถส่งคำสั่ง: ${cmd}`);
    return false;
  }
}

let pendingRestore = null;

function sendNextRestoreChunk() {
  if (!pendingRestore) return;
  pendingRestore.currentChunk++;
  const part = pendingRestore.currentChunk;
  if (part <= 4) {
    const start = (part - 1) * 256;
    const hexPart = pendingRestore.template.substring(start, start + 256);
    console.log(`📤 [Restore] ส่งข้อมูลส่วนที่ ${part}/4 ของ ID #${pendingRestore.id}`);
    sendSerialCommand(`RESTORE_CHUNK ${part} ${hexPart}`);
  }
}

// ==========================================
// 1.1 Tier 2 Database Candidate Search & Auto-Promote
// ==========================================
let tier2SearchQueue = [];
let tier2ActiveCandidate = null;
let tier2SearchTimer = null;
let pendingCompare = null;

function sendNextCompareChunk() {
  if (!pendingCompare) return;
  pendingCompare.currentChunk++;
  const part = pendingCompare.currentChunk;
  if (part <= 4) {
    const start = (part - 1) * 256;
    const hexPart = pendingCompare.template.substring(start, start + 256);
    sendSerialCommand(`COMPARE_CHUNK ${part} ${hexPart}`);
  }
}

async function startTier2Search() {
  console.log('🔍 [Tier 2] เริ่มต้นค้นหา candidate จาก Database...');
  // ค้นหาผู้ใช้ที่อยู่นอกเซนเซอร์ (in_sensor = 0 หรือถูก demote ออกไป)
  // เรียงลำดับตามผู้ที่สแกนล่าสุด หรือสร้างล่าสุดก่อน (Most likely candidate first)
  const candidates = await dbAsync.all(`
    SELECT id, name, fingerprint_template 
    FROM users 
    WHERE (in_sensor = 0 OR in_sensor IS NULL) AND fingerprint_template IS NOT NULL AND length(fingerprint_template) >= 512
    ORDER BY COALESCE(last_scanned_at, created_at) DESC
    LIMIT 60
  `);

  if (!candidates || candidates.length === 0) {
    console.log('⚠️ [Tier 2] ไม่มี candidate ใน Database ที่อยู่นอกเซนเซอร์');
    sendSerialCommand('CANCEL_TIER2');
    return;
  }

  console.log(`📋 [Tier 2] พบผู้ใช้ ${candidates.length} รายใน Database ที่ต้องตรวจสอบ`);
  tier2SearchQueue = [...candidates];
  
  if (tier2SearchTimer) clearTimeout(tier2SearchTimer);
  tier2SearchTimer = setTimeout(() => {
    console.log('⏰ [Tier 2] ค้นหาหมดเวลา (Timeout 4.5s)');
    tier2SearchQueue = [];
    pendingCompare = null;
    sendSerialCommand('CANCEL_TIER2');
  }, 4500);

  checkNextTier2Candidate();
}

function checkNextTier2Candidate() {
  if (tier2SearchQueue.length === 0) {
    console.log('❌ [Tier 2] ตรวจสอบครบทุก candidate แล้ว ไม่พบข้อมูลที่ตรงกัน');
    if (tier2SearchTimer) clearTimeout(tier2SearchTimer);
    sendSerialCommand('CANCEL_TIER2');
    return;
  }

  tier2ActiveCandidate = tier2SearchQueue.shift();
  console.log(`🔎 [Tier 2] กำลังทดสอบเทียบกับ ID #${tier2ActiveCandidate.id} (${tier2ActiveCandidate.name})...`);
  
  const rawTemplate = tier2ActiveCandidate.fingerprint_template || '';
  const firstTemplate = rawTemplate.split(',')[0].trim();

  pendingCompare = {
    id: tier2ActiveCandidate.id,
    template: firstTemplate,
    currentChunk: 0
  };

  sendSerialCommand(`COMPARE_INIT ${tier2ActiveCandidate.id}`);
}

// Auto-Promote (LRU Hardware Cache Eviction & Promotion)
async function autoPromoteToSensor(userId) {
  try {
    const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user || !user.fingerprint_template) return;

    // ตรวจสอบจำนวนผู้ใช้ที่อยู่ในเซนเซอร์ปัจจุบัน
    const countRow = await dbAsync.get('SELECT COUNT(*) as count FROM users WHERE in_sensor = 1');
    const currentInSensor = countRow ? countRow.count : 0;
    
    let targetSlot = userId;

    if (currentInSensor >= 1000) {
      // เซนเซอร์เต็ม (1,000 คน) ต้องปลดผู้ใช้ที่ไม่ค่อยใช้งาน (LRU) ออก 1 คน
      const lruUser = await dbAsync.get(`
        SELECT id, name FROM users 
        WHERE in_sensor = 1 AND id != ?
        ORDER BY COALESCE(last_scanned_at, created_at) ASC 
        LIMIT 1
      `, [userId]);

      if (lruUser) {
        console.log(`🔄 [Auto-Promote] เซนเซอร์เต็ม: ย้าย ID #${lruUser.id} (${lruUser.name}) ไปอยู่ Tier 2 แทน`);
        await dbAsync.run('UPDATE users SET in_sensor = 0 WHERE id = ?', [lruUser.id]);
        targetSlot = lruUser.id; // ใช้ slot เดิมของคนนั้น
      }
    }

    console.log(`🚀 [Auto-Promote] บันทึก Template ของ ID #${userId} (${user.name}) ลง Flash Slot #${targetSlot} ของ R307`);
    await dbAsync.run('UPDATE users SET in_sensor = 1 WHERE id = ?', [userId]);
    io.emit('user_updated');

    // ส่งคำสั่ง Restore เพื่อเขียน Template ลง Slot ใน R307
    const restoreRaw = user.fingerprint_template || '';
    const restoreTemplate = restoreRaw.split(',')[0].trim();

    pendingRestore = {
      id: targetSlot,
      template: restoreTemplate,
      currentChunk: 0
    };
    sendSerialCommand(`RESTORE_INIT ${targetSlot}`);
  } catch (err) {
    console.error('Error in autoPromoteToSensor:', err);
  }
}

// ประมวลผลเหตุการณ์เมื่อมีการสแกนนิ้ว (พร้อมระบบ Debounce ป้องกันการบันทึกซ้ำ)
let lastScanTime = 0;
let lastScanFingerId = null;
let lastScanStatus = null;

async function processScanEvent(fingerprint_id, score, status, tier = 'Tier 1') {
  try {
    const now = Date.now();
    // ป้องกันการบันทึกซ้ำ (Debounce 1.5 วินาที สำหรับเหตุการณ์เดียวกัน)
    if (now - lastScanTime < 1500 && lastScanFingerId === fingerprint_id && lastScanStatus === status) {
      console.log(`⏳ [Debounce] ละเว้นเหตุการณ์สแกนซ้ำภายใน 1.5 วินาที (ID: ${fingerprint_id}, Status: ${status})`);
      return;
    }
    lastScanTime = now;
    lastScanFingerId = fingerprint_id;
    lastScanStatus = status;

    let userName = 'Unknown User';
    let studentId = '-';
    let userId = null;
    const isGranted = (status === 'GRANTED');

    if (fingerprint_id > 0) {
      // คำนวณ Slot ID -> User ID สำหรับระบบ 3 นิ้วต่อคน (และ Fallback สำหรับ 1 นิ้วเดิม)
      const mappedUserId = Math.floor((fingerprint_id - 1) / 3) + 1;
      let user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [mappedUserId]);
      if (!user) {
        user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [fingerprint_id]);
      }
      if (user) {
        userName = user.name;
        studentId = user.student_id || '-';
        userId = user.id;
        // บันทึกเวลาที่สแกนล่าสุด
        await dbAsync.run("UPDATE users SET last_scanned_at = datetime('now', '+7 hours') WHERE id = ?", [userId]);
      }
    }

    // ตรวจสอบตารางการใช้ห้องเรียนตามห้องที่เครื่องสแกนประจำอยู่ (Active Device Room)
    const activeDeviceRoom = schedulesManager.getActiveDeviceRoom();
    const activeSchedInfo = schedulesManager.getActiveSchedule(new Date(), activeDeviceRoom);
    const currentSchedule = activeSchedInfo.schedule;
    const attendanceStatus = activeSchedInfo.attendanceStatus; // 'ON_TIME', 'LATE', or 'OUT_OF_SCHEDULE'
    const thaiDateNow = new Date(Date.now() + 7 * 3600000);
    const todayStr = thaiDateNow.toISOString().split('T')[0];
    const timeStr = `${String(thaiDateNow.getHours()).padStart(2, '0')}:${String(thaiDateNow.getMinutes()).padStart(2, '0')}:${String(thaiDateNow.getSeconds()).padStart(2, '0')}`;

    if (isGranted && currentSchedule && userId) {
      // ตรวจสอบว่าเคยสแกนในคาบนี้ของวันนี้แล้วหรือไม่ (ป้องกันลงเวลาซ้ำ)
      const alreadyCheckedIn = schedulesManager.checkAlreadyCheckedIn(userId, currentSchedule.id, todayStr);
      if (alreadyCheckedIn) {
        console.log(`⚠️ [Room Schedule] ${userName} [${studentId}] ได้ลงเวลาในคาบ "${currentSchedule.subject_name}" (ห้อง ${activeDeviceRoom}) แล้วในวันนี้`);
        io.emit('already_checked_in', {
          user_id: userId,
          user_name: userName,
          student_id: studentId,
          room_name: activeDeviceRoom,
          schedule: currentSchedule,
          message: 'คุณได้ลงเวลาคาบนี้แล้ว'
        });
        return; // ไม่บันทึกซ้ำ รักษาเวลาเดิมที่ลงไว้
      }

      // บันทึกลงระบบบันทึกเวลาเรียนประจำคาบ
      const sessionRecord = schedulesManager.recordSessionAttendance({
        schedule_id: currentSchedule.id,
        room_name: activeDeviceRoom,
        subject_code: currentSchedule.subject_code,
        subject_name: currentSchedule.subject_name,
        short_name: currentSchedule.short_name,
        class_type: currentSchedule.class_type,
        user_id: userId,
        student_id: studentId,
        user_name: userName,
        fingerprint_id: fingerprint_id || 0,
        date: todayStr,
        time: timeStr,
        timestamp: `${todayStr} ${timeStr}`,
        attendance_status: attendanceStatus,
        score: score || 0
      });
      io.emit('session_attendance_update', sessionRecord);
    }

    const insertResult = await dbAsync.run(`
      INSERT INTO access_logs (user_id, student_id, user_name, fingerprint_id, status, score, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
    `, [userId, studentId, userName, fingerprint_id || 0, isGranted ? 'GRANTED' : 'DENIED', score || 0]);

    const newLogEntry = {
      id: insertResult.lastID,
      user_id: userId,
      student_id: studentId,
      user_name: userName,
      fingerprint_id: fingerprint_id || 0,
      status: isGranted ? 'GRANTED' : 'DENIED',
      score: score || 0,
      tier: tier,
      room_name: activeDeviceRoom,
      schedule: currentSchedule ? {
        id: currentSchedule.id,
        room_name: activeDeviceRoom,
        subject_code: currentSchedule.subject_code,
        subject_name: currentSchedule.subject_name,
        short_name: currentSchedule.short_name,
        class_type: currentSchedule.class_type,
        time_display: currentSchedule.time_display,
        attendance_status: attendanceStatus
      } : null,
      attendance_status: currentSchedule ? attendanceStatus : 'OUT_OF_SCHEDULE',
      timestamp: new Date().toISOString()
    };

    io.emit('new_log', newLogEntry);
    console.log(`🔔 [Access Log] ${userName} [${studentId}] (ID #${fingerprint_id}): ${isGranted ? 'GRANTED' : 'DENIED'} (${tier}, Score: ${score}${currentSchedule ? ` | [${activeDeviceRoom}] ${currentSchedule.short_name} [${currentSchedule.class_type}] ${attendanceStatus}` : ''})`);
  } catch (err) {
    console.error('Error in processScanEvent:', err);
  }
}

// ฟังก์ชัน Auto-Rollback ลบข้อมูลผู้ใช้ใน DB และลบ Slot ในเซนเซอร์เมื่อการลงทะเบียนไม่สำเร็จ
async function cleanupFailedEnroll(userId, enrolledSlots = [], reason = '') {
  console.log(`🧹 [Auto-Rollback] เริ่มทำความสะอาดผู้ใช้ ID #${userId} (เหตุผล: ${reason})`);
  
  if (userId) {
    // 1. สั่ง R307 ลบทุก Slot ที่เกี่ยวข้อง
    const slot1 = (userId - 1) * 3 + 1;
    const slot2 = (userId - 1) * 3 + 2;
    const slot3 = (userId - 1) * 3 + 3;
    const allSlotsToDelete = new Set([...enrolledSlots, slot1, slot2, slot3]);
    for (const slot of allSlotsToDelete) {
      sendSerialCommand(`DELETE ${slot}`);
    }

    // 2. ลบแถวผู้ใช้คนนี้ออกจากตาราง users ใน Database ทันที
    try {
      await dbAsync.run('DELETE FROM users WHERE id = ?', [userId]);
      console.log(`🗑️ [Auto-Rollback] ลบผู้ใช้ ID #${userId} ออกจากฐานข้อมูลเรียบร้อยแล้ว`);
    } catch (err) {
      console.error(`Error deleting user #${userId} in cleanup:`, err);
    }
  }

  io.emit('user_updated');
  broadcastUsersCache();
}

// ประมวลผลข้อมูลที่ส่งมาจาก Arduino ผ่าน Serial
async function handleSerialData(rawLine) {
  const line = rawLine.trim();
  if (!line) return;
  console.log(`📥 [Arduino] ${line}`);

  // 1. สถานะขั้นตอนบันทึกลายนิ้วมือ (3-Finger Enrollment Guide)
  if (line === 'STATUS:ENROLL_STEP1_WAIT') {
    const fingerNum = currentEnrollSession ? currentEnrollSession.fingerNum : 1;
    io.emit('enroll_step_update', { status: 'STEP1_WAIT', id: currentEnrollId, fingerNum, totalFingers: 3 });
  } else if (line === 'STATUS:ENROLL_REMOVE_FINGER') {
    const fingerNum = currentEnrollSession ? currentEnrollSession.fingerNum : 1;
    io.emit('enroll_step_update', { status: 'REMOVE_FINGER', id: currentEnrollId, fingerNum, totalFingers: 3 });
  } else if (line === 'STATUS:ENROLL_STEP2_WAIT') {
    const fingerNum = currentEnrollSession ? currentEnrollSession.fingerNum : 1;
    io.emit('enroll_step_update', { status: 'STEP2_WAIT', id: currentEnrollId, fingerNum, totalFingers: 3 });
  } else if (line.startsWith('RESP:ENROLL_OK')) {
    const match = line.match(/ID=(\d+)/);
    const completedSlot = match ? parseInt(match[1]) : currentEnrollId;
    console.log(`🎉 [Enroll OK] บันทึก Slot #${completedSlot} สำเร็จ!`);

    if (currentEnrollSession) {
      currentEnrollSession.enrolledSlots.push(completedSlot);
      if (currentEnrollSession.fingerNum < 3) {
        const completedFinger = currentEnrollSession.fingerNum;
        currentEnrollSession.fingerNum++;
        const nextSlot = currentEnrollSession.slots[currentEnrollSession.fingerNum - 1];
        currentEnrollId = nextSlot;

        io.emit('enroll_step_update', {
          status: 'FINGER_DONE',
          fingerNum: completedFinger,
          totalFingers: 3,
          slotId: completedSlot,
          id: currentEnrollSession.userId
        });

        console.log(`⏳ [3-Finger Enroll] นิ้วที่ ${completedFinger}/3 ผ่านแล้ว -> กำลังเริ่มนิ้วที่ ${currentEnrollSession.fingerNum}/3 (Slot #${nextSlot}) ใน 1.5 วินาที...`);
        setTimeout(() => {
          if (currentEnrollSession) {
            sendSerialCommand(`ENROLL ${nextSlot}`);
            io.emit('enroll_step_update', {
              status: 'FINGER_START',
              fingerNum: currentEnrollSession.fingerNum,
              totalFingers: 3,
              slotId: nextSlot,
              id: currentEnrollSession.userId
            });
          }
        }, 1500);
      } else {
        // ครบทั้ง 3 นิ้ว!
        const finalUserId = currentEnrollSession.userId;
        console.log(`🏆 [3-Finger Enroll] บันทึกลายนิ้วมือครบ 3 นิ้วสมบูรณ์ สำหรับ User ID #${finalUserId}!`);
        io.emit('enroll_step_update', {
          status: 'SUCCESS',
          id: finalUserId,
          slots: currentEnrollSession.slots
        });
        io.emit('user_updated');
        broadcastUsersCache();
        currentEnrollSession = null;
        currentEnrollId = null;
      }
    } else {
      io.emit('enroll_step_update', { status: 'SUCCESS', id: completedSlot });
      io.emit('user_updated');
      currentEnrollId = null;
    }
  } else if (line.startsWith('RESP:ENROLL_CANCELLED')) {
    console.log(`🛑 [Arduino] ยกเลิกการสแกนนิ้วสำเร็จ (${line})`);
    if (currentEnrollSession) {
      const uId = currentEnrollSession.userId;
      const slots = [...currentEnrollSession.enrolledSlots];
      currentEnrollSession = null;
      currentEnrollId = null;
      await cleanupFailedEnroll(uId, slots, 'Arduino Cancelled');
    } else if (currentEnrollId) {
      const mappedId = Math.floor((currentEnrollId - 1) / 3) + 1;
      currentEnrollId = null;
      await cleanupFailedEnroll(mappedId, [], 'Arduino Cancelled');
    }
    io.emit('enroll_step_update', { status: 'CANCELLED', message: 'ยกเลิกการลงทะเบียนเรียบร้อย' });
  } else if (line.startsWith('RESP:ENROLL_FAIL')) {
    let message = 'การบันทึกล้มเหลว กรุณาลองใหม่';
    let code = 'FAILED';

    if (line.includes('DUPLICATE')) {
      const match = line.match(/ID=(\d+)/);
      const dupSlot = match ? parseInt(match[1]) : 0;
      const mappedOwnerId = dupSlot > 0 ? (Math.floor((dupSlot - 1) / 3) + 1) : 0;
      let ownerName = 'ผู้ใช้อื่นในระบบ';
      if (mappedOwnerId > 0) {
        try {
          const owner = await dbAsync.get('SELECT name FROM users WHERE id = ?', [mappedOwnerId]);
          if (owner) ownerName = owner.name;
        } catch (e) {}
      }
      message = `ลายนิ้วมือนี้มีในระบบแล้ว (ตรงกับผู้ใช้ ID #${mappedOwnerId}: ${ownerName})`;
      code = 'DUPLICATE';
    } else if (line.includes('TIMEOUT')) {
      message = 'หมดเวลารอวางนิ้วบนเซนเซอร์ กรุณากดลองใหม่';
    } else if (line.includes('IMAGE1')) {
      message = 'ภาพลายนิ้วมือรอบแรกไม่ชัด กรุณาวางนิ้วใหม่';
    } else if (line.includes('IMAGE2')) {
      message = 'ภาพลายนิ้วมือรอบสองไม่ชัด กรุณาวางนิ้วใหม่';
    } else if (line.includes('MISMATCH')) {
      message = 'ลายนิ้วมือรอบที่ 2 ไม่ตรงกับรอบแรก กรุณาลองใหม่';
    } else if (line.includes('STORE')) {
      message = 'หน่วยความจำ R307 ขัดข้อง บันทึกไม่สำเร็จ';
    }
    console.warn(`⚠️ [Enroll Failed] ${message} (${line})`);

    if (currentEnrollSession) {
      const uId = currentEnrollSession.userId;
      const slots = [...currentEnrollSession.enrolledSlots];
      currentEnrollSession = null;
      currentEnrollId = null;
      await cleanupFailedEnroll(uId, slots, message);
    } else if (currentEnrollId) {
      const mappedId = Math.floor((currentEnrollId - 1) / 3) + 1;
      currentEnrollId = null;
      await cleanupFailedEnroll(mappedId, [], message);
    }
    io.emit('enroll_step_update', { status: 'FAILED', code, message });
  }

  // 2. การลบลายนิ้วมือ
  else if (line.startsWith('RESP:DELETE_OK')) {
    console.log(`🗑️ [Delete OK] ${line}`);
    io.emit('user_updated');
  } else if (line.startsWith('RESP:DELETE_FAIL')) {
    console.warn(`⚠️ [Delete Fail] ${line}`);
  }

  // 3. สแกนเข้า-ออกประตู (Scan & Physical Button Event)
  else if (line.startsWith('EVENT:CONFIRMED')) {
    // ผู้ใช้กดปุ่ม D2 ยืนยันตัวตนสำเร็จ -> บันทึกลง Database
    const idMatch = line.match(/ID=(\d+)/);
    const scoreMatch = line.match(/SCORE=(\d+)/);
    const fingerId = idMatch ? parseInt(idMatch[1]) : 0;
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    console.log(`✅ [Confirm Button D2] ยืนยันการลงเวลา Slot #${fingerId} (Score: ${score}) -> บันทึกเข้า Supabase`);
    await processScanEvent(fingerId, score, 'GRANTED', 'Tier 1 Flash Match (Confirmed)');
  } else if (line.startsWith('EVENT:MATCH')) {
    // บอร์ดส่งมาแจ้งว่าพบลายนิ้วมือ และเข้าสู่สถานะรอกดปุ่ม D2/D3
    const idMatch = line.match(/ID=(\d+)/);
    const fingerId = idMatch ? parseInt(idMatch[1]) : 0;
    console.log(`⏳ [Awaiting Button] ตรวจพบลายนิ้วมือ Slot #${fingerId} กำลังรอกดปุ่ม D2 (Confirm) หรือ D3 (Rescan)...`);
  } else if (line.startsWith('EVENT:CANCELLED')) {
    console.log(`🛑 [Button Cancelled] ผู้ใช้กดปุ่ม D3 เพื่อยกเลิก/สแกนใหม่ (ไม่บันทึกลง Database)`);
  } else if (line === 'EVENT:TIMEOUT') {
    console.log(`⏰ [Button Timeout] หมดเวลา 5 วินาที ยกเลิกอัตโนมัติ (ไม่บันทึกลง Database)`);
  } else if (line === 'EVENT:TIER1_NO_MATCH') {
    console.log('📡 [Tier 1] ไม่พบใน Flash ออนบอร์ด -> เริ่มต้นตรวจสอบ Tier 2 ใน Database...');
    startTier2Search();
  } else if (line === 'EVENT:NO_MATCH') {
    await processScanEvent(0, 0, 'DENIED');
  }

  // 3.1 การเปรียบเทียบใน Tier 2
  else if (line.startsWith('RESP:COMPARE_READY')) {
    const match = line.match(/ID=(\d+)/);
    const id = match ? parseInt(match[1]) : 0;
    if (pendingCompare && pendingCompare.id === id) {
      sendNextCompareChunk();
    }
  } else if (line.startsWith('RESP:COMPARE_CHUNK_ACK')) {
    if (pendingCompare) {
      setTimeout(sendNextCompareChunk, 20);
    }
  } else if (line.startsWith('RESP:TIER2_MISMATCH')) {
    const match = line.match(/ID=(\d+)/);
    const id = match ? parseInt(match[1]) : 0;
    console.log(`⏭️ [Tier 2] ID #${id} ไม่ตรง -> ตรวจสอบ candidate ถัดไป...`);
    pendingCompare = null;
    checkNextTier2Candidate();
  } else if (line.startsWith('RESP:TIER2_MATCH')) {
    const idMatch = line.match(/ID=(\d+)/);
    const scoreMatch = line.match(/SCORE=(\d+)/);
    const candidateId = idMatch ? parseInt(idMatch[1]) : 0;
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    console.log(`🎉 [Tier 2 MATCH!] สแกนนิ้วตรงกับ ID #${candidateId} ใน Database (Score: ${score})`);
    if (tier2SearchTimer) clearTimeout(tier2SearchTimer);
    tier2SearchQueue = [];
    pendingCompare = null;

    await processScanEvent(candidateId, score, 'GRANTED', 'Tier 2 Cloud Match');
    autoPromoteToSensor(candidateId);
  }

  // 4. ข้อมูล Template สำหรับ Backup & Restore
  else if (line.startsWith('TEMPLATE:')) {
    // รูปแบบ: TEMPLATE:ID=1 DATA=0123456789ABCDEF...
    const idMatch = line.match(/ID=(\d+)/);
    const dataMatch = line.match(/DATA=([0-9A-Fa-f]+)/);
    if (idMatch && dataMatch) {
      const slotId = parseInt(idMatch[1]);
      const templateData = dataMatch[1];

      try {
        let targetUserId = null;
        if (currentEnrollSession && currentEnrollSession.slots && currentEnrollSession.slots.includes(slotId)) {
          targetUserId = currentEnrollSession.userId;
        } else {
          const mappedUserId = Math.floor((slotId - 1) / 3) + 1;
          const userExists = await dbAsync.get('SELECT id FROM users WHERE id = ?', [mappedUserId]);
          if (userExists) {
            targetUserId = mappedUserId;
          } else {
            // Fallback กรณีระบบ slot เดิม 1 นิ้วต่อคน
            const fallbackUser = await dbAsync.get('SELECT id FROM users WHERE id = ?', [slotId]);
            targetUserId = fallbackUser ? slotId : mappedUserId;
          }
        }

        // ดึง Template เดิมมาตรวจสอบเพื่อรวม Template ลายนิ้วมือสูงสุด 3 นิ้ว
        const existingUser = await dbAsync.get('SELECT id, fingerprint_template FROM users WHERE id = ?', [targetUserId]);
        let combinedTemplate = templateData;
        if (existingUser && existingUser.fingerprint_template && existingUser.fingerprint_template.length >= 512) {
          const templates = existingUser.fingerprint_template.split(',').map(t => t.trim()).filter(t => t.length >= 512);
          if (!templates.includes(templateData)) {
            templates.push(templateData);
            combinedTemplate = templates.slice(0, 3).join(',');
          } else {
            combinedTemplate = existingUser.fingerprint_template;
          }
        }

        await dbAsync.run('UPDATE users SET fingerprint_template = ?, in_sensor = 1 WHERE id = ?', [combinedTemplate, targetUserId]);
        console.log(`💾 [DB Backup] บันทึก Template ลายนิ้วมือ Slot #${slotId} -> User ID #${targetUserId} (${templateData.length / 2} Bytes) ลง Database สำเร็จ!`);
        io.emit('template_saved', { id: targetUserId, slotId, success: true });
        io.emit('user_updated');
        broadcastUsersCache();
      } catch (err) {
        console.error('Error saving template to DB:', err);
      }
    }
  } else if (line.startsWith('RESP:RESTORE_READY')) {
    const match = line.match(/ID=(\d+)/);
    const id = match ? parseInt(match[1]) : 0;
    console.log(`📡 [Restore Ready] R307 พร้อมรับ Template ID #${id}`);
    if (pendingRestore && pendingRestore.id === id) {
      sendNextRestoreChunk();
    }
  } else if (line.startsWith('RESP:CHUNK_ACK')) {
    if (pendingRestore) {
      setTimeout(sendNextRestoreChunk, 35);
    }
  } else if (line.startsWith('RESP:RESTORE_OK')) {
    const match = line.match(/ID=(\d+)/);
    const id = match ? parseInt(match[1]) : 0;
    console.log(`✅ [Restore OK] กู้คืนลายนิ้วมือ ID #${id} ลงเซนเซอร์ R307 สำเร็จ!`);
    pendingRestore = null;
    io.emit('restore_progress', { id, status: 'SUCCESS', message: `กู้คืน ID #${id} สำเร็จ` });
  } else if (line.startsWith('RESP:RESTORE_FAIL')) {
    const match = line.match(/ID=(\d+)/);
    const id = match ? parseInt(match[1]) : 0;
    console.warn(`❌ [Restore Fail] กู้คืนลายนิ้วมือ ID #${id} ล้มเหลว (${line})`);
    pendingRestore = null;
    io.emit('restore_progress', { id, status: 'FAILED', message: `กู้คืน ID #${id} ไม่สำเร็จ` });
  } else if (line.startsWith('RESP:BACKUP_FAIL')) {
    const match = line.match(/ID=(\d+)/);
    const id = match ? parseInt(match[1]) : 0;
    console.warn(`❌ [Backup Fail] ไม่สามารถดึง Template ID #${id} จากเซนเซอร์ได้ (${line})`);
    io.emit('backup_progress', { id, status: 'FAILED', message: `ไม่พบลายนิ้วมือ ID #${id} ในเซนเซอร์` });
  }
}

// ==========================================
// 2. Authentication Routes
// ==========================================
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
  }

  try {
    const admin = await dbAsync.get('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    const isProd = process.env.NODE_ENV === 'production';
    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });
    res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', username: admin.username });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'ออกจากระบบเรียบร้อย' });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ username: req.admin.username });
});

// เปลี่ยนรหัสผ่าน Admin
app.post('/api/auth/change-password', authRequired, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน' });
  }

  try {
    const admin = await dbAsync.get('SELECT * FROM admins WHERE id = ?', [req.admin.id]);
    if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
      return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);

    await dbAsync.run('UPDATE admins SET password_hash = ? WHERE id = ?', [newHash, req.admin.id]);

    res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
  }
});

// ==========================================
// 3. User Management Routes
// ==========================================
app.get('/api/users', authRequired, async (req, res) => {
  try {
    const users = await dbAsync.all('SELECT * FROM users ORDER BY id ASC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authRequired, async (req, res) => {
  const { name, student_id } = req.body;
  if (!name || !student_id) {
    return res.status(400).json({ error: 'กรุณากรอกรหัสนักศึกษาและชื่อ-นามสกุล' });
  }

  const cleanStudentId = student_id.toString().trim();
  const cleanName = name.trim();

  try {
    // 1. ตรวจสอบว่ารหัสนักศึกษานี้มีอยู่ในระบบแล้วหรือไม่ (ป้องกันการซ้ำ)
    const existingStudent = await dbAsync.get('SELECT id, name FROM users WHERE student_id = ?', [cleanStudentId]);
    if (existingStudent) {
      return res.status(400).json({ 
        error: `รหัสนักศึกษา "${cleanStudentId}" มีในระบบแล้ว (Slot ID #${existingStudent.id} - ${existingStudent.name})` 
      });
    }

    // 2. คำนวณ Slot ID อัตโนมัติ: เติมเต็มช่องว่างที่ว่างอยู่ (Re-use lowest available ID)
    const allExisting = await dbAsync.all('SELECT id FROM users ORDER BY id ASC');
    const usedIds = new Set(allExisting.map(u => u.id));
    
    let targetId = req.body.id ? parseInt(req.body.id) : 0;
    if (!targetId || usedIds.has(targetId)) {
      targetId = 1;
      while (usedIds.has(targetId) && targetId <= 100) targetId++;
    }

    if (targetId > 100) {
      return res.status(400).json({ error: 'หน่วยความจำเซนเซอร์เต็ม ไม่สามารถเพิ่มผู้ใช้ได้เกิน 100 คน (โหมด 3 นิ้วต่อคน: 300 Slots)' });
    }

    // 3. บันทึกข้อมูลลงฐานข้อมูล
    await dbAsync.run(
      "INSERT INTO users (id, student_id, name, created_at) VALUES (?, ?, ?, datetime('now', '+7 hours'))",
      [targetId, cleanStudentId, cleanName]
    );

    io.emit('user_updated');
    broadcastUsersCache();
    res.json({ 
      success: true, 
      id: targetId,
      message: `เตรียมข้อมูลผู้ใช้งาน ID #${targetId} (${cleanStudentId}) เรียบร้อย`,
      user: { id: targetId, student_id: cleanStudentId, name: cleanName }
    });
  } catch (err) {
    console.error('Error adding user:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await dbAsync.run('DELETE FROM users WHERE id = ?', [id]);
    
    // สั่งเซนเซอร์ R307 บนบอร์ด Arduino ให้ลบลายนิ้วมือทั้ง 3 ช่องของคนนี้ออกทันที
    const slot1 = (id - 1) * 3 + 1;
    const slot2 = (id - 1) * 3 + 2;
    const slot3 = (id - 1) * 3 + 3;
    sendSerialCommand(`DELETE ${slot1}`);
    sendSerialCommand(`DELETE ${slot2}`);
    sendSerialCommand(`DELETE ${slot3}`);
    if (id !== slot1 && id !== slot2 && id !== slot3) {
      sendSerialCommand(`DELETE ${id}`);
    }

    io.emit('cmd_delete_fingerprint', { id, slots: [slot1, slot2, slot3] });
    io.emit('user_updated');
    broadcastUsersCache();
    res.json({ success: true, message: `ลบผู้ใช้งาน ID #${id} เรียบร้อยแล้ว` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. Access Logs & Analytics Routes
// ==========================================
app.get('/api/logs', authRequired, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await dbAsync.all(`
      SELECT 
        access_logs.id,
        access_logs.user_id,
        access_logs.student_id,
        COALESCE(users.name, access_logs.user_name, 'Unknown User') AS user_name,
        access_logs.fingerprint_id,
        access_logs.status,
        access_logs.score,
        access_logs.timestamp
      FROM access_logs 
      ORDER BY access_logs.timestamp DESC 
      LIMIT ?
    `, [limit]);

    const attendanceRecords = schedulesManager.loadAttendanceRecords();
    const enrichedLogs = logs.map(log => {
      const dateStr = log.timestamp ? log.timestamp.split('T')[0].split(' ')[0] : '';
      const match = attendanceRecords.find(r => r.user_id === log.user_id && r.date === dateStr);
      return {
        ...log,
        is_offline: match ? !!match.is_offline : false,
        attendance_status: match ? match.attendance_status : (log.status === 'GRANTED' ? 'ON_TIME' : 'OUT_OF_SCHEDULE'),
        schedule: match ? {
          id: match.schedule_id,
          room_name: match.room_name,
          subject_code: match.subject_code,
          subject_name: match.subject_name,
          short_name: match.short_name,
          class_type: match.class_type
        } : null
      };
    });

    res.json(enrichedLogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', authRequired, async (req, res) => {
  try {
    const totalUsers = (await dbAsync.get('SELECT COUNT(*) as count FROM users')).count;
    const totalLogs = (await dbAsync.get('SELECT COUNT(*) as count FROM access_logs')).count;
    const grantedToday = (await dbAsync.get(`
      SELECT COUNT(*) as count FROM access_logs 
      WHERE status = 'GRANTED' AND date(timestamp) = date('now', '+7 hours')
    `)).count;
    const deniedToday = (await dbAsync.get(`
      SELECT COUNT(*) as count FROM access_logs 
      WHERE status != 'GRANTED' AND date(timestamp) = date('now', '+7 hours')
    `)).count;

    res.json({
      totalUsers,
      totalLogs,
      grantedToday,
      deniedToday
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4.1 Multi-Room & Timetable Attendance Routes
// ==========================================
// ดึงรายการห้องเรียนทั้งหมด และห้องที่เครื่องสแกนประจำอยู่
app.get('/api/rooms', authRequired, (req, res) => {
  try {
    const data = schedulesManager.getRooms();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ตั้งค่าห้องประจำเครื่อง Uno Q (Active Device Room)
app.post('/api/rooms/active', authRequired, (req, res) => {
  try {
    const { room_name } = req.body;
    if (!room_name) {
      return res.status(400).json({ error: 'กรุณาระบุชื่อห้อง' });
    }
    const updatedRoom = schedulesManager.setActiveDeviceRoom(room_name);
    const roomSchedules = schedulesManager.getAllSchedules(updatedRoom);
    
    io.emit('device_room_updated', { active_device_room: updatedRoom });
    io.emit('sync_device_room', { room_name: updatedRoom });
    io.emit('sync_schedules_cache', roomSchedules);

    res.json({ success: true, active_device_room: updatedRoom });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ลบห้องเรียน ตารางเรียน และประวัติการเข้าเรียนของห้องนั้น (Full Purge)
app.delete('/api/rooms/:roomName', authRequired, (req, res) => {
  try {
    const { roomName } = req.params;
    const result = schedulesManager.deleteRoom(roomName);
    
    io.emit('rooms_updated', schedulesManager.getRooms());
    io.emit('sync_device_room', { room_name: result.active_device_room });
    io.emit('sync_schedules_cache', schedulesManager.getAllSchedules());

    res.json(result);
  } catch (err) {
    console.error('Error deleting room:', err);
    res.status(500).json({ error: err.message });
  }
});

// ดูตัวอย่าง (Preview) ข้อมูลในไฟล์ Excel ก่อนบันทึกจริง
app.post('/api/schedules/preview-excel', authRequired, upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'กรุณาเลือกไฟล์ Excel (.xlsx)' });
    }
    const preview = schedulesManager.previewExcelData(req.file.buffer);
    res.json(preview);
  } catch (err) {
    console.error('Error previewing excel:', err);
    res.status(500).json({ error: 'ไม่สามารถอ่านไฟล์ Excel ได้: ' + err.message });
  }
});

// ดึงตารางเรียน (สามารถกรองตามห้อง ?room=ทค.1-101 ได้)
app.get('/api/schedules', authRequired, (req, res) => {
  try {
    const { room } = req.query;
    const schedules = schedulesManager.getAllSchedules(room);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ดึงสถานะคาบเรียนสด (สามารถกรองตามห้อง ?room=ทค.1-101 ได้)
app.get('/api/schedules/current', authRequired, (req, res) => {
  try {
    const { room } = req.query;
    const current = schedulesManager.getActiveSchedule(new Date(), room);
    res.json(current);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/schedules/:id/attendance', authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;
    const summary = schedulesManager.getSessionAttendance(id, date);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/schedules/:id/export-excel', authRequired, (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;
    const excelBuffer = schedulesManager.exportAttendanceExcel(id, date);
    const filename = `attendance_schedule_${id}_${date || 'all'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);
  } catch (err) {
    console.error('Error exporting excel:', err);
    res.status(500).json({ error: err.message });
  }
});

// บันทึกตารางเรียน (รองรับหลายห้อง: แทนที่ถ้าเป็นห้องเดิม, เพิ่มแดชบอร์ดใหม่ถ้าเป็นห้องใหม่)
app.post('/api/schedules/import-excel', authRequired, upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'กรุณาเลือกไฟล์ Excel (.xlsx) ที่ต้องการนำเข้า' });
    }
    const roomName = (req.body.room_name || '').trim();
    const building = (req.body.building || '').trim();

    const parsed = schedulesManager.parseExcelData(req.file.buffer, roomName, building);
    if (!parsed || parsed.length === 0) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลตารางเรียนในไฟล์ Excel หรือรูปแบบไม่ถูกต้อง' });
    }

    const saved = schedulesManager.saveRoomSchedules(parsed, roomName, building);
    io.emit('rooms_updated', schedulesManager.getRooms());
    io.emit('schedules_updated', saved);

    // ซิงก์แคชให้ Uno Q ถ้าห้องที่เพิ่งนำเข้าคือห้องประจำเครื่อง
    if (saved.room_name === schedulesManager.getActiveDeviceRoom()) {
      io.emit('sync_device_room', { room_name: saved.room_name });
      io.emit('sync_schedules_cache', schedulesManager.getAllSchedules());
    }

    res.json(saved);
  } catch (err) {
    console.error('Error importing excel:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการนำเข้าไฟล์ Excel: ' + err.message });
  }
});

// ==========================================
// 5. IoT Device Endpoints & Biometric Backup/Restore
// ==========================================
app.get('/api/device/serial-status', authRequired, (req, res) => {
  res.json({
    connected: serialConnected,
    port: hardwareBridgeSocket ? 'Cloud Bridge (Active)' : TARGET_PORT
  });
});

// ดึงข้อมูล Template จาก R307 มาเก็บสำรองใน Database ทีละคน (รองรับ 3 นิ้วต่อคน)
app.post('/api/device/backup/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  const slot1 = (id - 1) * 3 + 1;
  const slot2 = (id - 1) * 3 + 2;
  const slot3 = (id - 1) * 3 + 3;

  sendSerialCommand(`BACKUP ${slot1}`);
  setTimeout(() => sendSerialCommand(`BACKUP ${slot2}`), 1200);
  setTimeout(() => sendSerialCommand(`BACKUP ${slot3}`), 2400);

  if (id !== slot1 && id !== slot2 && id !== slot3) {
    setTimeout(() => sendSerialCommand(`BACKUP ${id}`), 3600);
  }

  res.json({ 
    success: true, 
    message: `ส่งคำสั่งดึงข้อมูลลายนิ้วมือ User ID #${id} (Slots #${slot1}, #${slot2}, #${slot3}) จากเซนเซอร์แล้ว` 
  });
});

// กู้คืนลายนิ้วมือจาก Database ลงเซนเซอร์ R307 ทีละคน (รองรับ 3 นิ้วต่อคน)
app.post('/api/device/restore/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user || !user.fingerprint_template || user.fingerprint_template.length < 512) {
    return res.status(404).json({ error: `ไม่พบข้อมูลลายนิ้วมือสำรองของ ID #${id} ในฐานข้อมูล` });
  }

  const rawTemplate = user.fingerprint_template || '';
  const templates = rawTemplate.split(',').map(t => t.trim()).filter(t => t.length >= 512);
  const slot1 = (id - 1) * 3 + 1;

  (async () => {
    for (let tIdx = 0; tIdx < templates.length; tIdx++) {
      const targetSlot = slot1 + tIdx;
      pendingRestore = {
        id: targetSlot,
        template: templates[tIdx],
        currentChunk: 0
      };
      sendSerialCommand(`RESTORE_INIT ${targetSlot}`);
      
      let waitCount = 0;
      while (pendingRestore !== null && waitCount < 100) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
      }
      await new Promise(r => setTimeout(r, 800));
    }
  })();

  res.json({ 
    success: true, 
    message: `เริ่มกู้คืนข้อมูลลายนิ้วมือ User ID #${id} (${templates.length} นิ้ว) ลงเซนเซอร์ R307 แล้ว` 
  });
});

// กู้คืนลายนิ้วมือทั้งหมดจาก Database ลงเซนเซอร์ R307 (เหมาะสำหรับเปลี่ยนเซนเซอร์ใหม่)
app.post('/api/device/restore-all', authRequired, async (req, res) => {
  const usersWithTemplate = await dbAsync.all('SELECT id, fingerprint_template FROM users WHERE fingerprint_template IS NOT NULL AND length(fingerprint_template) >= 512');
  if (usersWithTemplate.length === 0) {
    return res.status(400).json({ error: 'ไม่มีข้อมูลลายนิ้วมือสำรองในฐานข้อมูล' });
  }

  (async () => {
    for (let i = 0; i < usersWithTemplate.length; i++) {
      const u = usersWithTemplate[i];
      io.emit('restore_progress', { id: u.id, current: i + 1, total: usersWithTemplate.length, status: 'IN_PROGRESS' });
      
      const rawTemplate = u.fingerprint_template || '';
      const templates = rawTemplate.split(',').map(t => t.trim()).filter(t => t.length >= 512);
      const slot1 = (u.id - 1) * 3 + 1;

      for (let tIdx = 0; tIdx < templates.length; tIdx++) {
        const targetSlot = slot1 + tIdx;
        pendingRestore = {
          id: targetSlot,
          template: templates[tIdx],
          currentChunk: 0
        };
        sendSerialCommand(`RESTORE_INIT ${targetSlot}`);
        
        let waitCount = 0;
        while (pendingRestore !== null && waitCount < 100) {
          await new Promise(r => setTimeout(r, 100));
          waitCount++;
        }
        await new Promise(r => setTimeout(r, 800));
      }
    }
    io.emit('restore_progress', { status: 'ALL_COMPLETED', total: usersWithTemplate.length });
  })();

  res.json({
    success: true,
    total: usersWithTemplate.length,
    message: `กำลังเริ่มกู้คืนลายนิ้วมือทั้งหมด ${usersWithTemplate.length} รายการลงเซนเซอร์ R307`
  });
});

// ดึงข้อมูลสำรองจากเซนเซอร์ R307 เข้าสู่ Database ทั้งหมด
app.post('/api/device/backup-all', authRequired, async (req, res) => {
  const allUsers = await dbAsync.all('SELECT id FROM users ORDER BY id ASC');
  if (allUsers.length === 0) {
    return res.status(400).json({ error: 'ไม่มีรายชื่อผู้ใช้ในระบบ' });
  }

  (async () => {
    for (let i = 0; i < allUsers.length; i++) {
      const u = allUsers[i];
      io.emit('backup_progress', { id: u.id, current: i + 1, total: allUsers.length, status: 'IN_PROGRESS' });
      
      const slot1 = (u.id - 1) * 3 + 1;
      const slot2 = (u.id - 1) * 3 + 2;
      const slot3 = (u.id - 1) * 3 + 3;

      sendSerialCommand(`BACKUP ${slot1}`);
      await new Promise(r => setTimeout(r, 1200));
      sendSerialCommand(`BACKUP ${slot2}`);
      await new Promise(r => setTimeout(r, 1200));
      sendSerialCommand(`BACKUP ${slot3}`);
      await new Promise(r => setTimeout(r, 1200));

      if (u.id !== slot1 && u.id !== slot2 && u.id !== slot3) {
        sendSerialCommand(`BACKUP ${u.id}`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    io.emit('backup_progress', { status: 'ALL_COMPLETED', total: allUsers.length });
  })();

  res.json({
    success: true,
    total: allUsers.length,
    message: `กำลังดึงข้อมูลสำรองลายนิ้วมือจากเซนเซอร์ R307 ทั้งหมด ${allUsers.length} รายการ (ระบบ 3 นิ้วต่อคน)`
  });
});

// ==========================================
// 6. Socket.io Authentication Middleware & Event Handlers
// ==========================================
io.use((socket, next) => {
  try {
    const authHeader = socket.handshake.headers?.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const authToken = socket.handshake.auth?.token || bearerToken;
    
    let cookieToken = null;
    if (socket.handshake.headers?.cookie) {
      const parsedCookies = socket.handshake.headers.cookie.split(';').reduce((acc, c) => {
        const [key, val] = c.trim().split('=');
        if (key && val) acc[key] = decodeURIComponent(val);
        return acc;
      }, {});
      cookieToken = parsedCookies.token;
    }

    const token = authToken || cookieToken;

    // ก. กรณีเป็น Hardware Bridge (บอร์ด Uno Q ส่ง BRIDGE_TOKEN)
    if (token && token === BRIDGE_TOKEN) {
      socket.role = 'bridge';
      socket.isBridge = true;
      return next();
    }

    // ข. กรณีเป็น Admin Web Dashboard (ส่ง JWT token ผ่าน auth หรือ cookie)
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.role = 'admin';
        socket.admin = decoded;
        return next();
      } catch (jwtErr) {
        return next(new Error('Authentication error: Invalid JWT token'));
      }
    }

    return next(new Error('Authentication error: Authentication required'));
  } catch (err) {
    return next(new Error('Authentication error: ' + err.message));
  }
});

io.on('connection', (socket) => {
  console.log(`💻 Client Connected: ${socket.id} (Role: ${socket.role})`);

  // แจ้งสถานะ Serial ให้ client ที่เพิ่งเชื่อมต่อ
  const displayPort = hardwareBridgeSocket ? 'Cloud Bridge (Active)' : TARGET_PORT;
  socket.emit('serial_status', { connected: serialConnected, port: displayPort });

  // คำสั่งเริ่มลงทะเบียนจากหน้าเว็บ (ระบบ 3 นิ้วต่อคน) - เฉพาะ Admin
  socket.on('start_enroll', async (data) => {
    if (socket.role !== 'admin') {
      console.warn(`🚨 [Security] Blocked unauthorized start_enroll from ${socket.id}`);
      return;
    }
    const userId = parseInt(data.id);
    const slot1 = (userId - 1) * 3 + 1;
    const slot2 = (userId - 1) * 3 + 2;
    const slot3 = (userId - 1) * 3 + 3;

    currentEnrollSession = {
      userId: userId,
      name: data.name,
      fingerNum: 1,
      slots: [slot1, slot2, slot3],
      enrolledSlots: []
    };
    currentEnrollId = slot1;

    console.log(`🚀 [3-Finger Enroll] เริ่มลงทะเบียน User ID #${userId} (${data.name}) นิ้วที่ 1/3 (Slot #${slot1})`);

    // ส่งคำสั่งผ่าน Serial ไปสั่งเซนเซอร์ R307
    const sent = sendSerialCommand(`ENROLL ${slot1}`);
    if (sent) {
      io.emit('enroll_step_update', {
        status: 'FINGER_START',
        fingerNum: 1,
        totalFingers: 3,
        slotId: slot1,
        id: userId
      });
    } else {
      socket.emit('enroll_step_update', {
        status: 'FAILED',
        message: 'ไม่สามารถส่งคำสั่งไปยังบอร์ด Arduino ได้ (กรุณาตรวจสอบการเชื่อมต่อ COM12 หรือปิด Serial Monitor ใน Arduino IDE)'
      });
      await cleanupFailedEnroll(userId, [], 'Cannot send command to Arduino');
      currentEnrollSession = null;
      currentEnrollId = null;
    }
  });

  // คำสั่งยกเลิกการลงทะเบียนจากหน้าเว็บ - เฉพาะ Admin
  socket.on('cancel_enroll', async (data) => {
    if (socket.role !== 'admin') {
      console.warn(`🚨 [Security] Blocked unauthorized cancel_enroll from ${socket.id}`);
      return;
    }
    console.log(`🛑 [Cancel Enroll] ได้รับคำสั่งยกเลิกการลงทะเบียน`);

    // 1. ส่งคำสั่งให้ Arduino หลุดออกจากลูปทันที
    sendSerialCommand('CANCEL_ENROLL');

    let uId = data && data.id ? parseInt(data.id) : null;
    let enrolledSlots = [];

    if (currentEnrollSession) {
      uId = currentEnrollSession.userId;
      enrolledSlots = [...currentEnrollSession.enrolledSlots];
      currentEnrollSession = null;
      currentEnrollId = null;
    }

    if (uId) {
      await cleanupFailedEnroll(uId, enrolledSlots, 'Web Client Cancelled');
    } else if (currentEnrollId) {
      const mappedId = Math.floor((currentEnrollId - 1) / 3) + 1;
      currentEnrollId = null;
      await cleanupFailedEnroll(mappedId, [], 'Web Client Cancelled');
    }

    currentEnrollId = null;
    io.emit('enroll_step_update', { status: 'CANCELLED', message: 'ยกเลิกการลงทะเบียนเรียบร้อย' });
  });

  // เมื่อ Hardware Bridge เชื่อมต่อเข้ามา - เฉพาะ Bridge
  socket.on('register_bridge', async () => {
    if (socket.role !== 'bridge') {
      console.warn(`🚨 [Security] Blocked unauthorized register_bridge from ${socket.id}`);
      return;
    }
    if (hardwareBridgeSocket && hardwareBridgeSocket.id !== socket.id) {
      console.warn(`⚠️ [Hardware Bridge] สลับไปยัง Bridge ตัวใหม่ (${socket.id}) ปลดตัวเก่าออก (${hardwareBridgeSocket.id})`);
      try { hardwareBridgeSocket.disconnect(true); } catch (e) {}
    }
    hardwareBridgeSocket = socket;
    serialConnected = true;
    console.log(`🔗 [Hardware Bridge] บอร์ด Arduino เชื่อมต่อผ่าน Cloud Bridge สำเร็จ! (ID: ${socket.id})`);
    io.emit('serial_status', { connected: true, port: 'Cloud Bridge (Active)' });

    // ส่งแคชรายชื่อนักศึกษา ตารางเรียน และห้องประจำเครื่องให้บอร์ด Uno Q ทันทีที่เชื่อมต่อ
    try {
      const users = await dbAsync.all('SELECT id, name, student_id FROM users');
      const activeRoom = schedulesManager.getActiveDeviceRoom();
      socket.emit('sync_users_cache', users || []);
      socket.emit('sync_device_room', { room_name: activeRoom });
      socket.emit('sync_schedules_cache', schedulesManager.getAllSchedules());
      console.log(`📦 [Hardware Bridge] ส่งแคชรายชื่อ (${users.length} คน), ห้องประจำเครื่อง [${activeRoom}], และตารางเรียน (${schedulesManager.getAllSchedules().length} คาบ) ไปยังบอร์ดแล้ว`);
    } catch (err) {
      console.error('Error sending users cache to bridge:', err);
    }

    socket.on('disconnect', () => {
      if (hardwareBridgeSocket && hardwareBridgeSocket.id === socket.id) {
        hardwareBridgeSocket = null;
        serialConnected = false;
        console.warn('🔌 [Hardware Bridge] หลุดการเชื่อมต่อจาก Cloud Bridge');
        io.emit('serial_status', { connected: false, port: 'Cloud Bridge (Offline)' });
      }
    });
  });

  // บอร์ดร้องขอแคชรายชื่อนักศึกษา
  socket.on('get_users_cache', async () => {
    try {
      const users = await dbAsync.all('SELECT id, name, student_id FROM users');
      socket.emit('sync_users_cache', users || []);
    } catch (err) {
      console.error('Error in get_users_cache:', err);
    }
  });

  // บอร์ดร้องขอแคชตารางเรียน
  socket.on('get_schedules_cache', () => {
    try {
      socket.emit('sync_schedules_cache', schedulesManager.getAllSchedules());
    } catch (err) {
      console.error('Error in get_schedules_cache:', err);
    }
  });

  // บอร์ดร้องขอรายการลงเวลาเรียนของวันนี้
  socket.on('get_today_attendance', () => {
    try {
      const thaiDateNow = new Date(Date.now() + 7 * 3600000);
      const todayStr = thaiDateNow.toISOString().split('T')[0];
      const records = schedulesManager.loadAttendanceRecords().filter(r => r.date === todayStr);
      socket.emit('sync_today_attendance', records);
    } catch (err) {
      console.error('Error in get_today_attendance:', err);
    }
  });

  // รับข้อมูลสแกนนิ้ว/ผลตอบกลับจาก Arduino ที่ส่งผ่าน Bridge - เฉพาะ Bridge
  socket.on('bridge_serial_data', async (rawLine) => {
    if (socket.role !== 'bridge') {
      console.warn(`🚨 [Security] Blocked unauthorized bridge_serial_data from ${socket.id}`);
      return;
    }
    // ป้องกันการรับข้อมูลซ้ำซ้อนจาก Bridge ที่ไม่ได้ active
    if (hardwareBridgeSocket && socket.id !== hardwareBridgeSocket.id) {
      return;
    }
    await handleSerialData(rawLine);
  });

  // รับข้อมูลสแกนช่วงออฟไลน์ (Store-and-Forward Offline Sync) - เฉพาะ Bridge
  socket.on('sync_offline_attendance', async (records) => {
    if (socket.role !== 'bridge') {
      console.warn(`🚨 [Security] Blocked unauthorized sync_offline_attendance from ${socket.id}`);
      socket.emit('sync_offline_attendance_ack', { success: false, error: 'Unauthorized' });
      return;
    }
    if (!Array.isArray(records) || records.length === 0) {
      socket.emit('sync_offline_attendance_ack', { success: true, count: 0, synced_ids: [] });
      return;
    }

    console.log(`📥 [Offline Sync] ได้รับข้อมูลสแกนช่วงออฟไลน์ ${records.length} รายการ กำลังบันทึกลงฐานข้อมูล...`);
    const syncedIds = [];

    for (const rec of records) {
      try {
        const userId = rec.user_id;
        const studentId = rec.student_id || '-';
        const userName = rec.name || 'Unknown User';
        const fingerprintId = rec.slot_id || 0;
        const score = rec.score || 0;
        const roomName = rec.room_name || schedulesManager.getActiveDeviceRoom();
        const schedId = rec.schedule_id;
        const attendanceStatus = rec.attendance_status || 'OUT_OF_SCHEDULE';
        const scannedAt = rec.scanned_at || new Date().toISOString();

        // คำนวณวันและเวลาตามเวลาสแกนจริง
        const scanDate = new Date(scannedAt);
        const thaiDateStr = rec.scanned_at.includes('T') ? rec.scanned_at.split('T')[0] : new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
        const timePart = rec.scanned_at.includes('T') ? rec.scanned_at.split('T')[1].substring(0, 8) : '00:00:00';
        const dbTimestamp = `${thaiDateStr} ${timePart}`;

        if (userId) {
          try {
            await dbAsync.run("UPDATE users SET last_scanned_at = ? WHERE id = ?", [dbTimestamp, userId]);
          } catch (e) {}
        }

        let schedObj = null;
        if (schedId && userId) {
          const schedules = schedulesManager.getAllSchedules();
          schedObj = schedules.find(s => s.id === schedId);

          const alreadyCheckedIn = schedulesManager.checkAlreadyCheckedIn(userId, schedId, thaiDateStr);
          if (!alreadyCheckedIn && schedObj) {
            const sessionRecord = schedulesManager.recordSessionAttendance({
              schedule_id: schedId,
              room_name: roomName,
              subject_code: schedObj.subject_code,
              subject_name: schedObj.subject_name,
              short_name: schedObj.short_name,
              class_type: schedObj.class_type,
              user_id: userId,
              student_id: studentId,
              user_name: userName,
              fingerprint_id: fingerprintId,
              date: thaiDateStr,
              time: timePart,
              timestamp: dbTimestamp,
              attendance_status: attendanceStatus,
              score: score,
              is_offline: true
            });
            io.emit('session_attendance_update', sessionRecord);
          }
        }

        const insertResult = await dbAsync.run(`
          INSERT INTO access_logs (user_id, student_id, user_name, fingerprint_id, status, score, timestamp)
          VALUES (?, ?, ?, ?, 'GRANTED', ?, ?)
        `, [userId, studentId, userName, fingerprintId, score, dbTimestamp]);

        const logEntry = {
          id: insertResult ? insertResult.lastID : 0,
          user_id: userId,
          student_id: studentId,
          user_name: userName,
          fingerprint_id: fingerprintId,
          status: 'GRANTED',
          score: score,
          tier: 'Tier 1 (Offline Sync)',
          room_name: roomName,
          schedule: schedObj ? {
            id: schedObj.id,
            room_name: roomName,
            subject_code: schedObj.subject_code,
            subject_name: schedObj.subject_name,
            short_name: schedObj.short_name,
            class_type: schedObj.class_type,
            time_display: schedObj.time_display,
            attendance_status: attendanceStatus
          } : null,
          attendance_status: schedObj ? attendanceStatus : 'OUT_OF_SCHEDULE',
          timestamp: scanDate.toISOString(),
          is_offline: true
        };

        io.emit('new_log', logEntry);
        syncedIds.push(rec.record_id);
        console.log(`✅ [Offline Sync] บันทึกสำเร็จ: ${userName} (${studentId}) [${roomName}] เวลา: ${dbTimestamp} (สถานะ: ${attendanceStatus})`);
      } catch (err) {
        console.error('❌ [Offline Sync Error] ข้อผิดพลาดในการบันทึกแถว:', err);
      }
    }

    socket.emit('sync_offline_attendance_ack', {
      success: true,
      count: syncedIds.length,
      synced_ids: syncedIds
    });

    if (syncedIds.length > 0) {
      io.emit('offline_sync_completed', { count: syncedIds.length });
    }
  });

  socket.on('disconnect', () => {
    console.log('Web Client Disconnected:', socket.id);
  });
});

// Start Server
async function start() {
  await initDatabase();
  
  if (SERIAL_ENABLED) {
    initSerial();
  } else {
    console.log('☁️ [Cloud Mode] ปิดการต่อ SerialPort ตรงบนเซิร์ฟเวอร์ (พร้อมรับการเชื่อมต่อจาก bridge.js)');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 Fingerprint Admin Server running on: http://localhost:${PORT}`);
    console.log(`📊 Dashboard UI ready at: http://localhost:${PORT}/index.html`);
    console.log(`🔑 Login Page ready at: http://localhost:${PORT}/login.html`);
    if (SERIAL_ENABLED) {
      console.log(`🔌 Serial Target Port: ${TARGET_PORT} (Baud: ${BAUD_RATE})`);
    } else {
      console.log(`☁️ Cloud Deployment Mode: Active (Waiting for bridge.js)`);
    }
    console.log(`====================================================`);
  });
}

start();
