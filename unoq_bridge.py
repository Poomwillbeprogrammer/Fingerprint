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

if not os.path.exists('/home/arduino'):
    CACHE_FILE = os.path.join(os.path.dirname(__file__), 'users_cache.json')
    SCHEDULES_CACHE_FILE = os.path.join(os.path.dirname(__file__), 'schedules_cache.json')

sio = socketio.Client(reconnection=True, reconnection_delay=2)
mcu_sock = None
users_cache = {}
schedules_cache = []
current_room_name = 'ทค.1-101'

# 1. โหลดฟอนต์ภาษาไทยแท้
try:
    font_title = ImageFont.truetype(FONT_PATH, 10)
    font_id    = ImageFont.truetype(FONT_PATH, 10)
    font_name  = ImageFont.truetype(FONT_PATH, 11)
    font_name_sm = ImageFont.truetype(FONT_PATH, 9)
    font_body  = ImageFont.truetype(FONT_PATH, 11)
    font_small = ImageFont.truetype(FONT_PATH, 9)
    print(f'✅ [Font] โหลดฟอนต์ {FONT_PATH} สำเร็จ')
except Exception as e:
    print(f'⚠️ [Font] โหลดฟอนต์ไม่ได้: {e}')
    font_title = font_id = font_name = font_name_sm = font_body = font_small = ImageFont.load_default()

# 2. ฟังก์ชันแปลงภาพ Pillow (128x64) เป็น 1024-byte SH1106 Buffer
def img_to_oled_buf(img):
    buf = bytearray(1024)
    px = img.load()
    for y in range(64):
        for x in range(128):
            if px[x, y]:
                page = y >> 3
                bit = y & 7
                buf[x + page * 128] |= (1 << bit)
    return buf

