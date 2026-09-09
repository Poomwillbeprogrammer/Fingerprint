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

    footer = 'สถานะ: พร้อมใช้งาน'
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

# 5. เรนเดอร์การ์ดนักศึกษา (User Card ภาษาไทยคมกริบ - รอยืนยันด้วยปุ่มกด)
def render_user_card(student_id, name):
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    
    # หัวข้อ: ยินดีต้อนรับ สวยงามกึ่งกลาง
    title = 'ยินดีต้อนรับ'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((128 - tw) // 2, 2), title, font=font_title, fill=1)

    d.line([(2, 16), (125, 16)], fill=1)

    stu_str = student_id if student_id else '-'
    d.text((8, 18), f'ID: {stu_str}', font=font_id, fill=1)

    display_name = name or 'Unknown Student'
    name_f = font_name
    bb = d.textbbox((0, 0), display_name, font=name_f)
    if (bb[2] - bb[0]) > 112:
        name_f = font_name_sm
    d.text((8, 31), display_name, font=name_f, fill=1)

    d.line([(2, 47), (125, 47)], fill=1)

    prompt = '[ D2:ยืนยัน | D3:สแกนใหม่ ]'
    bb = d.textbbox((0, 0), prompt, font=font_small)
    sw = bb[2] - bb[0]
    d.text(((128 - sw) // 2, 49), prompt, font=font_small, fill=1)

    return img_to_oled_buf(img)

# 5.1 เรนเดอร์หน้าจอยืนยันสำเร็จ (Confirm Success Screen)
def render_confirm_success(student_id, name):
    img = Image.new('1', (128, 64), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 127, 63], outline=1)
    
    title = 'ยินดีต้อนรับ'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((128 - tw) // 2, 2), title, font=font_title, fill=1)

    d.line([(2, 16), (125, 16)], fill=1)

    stu_str = student_id if student_id else '-'
    d.text((8, 18), f'ID: {stu_str}', font=font_id, fill=1)

    display_name = name or 'Unknown Student'
    name_f = font_name
    bb = d.textbbox((0, 0), display_name, font=name_f)
    if (bb[2] - bb[0]) > 112:
        name_f = font_name_sm
    d.text((8, 31), display_name, font=name_f, fill=1)

    d.line([(2, 47), (125, 47)], fill=1)

    status = 'บันทึกเวลาสำเร็จ (OK)'
    bb = d.textbbox((0, 0), status, font=font_small)
    sw = bb[2] - bb[0]
    d.text(((128 - sw) // 2, 49), status, font=font_small, fill=1)

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
                    if user:
                        stu_id = user.get('student_id', '-')
                        name = user.get('name', 'Unknown')
                        print(f'⚡ [Local Engine] สแกนติด Slot #{slot_id} -> User ID #{mapped_user_id}: {name} ({stu_id}) รอกดปุ่ม D2/D3')
                        card_buf = render_user_card(stu_id, name)
                    else:
                        print(f'⚡ [Local Engine] Slot #{slot_id} (User #{mapped_user_id}) ไม่อยู่ในแคช -> ร้องขอแคชใหม่')
                        try:
                            sio.emit('get_users_cache')
                        except:
                            pass
                        card_buf = render_user_card(f'Slot #{slot_id}', 'Registered User')
                    
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
                    print(f'✅ [Local Engine] กดยืนยัน D2 สำเร็จ! User #{mapped_user_id}: {name} -> บันทึกลง Cloud')
                    success_buf = render_confirm_success(stu_id, name)
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
