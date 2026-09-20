const express = require('express');
const userRepository = require('../repositories/UserRepository');
const accessLogRepository = require('../repositories/AccessLogRepository');
const schedulesManager = require('../schedules_manager');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/logs', authRequired, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await accessLogRepository.getRecentLogs(limit);

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
    const totalUsers = await userRepository.countAll();
    const totalLogs = await accessLogRepository.countTotal();
    const grantedToday = await accessLogRepository.countGrantedToday();
    const deniedToday = await accessLogRepository.countDeniedToday();

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
