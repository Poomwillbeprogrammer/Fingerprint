import socket
import threading
import time
import sys
import json
import os
import socketio
from PIL import Image, ImageDraw, ImageFont

RENDER_URL = sys.argv[1] if len(sys.argv) > 1 else 'https://fingerprint-hrkp.onrender.com'
LOCAL_PORT = 7500
FONT_PATH = '/home/arduino/tahoma.ttf'
CACHE_FILE = '/home/arduino/users_cache.json'

sio = socketio.Client(reconnection=True, reconnection_delay=2)
mcu_sock = None
users_cache = {}

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

# 3. เรนเดอร์หน้าจอพร้อมใช้งาน (Idle Screen ภาษาไทยคมกริบ)
def render_idle_screen():
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    d.rectangle([0, 0, 127, 13], fill=1)
    
    title = 'ระบบลงเวลาสแกนนิ้ว'
    bb = d.textbbox((0, 0), title, font=font_title)
    w = bb[2] - bb[0]
    d.text(((128 - w) // 2, 1), title, font=font_title, fill=0)

    body = 'กรุณาวางนิ้วเพื่อสแกน'
    bb = d.textbbox((0, 0), body, font=font_body)
    w = bb[2] - bb[0]
    d.text(((128 - w) // 2, 25), body, font=font_body, fill=1)

    d.line([(4, 46), (124, 46)], fill=1)

    footer = 'สถานะ: พร้อมใช้งาน'
    bb = d.textbbox((0, 0), footer, font=font_small)
    w = bb[2] - bb[0]
    d.text(((128 - w) // 2, 49), footer, font=font_small, fill=1)

    return img_to_oled_buf(img)

# 4. เรนเดอร์หน้าจอไม่พบลายนิ้วมือ (Denied Screen ภาษาไทย)
def render_denied_screen():
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    d.rectangle([0, 0, 127, 13], fill=1)
    
    title = 'ACCESS DENIED'
    bb = d.textbbox((0, 0), title, font=font_title)
    w = bb[2] - bb[0]
    d.text(((128 - w) // 2, 1), title, font=font_title, fill=0)

    body = 'ไม่พบลายนิ้วมือในระบบ'
    bb = d.textbbox((0, 0), body, font=font_body)
    w = bb[2] - bb[0]
    d.text(((128 - w) // 2, 25), body, font=font_body, fill=1)

    d.line([(4, 46), (124, 46)], fill=1)

    footer = 'ไม่มีสิทธิ์เข้าถึง (DENIED)'
    bb = d.textbbox((0, 0), footer, font=font_small)
    w = bb[2] - bb[0]
    d.text(((128 - w) // 2, 49), footer, font=font_small, fill=1)

    return img_to_oled_buf(img)

# 5. เรนเดอร์การ์ดนักศึกษา (User Card ภาษาไทยคมกริบ)
def render_user_card(student_id, name):
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    d.rectangle([0, 0, 127, 13], fill=1)
    
    title = 'ยินดีต้อนรับ (GRANTED)'
    bb = d.textbbox((0, 0), title, font=font_title)
    w = bb[2] - bb[0]
    d.text(((128 - w) // 2, 1), title, font=font_title, fill=0)

    stu_str = student_id if student_id else '-'
    d.text((6, 16), f'ID: {stu_str}', font=font_id, fill=1)

    display_name = name or 'Unknown Student'
    name_f = font_name
    bb = d.textbbox((0, 0), display_name, font=name_f)
    if (bb[2] - bb[0]) > 116:
        name_f = font_name_sm
    d.text((6, 30), display_name, font=name_f, fill=1)

    d.line([(4, 47), (124, 47)], fill=1)
    d.text((6, 50), 'บันทึกเวลาสำเร็จ OK', font=font_small, fill=1)

    return img_to_oled_buf(img)

# โหลดภาพเริ่มต้นที่เรนเดอร์ล่วงหน้า
IDLE_BITMAP = render_idle_screen()
DENIED_BITMAP = render_denied_screen()

# 6. ส่งภาพ 1024 bytes ไปยัง MCU ทางพอร์ต 7500 (8 Pages)
def send_bitmap_to_mcu(buf):
    global mcu_sock
    if not mcu_sock:
        return False
    try:
        for page in range(8):
            page_data = buf[page * 128 : (page + 1) * 128]
            hex_str = page_data.hex().upper()
            cmd = f'SHOW_PAGE {page} {hex_str}\n'
            mcu_sock.sendall(cmd.encode('utf-8'))
            time.sleep(0.015)  # 15ms spacing
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
                if not line:
                    continue

                print(f'📥 [MCU -> Local] {line}')

                # ก) เมื่อสแกนนิ้วสำเร็จ: หาชื่อในแคช แล้วแสดงการ์ดภาษาไทยทันที (< 5ms)
                if line.startswith('EVENT:MATCH '):
                    parts = line.split()
                    user_id = 0
                    score = 0
                    for p in parts:
                        if p.startswith('ID='):
                            user_id = int(p.split('=')[1])
                        elif p.startswith('SCORE='):
                            score = int(p.split('=')[1])
                    
                    user = users_cache.get(user_id)
                    if user:
                        stu_id = user.get('student_id', '-')
                        name = user.get('name', 'Unknown')
                        print(f'⚡ [Local Engine] พบผู้ใช้ ID #{user_id}: {name} ({stu_id}) -> เรนเดอร์การ์ดทันที')
                        card_buf = render_user_card(stu_id, name)
                    else:
                        print(f'⚡ [Local Engine] ผู้ใช้ ID #{user_id} ไม่อยู่ในแคช -> แสดง Slot #{user_id}')
                        card_buf = render_user_card(f'Slot #{user_id}', 'Registered User')
                    
                    send_bitmap_to_mcu(card_buf)

                # ข) เมื่อสแกนไม่พบลายนิ้วมือ: แสดงหน้าจอ ACCESS DENIED ภาษาไทย
                elif line == 'EVENT:NO_MATCH':
                    print('⚡ [Local Engine] ไม่พบลายนิ้วมือ -> แสดงหน้า Denied')
                    send_bitmap_to_mcu(DENIED_BITMAP)

                # ค) เมื่อเข้าสู่สถานะ Idle: แสดงหน้าจอระบบลงเวลาสแกนนิ้ว ภาษาไทย
                elif line == 'EVENT:IDLE' or line == 'STATUS:R307_READY':
                    print('⚡ [Local Engine] กลับสู่หน้าจอพร้อมใช้งาน (ภาษาไทย)')
                    send_bitmap_to_mcu(IDLE_BITMAP)

                # ส่ง Event ขึ้น Cloud ในพื้นหลังเสมอ (เพื่อให้ Web Dashboard บันทึก Log และแสดงผล)
                if sio.connected:
                    sio.emit('bridge_serial_data', line)

        except Exception as e:
            print(f'❌ [Uno Q MCU Error] {e}')
            mcu_sock = None
            time.sleep(2)

# 9. Socket.IO Handlers เชื่อมต่อ Render Cloud
@sio.event
def connect():
    print(f'☁️ [Cloud] เชื่อมต่อกับ Render สำเร็จ: {RENDER_URL} (SID: {sio.sid})')
    sio.emit('register_bridge')
    # ขอดึงแคชรายชื่อล่าสุดทันที
    sio.emit('get_users_cache')

@sio.event
def disconnect():
    print('⚠️ [Cloud] หลุดการเชื่อมต่อจาก Render กำลังเชื่อมต่อใหม่...')

@sio.on('sync_users_cache')
def on_sync_users_cache(data):
    if isinstance(data, list):
        print(f'📥 [Cloud] ได้รับอัปเดตแคชรายชื่อนักศึกษา {len(data)} คน')
        save_cache(data)

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
