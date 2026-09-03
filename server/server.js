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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fingerprint_super_secret_key_2026';
const TARGET_PORT = process.env.SERIAL_PORT || 'COM12';
const SERIAL_ENABLED = process.env.SERIAL_ENABLED !== 'false';
const BAUD_RATE = 115200;

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

// ==========================================
// 1. SerialPort Hardware Bridge (Arduino UNO Q & R307)
// ==========================================
let serialPort = null;
let serialParser = null;
let currentEnrollId = null;
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
  
  pendingCompare = {
    id: tier2ActiveCandidate.id,
    template: tier2ActiveCandidate.fingerprint_template,
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
    pendingRestore = {
      id: targetSlot,
      template: user.fingerprint_template,
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
      const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [fingerprint_id]);
      if (user) {
        userName = user.name;
        studentId = user.student_id || '-';
        userId = user.id;
        // บันทึกเวลาที่สแกนล่าสุด
        await dbAsync.run("UPDATE users SET last_scanned_at = datetime('now', '+7 hours') WHERE id = ?", [userId]);
        // ส่งข้อมูลผู้ใช้กลับไปให้หน้าจอ OLED บน Arduino แสดงชื่อและรหัสนักศึกษา
        sendSerialCommand(`MATCH_USER STU=${studentId} NAME=${userName}`);
      }
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
      timestamp: new Date().toISOString()
    };

    io.emit('new_log', newLogEntry);
    console.log(`🔔 [Access Log] ${userName} [${studentId}] (ID #${fingerprint_id}): ${isGranted ? 'GRANTED' : 'DENIED'} (${tier}, Score: ${score})`);
  } catch (err) {
    console.error('Error in processScanEvent:', err);
  }
}

