import socket
import threading
import time
import sys
import json
import os
import datetime
import socketio
from PIL import Image, ImageDraw, ImageFont

RENDER_URL = sys.argv[1] if len(sys.argv) > 1 else 'https://fingerprint-hrkp.onrender.com'
LOCAL_PORT = 7500
FONT_PATH = '/home/arduino/tahoma.ttf'
CACHE_FILE = '/home/arduino/users_cache.json'
SCHEDULES_CACHE_FILE = '/home/arduino/schedules_cache.json'
ACTIVE_ROOM_FILE = '/home/arduino/active_room.txt'
ATTENDANCE_CACHE_FILE = '/home/arduino/attendance_cache.json'
OFFLINE_QUEUE_FILE = '/home/arduino/offline_queue.json'
BRIDGE_TOKEN_FILE = '/home/arduino/bridge_token.txt'

if not os.path.exists('/home/arduino'):
    CACHE_FILE = os.path.join(os.path.dirname(__file__), 'users_cache.json')
    SCHEDULES_CACHE_FILE = os.path.join(os.path.dirname(__file__), 'schedules_cache.json')
    ACTIVE_ROOM_FILE = os.path.join(os.path.dirname(__file__), 'active_room.txt')
    ATTENDANCE_CACHE_FILE = os.path.join(os.path.dirname(__file__), 'attendance_cache.json')
    OFFLINE_QUEUE_FILE = os.path.join(os.path.dirname(__file__), 'offline_queue.json')
    BRIDGE_TOKEN_FILE = os.path.join(os.path.dirname(__file__), 'bridge_token.txt')

BRIDGE_TOKEN = os.environ.get('BRIDGE_TOKEN', 'fingerprint_unoq_bridge_secure_token_2026')
if os.path.exists(BRIDGE_TOKEN_FILE):
    try:
        with open(BRIDGE_TOKEN_FILE, 'r', encoding='utf-8') as tf:
            t = tf.read().strip()
            if t:
                BRIDGE_TOKEN = t
                print('🔑 [Security] โหลด BRIDGE_TOKEN จากไฟล์สำเร็จ')
    except Exception as e:
        print(f'⚠️ [Security] ไม่สามารถอ่าน {BRIDGE_TOKEN_FILE}: {e}')

sio = socketio.Client(reconnection=True, reconnection_delay=2)
mcu_sock = None
users_cache = {}
schedules_cache = []
checked_in_records = set()
offline_queue = []
current_room_name = 'ทค.1-101'
r307_connected = False
oled_connected = False

def load_offline_queue():
    global offline_queue
    if os.path.exists(OFFLINE_QUEUE_FILE):
        try:
            with open(OFFLINE_QUEUE_FILE, 'r', encoding='utf-8') as f:
                offline_queue = json.load(f)
                print(f'📦 [Offline Queue] โหลดคิวออฟไลน์ที่ค้างอยู่: {len(offline_queue)} รายการ')
        except Exception as e:
            print(f'⚠️ [Offline Queue] โหลด offline_queue.json ล้มเหลว: {e}')
            offline_queue = []
    else:
        offline_queue = []

def save_offline_queue():
    global offline_queue
    try:
        with open(OFFLINE_QUEUE_FILE, 'w', encoding='utf-8') as f:
            json.dump(offline_queue, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f'⚠️ [Offline Queue] บันทึก offline_queue.json ล้มเหลว: {e}')

def add_to_offline_queue(record):
    global offline_queue
    offline_queue.append(record)
    save_offline_queue()
    print(f'💾 [Offline Queue] บันทึกลงคิวออฟไลน์สำเร็จ! (ค้างอยู่ {len(offline_queue)} รายการ)')

def load_active_room():
    global current_room_name, IDLE_BITMAP
    if os.path.exists(ACTIVE_ROOM_FILE):
        try:
            with open(ACTIVE_ROOM_FILE, 'r', encoding='utf-8') as f:
                r = f.read().strip()
                if r:
                    current_room_name = r
                    print(f'📍 [Local Cache] โหลดห้องประจำเครื่องเดิม: [{current_room_name}]')
                    IDLE_BITMAP = render_idle_screen(current_room_name)
        except Exception as e:
            print(f'⚠️ [Local Cache] โหลด active_room.txt ล้มเหลว: {e}')

def save_active_room(room_name):
    try:
        with open(ACTIVE_ROOM_FILE, 'w', encoding='utf-8') as f:
            f.write(room_name.strip())
    except Exception as e:
        print(f'⚠️ [Local Cache] บันทึก active_room.txt ล้มเหลว: {e}')

