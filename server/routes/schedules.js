const express = require('express');
const schedulesManager = require('../schedules_manager');
const { authRequired } = require('../middleware/auth');

function createSchedulesRouter({ upload, io }) {
  const router = express.Router();

  // ดึงรายการห้องเรียนทั้งหมด และห้องที่เครื่องสแกนประจำอยู่
  router.get('/rooms', authRequired, (req, res) => {
    try {
      const data = schedulesManager.getRooms();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ตั้งค่าห้องประจำเครื่อง Uno Q (Active Device Room)
  router.post('/rooms/active', authRequired, (req, res) => {
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
  router.delete('/rooms/:roomName', authRequired, (req, res) => {
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
  router.post('/schedules/preview-excel', authRequired, upload.single('file'), (req, res) => {
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
  router.get('/schedules', authRequired, (req, res) => {
    try {
      const { room } = req.query;
      const schedules = schedulesManager.getAllSchedules(room);
      res.json(schedules);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ดึงสถานะคาบเรียนสด (สามารถกรองตามห้อง ?room=ทค.1-101 ได้)
  router.get('/schedules/current', authRequired, (req, res) => {
    try {
      const { room } = req.query;
      const current = schedulesManager.getActiveSchedule(new Date(), room);
      res.json(current);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/schedules/:id/attendance', authRequired, (req, res) => {
    try {
      const { id } = req.params;
      const { date, week } = req.query;
      const summary = schedulesManager.getSessionAttendance(id, { date, week });
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/schedules/:id/export-excel', authRequired, (req, res) => {
    try {
      const { id } = req.params;
      const { date, week } = req.query;
      const excelBuffer = schedulesManager.exportAttendanceExcel(id, { date, week });
      const sched = schedulesManager.getScheduleById(id);
      const schedCode = sched ? sched.subject_code : id;
      const period = week || date || 'all';
      const filename = `Attendance_${schedCode}_${period}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(excelBuffer);
    } catch (err) {
      console.error('Error exporting excel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ส่งออกตารางสรุปภาพรวมทุกสัปดาห์ (Academic Matrix - เฉพาะนักศึกษาที่ลงเวลาในวิชานี้)
  router.get('/schedules/:id/export-matrix', authRequired, (req, res) => {
    try {
      const { id } = req.params;
      const excelBuffer = schedulesManager.exportAttendanceMatrixExcel(id);
      const sched = schedulesManager.getScheduleById(id);
      const schedCode = sched ? sched.subject_code : id;
      const filename = `Attendance_Matrix_${schedCode}_Summary.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(excelBuffer);
    } catch (err) {
      console.error('Error exporting matrix excel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // บันทึกตารางเรียน (รองรับหลายห้อง: แทนที่ถ้าเป็นห้องเดิม, เพิ่มแดชบอร์ดใหม่ถ้าเป็นห้องใหม่)
  router.post('/schedules/import-excel', authRequired, upload.single('file'), (req, res) => {
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

  return router;
}

module.exports = createSchedulesRouter;