# 3. เรนเดอร์หน้าจอพร้อมใช้งาน (Idle Screen ภาษาไทยคมกริบ - พร้อมชื่อห้องประจำเครื่อง)
def render_idle_screen(room_name=None):
    global current_room_name
    r_name = room_name or current_room_name or 'ทค.1-101'
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    
    title = 'ระบบลงเวลาสแกนนิ้ว'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((128 - tw) // 2, 2), title, font=font_title, fill=1)

    d.line([(2, 15), (125, 15)], fill=1)

    body = 'กรุณาวางนิ้วเพื่อสแกน'
    bb = d.textbbox((0, 0), body, font=font_body)
    bw = bb[2] - bb[0]
    d.text(((128 - bw) // 2, 25), body, font=font_body, fill=1)

    d.line([(2, 47), (125, 47)], fill=1)

    footer = f'[ {r_name} ] พร้อมใช้งาน'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((128 - fw) // 2, 49), footer, font=font_small, fill=1)

    return img_to_oled_buf(img)

# 4. เรนเดอร์หน้าจอไม่พบลายนิ้วมือ (Denied Screen ภาษาไทย)
def render_denied_screen():
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    
    title = 'ACCESS DENIED'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((128 - tw) // 2, 2), title, font=font_title, fill=1)

    d.line([(2, 15), (125, 15)], fill=1)

    body = 'ไม่พบลายนิ้วมือในระบบ'
    bb = d.textbbox((0, 0), body, font=font_body)
    bw = bb[2] - bb[0]
    d.text(((128 - bw) // 2, 25), body, font=font_body, fill=1)

    d.line([(2, 47), (125, 47)], fill=1)

    footer = 'ไม่มีสิทธิ์เข้าถึง (DENIED)'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((128 - fw) // 2, 49), footer, font=font_small, fill=1)

    return img_to_oled_buf(img)

# 5. เรนเดอร์การ์ดนักศึกษา (User Card ภาษาไทยคมกริบ - พร้อมข้อมูลวิชาและสถานะเข้าเรียน)
def render_user_card(student_id, name, sched_info=None):
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    
    # หัวข้อ: ยินดีต้อนรับ สวยงามกึ่งกลาง
    title = 'ยินดีต้อนรับ'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((128 - tw) // 2, 2), title, font=font_title, fill=1)

    d.line([(2, 14), (125, 14)], fill=1)

    # ข้อมูลนักศึกษา
    stu_str = student_id if student_id else '-'
    display_name = name or 'Unknown'
    stu_line = f"{stu_str} {display_name}"
    if len(stu_line) > 18:
        stu_line = stu_line[:17] + '..'
    d.text((5, 16), stu_line, font=font_small, fill=1)

    # ข้อมูลคาบเรียนและสถานะ
    sched = sched_info.get('schedule') if sched_info else None
    att_status = sched_info.get('attendanceStatus', 'OUT_OF_SCHEDULE') if sched_info else 'OUT_OF_SCHEDULE'

    if sched:
        short_name = sched.get('short_name') or sched.get('subject_name', 'Class')
        class_type = sched.get('class_type', 'T')
        subj_line = f"{short_name} [{class_type}]"
        if len(subj_line) > 20:
            subj_line = subj_line[:19] + '..'
        d.text((5, 27), subj_line, font=font_small, fill=1)

        status_tag = '[ทันเวลา]' if att_status == 'ON_TIME' else '[มาสาย]'
        d.text((5, 38), f"สถานะ: {status_tag}", font=font_small, fill=1)
    else:
        d.text((5, 27), "นอกเวลาเรียน (General)", font=font_small, fill=1)
        d.text((5, 38), "สถานะ: [บันทึกทั่วไป]", font=font_small, fill=1)

    d.line([(2, 49), (125, 49)], fill=1)

    prompt = '[ D2:ยืนยัน | D3:สแกน ]'
    bb = d.textbbox((0, 0), prompt, font=font_small)
    sw = bb[2] - bb[0]
    d.text(((128 - sw) // 2, 51), prompt, font=font_small, fill=1)

    return img_to_oled_buf(img)

# 5.1 เรนเดอร์หน้าจอยืนยันสำเร็จ (Confirm Success Screen)
def render_confirm_success(student_id, name, sched_info=None):
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    
    title = 'ยินดีต้อนรับ'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((128 - tw) // 2, 2), title, font=font_title, fill=1)

    d.line([(2, 14), (125, 14)], fill=1)

    stu_str = student_id if student_id else '-'
    display_name = name or 'Unknown'
    stu_line = f"{stu_str} {display_name}"
    if len(stu_line) > 18:
        stu_line = stu_line[:17] + '..'
    d.text((5, 16), stu_line, font=font_small, fill=1)

    sched = sched_info.get('schedule') if sched_info else None
    if sched:
        short_name = sched.get('short_name') or sched.get('subject_name', 'Class')
        class_type = sched.get('class_type', 'T')
        subj_line = f"{short_name} [{class_type}]"
        if len(subj_line) > 20:
            subj_line = subj_line[:19] + '..'
        d.text((5, 27), subj_line, font=font_small, fill=1)
    else:
        d.text((5, 27), "นอกเวลาเรียน (General)", font=font_small, fill=1)

    d.line([(2, 49), (125, 49)], fill=1)

    status = 'บันทึกเวลาสำเร็จ (OK)'
    bb = d.textbbox((0, 0), status, font=font_small)
    sw = bb[2] - bb[0]
    d.text(((128 - sw) // 2, 51), status, font=font_small, fill=1)

    return img_to_oled_buf(img)

# 5.1.1 เรนเดอร์หน้าจอแจ้งเตือนลงเวลาซ้ำ (Already Checked In Screen)
def render_already_checked_in(name, subject_str):
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    
    title = 'แจ้งเตือนการลงเวลา'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((128 - tw) // 2, 2), title, font=font_title, fill=1)

    d.line([(2, 14), (125, 14)], fill=1)

    body1 = 'คุณได้ลงเวลาคาบนี้แล้ว'
    bb = d.textbbox((0, 0), body1, font=font_small)
    w1 = bb[2] - bb[0]
    d.text(((128 - w1) // 2, 18), body1, font=font_small, fill=1)

    subj = subject_str or 'วิชาปัจจุบัน'
    if len(subj) > 18:
        subj = subj[:17] + '..'
    bb = d.textbbox((0, 0), subj, font=font_small)
    w2 = bb[2] - bb[0]
    d.text(((128 - w2) // 2, 31), subj, font=font_small, fill=1)

    d.line([(2, 49), (125, 49)], fill=1)

    footer = '(ไม่บันทึกเวลาซ้ำ)'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((128 - fw) // 2, 51), footer, font=font_small, fill=1)

    return img_to_oled_buf(img)

# 5.2 เรนเดอร์หน้าจอยกเลิก (Cancelled Screen - D3 Rescan)
def render_cancelled_screen():
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    
    title = 'ยกเลิกการลงเวลา'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((128 - tw) // 2, 2), title, font=font_title, fill=1)

    d.line([(2, 15), (125, 15)], fill=1)

    body = 'กรุณาวางนิ้วสแกนใหม่'
    bb = d.textbbox((0, 0), body, font=font_body)
    bw = bb[2] - bb[0]
    d.text(((128 - bw) // 2, 25), body, font=font_body, fill=1)

    d.line([(2, 47), (125, 47)], fill=1)

    footer = 'สถานะ: ยกเลิกแล้ว (D3)'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((128 - fw) // 2, 49), footer, font=font_small, fill=1)

    return img_to_oled_buf(img)

# 5.3 เรนเดอร์หน้าจอหมดเวลา (Timeout Screen - 10s Auto-Cancel)
def render_timeout_screen():
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    
    title = 'หมดเวลาการยืนยัน'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((128 - tw) // 2, 2), title, font=font_title, fill=1)

    d.line([(2, 15), (125, 15)], fill=1)

    body = 'ยกเลิกอัตโนมัติ (10 วินาที)'
    bb = d.textbbox((0, 0), body, font=font_body)
    bw = bb[2] - bb[0]
    d.text(((128 - bw) // 2, 25), body, font=font_body, fill=1)

    d.line([(2, 47), (125, 47)], fill=1)

    footer = 'สถานะ: ไม่ได้บันทึกข้อมูล'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((128 - fw) // 2, 49), footer, font=font_small, fill=1)

    return img_to_oled_buf(img)

# โหลดภาพเริ่มต้นที่เรนเดอร์ล่วงหน้า
IDLE_BITMAP = render_idle_screen()
DENIED_BITMAP = render_denied_screen()
CANCELLED_BITMAP = render_cancelled_screen()
TIMEOUT_BITMAP = render_timeout_screen()

# 6. ส่งภาพ 1024 bytes ไปยัง MCU ทางพอร์ต 7500 (16-byte chunks = 32 hex chars, 46 chars/line safe for 64-byte UART buffer)
def send_bitmap_to_mcu(buf):
    global mcu_sock
    if not mcu_sock:
        return False
    try:
        mcu_sock.sendall(b'FRAME_START\n')
        time.sleep(0.03)  # 30ms ให้ MCU เคลียร์บัฟเฟอร์ให้พร้อม
        offset = 0
        chunk_size = 16
        while offset < 1024:
            chunk = buf[offset : offset + chunk_size]
            hex_str = chunk.hex().upper()
            cmd = f'FRAME_DATA {offset} {hex_str}\n'
            mcu_sock.sendall(cmd.encode('utf-8'))
            offset += len(chunk)
            time.sleep(0.006)  # 6ms pacing ป้องกัน UART FIFO เต็ม 100%
        time.sleep(0.015)
        mcu_sock.sendall(b'FRAME_END\n')
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

    today_schedules = [s for s in schedules_cache if s.get('day_of_week') == day_of_week and s.get('is_active', True)]

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
            # ส่งหน้าจอพร้อมใช้งาน (ภาษาไทย) ทันทีที่เชื่อมต่อ
            send_bitmap_to_mcu(IDLE_BITMAP)
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
                    
                    send_bitmap_to_mcu(card_buf)
                    # หมายเหตุ: ไม่ส่งบันทึกเวลาขึ้น Cloud ตรงนี้ เพราะต้องรอปุ่ม D2 ก่อน

                # ข) เมื่อกดยืนยัน D2: แสดงผลสำเร็จ และส่ง Event ขึ้น Cloud เพื่อบันทึกลง Database
                elif line.startswith('EVENT:CONFIRMED '):
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
                    print(f'✅ [Local Engine] กดยืนยัน D2 สำเร็จ! User #{mapped_user_id}: {name} -> บันทึกลง Cloud')
                    success_buf = render_confirm_success(stu_id, name, sched_info)
                    send_bitmap_to_mcu(success_buf)

                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

                # ค) เมื่อกดยกเลิก/สแกนใหม่ D3
                elif line.startswith('EVENT:CANCELLED'):
                    print('🛑 [Local Engine] กดยกเลิก D3 -> ไม่บันทึกเวลา')
                    send_bitmap_to_mcu(CANCELLED_BITMAP)
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

                # ง) เมื่อหมดเวลา 5 วินาที (Auto-Cancel ทางเลือก A)
                elif line == 'EVENT:TIMEOUT':
                    print('⏰ [Local Engine] หมดเวลา 5 วินาที (Auto-Cancel) -> ไม่บันทึกเวลา')
                    send_bitmap_to_mcu(TIMEOUT_BITMAP)
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

                # จ) เมื่อสแกนไม่พบลายนิ้วมือ: แสดงหน้าจอ ACCESS DENIED ภาษาไทย
                elif line == 'EVENT:NO_MATCH':
                    print('⚡ [Local Engine] ไม่พบลายนิ้วมือ -> แสดงหน้า Denied')
                    send_bitmap_to_mcu(DENIED_BITMAP)
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

                elif line.startswith('RESP:ENROLL_OK') or line.startswith('TEMPLATE:'):
                    try:
                        sio.emit('get_users_cache')
                    except:
                        pass
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)

                # ฉ) เมื่อเซนเซอร์พร้อมใช้งาน / กลับสู่หน้าหลัก
                elif line == 'EVENT:IDLE' or line == 'STATUS:R307_READY':
                    print('⚡ [Local Engine] กลับสู่หน้าจอพร้อมใช้งาน (ภาษาไทย)')
                    send_bitmap_to_mcu(IDLE_BITMAP)
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
@sio.event
def connect():
    print(f'☁️ [Cloud] เชื่อมต่อกับ Render สำเร็จ: {RENDER_URL} (SID: {sio.sid})')
    sio.emit('register_bridge')
    # ขอดึงแคชรายชื่อและตารางเรียนล่าสุดทันที
    sio.emit('get_users_cache')
    sio.emit('get_schedules_cache')

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
        IDLE_BITMAP = render_idle_screen(current_room_name)
        send_bitmap_to_mcu(IDLE_BITMAP)

@sio.on('schedules_updated')
def on_schedules_updated(data):
    if isinstance(data, list):
        print(f'🔄 [Cloud] ได้รับแจ้งเตือนตารางเรียนอัปเดต: {len(data)} คาบ')
        save_schedules_cache(data)

@sio.on('already_checked_in')
def on_already_checked_in(data):
    print(f'⚠️ [Cloud] แจ้งเตือน: คุณได้ลงเวลาคาบนี้แล้ว ({data.get("user_name")})')
    user_name = data.get('user_name', '')
    sched = data.get('schedule') or {}
    short_name = sched.get('short_name') or sched.get('subject_name', 'คาบเรียน')
    class_type = sched.get('class_type', '')
    type_suffix = f" [{class_type}]" if class_type else ""
    warn_buf = render_already_checked_in(user_name, f"{short_name}{type_suffix}")
    send_bitmap_to_mcu(warn_buf)

    # ค้างหน้าจอแจ้งเตือน 3 วินาที แล้วกลับสู่หน้าจอพร้อมใช้งาน
    def return_idle():
        time.sleep(3.0)
        send_bitmap_to_mcu(IDLE_BITMAP)
    threading.Thread(target=return_idle, daemon=True).start()

@sio.on('user_updated')
def on_user_updated(data=None):
    print('🔄 [Cloud] ได้รับแจ้งเตือนข้อมูลผู้ใช้เปลี่ยนแปลง -> ขอแคชใหม่ทันที')
    try:
        sio.emit('get_users_cache')
    except:
        pass

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

if __name__ == '__main__':
    print('====================================================')
    print('🚀 กำลังเริ่ม Local Bitmap Engine บน Uno Q Linux')
    print(f'🌐 Cloud Target: {RENDER_URL}')
    print(f'🎨 Thai Font: {FONT_PATH}')
    print('====================================================')
    
    # 1. โหลดแคชเดิมที่มีในเครื่อง
    load_cache()
    load_schedules_cache()

    # 2. เริ่ม Thread รับส่งข้อมูลกับ MCU (Port 7500)
    t = threading.Thread(target=mcu_reader_thread, daemon=True)
    t.start()
    
    # 3. เชื่อมต่อ Render Cloud ในลูปหลัก
    while True:
        try:
            sio.connect(RENDER_URL, wait_timeout=15)
            sio.wait()
        except Exception as e:
            print(f'⚠️ [Cloud Connection Error] {e}')
            time.sleep(4)
