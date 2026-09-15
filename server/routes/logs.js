const express = require('express');
const { dbAsync } = require('../database');
const schedulesManager = require('../schedules_manager');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/logs', authRequired, async (req, res) => {
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

router.get('/stats', authRequired, async (req, res) => {
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

module.exports = router;