// ประมวลผลข้อมูลที่ส่งมาจาก Arduino ผ่าน Serial
async function handleSerialData(rawLine) {
  const line = rawLine.trim();
  if (!line) return;
  console.log(`📥 [Arduino] ${line}`);

  // 1. สถานะขั้นตอนบันทึกลายนิ้วมือ (Enrollment Guide)
  if (line === 'STATUS:ENROLL_STEP1_WAIT') {
    io.emit('enroll_step_update', { status: 'STEP1_WAIT', id: currentEnrollId });
  } else if (line === 'STATUS:ENROLL_REMOVE_FINGER') {
    io.emit('enroll_step_update', { status: 'REMOVE_FINGER', id: currentEnrollId });
  } else if (line === 'STATUS:ENROLL_STEP2_WAIT') {
    io.emit('enroll_step_update', { status: 'STEP2_WAIT', id: currentEnrollId });
  } else if (line.startsWith('RESP:ENROLL_OK')) {
    const match = line.match(/ID=(\d+)/);
    const id = match ? parseInt(match[1]) : currentEnrollId;
    console.log(`🎉 [Enroll Success] บันทึกลายนิ้วมือ ID #${id} สำเร็จ!`);
    io.emit('enroll_step_update', { status: 'SUCCESS', id });
    io.emit('user_updated');
  } else if (line.startsWith('RESP:ENROLL_CANCELLED')) {
    console.log(`🛑 [Arduino] ยกเลิกการสแกนนิ้วสำเร็จ (${line})`);
    io.emit('enroll_step_update', { status: 'CANCELLED', message: 'ยกเลิกการลงทะเบียนเรียบร้อย' });
    io.emit('user_updated');
  } else if (line.startsWith('RESP:ENROLL_FAIL')) {
    let message = 'การบันทึกล้มเหลว กรุณาลองใหม่';
    if (line.includes('TIMEOUT')) {
      message = 'หมดเวลารอวางนิ้วบนเซนเซอร์ กรุณากดลองใหม่';
      const match = line.match(/ID=(\d+)/);
      const id = match ? parseInt(match[1]) : currentEnrollId;
      if (id) {
        (async () => {
          try {
            const u = await dbAsync.get('SELECT fingerprint_template FROM users WHERE id = ?', [id]);
            if (u && !u.fingerprint_template) {
              await dbAsync.run('DELETE FROM users WHERE id = ?', [id]);
              console.log(`🗑️ [Cleanup] ลบผู้ใช้ ID #${id} เนื่องจากหมดเวลาสแกน`);
              io.emit('user_updated');
            }
          } catch (e) {}
        })();
      }
      currentEnrollId = null;
    }
    else if (line.includes('IMAGE1')) message = 'ภาพลายนิ้วมือรอบแรกไม่ชัด กรุณาวางนิ้วใหม่';
    else if (line.includes('IMAGE2')) message = 'ภาพลายนิ้วมือรอบสองไม่ชัด กรุณาวางนิ้วใหม่';
    else if (line.includes('MISMATCH')) message = 'ลายนิ้วมือรอบที่ 2 ไม่ตรงกับรอบแรก กรุณาลองใหม่';
    else if (line.includes('STORE')) message = 'หน่วยความจำ R307 ขัดข้อง บันทึกไม่สำเร็จ';
    console.warn(`⚠️ [Enroll Failed] ${message} (${line})`);
    io.emit('enroll_step_update', { status: 'FAILED', message });
  }

  // 2. การลบลายนิ้วมือ
  else if (line.startsWith('RESP:DELETE_OK')) {
    console.log(`🗑️ [Delete OK] ${line}`);
    io.emit('user_updated');
  } else if (line.startsWith('RESP:DELETE_FAIL')) {
    console.warn(`⚠️ [Delete Fail] ${line}`);
  }

  // 3. สแกนเข้า-ออกประตู (Scan Event)
  else if (line.startsWith('EVENT:MATCH')) {
    // รูปแบบ: EVENT:MATCH ID=1 SCORE=145
    const idMatch = line.match(/ID=(\d+)/);
    const scoreMatch = line.match(/SCORE=(\d+)/);
    const fingerId = idMatch ? parseInt(idMatch[1]) : 0;
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    await processScanEvent(fingerId, score, 'GRANTED', 'Tier 1 Flash Match');
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
      const templateId = parseInt(idMatch[1]);
      const templateData = dataMatch[1];
      try {
        await dbAsync.run('UPDATE users SET fingerprint_template = ?, in_sensor = 1 WHERE id = ?', [templateData, templateId]);
        console.log(`💾 [DB Backup] บันทึก Template ลายนิ้วมือ ID #${templateId} (${templateData.length / 2} Bytes) ลง SQLite สำเร็จ!`);
        io.emit('template_saved', { id: templateId, success: true });
        io.emit('user_updated');
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
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
  }

  try {
    const admin = await dbAsync.get('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', token, username: admin.username });
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
      while (usedIds.has(targetId) && targetId <= 300) targetId++;
    }

    if (targetId > 300) {
      return res.status(400).json({ error: 'หน่วยความจำเต็ม ไม่สามารถเพิ่มผู้ใช้ได้เกิน 300 คน' });
    }

    // 3. บันทึกข้อมูลลงฐานข้อมูล
    await dbAsync.run(
      "INSERT INTO users (id, student_id, name, created_at) VALUES (?, ?, ?, datetime('now', '+7 hours'))",
      [targetId, cleanStudentId, cleanName]
    );

    io.emit('user_updated');
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
    
    // สั่งเซนเซอร์ R307 บนบอร์ด Arduino ให้ลบลายนิ้วมือตาม ID ออกด้วยทันที
    sendSerialCommand(`DELETE ${id}`);

    io.emit('cmd_delete_fingerprint', { id });
    io.emit('user_updated');
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
    res.json(logs);
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
// 5. IoT Device Endpoints & Biometric Backup/Restore
// ==========================================
app.get('/api/device/serial-status', (req, res) => {
  res.json({
    connected: serialConnected,
    port: TARGET_PORT
  });
});

// ดึงข้อมูล Template จาก R307 มาเก็บสำรองใน SQLite ทีละคน
app.post('/api/device/backup/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  const sent = sendSerialCommand(`BACKUP ${id}`);
  if (sent) {
    res.json({ success: true, message: `ส่งคำสั่งดึงข้อมูลลายนิ้วมือ ID #${id} จากเซนเซอร์แล้ว` });
  } else {
    res.status(500).json({ error: 'ไม่สามารถส่งคำสั่งไปยังบอร์ด Arduino ได้' });
  }
});

