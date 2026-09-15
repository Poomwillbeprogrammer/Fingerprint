const express = require('express');
const { dbAsync } = require('../database');
const { authRequired } = require('../middleware/auth');

function createDeviceRouter({ serialController }) {
  const router = express.Router();

  router.get('/serial-status', authRequired, (req, res) => {
    res.json(serialController.getStatus());
  });

  // ดึงข้อมูล Template จาก R307 มาเก็บสำรองใน Database ทีละคน (รองรับ 3 นิ้วต่อคน)
  router.post('/backup/:id', authRequired, async (req, res) => {
    const id = parseInt(req.params.id);
    const slot1 = (id - 1) * 3 + 1;
    const slot2 = (id - 1) * 3 + 2;
    const slot3 = (id - 1) * 3 + 3;

    serialController.backupUser(id);

    res.json({ 
      success: true, 
      message: `ส่งคำสั่งดึงข้อมูลลายนิ้วมือ User ID #${id} (Slots #${slot1}, #${slot2}, #${slot3}) จากเซนเซอร์แล้ว` 
    });
  });

  // กู้คืนลายนิ้วมือจาก Database ลงเซนเซอร์ R307 ทีละคน (รองรับ 3 นิ้วต่อคน)
  router.post('/restore/:id', authRequired, async (req, res) => {
    const id = parseInt(req.params.id);
    const user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user || !user.fingerprint_template || user.fingerprint_template.length < 512) {
      return res.status(404).json({ error: `ไม่พบข้อมูลลายนิ้วมือสำรองของ ID #${id} ในฐานข้อมูล` });
    }

    const rawTemplate = user.fingerprint_template || '';
    const templates = rawTemplate.split(',').map(t => t.trim()).filter(t => t.length >= 512);

    serialController.restoreUser(id, rawTemplate);

    res.json({ 
      success: true, 
      message: `เริ่มกู้คืนข้อมูลลายนิ้วมือ User ID #${id} (${templates.length} นิ้ว) ลงเซนเซอร์ R307 แล้ว` 
    });
  });

  // กู้คืนลายนิ้วมือทั้งหมดจาก Database ลงเซนเซอร์ R307 (เหมาะสำหรับเปลี่ยนเซนเซอร์ใหม่)
  router.post('/restore-all', authRequired, async (req, res) => {
    const usersWithTemplate = await dbAsync.all('SELECT id, fingerprint_template FROM users WHERE fingerprint_template IS NOT NULL AND length(fingerprint_template) >= 512');
    if (usersWithTemplate.length === 0) {
      return res.status(400).json({ error: 'ไม่มีข้อมูลลายนิ้วมือสำรองในฐานข้อมูล' });
    }

    serialController.restoreAll(usersWithTemplate);

    res.json({
      success: true,
      total: usersWithTemplate.length,
      message: `กำลังเริ่มกู้คืนลายนิ้วมือทั้งหมด ${usersWithTemplate.length} รายการลงเซนเซอร์ R307`
    });
  });

  // ดึงข้อมูลสำรองจากเซนเซอร์ R307 เข้าสู่ Database ทั้งหมด
  router.post('/backup-all', authRequired, async (req, res) => {
    const allUsers = await dbAsync.all('SELECT id FROM users ORDER BY id ASC');
    if (allUsers.length === 0) {
      return res.status(400).json({ error: 'ไม่มีรายชื่อผู้ใช้ในระบบ' });
    }

    serialController.backupAll(allUsers);

    res.json({
      success: true,
      total: allUsers.length,
      message: `กำลังดึงข้อมูลสำรองลายนิ้วมือจากเซนเซอร์ R307 ทั้งหมด ${allUsers.length} รายการ (ระบบ 3 นิ้วต่อคน)`
    });
  });

  return router;
}

module.exports = createDeviceRouter;
