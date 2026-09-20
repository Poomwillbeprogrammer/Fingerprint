const express = require('express');
const userRepository = require('../repositories/UserRepository');
const { authRequired, requireRole } = require('../middleware/auth');

// รูปแบบรหัสนักศึกษา 12 หลัก: ตัวเลข 11 ตัว คั่นด้วยขีด และตัวเลข 1 ตัว (เช่น 66041013110-1)
const STUDENT_ID_REGEX = /^\d{11}-\d$/;

function createUsersRouter({ serialController, io }) {
  const router = express.Router();

  router.get('/', authRequired, async (req, res) => {
    try {
      const users = await userRepository.findAllOrderById();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', authRequired, requireRole('super_admin'), async (req, res) => {
    const { name, student_id } = req.body;
    if (!name || !student_id) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสนักศึกษาและชื่อ-นามสกุล' });
    }

    const cleanStudentId = student_id.toString().trim();
    const cleanName = name.trim();

    if (!cleanStudentId || !cleanName) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสนักศึกษาและชื่อ-นามสกุล' });
    }

    // ตรวจสอบรูปแบบรหัสนักศึกษา 12 หลัก (ป้องกันรหัสขาดหรือเกิน)
    if (!STUDENT_ID_REGEX.test(cleanStudentId)) {
      return res.status(400).json({ 
        error: 'รูปแบบรหัสนักศึกษาไม่ถูกต้อง ต้องเป็นตัวเลข 12 หลักในรูปแบบ XXXXXXXXXXX-X (เช่น 66041013110-1)' 
      });
    }

    try {
      // 1. ตรวจสอบว่ารหัสนักศึกษานี้มีอยู่ในระบบแล้วหรือไม่ (ป้องกันการซ้ำ)
      const existingStudent = await userRepository.findByStudentId(cleanStudentId);
      if (existingStudent) {
        return res.status(400).json({ 
          error: `รหัสนักศึกษา "${cleanStudentId}" มีในระบบแล้ว (Slot ID #${existingStudent.id} - ${existingStudent.name})` 
        });
      }

      // 2. คำนวณ Slot ID อัตโนมัติ: เติมเต็มช่องว่างที่ว่างอยู่ (Re-use lowest available ID)
      const allExisting = await userRepository.findAllOrderById();
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
      await userRepository.insertUser({
        id: targetId,
        studentId: cleanStudentId,
        name: cleanName
      });

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

  router.put('/:id', authRequired, requireRole('super_admin'), async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, student_id } = req.body;

    if (!name || !student_id) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสนักศึกษาและชื่อ-นามสกุล' });
    }

    const cleanStudentId = student_id.toString().trim();
    const cleanName = name.trim();

    if (!cleanStudentId || !cleanName) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสนักศึกษาและชื่อ-นามสกุล' });
    }

    // ตรวจสอบรูปแบบรหัสนักศึกษา 12 หลัก (ป้องกันรหัสขาดหรือเกิน)
    if (!STUDENT_ID_REGEX.test(cleanStudentId)) {
      return res.status(400).json({ 
        error: 'รูปแบบรหัสนักศึกษาไม่ถูกต้อง ต้องเป็นตัวเลข 12 หลักในรูปแบบ XXXXXXXXXXX-X (เช่น 66041013110-1)' 
      });
    }

    try {
      // 1. ตรวจสอบว่าผู้ใช้งานนี้มีอยู่ในระบบจริงหรือไม่
      const currentUser = await userRepository.findById(id);
      if (!currentUser) {
        return res.status(404).json({ error: `ไม่พบผู้ใช้งาน ID #${id}` });
      }

      // 2. ตรวจสอบว่ารหัสนักศึกษานี้ไปซ้ำกับผู้ใช้อื่นหรือไม่
      const existingStudent = await userRepository.findByStudentId(cleanStudentId);
      if (existingStudent && existingStudent.id !== id) {
        return res.status(400).json({
          error: `รหัสนักศึกษา "${cleanStudentId}" ซ้ำกับผู้ใช้อื่นในระบบแล้ว (Slot ID #${existingStudent.id} - ${existingStudent.name})`
        });
      }

      // 3. บันทึกข้อมูลที่แก้ไขลงฐานข้อมูล และ Cascade ไปยังตารางที่เกี่ยวข้อง
      await userRepository.updateUser(id, {
        name: cleanName,
        studentId: cleanStudentId
      });

      // 4. ซิงก์ข้อมูลในหน่วยความจำ RAM ของ schedules_manager
      const schedulesManager = require('../schedules_manager');
      schedulesManager.updateUserDetails(id, {
        name: cleanName,
        studentId: cleanStudentId
      });

      // 5. แจ้งเตือนหน้าเว็บและส่งอัปเดตแคชให้บอร์ดฮาร์ดแวร์
      io.emit('user_updated');
      serialController.broadcastUsersCache();

      res.json({
        success: true,
        message: `แก้ไขข้อมูลผู้ใช้งาน ID #${id} เรียบร้อยแล้ว`,
        user: { id, student_id: cleanStudentId, name: cleanName }
      });
    } catch (err) {
      console.error('Error updating user:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/bulk-delete', authRequired, requireRole('super_admin'), async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'กรุณาเลือกผู้ใช้งานที่ต้องการลบอย่างน้อย 1 คน' });
    }

    const cleanIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
    if (cleanIds.length === 0) {
      return res.status(400).json({ error: 'รหัสผู้ใช้งานไม่ถูกต้อง' });
    }

    try {
      // 1. ลบจากตาราง users (เก็บบันทึกประวัติการเข้าเรียน session_attendance ไว้ตามนโยบายข้อ Q1.A)
      await userRepository.deleteUsers(cleanIds);

      // 2. สั่งเคลียร์ช่องลายนิ้วมือบนเซนเซอร์ R307 แบบ Pacing ตามข้อ Q3.A
      if (typeof serialController.deleteUsersSlots === 'function') {
        serialController.deleteUsersSlots(cleanIds);
      }

      // 3. แจ้งเตือนหน้าเว็บและซิงก์แคชไปยังบอร์ด Uno Q
      io.emit('user_updated');
      serialController.broadcastUsersCache();

      res.json({
        success: true,
        count: cleanIds.length,
        message: `ลบผู้ใช้งานจำนวน ${cleanIds.length} คนเรียบร้อยแล้ว`
      });
    } catch (err) {
      console.error('Error in bulk-delete:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', authRequired, requireRole('super_admin'), async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await userRepository.deleteUser(id);
      
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
