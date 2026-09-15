const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { EnrollmentSession } = require('../enrollment_manager');
const userRepository = require('../repositories/UserRepository');
const accessLogRepository = require('../repositories/AccessLogRepository');

function createSerialController({
  io,
  schedulesManager,
  targetPort = process.env.SERIAL_PORT || 'COM12',
  baudRate = 115200,
  serialEnabled = process.env.SERIAL_ENABLED !== 'false',
  bridgeToken = process.env.BRIDGE_TOKEN || 'fingerprint_unoq_bridge_secure_token_2026'
}) {
  let serialPort = null;
  let serialParser = null;
  let currentEnrollId = null;
  let currentEnrollSession = null;
  let serialConnected = false;
  let r307Connected = false;
  let oledConnected = false;
  let reconnectTimer = null;
  let hardwareBridgeSocket = null;
  let pendingRestore = null;

  let tier2SearchQueue = [];
  let tier2ActiveCandidate = null;
  let tier2SearchTimer = null;
  let pendingCompare = null;

  let lastScanTime = 0;
  let lastScanFingerId = null;
  let lastScanStatus = null;

  // บรอดแคสต์แคชรายชื่อนักศึกษาให้ทุก Bridge และ Client
  async function broadcastUsersCache() {
    try {
      const users = await userRepository.findAllBasic();
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

  function initSerial() {
    if (serialPort && serialPort.isOpen) return;

    console.log(`🔌 [Serial] กำลังเชื่อมต่อไปยัง Arduino บนพอร์ต ${targetPort}...`);

    try {
      serialPort = new SerialPort({
        path: targetPort,
        baudRate: baudRate,
        autoOpen: false
      });

      serialParser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

      serialPort.open((err) => {
        if (err) {
          serialConnected = false;
          r307Connected = false;
          console.warn(`⚠️ [Serial] ไม่สามารถเปิดพอร์ต ${targetPort}: ${err.message}`);
          if (err.message.includes('Access denied')) {
            console.warn(`💡 [คำแนะนำ] พอร์ต ${targetPort} กำลังถูกใช้งานโดยโปรแกรมอื่น (เช่น Serial Monitor ใน Arduino IDE) กรุณาปิด Serial Monitor ก่อน`);
          }
          scheduleReconnect();
          return;
        }

        serialConnected = true;
        console.log(`✅ [Serial] เชื่อมต่อบอร์ด Arduino บน ${targetPort} สำเร็จ!`);
        io.emit('serial_status', { connected: true, port: targetPort, r307_connected: r307Connected, oled_connected: oledConnected });
      });

      serialParser.on('data', handleSerialData);

      serialPort.on('error', (err) => {
        console.error(`❌ [Serial Error] ${err.message}`);
        serialConnected = false;
        r307Connected = false;
        oledConnected = false;
        io.emit('serial_status', { connected: false, port: targetPort, r307_connected: false, oled_connected: false, error: err.message });
        scheduleReconnect();
      });

      serialPort.on('close', () => {
        console.warn(`🔌 [Serial] พอร์ต ${targetPort} ปิดการเชื่อมต่อ`);
        serialConnected = false;
        r307Connected = false;
        oledConnected = false;
        io.emit('serial_status', { connected: false, port: targetPort, r307_connected: false, oled_connected: false });
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
    const candidates = await userRepository.getTier2Candidates();

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

  async function autoPromoteToSensor(userId) {
    try {
      const user = await userRepository.findById(userId);
      if (!user || !user.fingerprint_template) return;

      const currentInSensor = await userRepository.countInSensor();
      
      let targetSlot = userId;

      if (currentInSensor >= 1000) {
        const lruUser = await userRepository.findLruInSensor(userId);

        if (lruUser) {
          console.log(`🔄 [Auto-Promote] เซนเซอร์เต็ม: ย้าย ID #${lruUser.id} (${lruUser.name}) ไปอยู่ Tier 2 แทน`);
          await userRepository.updateInSensor(lruUser.id, 0);
          targetSlot = lruUser.id;
        }
      }

      console.log(`🚀 [Auto-Promote] บันทึก Template ของ ID #${userId} (${user.name}) ลง Flash Slot #${targetSlot} ของ R307`);
      await userRepository.updateInSensor(userId, 1);
      io.emit('user_updated');

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

  async function processScanEvent(fingerprint_id, score, status, tier = 'Tier 1') {
    try {
      const now = Date.now();
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
        const mappedUserId = Math.floor((fingerprint_id - 1) / 3) + 1;
        let user = await userRepository.findById(mappedUserId);
        if (!user) {
          user = await userRepository.findById(fingerprint_id);
        }
        if (user) {
          userName = user.name;
          studentId = user.student_id || '-';
          userId = user.id;
          await userRepository.updateLastScanned(userId);
        }
      }

      const activeDeviceRoom = schedulesManager.getActiveDeviceRoom();
      const activeSchedInfo = schedulesManager.getActiveSchedule(new Date(), activeDeviceRoom);
      const currentSchedule = activeSchedInfo.schedule;
      const attendanceStatus = activeSchedInfo.attendanceStatus;
      const thaiDateNow = new Date(Date.now() + 7 * 3600000);
      const todayStr = thaiDateNow.toISOString().split('T')[0];
      const timeStr = `${String(thaiDateNow.getHours()).padStart(2, '0')}:${String(thaiDateNow.getMinutes()).padStart(2, '0')}:${String(thaiDateNow.getSeconds()).padStart(2, '0')}`;
      const isoWeek = schedulesManager.getIsoWeekDetails(thaiDateNow);

      if (isGranted && currentSchedule && userId) {
        const alreadyCheckedIn = schedulesManager.checkAlreadyCheckedIn(userId, currentSchedule.id, isoWeek.yearWeek);
        if (alreadyCheckedIn) {
          console.log(`⚠️ [Room Schedule] ${userName} [${studentId}] ได้ลงเวลาในคาบ "${currentSchedule.subject_name}" (สัปดาห์ที่ ${isoWeek.weekNo}) แล้ว`);
          io.emit('already_checked_in', {
            user_id: userId,
            user_name: userName,
            student_id: studentId,
            room_name: activeDeviceRoom,
            schedule: currentSchedule,
            week_number: isoWeek.weekNo,
            year_week: isoWeek.yearWeek,
            message: `คุณได้ลงเวลาคาบนี้ในสัปดาห์ที่ ${isoWeek.weekNo} เรียบร้อยแล้ว`
          });
          return;
        }

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
          week_number: isoWeek.weekNo,
          year: isoWeek.year,
          year_week: isoWeek.yearWeek,
          attendance_status: attendanceStatus,
          score: score || 0
        });
        io.emit('session_attendance_update', sessionRecord);
      }

      const insertResult = await accessLogRepository.insertLog({
        userId,
        studentId,
        userName,
        fingerprintId: fingerprint_id || 0,
        status: isGranted ? 'GRANTED' : 'DENIED',
        score: score || 0
      });

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

  async function cleanupFailedEnroll(userId, enrolledSlots = [], reason = '') {
    console.log(`🧹 [Auto-Rollback] เริ่มทำความสะอาดผู้ใช้ ID #${userId} (เหตุผล: ${reason})`);
    
    if (userId) {
      const slot1 = (userId - 1) * 3 + 1;
      const slot2 = (userId - 1) * 3 + 2;
      const slot3 = (userId - 1) * 3 + 3;
      const allSlotsToDelete = new Set([...enrolledSlots, slot1, slot2, slot3]);
      for (const slot of allSlotsToDelete) {
        sendSerialCommand(`DELETE ${slot}`);
      }

      try {
        await userRepository.deleteUser(userId);
        console.log(`🗑️ [Auto-Rollback] ลบผู้ใช้ ID #${userId} ออกจากฐานข้อมูลเรียบร้อยแล้ว`);
      } catch (err) {
        console.error(`Error deleting user #${userId} in cleanup:`, err);
      }
    }

    io.emit('user_updated');
    broadcastUsersCache();
  }

  async function handleSerialData(rawLine) {
    const line = rawLine.trim();
    if (!line) return;
    console.log(`📥 [Arduino] ${line}`);

    if (line.startsWith('STATUS:HARDWARE')) {
      r307Connected = line.includes('R307=READY');
      oledConnected = line.includes('OLED=READY') || line.includes('TFT=READY');
      const displayPort = hardwareBridgeSocket ? 'Cloud Bridge (Active)' : targetPort;
      console.log(`✅ [Hardware] สถานะ: R307=${r307Connected ? 'Ready' : 'Not Found'}, Display(TFT/OLED)=${oledConnected ? 'Ready' : 'Not Found'}`);
      io.emit('serial_status', { connected: serialConnected, port: displayPort, r307_connected: r307Connected, oled_connected: oledConnected, tft_connected: oledConnected });
      return;
    } else if (line === 'STATUS:R307_READY') {
      r307Connected = true;
      const displayPort = hardwareBridgeSocket ? 'Cloud Bridge (Active)' : targetPort;
      console.log('✅ [Hardware] เซนเซอร์ R307 พร้อมใช้งาน (Ready)');
      io.emit('serial_status', { connected: serialConnected, port: displayPort, r307_connected: true, oled_connected: oledConnected });
      return;
    } else if (line === 'STATUS:R307_NOT_FOUND') {
      r307Connected = false;
      const displayPort = hardwareBridgeSocket ? 'Cloud Bridge (Active)' : targetPort;
      console.warn('⚠️ [Hardware] ไม่พบเซนเซอร์ R307 (Not Found)! กรุณาตรวจสอบการต่อสาย Pin 0/1');
      io.emit('serial_status', { connected: serialConnected, port: displayPort, r307_connected: false, oled_connected: oledConnected });
      return;
    }

    // 1. สถานะขั้นตอนบันทึกลายนิ้วมือ (3-Finger Enrollment Guide)
    if (line.startsWith('STATUS:ENROLL_STEP1_WAIT')) {
      const fingerNum = currentEnrollSession ? currentEnrollSession.fingerNum : 1;
      io.emit('enroll_step_update', { status: 'STEP1_WAIT', id: currentEnrollId, fingerNum, totalFingers: 3 });
    } else if (line.startsWith('STATUS:ENROLL_REMOVE_FINGER')) {
      const fingerNum = currentEnrollSession ? currentEnrollSession.fingerNum : 1;
      io.emit('enroll_step_update', { status: 'REMOVE_FINGER', id: currentEnrollId, fingerNum, totalFingers: 3 });
    } else if (line.startsWith('STATUS:ENROLL_STEP2_WAIT')) {
      const fingerNum = currentEnrollSession ? currentEnrollSession.fingerNum : 1;
      const tryMatch = line.match(/TRY=(\d+)/);
      const attempt = tryMatch ? parseInt(tryMatch[1]) : 1;
      io.emit('enroll_step_update', { status: 'STEP2_WAIT', id: currentEnrollId, fingerNum, totalFingers: 3, attempt });
    } else if (line.startsWith('RESP:ENROLL_OK')) {
      const match = line.match(/ID=(\d+)/);
      const completedSlot = match ? parseInt(match[1]) : currentEnrollId;
      console.log(`🎉 [Enroll OK] บันทึก Slot #${completedSlot} สำเร็จ!`);

      if (currentEnrollSession) {
        const enrollRes = currentEnrollSession.onSlotSuccess(completedSlot);
        if (!enrollRes.isComplete) {
          const completedFinger = enrollRes.completedFinger;
          const nextSlot = enrollRes.nextSlot;
          currentEnrollId = nextSlot;

          io.emit('enroll_step_update', {
            status: 'FINGER_DONE',
            fingerNum: completedFinger,
            nextFinger: enrollRes.nextFinger,
            totalFingers: 3,
            slotId: completedSlot,
            nextSlot: nextSlot,
            id: currentEnrollSession.userId
          });

          console.log(`⏳ [3-Finger Enroll] นิ้วที่ ${completedFinger}/3 ผ่านแล้ว -> กำลังเริ่มนิ้วที่ ${enrollRes.nextFinger}/3 (Slot #${nextSlot}) ใน 1.5 วินาที...`);
          setTimeout(() => {
            if (currentEnrollSession && currentEnrollSession.status === 'IN_PROGRESS') {
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
        const slots = currentEnrollSession.getSlotsForCleanup();
        currentEnrollSession.cancel();
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
            const owner = await userRepository.findById(mappedOwnerId);
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
        message = 'ภาพลายนิ้วมือรอบสองไม่ชัด (ลองซ้ำ 3 ครั้งแล้ว) กรุณาวางนิ้วใหม่';
      } else if (line.includes('MISMATCH')) {
        message = 'ลายนิ้วมือรอบที่ 2 ไม่ตรงกับรอบแรก (ลองซ้ำ 3 ครั้งแล้ว) กรุณาลองใหม่';
      } else if (line.includes('STORE')) {
        message = 'หน่วยความจำ R307 ขัดข้อง บันทึกไม่สำเร็จ';
      }
      console.warn(`⚠️ [Enroll Failed] ${message} (${line})`);

      if (currentEnrollSession) {
        const failInfo = currentEnrollSession.onSlotFailure(code, message);
        io.emit('enroll_step_update', {
          status: 'FINGER_FAILED',
          code,
          message,
          fingerNum: failInfo.failedFinger,
          slotId: failInfo.failedSlot,
          enrolledSlots: failInfo.enrolledSlots,
          canRetry: true,
          id: currentEnrollSession.userId
        });
      } else if (currentEnrollId) {
        const mappedId = Math.floor((currentEnrollId - 1) / 3) + 1;
        currentEnrollId = null;
        await cleanupFailedEnroll(mappedId, [], message);
        io.emit('enroll_step_update', { status: 'FAILED', code, message });
      } else {
        io.emit('enroll_step_update', { status: 'FAILED', code, message });
      }
    } else if (line.startsWith('RESP:DELETE_OK')) {
      console.log(`🗑️ [Delete OK] ${line}`);
      io.emit('user_updated');
    } else if (line.startsWith('RESP:DELETE_FAIL')) {
      console.warn(`⚠️ [Delete Fail] ${line}`);
    } else if (line.startsWith('EVENT:CONFIRMED')) {
      const idMatch = line.match(/ID=(\d+)/);
      const scoreMatch = line.match(/SCORE=(\d+)/);
      const fingerId = idMatch ? parseInt(idMatch[1]) : 0;
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
      console.log(`✅ [Confirm Button D2] ยืนยันการลงเวลา Slot #${fingerId} (Score: ${score}) -> บันทึกเข้า Supabase`);
      await processScanEvent(fingerId, score, 'GRANTED', 'Tier 1 Flash Match (Confirmed)');
    } else if (line.startsWith('EVENT:MATCH')) {
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
    } else if (line.startsWith('RESP:COMPARE_READY')) {
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
    } else if (line.startsWith('TEMPLATE:')) {
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
            const userExists = await userRepository.findById(mappedUserId);
            if (userExists) {
              targetUserId = mappedUserId;
            } else {
              const fallbackUser = await userRepository.findById(slotId);
              targetUserId = fallbackUser ? slotId : mappedUserId;
            }
          }

          const existingUser = await userRepository.findById(targetUserId);
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

          await userRepository.updateTemplateAndInSensor(targetUserId, combinedTemplate);
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

  // --- Methods for routes/device.js and users.js ---

  function getStatus() {
    const displayPort = hardwareBridgeSocket ? 'Cloud Bridge (Active)' : targetPort;
    return {
      connected: serialConnected,
      port: displayPort,
      r307_connected: r307Connected,
      oled_connected: oledConnected
    };
  }

  function backupUser(id) {
    const slot1 = (id - 1) * 3 + 1;
    const slot2 = (id - 1) * 3 + 2;
    const slot3 = (id - 1) * 3 + 3;

    sendSerialCommand(`BACKUP ${slot1}`);
    setTimeout(() => sendSerialCommand(`BACKUP ${slot2}`), 1200);
    setTimeout(() => sendSerialCommand(`BACKUP ${slot3}`), 2400);

    if (id !== slot1 && id !== slot2 && id !== slot3) {
      setTimeout(() => sendSerialCommand(`BACKUP ${id}`), 3600);
    }
  }

  function restoreUser(id, rawTemplate) {
    const templates = (rawTemplate || '').split(',').map(t => t.trim()).filter(t => t.length >= 512);
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
  }

  function restoreAll(usersWithTemplate) {
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
  }

  function backupAll(allUsers) {
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
  }

  function deleteUserSlots(id) {
    const slot1 = (id - 1) * 3 + 1;
    const slot2 = (id - 1) * 3 + 2;
    const slot3 = (id - 1) * 3 + 3;
    sendSerialCommand(`DELETE ${slot1}`);
    sendSerialCommand(`DELETE ${slot2}`);
    sendSerialCommand(`DELETE ${slot3}`);
    if (id !== slot1 && id !== slot2 && id !== slot3) {
      sendSerialCommand(`DELETE ${id}`);
    }
    return { slot1, slot2, slot3 };
  }

  // --- Socket.IO Event Handler Attachment ---

  function handleSocketConnection(socket) {
    console.log(`💻 Client Connected: ${socket.id} (Role: ${socket.role})`);

    const displayPort = hardwareBridgeSocket ? 'Cloud Bridge (Active)' : targetPort;
    socket.emit('serial_status', { connected: serialConnected, port: displayPort, r307_connected: r307Connected, oled_connected: oledConnected });

    socket.on('start_enroll', async (data) => {
      if (socket.role !== 'admin') {
        console.warn(`🚨 [Security] Blocked unauthorized start_enroll from ${socket.id}`);
        return;
      }
      const userId = parseInt(data.id);

      if (!r307Connected) {
        console.warn(`⚠️ [Enroll Blocked] ไม่สามารถเริ่มลงทะเบียน User ID #${userId} ได้เนื่องจากไม่พบเซนเซอร์ R307`);
        socket.emit('enroll_step_update', {
          status: 'FAILED',
          message: 'ไม่สามารถเริ่มลงทะเบียนได้ เนื่องจากไม่พบเซนเซอร์ R307 (กรุณาตรวจสอบการต่อสายไฟเซนเซอร์ Pin 0/1)'
        });
        await cleanupFailedEnroll(userId, [], 'R307 Sensor Not Connected');
        currentEnrollSession = null;
        currentEnrollId = null;
        return;
      }

      const slot1 = (userId - 1) * 3 + 1;
      const slot2 = (userId - 1) * 3 + 2;
      const slot3 = (userId - 1) * 3 + 3;

      currentEnrollSession = new EnrollmentSession(userId, data.name, [slot1, slot2, slot3]);
      currentEnrollId = currentEnrollSession.getCurrentSlot();

      console.log(`🚀 [3-Finger Enroll] เริ่มลงทะเบียน User ID #${userId} (${data.name}) นิ้วที่ 1/3 (Slot #${slot1})`);

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

    socket.on('retry_current_finger', async () => {
      if (socket.role !== 'admin') {
        console.warn(`🚨 [Security] Blocked unauthorized retry_current_finger from ${socket.id}`);
        return;
      }
      if (!currentEnrollSession) {
        console.warn('⚠️ [Enroll Retry] No active enrollment session to retry');
        return;
      }

      const retryInfo = currentEnrollSession.retryCurrentFinger();
      currentEnrollId = retryInfo.slot;
      console.log(`🔄 [3-Finger Enroll] สั่งลองสแกนนิ้วที่ ${retryInfo.fingerNum}/3 ใหม่อีกครั้ง (Slot #${retryInfo.slot})`);

      const sent = sendSerialCommand(`ENROLL ${retryInfo.slot}`);
      if (sent) {
        io.emit('enroll_step_update', {
          status: 'FINGER_START',
          fingerNum: retryInfo.fingerNum,
          totalFingers: 3,
          slotId: retryInfo.slot,
          id: currentEnrollSession.userId
        });
      } else {
        socket.emit('enroll_step_update', {
          status: 'FAILED',
          message: 'ไม่สามารถส่งคำสั่งไปยังบอร์ด Arduino ได้'
        });
      }
    });

    socket.on('cancel_enroll', async (data) => {
      if (socket.role !== 'admin') {
        console.warn(`🚨 [Security] Blocked unauthorized cancel_enroll from ${socket.id}`);
        return;
      }
      console.log(`🛑 [Cancel Enroll] ได้รับคำสั่งยกเลิกการลงทะเบียน`);

      sendSerialCommand('CANCEL_ENROLL');

      let uId = data && data.id ? parseInt(data.id) : null;
      let enrolledSlots = [];

      if (currentEnrollSession) {
        uId = currentEnrollSession.userId;
        enrolledSlots = currentEnrollSession.getSlotsForCleanup();
        currentEnrollSession.cancel();
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

    socket.on('register_bridge', async (data) => {
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
      if (data) {
        if (typeof data.r307_connected === 'boolean') r307Connected = data.r307_connected;
        if (typeof data.oled_connected === 'boolean') oledConnected = data.oled_connected;
      }
      console.log(`🔗 [Hardware Bridge] บอร์ด Arduino เชื่อมต่อผ่าน Cloud Bridge สำเร็จ! (ID: ${socket.id}, R307: ${r307Connected ? 'Ready' : 'Not Found'}, OLED: ${oledConnected ? 'Ready' : 'Not Found'})`);
      io.emit('serial_status', { connected: true, port: 'Cloud Bridge (Active)', r307_connected: r307Connected, oled_connected: oledConnected });

      try {
        const users = await userRepository.findAllBasic();
        const activeRoom = schedulesManager.getActiveDeviceRoom();
        socket.emit('sync_users_cache', users || []);
        socket.emit('sync_device_room', { room_name: activeRoom });
        socket.emit('sync_schedules_cache', schedulesManager.getAllSchedules());

        const thaiDateNow = new Date(Date.now() + 7 * 3600000);
        const todayStr = thaiDateNow.toISOString().split('T')[0];
        const todayRecords = schedulesManager.loadAttendanceRecords().filter(r => r.date === todayStr);
        socket.emit('sync_today_attendance', todayRecords);

        console.log(`📦 [Hardware Bridge] ส่งแคชรายชื่อ (${users.length} คน), ห้องประจำเครื่อง [${activeRoom}], ตารางเรียน (${schedulesManager.getAllSchedules().length} คาบ), และประวัติวันนี้ (${todayRecords.length} รายการ) ไปยังบอร์ดแล้ว`);
      } catch (err) {
        console.error('Error sending users cache to bridge:', err);
      }

      socket.on('disconnect', () => {
        if (hardwareBridgeSocket && hardwareBridgeSocket.id === socket.id) {
          hardwareBridgeSocket = null;
          serialConnected = false;
          r307Connected = false;
          oledConnected = false;
          console.warn('🔌 [Hardware Bridge] หลุดการเชื่อมต่อจาก Cloud Bridge');
          io.emit('serial_status', { connected: false, port: 'Cloud Bridge (Offline)', r307_connected: false, oled_connected: false });
        }
      });
    });

    socket.on('bridge_sensor_status', (data) => {
      if (socket.role !== 'bridge') {
        console.warn(`🚨 [Security] Blocked unauthorized bridge_sensor_status from ${socket.id}`);
        return;
      }
      if (data) {
        if (typeof data.r307_connected === 'boolean') {
          r307Connected = data.r307_connected;
        }
        if (typeof data.oled_connected === 'boolean') {
          oledConnected = data.oled_connected;
        }
        const displayPort = hardwareBridgeSocket ? 'Cloud Bridge (Active)' : targetPort;
        console.log(`📡 [Hardware Bridge] สถานะอัปเดต: R307=${r307Connected ? 'Online' : 'Not Found'}, OLED=${oledConnected ? 'Online' : 'Not Found'}`);
        io.emit('serial_status', { connected: serialConnected, port: displayPort, r307_connected: r307Connected, oled_connected: oledConnected });
      }
    });

    socket.on('get_users_cache', async () => {
      try {
        const users = await userRepository.findAllBasic();
        socket.emit('sync_users_cache', users || []);
      } catch (err) {
        console.error('Error in get_users_cache:', err);
      }
    });

    socket.on('get_schedules_cache', () => {
      try {
        socket.emit('sync_schedules_cache', schedulesManager.getAllSchedules());
      } catch (err) {
        console.error('Error in get_schedules_cache:', err);
      }
    });

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

    socket.on('bridge_serial_data', async (rawLine) => {
      if (socket.role !== 'bridge') {
        console.warn(`🚨 [Security] Blocked unauthorized bridge_serial_data from ${socket.id}`);
        return;
      }
      if (hardwareBridgeSocket && socket.id !== hardwareBridgeSocket.id) {
        return;
      }
      await handleSerialData(rawLine);
    });

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

          const scanDate = new Date(scannedAt);
          const thaiDateStr = rec.scanned_at.includes('T') ? rec.scanned_at.split('T')[0] : new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
          const timePart = rec.scanned_at.includes('T') ? rec.scanned_at.split('T')[1].substring(0, 8) : '00:00:00';
          const dbTimestamp = `${thaiDateStr} ${timePart}`;

          if (userId) {
            try {
              await userRepository.updateLastScanned(userId, dbTimestamp);
            } catch (e) {}
          }

          let schedObj = null;
          if (schedId && userId) {
            schedObj = schedulesManager.getScheduleById(schedId);

            const offlineIso = schedulesManager.getIsoWeekDetails(thaiDateStr);
            const alreadyCheckedIn = schedulesManager.checkAlreadyCheckedIn(userId, schedId, offlineIso.yearWeek, thaiDateStr);
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
                week_number: offlineIso.weekNo,
                year: offlineIso.year,
                year_week: offlineIso.yearWeek,
                attendance_status: attendanceStatus,
                score: score,
                is_offline: true
              });
              io.emit('session_attendance_update', sessionRecord);
            }
          }

          const insertResult = await accessLogRepository.insertLog({
            userId,
            studentId,
            userName,
            fingerprintId,
            status: 'GRANTED',
            score,
            timestamp: dbTimestamp
          });

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
  }

  return {
    initSerial,
    scheduleReconnect,
    sendSerialCommand,
    sendNextRestoreChunk,
    sendNextCompareChunk,
    startTier2Search,
    checkNextTier2Candidate,
    autoPromoteToSensor,
    processScanEvent,
    cleanupFailedEnroll,
    handleSerialData,
    broadcastUsersCache,
    broadcastSchedulesCache,
    getStatus,
    backupUser,
    restoreUser,
    restoreAll,
    backupAll,
    deleteUserSlots,
    handleSocketConnection,
    isSerialConnected: () => serialConnected,
    isR307Connected: () => r307Connected,
    isOledConnected: () => oledConnected
  };
}

module.exports = {
  createSerialController
};
