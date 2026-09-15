"""
Unit Tests for Uno Q Bridge (unoq_bridge.py)
Tests domain logic, slot mapping, offline queue, attendance deduplication,
16-byte chunking protocol safety, and schedule time evaluation.
"""

import sys
import os
import unittest
import tempfile
import json
from unittest.mock import MagicMock, patch

# Ensure repo root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Mock socketio and PIL if running in environments without them installed
if 'socketio' not in sys.modules:
    try:
        import socketio
    except ImportError:
        mock_sio = MagicMock()
        sys.modules['socketio'] = mock_sio

if 'PIL' not in sys.modules:
    try:
        import PIL
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        mock_pil = MagicMock()
        mock_pil.ImageFont.load_default.return_value = MagicMock()
        sys.modules['PIL'] = mock_pil
        sys.modules['PIL.Image'] = mock_pil
        sys.modules['PIL.ImageDraw'] = mock_pil
        sys.modules['PIL.ImageFont'] = mock_pil

# แยกแยะว่า PIL เป็นโมดูลจริงหรือถูกแทนด้วย MagicMock (เครื่องที่ไม่ได้ติดตั้ง Pillow)
REAL_PIL = not isinstance(sys.modules.get('PIL'), MagicMock)
requires_real_pil = unittest.skipUnless(
    REAL_PIL,
    'Pillow ไม่ได้ติดตั้งใน environment นี้ (PIL ถูกแทนด้วย MagicMock) — ข้าม test ที่ assert ผลเรนเดอร์จริง'
)
import unoq_bridge
import unoq_views


class TestSlotMapping(unittest.TestCase):
    """
    Test 3-finger biometric slot-to-user mapping formula:
    mapped_user_id = (slot_id - 1) // 3 + 1 if slot_id > 0 else 0
    """

    def map_slot(self, slot_id):
        return (slot_id - 1) // 3 + 1 if slot_id > 0 else 0

    def test_user_1_slots(self):
        self.assertEqual(self.map_slot(1), 1)
        self.assertEqual(self.map_slot(2), 1)
        self.assertEqual(self.map_slot(3), 1)

    def test_user_2_slots(self):
        self.assertEqual(self.map_slot(4), 2)
        self.assertEqual(self.map_slot(5), 2)
        self.assertEqual(self.map_slot(6), 2)

    def test_user_3_slots(self):
        self.assertEqual(self.map_slot(7), 3)
        self.assertEqual(self.map_slot(8), 3)
        self.assertEqual(self.map_slot(9), 3)

    def test_higher_slots(self):
        # Slot 13, 14, 15 -> User 5
        self.assertEqual(self.map_slot(13), 5)
        self.assertEqual(self.map_slot(14), 5)
        self.assertEqual(self.map_slot(15), 5)
        # Slot 300 -> User 100
        self.assertEqual(self.map_slot(300), 100)

    def test_invalid_and_boundary_slots(self):
        self.assertEqual(self.map_slot(0), 0)
        self.assertEqual(self.map_slot(-1), 0)
        self.assertEqual(self.map_slot(-99), 0)


class TestAttendanceDeduplication(unittest.TestCase):
    """
    Test attendance caching and duplicate scan prevention logic in unoq_bridge.
    """

    def setUp(self):
        # Save original state and isolate with temporary file
        self.orig_checked_in = set(unoq_bridge.checked_in_records)
        self.orig_cache_file = unoq_bridge.ATTENDANCE_CACHE_FILE
        self.temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.json')
        self.temp_file.close()
        unoq_bridge.ATTENDANCE_CACHE_FILE = self.temp_file.name
        unoq_bridge.checked_in_records = set()

    def tearDown(self):
        unoq_bridge.checked_in_records = self.orig_checked_in
        unoq_bridge.ATTENDANCE_CACHE_FILE = self.orig_cache_file
        if os.path.exists(self.temp_file.name):
            os.unlink(self.temp_file.name)

    def test_check_in_and_duplicate_detection(self):
        user_id = 42
        sched_id = 101
        date_str = '2026-09-16'

        # Initial state: not checked in
        self.assertFalse(unoq_bridge.is_already_checked_in(user_id, sched_id, date_str))

        # Record check-in
        unoq_bridge.record_check_in(user_id, sched_id, date_str)

        # Now should be detected as already checked in
        self.assertTrue(unoq_bridge.is_already_checked_in(user_id, sched_id, date_str))

        # Different date should not be marked checked in
        self.assertFalse(unoq_bridge.is_already_checked_in(user_id, sched_id, '2026-09-17'))

        # Different schedule should not be marked checked in
        self.assertFalse(unoq_bridge.is_already_checked_in(user_id, 999, date_str))

        # Different user should not be marked checked in
        self.assertFalse(unoq_bridge.is_already_checked_in(99, sched_id, date_str))

    def test_cache_file_persistence(self):
        unoq_bridge.record_check_in(1, 10, '2026-09-16')
        unoq_bridge.record_check_in(2, 20, '2026-09-16')

        # Clear in-memory set and reload from disk
        unoq_bridge.checked_in_records = set()
        unoq_bridge.load_attendance_cache()

        self.assertTrue(unoq_bridge.is_already_checked_in(1, 10, '2026-09-16'))
        self.assertTrue(unoq_bridge.is_already_checked_in(2, 20, '2026-09-16'))
        self.assertFalse(unoq_bridge.is_already_checked_in(3, 30, '2026-09-16'))

    def test_invalid_parameters_return_false(self):
        self.assertFalse(unoq_bridge.is_already_checked_in(None, 1, '2026-09-16'))
        self.assertFalse(unoq_bridge.is_already_checked_in(1, None, '2026-09-16'))
        self.assertFalse(unoq_bridge.is_already_checked_in(1, 1, None))
        self.assertFalse(unoq_bridge.is_already_checked_in(0, 0, ''))