def load_attendance_cache():
    global checked_in_records
    if os.path.exists(ATTENDANCE_CACHE_FILE):
        try:
            with open(ATTENDANCE_CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                checked_in_records = set(tuple(item) for item in data)
                print(f'📋 [Local Cache] โหลดประวัติการลงเวลา: {len(checked_in_records)} รายการ')
        except Exception as e:
            print(f'⚠️ [Local Cache] โหลดประวัติการลงเวลาล้มเหลว: {e}')

def save_attendance_cache():
    try:
        with open(ATTENDANCE_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(list(checked_in_records), f, ensure_ascii=False)
    except Exception as e:
        print(f'⚠️ [Local Cache] บันทึกประวัติการลงเวลาล้มเหลว: {e}')

def record_check_in(user_id, sched_id, date_str):
    if user_id and sched_id and date_str:
        checked_in_records.add((int(user_id), int(sched_id), str(date_str)))
        save_attendance_cache()

def is_already_checked_in(user_id, sched_id, date_str):
    if not user_id or not sched_id or not date_str:
        return False
    return (int(user_id), int(sched_id), str(date_str)) in checked_in_records

# 1. โหลดฟอนต์ภาษาไทยแท้
FONT_CANDIDATES = [
    FONT_PATH,
    os.path.join(os.path.dirname(__file__), 'server', 'fonts', 'tahoma.ttf'),
    os.path.join(os.path.dirname(__file__), 'fonts', 'tahoma.ttf'),
    os.path.join(os.path.dirname(__file__), 'tahoma.ttf'),
    '/home/arduino/tahoma.ttf'
]

actual_font_path = None
for fp in FONT_CANDIDATES:
    if os.path.exists(fp):
        actual_font_path = fp
        break

if actual_font_path:
    try:
        font_title = ImageFont.truetype(actual_font_path, 10)
        font_id    = ImageFont.truetype(actual_font_path, 10)
        font_name  = ImageFont.truetype(actual_font_path, 11)
        font_name_sm = ImageFont.truetype(actual_font_path, 9)
        font_body  = ImageFont.truetype(actual_font_path, 11)
        font_small = ImageFont.truetype(actual_font_path, 9)
        print(f'✅ [Font] โหลดฟอนต์ {actual_font_path} สำเร็จ คมชัด 100%')
    except Exception as e:
        print(f'⚠️ [Font] โหลดฟอนต์ {actual_font_path} ล้มเหลว: {e}')
        actual_font_path = None

if not actual_font_path:
    print('⚠️ [Font] ไม่พบไฟล์ฟอนต์ TrueType กำลังใช้ฟอนต์เริ่มต้น (อาจแสดงผลภาษาไทยไม่สมบูรณ์)')
    font_title = font_id = font_name = font_name_sm = font_body = font_small = ImageFont.load_default()

# ขนาดความละเอียดจอ 1.8" TFT SPI (128x160)
TFT_WIDTH = 128
TFT_HEIGHT = 160
TFT_BUF_SIZE = (TFT_WIDTH * TFT_HEIGHT) // 8  # 2,560 Bytes

# 2. ฟังก์ชันแปลงภาพ Pillow (128x160) เป็น 2560-byte TFT Horizontal 1-bit Buffer
def img_to_tft_buf(img):
    try:
        # โหมด '1' ของ Pillow เข้ารหัสแบบ 1-bit MSB Horizontal Raster ตรงตามสเปก 100%
        return bytearray(img.convert('1').tobytes())
    except Exception:
        buf = bytearray(TFT_BUF_SIZE)
        px = img.load()
        w, h = img.size
        for y in range(h):
            row_offset = y * (w // 8)
            for x in range(w):
                if px[x, y]:
                    buf[row_offset + (x // 8)] |= (1 << (7 - (x % 8)))
        return buf

# Alias เพื่อความเข้ากันได้ย้อนหลัง 100%
img_to_oled_buf = img_to_tft_buf

# 3. เรนเดอร์หน้าจอพร้อมใช้งาน (Idle Screen ภาษาไทยคมกริบ - 128x160 พร้อมชื่อห้องประจำเครื่อง)
def render_idle_screen(room_name=None):
    global current_room_name
    r_name = room_name or current_room_name or 'ทค.1-101'
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    # Header: ระบบลงเวลาเรียน IoT
    title = 'ระบบลงเวลาเรียน IoT'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 6), title, font=font_title, fill=1)
    d.line([(2, 22), (TFT_WIDTH - 3, 22)], fill=1)

    # Subheader / Institution
    inst = 'มทร.ล้านนา (RMUTL)'
    bb = d.textbbox((0, 0), inst, font=font_small)
    iw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - iw) // 2, 28), inst, font=font_small, fill=1)

    # Central Fingerprint Prompt Box
    d.rectangle([12, 46, TFT_WIDTH - 13, 108], outline=1)
    prompt1 = 'กรุณาวางนิ้ว'
    bb = d.textbbox((0, 0), prompt1, font=font_name)
    pw1 = bb[2] - bb[0]
    d.text(((TFT_WIDTH - pw1) // 2, 56), prompt1, font=font_name, fill=1)

    prompt2 = 'เพื่อสแกนเวลาเรียน'
    bb = d.textbbox((0, 0), prompt2, font=font_small)
    pw2 = bb[2] - bb[0]
    d.text(((TFT_WIDTH - pw2) // 2, 82), prompt2, font=font_small, fill=1)

    # Footer / Room Information
    d.line([(2, 118), (TFT_WIDTH - 3, 118)], fill=1)
    room_text = f'[ {r_name} ]'
    bb = d.textbbox((0, 0), room_text, font=font_title)
    rw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - rw) // 2, 124), room_text, font=font_title, fill=1)

    status_text = 'พร้อมใช้งาน (READY)'
    bb = d.textbbox((0, 0), status_text, font=font_small)
    sw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - sw) // 2, 142), status_text, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 4. เรนเดอร์หน้าจอไม่พบลายนิ้วมือ (Denied Screen ภาษาไทย - 128x160)
def render_denied_screen(is_offline=False):
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    title = 'ACCESS DENIED'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 6), title, font=font_title, fill=1)
    d.line([(2, 22), (TFT_WIDTH - 3, 22)], fill=1)

    d.rectangle([10, 40, TFT_WIDTH - 11, 102], outline=1)
    body1 = 'ไม่พบลายนิ้วมือ'
    bb = d.textbbox((0, 0), body1, font=font_name)
    b1w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b1w) // 2, 50), body1, font=font_name, fill=1)

    body2 = 'ในฐานข้อมูลระบบ'
    bb = d.textbbox((0, 0), body2, font=font_body)
    b2w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b2w) // 2, 74), body2, font=font_body, fill=1)

    d.line([(2, 120), (TFT_WIDTH - 3, 120)], fill=1)
    footer = 'ไม่พบข้อมูล (โหมดออฟไลน์)' if is_offline else 'ไม่มีสิทธิ์เข้าถึง (DENIED)'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 134), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 5. เรนเดอร์การ์ดนักศึกษา (User Card ภาษาไทยคมกริบ - 128x160 แสดงชื่อเต็ม + รหัสนักศึกษา + ข้อมูลวิชา + ปุ่มกด)