// กู้คืนลายนิ้วมือจาก SQLite ลงเซนเซอร์ R307 ทีละคน
app.post('/api/device/restore/:id', authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user || !user.fingerprint_template || user.fingerprint_template.length < 1024) {
    return res.status(404).json({ error: `ไม่พบข้อมูลลายนิ้วมือสำรองของ ID #${id} ในฐานข้อมูล` });
  }

  pendingRestore = {
    id: user.id,
    template: user.fingerprint_template,
    currentChunk: 0
  };

  const sent = sendSerialCommand(`RESTORE_INIT ${id}`);
  if (sent) {
    res.json({ success: true, message: `เริ่มกู้คืนข้อมูลลายนิ้วมือ ID #${id} ลงเซนเซอร์ R307 แล้ว` });
  } else {
    pendingRestore = null;
    res.status(500).json({ error: 'ไม่สามารถส่งคำสั่งไปยังบอร์ด Arduino ได้' });
  }
});

// กู้คืนลายนิ้วมือทั้งหมดจาก SQLite ลงเซนเซอร์ R307 (เหมาะสำหรับเปลี่ยนเซนเซอร์ใหม่)
app.post('/api/device/restore-all', authRequired, async (req, res) => {
  const usersWithTemplate = await dbAsync.all('SELECT id, fingerprint_template FROM users WHERE fingerprint_template IS NOT NULL AND length(fingerprint_template) >= 1024');
  if (usersWithTemplate.length === 0) {
    return res.status(400).json({ error: 'ไม่มีข้อมูลลายนิ้วมือสำรองในฐานข้อมูล' });
  }

  (async () => {
    for (let i = 0; i < usersWithTemplate.length; i++) {
      const u = usersWithTemplate[i];
      io.emit('restore_progress', { id: u.id, current: i + 1, total: usersWithTemplate.length, status: 'IN_PROGRESS' });
      
      pendingRestore = {
        id: u.id,
        template: u.fingerprint_template,
        currentChunk: 0
      };
      sendSerialCommand(`RESTORE_INIT ${u.id}`);
      
      // รอกระบวนการกู้คืนของแต่ละคนให้เสร็จสิ้น (สูงสุด 10 วินาที)
      let waitCount = 0;
      while (pendingRestore !== null && waitCount < 100) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
      }
      await new Promise(r => setTimeout(r, 1200));
    }
    io.emit('restore_progress', { status: 'ALL_COMPLETED', total: usersWithTemplate.length });
  })();

  res.json({
    success: true,
    total: usersWithTemplate.length,
    message: `กำลังเริ่มกู้คืนลายนิ้วมือทั้งหมด ${usersWithTemplate.length} รายการลงเซนเซอร์ R307`
  });
});

// ดึงข้อมูลสำรองจากเซนเซอร์ R307 เข้าสู่ SQLite ทั้งหมด
app.post('/api/device/backup-all', authRequired, async (req, res) => {
  const allUsers = await dbAsync.all('SELECT id FROM users ORDER BY id ASC');
  if (allUsers.length === 0) {
    return res.status(400).json({ error: 'ไม่มีรายชื่อผู้ใช้ในระบบ' });
  }

  (async () => {
    for (let i = 0; i < allUsers.length; i++) {
      const u = allUsers[i];
      io.emit('backup_progress', { id: u.id, current: i + 1, total: allUsers.length, status: 'IN_PROGRESS' });
      sendSerialCommand(`BACKUP ${u.id}`);
      await new Promise(r => setTimeout(r, 2000));
    }
    io.emit('backup_progress', { status: 'ALL_COMPLETED', total: allUsers.length });
  })();

  res.json({
    success: true,
    total: allUsers.length,
    message: `กำลังดึงข้อมูลสำรองลายนิ้วมือจากเซนเซอร์ R307 ทั้งหมด ${allUsers.length} รายการ`
  });
});