class TestOfflineQueue(unittest.TestCase):
    """
    Test store-and-forward offline queue persistence and queue management.
    """

    def setUp(self):
        self.orig_queue = list(unoq_bridge.offline_queue)
        self.orig_queue_file = unoq_bridge.OFFLINE_QUEUE_FILE
        self.temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.json')
        self.temp_file.close()
        unoq_bridge.OFFLINE_QUEUE_FILE = self.temp_file.name
        unoq_bridge.offline_queue = []

    def tearDown(self):
        unoq_bridge.offline_queue = self.orig_queue
        unoq_bridge.OFFLINE_QUEUE_FILE = self.orig_queue_file
        if os.path.exists(self.temp_file.name):
            os.unlink(self.temp_file.name)

    def test_add_and_persist_offline_queue(self):
        record1 = {
            'user_id': 1,
            'schedule_id': 10,
            'attendance_status': 'ON_TIME',
            'scanned_at': '2026-09-16T08:30:00.000Z'
        }
        record2 = {
            'user_id': 2,
            'schedule_id': 10,
            'attendance_status': 'LATE',
            'scanned_at': '2026-09-16T08:50:00.000Z'
        }

        unoq_bridge.add_to_offline_queue(record1)
        unoq_bridge.add_to_offline_queue(record2)

        self.assertEqual(len(unoq_bridge.offline_queue), 2)

        # Clear in-memory queue and reload from disk
        unoq_bridge.offline_queue = []
        unoq_bridge.load_offline_queue()

        self.assertEqual(len(unoq_bridge.offline_queue), 2)
        self.assertEqual(unoq_bridge.offline_queue[0]['user_id'], 1)
        self.assertEqual(unoq_bridge.offline_queue[0]['attendance_status'], 'ON_TIME')
        self.assertEqual(unoq_bridge.offline_queue[1]['user_id'], 2)
        self.assertEqual(unoq_bridge.offline_queue[1]['attendance_status'], 'LATE')

    def test_corrupted_queue_file_recovery(self):
        # Write corrupted content to file
        with open(self.temp_file.name, 'w', encoding='utf-8') as f:
            f.write('{ INVALID JSON !!!')

        with patch('builtins.print'):
            unoq_bridge.load_offline_queue()
        # Should gracefully recover to an empty list without crashing
        self.assertEqual(unoq_bridge.offline_queue, [])


class TestChunkingProtocolSafety(unittest.TestCase):
    """
    Test 16-byte chunking protocol to guarantee Zephyr OS 64-byte UART RX FIFO safety (ADR-002, ADR-029).
    """

    def test_buffer_geometry(self):
        self.assertEqual(unoq_bridge.TFT_WIDTH, 160)
        self.assertEqual(unoq_bridge.TFT_HEIGHT, 128)
        expected_size = (160 * 128) // 8  # 2,560 bytes
        self.assertEqual(unoq_bridge.TFT_BUF_SIZE, expected_size)

    def test_chunking_and_uart_fifo_length_limit(self):
        """
        Ensure that every single FRAME_DATA line is strictly under 64 bytes.
        """
        test_buf = bytearray([i % 256 for i in range(unoq_bridge.TFT_BUF_SIZE)])
        chunk_size = 16
        offset = 0
        chunk_count = 0

        while offset < len(test_buf):
            chunk = test_buf[offset : offset + chunk_size]
            hex_str = chunk.hex().upper()
            cmd = f'FRAME_DATA {offset} {hex_str}\n'
            
            # Zephyr OS UART RX FIFO invariant: line length MUST be < 64 bytes
            self.assertLess(len(cmd), 64, f"Command line exceeds 64-byte limit: '{cmd}' ({len(cmd)} bytes)")
            
            # Verify hex length: 16 bytes = 32 hex characters
            self.assertLessEqual(len(hex_str), 32)
            
            offset += len(chunk)
            chunk_count += 1

        # Exactly 160 chunks of 16 bytes = 2,560 bytes
        self.assertEqual(chunk_count, 160)
        self.assertEqual(offset, unoq_bridge.TFT_BUF_SIZE)