def render_user_card(student_id, name, sched_info=None):
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    # หัวข้อ: ยินดีต้อนรับ สวยงามกึ่งกลาง
    title = 'ยินดีต้อนรับ'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 5), title, font=font_title, fill=1)
    d.line([(2, 20), (TFT_WIDTH - 3, 20)], fill=1)

    # ข้อมูลชื่อนักศึกษา
    display_name = name or 'Unknown'
    if len(display_name) > 22:
        display_name = display_name[:21] + '..'
    bb = d.textbbox((0, 0), display_name, font=font_name)
    nw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - nw) // 2, 25), display_name, font=font_name, fill=1)

    # รหัสนักศึกษา (บนจอ 128x160 สามารถแสดงรหัสได้ครบถ้วน ชัดเจน)
    sid = str(student_id) if student_id else '-'
    sid_text = f"รหัส: {sid}"
    bb = d.textbbox((0, 0), sid_text, font=font_small)
    sw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - sw) // 2, 42), sid_text, font=font_small, fill=1)

    d.line([(2, 56), (TFT_WIDTH - 3, 56)], fill=1)

    # ข้อมูลคาบเรียนและสถานะ
    sched = sched_info.get('schedule') if sched_info else None
    att_status = sched_info.get('attendanceStatus', 'OUT_OF_SCHEDULE') if sched_info else 'OUT_OF_SCHEDULE'

    if sched:
        short_name = sched.get('short_name') or sched.get('subject_name', 'Class')
        class_type = sched.get('class_type', 'T')
        subj_line = f"{short_name} [{class_type}]"
        if len(subj_line) > 18:
            subj_line = subj_line[:17] + '..'
        d.text((6, 62), subj_line, font=font_small, fill=1)

        status_tag = '[ทันเวลา]' if att_status == 'ON_TIME' else '[มาสาย]'
        d.text((6, 76), f"สถานะ: {status_tag}", font=font_small, fill=1)
        
        room = sched.get('room_name', current_room_name)
        d.text((6, 90), f"ห้อง: {room}", font=font_small, fill=1)
    else:
        d.text((6, 62), "นอกเวลาเรียน (General)", font=font_small, fill=1)
        d.text((6, 76), "สถานะ: [บันทึกทั่วไป]", font=font_small, fill=1)
        d.text((6, 90), f"ห้อง: {current_room_name}", font=font_small, fill=1)

    d.line([(2, 106), (TFT_WIDTH - 3, 106)], fill=1)

    # ปุ่มกด Physical Switch
    prompt1 = '[ ปุ่มฟ้า : ยืนยัน ]'
    bb = d.textbbox((0, 0), prompt1, font=font_small)
    p1w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - p1w) // 2, 112), prompt1, font=font_small, fill=1)

    prompt2 = '[ ปุ่มแดง : สแกนใหม่ ]'
    bb = d.textbbox((0, 0), prompt2, font=font_small)
    p2w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - p2w) // 2, 126), prompt2, font=font_small, fill=1)

    d.line([(2, 142), (TFT_WIDTH - 3, 142)], fill=1)
    footer = 'หมดเวลาใน 10 วินาที'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 146), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 5.1 เรนเดอร์หน้าจอยืนยันสำเร็จ (Confirm Success Screen - 128x160)
def render_confirm_success(student_id, name, sched_info=None, is_offline=False):
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    title = 'ยินดีต้อนรับ'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 5), title, font=font_title, fill=1)
    d.line([(2, 20), (TFT_WIDTH - 3, 20)], fill=1)

    display_name = name or 'Unknown'
    if len(display_name) > 22:
        display_name = display_name[:21] + '..'
    bb = d.textbbox((0, 0), display_name, font=font_name)
    nw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - nw) // 2, 25), display_name, font=font_name, fill=1)

    sid = str(student_id) if student_id else '-'
    sid_text = f"รหัส: {sid}"
    bb = d.textbbox((0, 0), sid_text, font=font_small)
    sw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - sw) // 2, 42), sid_text, font=font_small, fill=1)

    d.line([(2, 56), (TFT_WIDTH - 3, 56)], fill=1)

    sched = sched_info.get('schedule') if sched_info else None
    if sched:
        short_name = sched.get('short_name') or sched.get('subject_name', 'Class')
        class_type = sched.get('class_type', 'T')
        subj_line = f"{short_name} [{class_type}]"
        if len(subj_line) > 18:
            subj_line = subj_line[:17] + '..'
        d.text((6, 62), subj_line, font=font_small, fill=1)
    else:
        d.text((6, 62), "นอกเวลาเรียน (General)", font=font_small, fill=1)

    # กล่องผลการลงเวลา
    d.rectangle([10, 84, TFT_WIDTH - 11, 124], outline=1)
    chk_title = '✓ บันทึกสำเร็จ'
    bb = d.textbbox((0, 0), chk_title, font=font_title)
    cw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - cw) // 2, 90), chk_title, font=font_title, fill=1)

    status = 'บันทึกออฟไลน์ (รอเน็ต)' if is_offline else 'บันทึกขึ้น Cloud แล้ว'
    bb = d.textbbox((0, 0), status, font=font_small)
    sw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - sw) // 2, 106), status, font=font_small, fill=1)

    d.line([(2, 136), (TFT_WIDTH - 3, 136)], fill=1)
    footer = 'ขอบคุณที่เข้าชั้นเรียน'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 142), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 5.1.1 เรนเดอร์หน้าจอแจ้งเตือนลงเวลาซ้ำ (Already Checked In Screen - 128x160)
def render_already_checked_in(name, subject_str):
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    title = 'แจ้งเตือนการลงเวลา'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 6), title, font=font_title, fill=1)
    d.line([(2, 22), (TFT_WIDTH - 3, 22)], fill=1)

    display_name = name or 'Student'
    if len(display_name) > 22:
        display_name = display_name[:21] + '..'
    bb = d.textbbox((0, 0), display_name, font=font_name)
    nw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - nw) // 2, 30), display_name, font=font_name, fill=1)

    d.rectangle([10, 52, TFT_WIDTH - 11, 108], outline=1)
    w1 = 'คุณได้ลงเวลาคาบนี้แล้ว'
    bb = d.textbbox((0, 0), w1, font=font_small)
    w1_w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - w1_w) // 2, 60), w1, font=font_small, fill=1)

    subj = subject_str or 'วิชาปัจจุบัน'
    if len(subj) > 18:
        subj = subj[:17] + '..'
    bb = d.textbbox((0, 0), subj, font=font_small)
    w2 = bb[2] - bb[0]
    d.text(((TFT_WIDTH - w2) // 2, 76), subj, font=font_small, fill=1)

    w3 = '(ไม่บันทึกเวลาซ้ำ)'
    bb = d.textbbox((0, 0), w3, font=font_small)
    w3_w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - w3_w) // 2, 92), w3, font=font_small, fill=1)

    d.line([(2, 126), (TFT_WIDTH - 3, 126)], fill=1)
    footer = 'อนุญาตสแกน 1 ครั้ง/สัปดาห์'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 136), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 5.2 เรนเดอร์หน้าจอยกเลิก (Cancelled Screen - D3 Rescan 128x160)