// ==========================================
// 6. Socket.io Real-time Event Handlers
// ==========================================
io.on('connection', (socket) => {
  console.log('💻 Web Client Connected:', socket.id);

  // แจ้งสถานะ Serial ให้ client ที่เพิ่งเชื่อมต่อ
  socket.emit('serial_status', { connected: serialConnected, port: TARGET_PORT });

  // คำสั่งเริ่มลงทะเบียนจากหน้าเว็บ
  socket.on('start_enroll', (data) => {
    console.log('🚀 สั่งเริ่มลงทะเบียนนิ้ว ID:', data.id, 'Name:', data.name);
    currentEnrollId = data.id;
    // ส่งคำสั่งผ่าน Serial ไปสั่งเซนเซอร์ R307
    const sent = sendSerialCommand(`ENROLL ${data.id}`);
    if (!sent) {
      socket.emit('enroll_step_update', {
        status: 'FAILED',
        message: 'ไม่สามารถส่งคำสั่งไปยังบอร์ด Arduino ได้ (กรุณาตรวจสอบการเชื่อมต่อ COM12 หรือปิด Serial Monitor ใน Arduino IDE)'
      });
    }
  });

  // คำสั่งยกเลิกการลงทะเบียนจากหน้าเว็บ
  socket.on('cancel_enroll', async (data) => {
    const id = data?.id || currentEnrollId;
    console.log(`🛑 [Cancel Enroll] ได้รับคำสั่งยกเลิกการลงทะเบียน ID #${id}`);

    // 1. ส่งคำสั่งให้ Arduino หลุดออกจากลูปทันที
    sendSerialCommand('CANCEL_ENROLL');

    // 2. ถ้าผู้ใช้คนนี้เพิ่งถูกสร้างและยังไม่มี fingerprint_template ให้ลบออกจาก Database ทันที (Rollback)
    if (id) {
      try {
        const u = await dbAsync.get('SELECT fingerprint_template FROM users WHERE id = ?', [id]);
        if (u && !u.fingerprint_template) {
          await dbAsync.run('DELETE FROM users WHERE id = ?', [id]);
          console.log(`🗑️ [Cleanup] ยกเลิกและลบผู้ใช้ Slot ID #${id} ที่ไม่มีลายนิ้วมือออกจากระบบแล้ว`);
          io.emit('user_updated');
        }
      } catch (err) {
        console.error('Error in cancel_enroll rollback:', err);
      }
    }

    currentEnrollId = null;
    io.emit('enroll_step_update', { status: 'CANCELLED', message: 'ยกเลิกการลงทะเบียนเรียบร้อย' });
  });

  // เมื่อ Hardware Bridge เชื่อมต่อเข้ามา (รองรับ Uno Q Linux Bridge หรือ PC Bridge)
  socket.on('register_bridge', () => {
    if (hardwareBridgeSocket && hardwareBridgeSocket.id !== socket.id) {
      console.warn(`⚠️ [Hardware Bridge] สลับไปยัง Bridge ตัวใหม่ (${socket.id}) ปลดตัวเก่าออก (${hardwareBridgeSocket.id})`);
      try { hardwareBridgeSocket.disconnect(true); } catch (e) {}
    }
    hardwareBridgeSocket = socket;
    serialConnected = true;
    console.log(`🔗 [Hardware Bridge] บอร์ด Arduino เชื่อมต่อผ่าน Cloud Bridge สำเร็จ! (ID: ${socket.id})`);
    io.emit('serial_status', { connected: true, port: 'Cloud Bridge (Active)' });

    socket.on('disconnect', () => {
      if (hardwareBridgeSocket && hardwareBridgeSocket.id === socket.id) {
        hardwareBridgeSocket = null;
        serialConnected = false;
        console.warn('🔌 [Hardware Bridge] หลุดการเชื่อมต่อจาก Cloud Bridge');
        io.emit('serial_status', { connected: false, port: 'Cloud Bridge (Offline)' });
      }
    });
  });

  // รับข้อมูลสแกนนิ้ว/ผลตอบกลับจาก Arduino ที่ส่งผ่าน Bridge
  socket.on('bridge_serial_data', async (rawLine) => {
    // ป้องกันการรับข้อมูลซ้ำซ้อนจาก Bridge ที่ไม่ได้ active
    if (hardwareBridgeSocket && socket.id !== hardwareBridgeSocket.id) {
      return;
    }
    await handleSerialData(rawLine);
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