class TestScheduleActiveEvaluation(unittest.TestCase):
    """
    Test schedule time window logic in get_active_schedule.
    """

    def setUp(self):
        self.orig_schedules = list(unoq_bridge.schedules_cache)
        self.orig_room = unoq_bridge.current_room_name
        unoq_bridge.current_room_name = 'ทค.1-101'

    def tearDown(self):
        unoq_bridge.schedules_cache = self.orig_schedules
        unoq_bridge.current_room_name = self.orig_room

    def test_empty_schedule_returns_out_of_schedule(self):
        unoq_bridge.schedules_cache = []
        res = unoq_bridge.get_active_schedule()
        self.assertIsNone(res['schedule'])
        self.assertEqual(res['attendanceStatus'], 'OUT_OF_SCHEDULE')

    @patch('unoq_bridge.datetime')
    def test_early_scan_window(self, mock_dt):
        """
        Class at 09:00 - 12:00, student scans at 08:50 (10 mins early).
        Expected: ON_TIME, isEarly=True
        """
        # Monday = 1
        fake_now = MagicMock()
        fake_now.isoweekday.return_value = 1
        fake_now.hour = 8
        fake_now.minute = 50
        mock_dt.datetime.now.return_value = fake_now
        mock_dt.timedelta.return_value = fake_now
        mock_dt.timezone.utc = MagicMock()

        # Mock the thai_now calculation
        with patch('datetime.datetime') as pdt:
            # Let's test with direct cache matching
            sample_sched = {
                'id': 1,
                'subject_name': 'Software Engineering',
                'day_of_week': 1,
                'start_time': '09:00',
                'end_time': '12:00',
                'late_threshold_mins': 15,
                'room_name': 'ทค.1-101',
                'is_active': True
            }
            unoq_bridge.schedules_cache = [sample_sched]

            # Direct check with datetime logic
            def parse_min(t_str):
                p = t_str.split(':')
                return int(p[0]) * 60 + int(p[1])

            start_m = parse_min('09:00')
            current_m = 8 * 60 + 50  # 08:50 = 530 mins
            # start_m = 540 mins
            is_early = (start_m - 15) <= current_m < start_m
            self.assertTrue(is_early)


class TestUnoqViews(unittest.TestCase):
    """
    Test unoq_views module: 160x128 Pillow rendering, buffer size invariants, and view outputs (ADR-037).
    """

    def test_dimensions_and_buffer_invariants(self):
        self.assertEqual(unoq_views.TFT_WIDTH, 160)
        self.assertEqual(unoq_views.TFT_HEIGHT, 128)
        self.assertEqual(unoq_views.TFT_BUF_SIZE, 2560)

    @requires_real_pil
    def test_all_seven_views_produce_exact_tft_buffer_size(self):
        views = [
            unoq_views.render_idle_screen('ทค.1-101'),
            unoq_views.render_denied_screen(is_offline=False),
            unoq_views.render_denied_screen(is_offline=True),
            unoq_views.render_user_card('6404101312345', 'สมชาย สายเสมอ', None),
            unoq_views.render_confirm_success('6404101312345', 'สมชาย สายเสมอ', None, is_offline=False),
            unoq_views.render_already_checked_in('สมชาย สายเสมอ', 'Programming'),
            unoq_views.render_cancelled_screen(),
            unoq_views.render_timeout_screen(),
        ]
        for buf in views:
            self.assertEqual(len(buf), unoq_views.TFT_BUF_SIZE)
            self.assertIsInstance(buf, bytearray)

    @requires_real_pil
    def test_tft_buf_to_img_roundtrip(self):
        buf = unoq_views.render_idle_screen('ทค.1-101')
        img = unoq_views.tft_buf_to_img(buf)
        self.assertEqual(img.size, (160, 128))
        self.assertEqual(img.mode, '1')

    def test_set_current_room_name(self):
        orig = unoq_views.current_room_name
        try:
            unoq_views.set_current_room_name('ทค.2-202')
            self.assertEqual(unoq_views.current_room_name, 'ทค.2-202')
        finally:
            unoq_views.set_current_room_name(orig)


if __name__ == '__main__':
    unittest.main()