def render_cancelled_screen():
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    title = 'ยกเลิกการลงเวลา'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 6), title, font=font_title, fill=1)
    d.line([(2, 22), (TFT_WIDTH - 3, 22)], fill=1)

    d.rectangle([10, 42, TFT_WIDTH - 11, 100], outline=1)
    body1 = 'ยกเลิกด้วยปุ่มแดง (D3)'
    bb = d.textbbox((0, 0), body1, font=font_small)
    b1w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b1w) // 2, 54), body1, font=font_small, fill=1)

    body2 = 'กรุณาวางนิ้วสแกนใหม่'
    bb = d.textbbox((0, 0), body2, font=font_body)
    b2w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b2w) // 2, 74), body2, font=font_body, fill=1)

    d.line([(2, 120), (TFT_WIDTH - 3, 120)], fill=1)
    footer = 'สถานะ: ยกเลิกแล้ว'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 134), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 5.3 เรนเดอร์หน้าจอหมดเวลา (Timeout Screen - 10s Auto-Cancel 128x160)
def render_timeout_screen():
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    title = 'หมดเวลาการยืนยัน'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 6), title, font=font_title, fill=1)
    d.line([(2, 22), (TFT_WIDTH - 3, 22)], fill=1)

    d.rectangle([10, 42, TFT_WIDTH - 11, 100], outline=1)
    body1 = 'ไม่มีการกดปุ่มยืนยัน'
    bb = d.textbbox((0, 0), body1, font=font_small)
    b1w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b1w) // 2, 54), body1, font=font_small, fill=1)

    body2 = 'ยกเลิกอัตโนมัติ (10 วิ)'
    bb = d.textbbox((0, 0), body2, font=font_body)
    b2w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b2w) // 2, 74), body2, font=font_body, fill=1)

    d.line([(2, 120), (TFT_WIDTH - 3, 120)], fill=1)
    footer = 'สถานะ: ไม่ได้บันทึกเวลา'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 134), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

# โหลดภาพเริ่มต้นที่เรนเดอร์ล่วงหน้า
IDLE_BITMAP = render_idle_screen()
DENIED_BITMAP = render_denied_screen()
CANCELLED_BITMAP = render_cancelled_screen()
TIMEOUT_BITMAP = render_timeout_screen()

last_frame_sent_time = 0
last_sent_buf = None
oled_lock = threading.Lock()

# 6. ส่งภาพ 2560 bytes ไปยัง MCU ทางพอร์ต 7500 (16-byte chunks = 32 hex chars, 48 chars/line safe for 64-byte UART buffer)
def send_bitmap_to_mcu(buf, initial_wait=0.20, theme='IDLE'):
    global mcu_sock, last_frame_sent_time, last_sent_buf
    if not mcu_sock:
        return False
    with oled_lock:
        now = time.time()
        elapsed = now - last_frame_sent_time
        # หากเพิ่งส่งภาพเดิมไปไม่เกิน 1.5 วินาที ข้ามได้เลย (ป้องกันการส่งเฟรมซ้ำซ้อน)
        if last_sent_buf == buf and elapsed < 1.5:
            return True

        # ป้องกันการส่งเฟรมติดกันเกินไป (ต้องรอให้ STM32 รัน tft.display() ให้เสร็จสิ้นก่อน)
        if elapsed < 0.6:
            time.sleep(0.6 - elapsed)

        try:
            start_cmd = f'FRAME_START THEME={theme}\n' if theme else 'FRAME_START\n'
            mcu_sock.sendall(start_cmd.encode('utf-8'))
            time.sleep(initial_wait)  # หน่วงเวลาให้ STM32 ตื่นและเข้าสู่ handleFrameReceive()
            offset = 0
            chunk_size = 16
            total_len = len(buf)
            while offset < total_len:
                chunk = buf[offset : offset + chunk_size]
                hex_str = chunk.hex().upper()
                cmd = f'FRAME_DATA {offset} {hex_str}\n'
                mcu_sock.sendall(cmd.encode('utf-8'))
                offset += len(chunk)
                time.sleep(0.005)  # 5ms pacing ป้องกัน UART FIFO เต็ม 100%
            time.sleep(0.03)
            mcu_sock.sendall(b'FRAME_END\n')
            last_frame_sent_time = time.time()
            last_sent_buf = buf
            return True
        except Exception as e:
            print(f'❌ [Bitmap] ส่งภาพล้มเหลว: {e}')
            return False

# 7. จัดการ Local Cache รายชื่อนักศึกษา
def load_cache():
    global users_cache
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8-sig') as f:
                data = json.load(f)
                users_cache = {int(u['id']): u for u in data if 'id' in u}
                print(f'📦 [Local Cache] โหลดรายชื่อจากไฟล์สำเร็จ: {len(users_cache)} คน')
        except Exception as e:
            print(f'⚠️ [Local Cache] โหลดไฟล์แคชล้มเหลว: {e}')

def save_cache(user_list):
    global users_cache
    try:
        users_cache = {int(u['id']): u for u in user_list if 'id' in u}
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(user_list, f, ensure_ascii=False, indent=2)
        print(f'💾 [Local Cache] บันทึกรายชื่อนักศึกษาออฟไลน์สำเร็จ: {len(users_cache)} คน')
    except Exception as e:
        print(f'⚠️ [Local Cache] บันทึกไฟล์แคชล้มเหลว: {e}')

# 7.1 จัดการ Local Cache ตารางเรียนห้อง ทค.1-101
def load_schedules_cache():
    global schedules_cache
    if os.path.exists(SCHEDULES_CACHE_FILE):
        try:
            with open(SCHEDULES_CACHE_FILE, 'r', encoding='utf-8-sig') as f:
                schedules_cache = json.load(f)
                print(f'📅 [Local Cache] โหลดตารางเรียนสำเร็จ: {len(schedules_cache)} คาบ')
        except Exception as e:
            print(f'⚠️ [Local Cache] โหลดไฟล์ตารางเรียนล้มเหลว: {e}')

