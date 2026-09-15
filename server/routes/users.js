const express = require('express');
const { dbAsync } = require('../database');
const { authRequired } = require('../middleware/auth');

function createUsersRouter({ serialController, io }) {
  const router = express.Router();

  router.get('/', authRequired, async (req, res) => {
    try {
      const users = await dbAsync.all('SELECT * FROM users ORDER BY id ASC');
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', authRequired, async (req, res) => {
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
      serialController.broadcastUsersCache();
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

  router.delete('/:id', authRequired, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await dbAsync.run('DELETE FROM users WHERE id = ?', [id]);
      
      // สั่งเซนเซอร์ R307 บนบอร์ด Arduino ให้ลบลายนิ้วมือทั้ง 3 ช่องของคนนี้ออกทันที
      const { slot1, slot2, slot3 } = serialController.deleteUserSlots(id);

      io.emit('cmd_delete_fingerprint', { id, slots: [slot1, slot2, slot3] });
      io.emit('user_updated');
      serialController.broadcastUsersCache();
      res.json({ success: true, message: `ลบผู้ใช้งาน ID #${id} เรียบร้อยแล้ว` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createUsersRouter;