def save_schedules_cache(sched_list):
    global schedules_cache
    try:
        schedules_cache = sched_list
        with open(SCHEDULES_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(sched_list, f, ensure_ascii=False, indent=2)
        print(f'💾 [Local Cache] บันทึกตารางเรียนออฟไลน์สำเร็จ: {len(schedules_cache)} คาบ')
    except Exception as e:
        print(f'⚠️ [Local Cache] บันทึกตารางเรียนล้มเหลว: {e}')

# คำนวณคาบเรียนที่กำลังใช้งานในเวลาปัจจุบัน (UTC+7 Bangkok)
def get_active_schedule():
    global schedules_cache
    if not schedules_cache:
        return {'schedule': None, 'attendanceStatus': 'OUT_OF_SCHEDULE'}

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    thai_now = now_utc + datetime.timedelta(hours=7)
    day_of_week = thai_now.isoweekday() # 1=Mon ... 7=Sun
    current_minutes = thai_now.hour * 60 + thai_now.minute

    today_schedules = [
        s for s in schedules_cache 
        if s.get('day_of_week') == day_of_week 
        and s.get('is_active', True)
        and (not s.get('room_name') or s.get('room_name') == current_room_name)
    ]

    def parse_min(t_str):
        parts = t_str.split(':')
        return int(parts[0]) * 60 + int(parts[1])

    # กฎ 1 & 2: สแกนล่วงหน้า 15 นาที และส่งต่อคาบต่อเนื่อง (Priority ให้คาบใหม่)
    for s in today_schedules:
        start_m = parse_min(s['start_time'])
        if (start_m - 15) <= current_minutes < start_m:
            return {
                'schedule': s,
                'attendanceStatus': 'ON_TIME',
                'isEarly': True,
                'timeStr': f"{thai_now.hour:02d}:{thai_now.minute:02d}"
            }

    # คาบเรียนที่กำลังดำเนินการอยู่
    for s in today_schedules:
        start_m = parse_min(s['start_time'])
        end_m = parse_min(s['end_time'])
        if start_m <= current_minutes < end_m:
            late_threshold = start_m + s.get('late_threshold_mins', 15)
            is_late = current_minutes > late_threshold
            return {
                'schedule': s,
                'attendanceStatus': 'LATE' if is_late else 'ON_TIME',
                'isEarly': False,
                'timeStr': f"{thai_now.hour:02d}:{thai_now.minute:02d}"
            }

    return {'schedule': None, 'attendanceStatus': 'OUT_OF_SCHEDULE'}

# 8. เชื่อมต่อ STM32 Microcontroller ผ่าน Local Socket 7500
def connect_mcu():
    global mcu_sock
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect(('127.0.0.1', LOCAL_PORT))
            mcu_sock = s
            print('✅ [Uno Q MCU] เชื่อมต่อกับ STM32 พอร์ต 7500 สำเร็จ')
            time.sleep(0.4)
            # ขอตรวจสอบสถานะเซนเซอร์ R307 ทันทีที่เชื่อมต่อ
            try:
                s.sendall(b'CHECK_R307\n')
            except Exception as e:
                pass
            # ส่งหน้าจอพร้อมใช้งาน (ภาษาไทย) ทันทีที่เชื่อมต่อ
            send_bitmap_to_mcu(IDLE_BITMAP, initial_wait=0.20, theme='IDLE')
            return s
        except Exception as e:
            print(f'⚠️ [Uno Q MCU] กำลังรอเชื่อมต่อ STM32: {e}')
            time.sleep(2)

def mcu_reader_thread():
    global mcu_sock
    buf = ""
    while True:
        try:
            if not mcu_sock:
                mcu_sock = connect_mcu()
            data = mcu_sock.recv(1024)
            if not data:
                print('⚠️ [Uno Q MCU] Socket หลุด กำลังเชื่อมต่อใหม่...')
                mcu_sock = None
                time.sleep(1)
                continue
            buf += data.decode('utf-8', errors='ignore')
            while '\n' in buf:
                line, buf = buf.split('\n', 1)
                line = line.strip()
                if not line or line.startswith('FRAME_ACK ') or line == 'FRAME_DONE':
                    continue

                print(f'📥 [MCU -> Local] {line}')

                # ก) เมื่อสแกนนิ้วสำเร็จ: แสดงการ์ดนักศึกษา รอการกดยืนยัน D2 หรือยกเลิก D3
                if line.startswith('EVENT:MATCH '):
                    global is_awaiting_confirmation
                    is_awaiting_confirmation = True
                    parts = line.split()
                    slot_id = 0
                    score = 0
                    for p in parts:
                        if p.startswith('ID='):
                            slot_id = int(p.split('=')[1])
                        elif p.startswith('SCORE='):
                            score = int(p.split('=')[1])
                    
                    mapped_user_id = (slot_id - 1) // 3 + 1 if slot_id > 0 else 0
                    user = users_cache.get(mapped_user_id) or users_cache.get(slot_id)
                    sched_info = get_active_schedule()
                    if user:
                        stu_id = user.get('student_id', '-')
                        name = user.get('name', 'Unknown')
                        print(f'⚡ [Local Engine] สแกนติด Slot #{slot_id} -> User ID #{mapped_user_id}: {name} ({stu_id}) รอกดปุ่ม D2/D3')
                        card_buf = render_user_card(stu_id, name, sched_info)
                    else:
                        print(f'⚡ [Local Engine] Slot #{slot_id} (User #{mapped_user_id}) ไม่อยู่ในแคช -> ร้องขอแคชใหม่')
                        try:
                            sio.emit('get_users_cache')
                        except:
                            pass
                        card_buf = render_user_card(f'Slot #{slot_id}', 'Registered User', sched_info)
                    
                    send_bitmap_to_mcu(card_buf, initial_wait=0.04, theme='CARD')
                    # หมายเหตุ: ไม่ส่งบันทึกเวลาขึ้น Cloud ตรงนี้ เพราะต้องรอปุ่ม D2 ก่อน

                # ข) เมื่อกดยืนยัน D2: แสดงผลสำเร็จ หรือเตือนหากเคยลงเวลาแล้ว และส่ง Event ขึ้น Cloud
                elif line.startswith('EVENT:CONFIRMED '):
                    is_awaiting_confirmation = False
                    parts = line.split()
                    slot_id = 0
                    score = 0
                    for p in parts:
                        if p.startswith('ID='):
                            slot_id = int(p.split('=')[1])
                        elif p.startswith('SCORE='):
                            score = int(p.split('=')[1])
                    
                    mapped_user_id = (slot_id - 1) // 3 + 1 if slot_id > 0 else 0
                    user = users_cache.get(mapped_user_id) or users_cache.get(slot_id)
                    stu_id = user.get('student_id', '-') if user else f'#{slot_id}'
                    name = user.get('name', 'Unknown') if user else 'Registered User'
                    sched_info = get_active_schedule()
                    sched = sched_info.get('schedule') if sched_info else None

                    now_utc = datetime.datetime.now(datetime.timezone.utc)
                    thai_now = now_utc + datetime.timedelta(hours=7)
                    today_str = thai_now.strftime('%Y-%m-%d')
                    sched_id = sched.get('id') if sched else None

                    if sched and is_already_checked_in(mapped_user_id, sched_id, today_str):
                        print(f'⚠️ [Local Engine] ผู้ใช้ #{mapped_user_id}: {name} เคยลงเวลาในคาบนี้แล้ว -> แสดงหน้าแจ้งเตือน')
                        short_name = sched.get('short_name') or sched.get('subject_name', 'คาบเรียน')
                        class_type = sched.get('class_type', '')
                        type_suffix = f" [{class_type}]" if class_type else ""
                        resp_buf = render_already_checked_in(name, f"{short_name}{type_suffix}")
                        if sio.connected:
                            sio.emit('bridge_serial_data', line)
                        send_bitmap_to_mcu(resp_buf, initial_wait=0.04, theme='DENIED')
                    else:
                        is_offline = not sio.connected
                        if is_offline:
                            print(f'💾 [Offline Engine] Wi-Fi ล่ม/ออฟไลน์: บันทึกข้อมูลลงคิวออฟไลน์ User #{mapped_user_id}: {name}')
                            record = {
                                'record_id': f"{int(time.time()*1000)}_{mapped_user_id}",
                                'user_id': mapped_user_id,
                                'student_id': stu_id,
                                'name': name,
                                'slot_id': slot_id,
                                'score': score,
                                'room_name': current_room_name,
                                'schedule_id': sched_id,
                                'subject_name': sched.get('subject_name') if sched else None,
                                'short_name': sched.get('short_name') if sched else None,
                                'class_type': sched.get('class_type') if sched else None,
                                'attendance_status': sched_info.get('attendanceStatus', 'OUT_OF_SCHEDULE'),
                                'scanned_at': thai_now.isoformat(),
                                'is_offline': True
                            }
                            add_to_offline_queue(record)
                            if sched and sched_id:
                                record_check_in(mapped_user_id, sched_id, today_str)
                            resp_buf = render_confirm_success(stu_id, name, sched_info, is_offline=True)
                        else:
                            print(f'✅ [Local Engine] กดยืนยัน D2 สำเร็จ! User #{mapped_user_id}: {name} -> บันทึกลง Cloud')
                            if sched and sched_id:
                                record_check_in(mapped_user_id, sched_id, today_str)
                            resp_buf = render_confirm_success(stu_id, name, sched_info, is_offline=False)
                            sio.emit('bridge_serial_data', line)

                        # ส่ง Frame ให้ STM32 ครั้งเดียวใน ackWait (ห้ามส่งซ้ำระหว่าง delay)
                        send_bitmap_to_mcu(resp_buf, initial_wait=0.04, theme='SUCCESS')

                # ค) เมื่อกดยกเลิก/สแกนใหม่ D3
                elif line.startswith('EVENT:CANCELLED'):
                    is_awaiting_confirmation = False
                    print('🛑 [Local Engine] กดยกเลิก D3 -> ไม่บันทึกเวลา')
                    send_bitmap_to_mcu(CANCELLED_BITMAP, initial_wait=0.04, theme='CANCEL')
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

                # ง) เมื่อหมดเวลา 10 วินาที (Auto-Cancel ทางเลือก A)
                elif line == 'EVENT:TIMEOUT':
                    is_awaiting_confirmation = False
                    print('⏰ [Local Engine] หมดเวลา (Auto-Cancel) -> ไม่บันทึกเวลา')
                    send_bitmap_to_mcu(TIMEOUT_BITMAP, initial_wait=0.04, theme='TIMEOUT')
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

                # จ.1) เมื่อเซนเซอร์ไม่พบใน Flash ออนบอร์ด (Tier 1 No Match)
                elif line == 'EVENT:TIER1_NO_MATCH':
                    if not sio.connected:
                        print('⚡ [Offline Engine] ไม่พบลายนิ้วมือในเครื่อง และ Wi-Fi ออฟไลน์ (ยกเลิกค้นหา Cloud Tier 2)')
                        if mcu_sock:
                            try:
                                mcu_sock.sendall(b'CANCEL_TIER2\n')
                            except Exception as e:
                                print(f'⚠️ ส่ง CANCEL_TIER2 ล้มเหลว: {e}')
                    else:
                        print('📡 [Tier 1] ไม่พบในเซนเซอร์ -> ส่งให้ Cloud ค้นหา Tier 2')
                        sio.emit('bridge_serial_data', line)

                # จ.2) เมื่อสแกนไม่พบลายนิ้วมือ: แสดงหน้าจอ ACCESS DENIED ภาษาไทย แล้วคืนสู่หน้าจอพร้อมใช้งาน
                elif line == 'EVENT:NO_MATCH':
                    is_off = not sio.connected
                    print(f'⚡ [Local Engine] ไม่พบลายนิ้วมือในระบบ -> แสดงหน้า Denied ภาษาไทย (Offline={is_off})')
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

                    def handle_no_match_flow(offline_mode=False):
                        # รอ 1.6 วินาที ให้ STM32 พ้น delay(1500) และ showIdleScreen() ของมันก่อน
                        time.sleep(1.6)
                        send_bitmap_to_mcu(render_denied_screen(is_offline=offline_mode), initial_wait=0.30, theme='DENIED')
                        # ค้างหน้าปฏิเสธไว้ 3.0 วินาที ให้อ่านชัดเจน แล้วคืนสู่หน้าจอพร้อมใช้งาน
                        time.sleep(3.0)
                        print('⚡ [Local Engine] คืนสู่หน้าจอพร้อมใช้งาน (ภาษาไทย)')
                        send_bitmap_to_mcu(IDLE_BITMAP, initial_wait=0.20, theme='IDLE')

                    threading.Thread(target=handle_no_match_flow, args=(is_off,), daemon=True).start()

                elif line.startswith('RESP:ENROLL_OK') or line.startswith('TEMPLATE:'):
                    try:
                        sio.emit('get_users_cache')
                    except:
                        pass
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

                # ฉ.0) เมื่อ MCU รายงานสถานะฮาร์ดแวร์รวม (R307 และ จอภาพ TFT)
                elif line.startswith('STATUS:HARDWARE'):
                    r307_connected = ('R307=READY' in line)
                    oled_connected = ('OLED=READY' in line or 'TFT=READY' in line)
                    print(f'⚡ [Local Engine] สถานะฮาร์ดแวร์: R307={"พร้อม" if r307_connected else "ไม่พบ"}, จอ TFT={"พร้อม" if oled_connected else "ไม่มีจอ/ปิด"}')
                    if sio.connected:
                        sio.emit('bridge_sensor_status', {'r307_connected': r307_connected, 'oled_connected': oled_connected})
                        sio.emit('bridge_serial_data', line)

                # ฉ.1) เมื่อเซนเซอร์เปิดเครื่องตอนบู๊ต หรือเมื่อตอบกลับ CHECK_R307
                elif line == 'STATUS:R307_READY':
                    r307_connected = True
                    print('⚡ [Local Engine] เซนเซอร์ R307 พร้อมทำงาน (Ready)')
                    if sio.connected:
                        sio.emit('bridge_sensor_status', {'r307_connected': True, 'oled_connected': oled_connected})
                        sio.emit('bridge_serial_data', line)
                    if oled_connected:
                        def send_after_boot():
                            time.sleep(2.0)
                            print('⚡ [Local Engine] ส่งหน้าจอพร้อมใช้งานภาษาไทยหลัง Boot สมบูรณ์')
                            send_bitmap_to_mcu(IDLE_BITMAP, initial_wait=0.30, theme='IDLE')
                        threading.Thread(target=send_after_boot, daemon=True).start()

                elif line == 'STATUS:R307_NOT_FOUND':
                    r307_connected = False
                    print('⚠️ [Local Engine] ไม่พบเซนเซอร์ R307 (Not Found)! กรุณาตรวจสอบการต่อสาย Pin 0/1')
                    if sio.connected:
                        sio.emit('bridge_sensor_status', {'r307_connected': False, 'oled_connected': oled_connected})
                        sio.emit('bridge_serial_data', line)

                # ฉ.2) เมื่อกลับสู่หน้าจอพร้อมใช้งานตามปกติ (หลังสแกนนิ้ว / กดยกเลิก / หมดเวลา)
                elif line == 'EVENT:IDLE':
                    print('⚡ [Local Engine] กลับสู่หน้าจอพร้อมใช้งาน (ภาษาไทย)')
                    if oled_connected:
                        time.sleep(0.20)  # หน่วงเวลา 200ms รอให้ STM32 รัน showIdleScreen() เสร็จ
                        send_bitmap_to_mcu(IDLE_BITMAP, initial_wait=0.20, theme='IDLE')
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

                # ช) ส่งต่อ Event อื่นๆ ขึ้นไปยัง Cloud Server (Render)
                else:
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

        except Exception as e:
            print(f'❌ [MCU Reader Error] {e}')
            time.sleep(1)

# 9. Socket.IO Handlers เชื่อมต่อ Render Cloud
def sync_offline_records_if_any():
    global offline_queue
    if offline_queue and sio.connected:
        print(f'🔄 [Offline Sync] ตรวจพบข้อมูลออฟไลน์ค้างอยู่ {len(offline_queue)} รายการ กำลังซิงก์ขึ้น Cloud...')
        try:
            sio.emit('sync_offline_attendance', offline_queue)
        except Exception as e:
            print(f'⚠️ [Offline Sync] ส่งข้อมูลออฟไลน์ล้มเหลว: {e}')

@sio.event
def connect():
    print(f'☁️ [Cloud] เชื่อมต่อกับ Render สำเร็จ: {RENDER_URL} (SID: {sio.sid})')
    sio.emit('register_bridge', {'r307_connected': r307_connected, 'oled_connected': oled_connected})
    # ขอดึงแคชรายชื่อ ตารางเรียน และประวัติลงเวลาล่าสุดทันที
    sio.emit('get_users_cache')
    sio.emit('get_schedules_cache')
    sio.emit('get_today_attendance')
    sync_offline_records_if_any()

@sio.event
def disconnect():
    print('⚠️ [Cloud] หลุดการเชื่อมต่อจาก Render กำลังเชื่อมต่อใหม่...')

@sio.on('sync_users_cache')
def on_sync_users_cache(data):
    if isinstance(data, list):
        print(f'📥 [Cloud] ได้รับอัปเดตแคชรายชื่อนักศึกษา {len(data)} คน')
        save_cache(data)

@sio.on('sync_schedules_cache')
def on_sync_schedules_cache(data):
    if isinstance(data, list):
        print(f'📅 [Cloud] ได้รับอัปเดตตารางเรียน {len(data)} คาบ')
        save_schedules_cache(data)

@sio.on('sync_device_room')
def on_sync_device_room(data):
    global current_room_name, IDLE_BITMAP
    if isinstance(data, dict) and data.get('room_name'):
        r_name = data.get('room_name')
        print(f'📍 [Cloud] ได้รับคำสั่งสลับห้องประจำเครื่องเป็น: [{r_name}]')
        current_room_name = r_name
        save_active_room(r_name)
        IDLE_BITMAP = render_idle_screen(current_room_name)
        send_bitmap_to_mcu(IDLE_BITMAP, initial_wait=0.20)

@sio.on('schedules_updated')
def on_schedules_updated(data):
    if isinstance(data, list):
        print(f'🔄 [Cloud] ได้รับแจ้งเตือนตารางเรียนอัปเดต: {len(data)} คาบ')
        save_schedules_cache(data)

@sio.on('already_checked_in')
def on_already_checked_in(data):
    print(f'⚠️ [Cloud] แจ้งเตือน: คุณได้ลงเวลาคาบนี้แล้ว ({data.get("user_name")})')
    user_id = data.get('user_id')
    sched = data.get('schedule') or {}
    sched_id = sched.get('id')
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    thai_now = now_utc + datetime.timedelta(hours=7)
    today_str = thai_now.strftime('%Y-%m-%d')
    if user_id and sched_id:
        record_check_in(user_id, sched_id, today_str)
    # หมายเหตุ: ไม่ต้องส่ง Frame หรือสร้าง thread คืนค่าหน้าจอที่นี่
    # เพราะ STM32 อยู่ใน delay(3500) และจะส่ง EVENT:IDLE ออกมาเองเมื่อครบเวลา
    # ระบบหลักจะส่งหน้าจอพร้อมใช้งาน (IDLE_BITMAP) ให้โดยอัตโนมัติ

@sio.on('session_attendance_update')
def on_session_attendance_update(data):
    if isinstance(data, dict):
        user_id = data.get('user_id')
        sched_id = data.get('schedule_id')
        date_str = data.get('date')
        if user_id and sched_id and date_str:
            record_check_in(user_id, sched_id, date_str)

@sio.on('sync_today_attendance')
def on_sync_today_attendance(data):
    global checked_in_records
    if isinstance(data, list):
        print(f'📋 [Cloud] ซิงก์ประวัติการลงเวลาเรียนวันนี้จาก Cloud: {len(data)} รายการ')
        new_records = set()
        for r in data:
            if isinstance(r, dict):
                user_id = r.get('user_id')
                sched_id = r.get('schedule_id')
                date_str = r.get('date')
                if user_id and sched_id and date_str:
                    new_records.add((int(user_id), int(sched_id), str(date_str)))
        checked_in_records = new_records
        save_attendance_cache()

@sio.on('user_updated')
def on_user_updated(data=None):
    print('🔄 [Cloud] ได้รับแจ้งเตือนข้อมูลผู้ใช้เปลี่ยนแปลง -> ขอแคชใหม่ทันที')
    try:
        sio.emit('get_users_cache')
    except:
        pass

@sio.on('sync_offline_attendance_ack')
def on_sync_offline_attendance_ack(data):
    global offline_queue
    if isinstance(data, dict):
        synced_ids = set(data.get('synced_ids', []))
        if synced_ids:
            before_cnt = len(offline_queue)
            offline_queue = [item for item in offline_queue if item.get('record_id') not in synced_ids]
            save_offline_queue()
            after_cnt = len(offline_queue)
            print(f'✅ [Offline Sync] ซิงก์ข้อมูลออฟไลน์สำเร็จ {len(synced_ids)} รายการ! (คงเหลือในคิว: {after_cnt} รายการ)')

@sio.on('bridge_command')
def on_bridge_command(cmd):
    global mcu_sock
    # กรองคำสั่งที่ไม่จำเป็นต้องส่งเข้า MCU (เพราะ Local Engine จัดการเองแล้ว)
    if cmd.startswith('MATCH_USER ') or cmd.startswith('SHOW_PAGE '):
        return
    print(f'📤 [Cloud -> MCU] {cmd}')
    if mcu_sock:
        try:
            full_cmd = (cmd.strip() + '\n').encode('utf-8')
            mcu_sock.sendall(full_cmd)
        except Exception as e:
            print(f'❌ [Error sending to MCU] {e}')

is_awaiting_confirmation = False

def r307_monitor_thread():
    """ตรวจสอบสถานะเซนเซอร์ R307 ทันทีหลังบู๊ต และตรวจเช็คเป็นระยะทุก 15 วินาที (เว้นจังหวะรอกดปุ่มยืนยัน)"""
    global mcu_sock, is_awaiting_confirmation
    time.sleep(2.0)
    while True:
        if mcu_sock and not is_awaiting_confirmation:
            try:
                mcu_sock.sendall(b'CHECK_R307\n')
            except Exception as e:
                pass
        time.sleep(15)

if __name__ == '__main__':
    print('====================================================')
    print('🚀 กำลังเริ่ม Local Bitmap Engine บน Uno Q Linux')
    print(f'🌐 Cloud Target: {RENDER_URL}')
    print(f'🎨 Thai Font: {FONT_PATH}')
    print('====================================================')
    
    # 1. โหลดแคชเดิมที่มีในเครื่อง
    load_cache()
    load_schedules_cache()
    load_active_room()
    load_attendance_cache()
    load_offline_queue()

    # 2. เริ่ม Thread รับส่งข้อมูลกับ MCU (Port 7500)
    t = threading.Thread(target=mcu_reader_thread, daemon=True)
    t.start()

    # 2.1 เริ่ม Thread ตรวจสอบสถานะ R307 ทุก 30 วินาที
    t_r307 = threading.Thread(target=r307_monitor_thread, daemon=True)
    t_r307.start()

    # 3. Boot Watchdog: ตรวจสอบและส่งหน้าจอภาษาไทยรอบแรกหลังเปิดเครื่อง
    def boot_sync_watchdog():
        time.sleep(3.5)
        print('🚀 [Local Engine] Watchdog: ส่งหน้าจอภาษาไทยรอบแรกหลังบู๊ตเครื่องสมบูรณ์')
        send_bitmap_to_mcu(IDLE_BITMAP, initial_wait=0.30)
    threading.Thread(target=boot_sync_watchdog, daemon=True).start()
    
    # 4. เชื่อมต่อ Render Cloud ในลูปหลัก
    while True:
        try:
            sio.connect(
                RENDER_URL,
                headers={'Authorization': f'Bearer {BRIDGE_TOKEN}', 'x-bridge-token': BRIDGE_TOKEN},
                auth={'token': BRIDGE_TOKEN},
                transports=['websocket', 'polling'],
                wait_timeout=15
            )
            sio.wait()
        except Exception as e:
            print(f'⚠️ [Cloud Connection Error] {e}')
            time.sleep(4)
