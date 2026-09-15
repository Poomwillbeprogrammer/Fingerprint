import os
import sys
from PIL import Image, ImageDraw, ImageFont

if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 1. โหลดฟอนต์ภาษาไทยแท้
FONT_PATH = '/home/arduino/tahoma.ttf'
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
        font_title = ImageFont.truetype(actual_font_path, 11)
        font_id    = ImageFont.truetype(actual_font_path, 11)
        font_name  = ImageFont.truetype(actual_font_path, 12)
        font_name_sm = ImageFont.truetype(actual_font_path, 10)
        font_body  = ImageFont.truetype(actual_font_path, 11)
        font_small = ImageFont.truetype(actual_font_path, 10)
        print(f'✅ [Font] โหลดฟอนต์ {actual_font_path} สำเร็จ คมชัด 100%')
    except Exception as e:
        print(f'⚠️ [Font] โหลดฟอนต์ {actual_font_path} ล้มเหลว: {e}')
        actual_font_path = None

if not actual_font_path:
    print('⚠️ [Font] ไม่พบไฟล์ฟอนต์ TrueType กำลังใช้ฟอนต์เริ่มต้น (อาจแสดงผลภาษาไทยไม่สมบูรณ์)')
    font_title = font_id = font_name = font_name_sm = font_body = font_small = ImageFont.load_default()

# ขนาดความละเอียดจอ 1.8" TFT SPI (160x128 แนวนอน Landscape)
TFT_WIDTH = 160
TFT_HEIGHT = 128
TFT_BUF_SIZE = (TFT_WIDTH * TFT_HEIGHT) // 8  # 2,560 Bytes

current_room_name = 'ทค.1-101'

def set_current_room_name(room_name):
    global current_room_name
    if room_name:
        current_room_name = room_name.strip()

# 2. ฟังก์ชันแปลงภาพ Pillow (160x128) เป็น 2560-byte TFT Horizontal 1-bit Buffer
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

# ฟังก์ชันแปลง 2560-byte 1-bit Buffer กลับเป็น Pillow Image สำหรับพรีวิวและ export PNG
def tft_buf_to_img(buf, width=TFT_WIDTH, height=TFT_HEIGHT):
    return Image.frombytes('1', (width, height), bytes(buf))

# 3. เรนเดอร์หน้าจอพร้อมใช้งาน (Idle Screen ภาษาไทยคมกริบ - 160x128 แนวนอน พร้อมชื่อห้องประจำเครื่อง)
def render_idle_screen(room_name=None):
    global current_room_name
    r_name = room_name or current_room_name or 'ทค.1-101'
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    # โซน Header: ระบบลงเวลาเรียน IoT (Y: 0..22)
    title = 'ระบบลงเวลาเรียน IoT'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 4), title, font=font_title, fill=1)
    d.line([(2, 23), (TFT_WIDTH - 3, 23)], fill=1)

    # โซน Body: RMUTL + กรอบวางนิ้ว (Y: 24..103)
    inst = 'มทร.ล้านนา (RMUTL)'
    bb = d.textbbox((0, 0), inst, font=font_small)
    iw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - iw) // 2, 28), inst, font=font_small, fill=1)

    d.rectangle([14, 46, TFT_WIDTH - 15, 96], outline=1)
    prompt1 = 'กรุณาวางลายนิ้วมือ'
    bb = d.textbbox((0, 0), prompt1, font=font_name)
    pw1 = bb[2] - bb[0]
    d.text(((TFT_WIDTH - pw1) // 2, 54), prompt1, font=font_name, fill=1)

    prompt2 = 'เพื่อบันทึกเวลาเรียน'
    bb = d.textbbox((0, 0), prompt2, font=font_small)
    pw2 = bb[2] - bb[0]
    d.text(((TFT_WIDTH - pw2) // 2, 75), prompt2, font=font_small, fill=1)

    # โซน Footer: ข้อมูลห้อง + สถานะพร้อมใช้งาน (Y: 104..127)
    d.line([(2, 104), (TFT_WIDTH - 3, 104)], fill=1)
    footer_text = f'[ {r_name} ]   ● พร้อมใช้งาน'
    bb = d.textbbox((0, 0), footer_text, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 110), footer_text, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 4. เรนเดอร์หน้าจอไม่พบลายนิ้วมือ (Denied Screen ภาษาไทย - 160x128 แนวนอน)
def render_denied_screen(is_offline=False):
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    # โซน Header: ACCESS DENIED (Y: 0..22)
    title = 'ACCESS DENIED'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 4), title, font=font_title, fill=1)
    d.line([(2, 23), (TFT_WIDTH - 3, 23)], fill=1)

    # โซน Body: ข้อความเตือน (Y: 24..103)
    d.rectangle([14, 36, TFT_WIDTH - 15, 96], outline=1)
    body1 = 'ไม่พบลายนิ้วมือ'
    bb = d.textbbox((0, 0), body1, font=font_name)
    b1w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b1w) // 2, 46), body1, font=font_name, fill=1)

    body2 = 'ไม่มีข้อมูลในระบบ หรือสแกนไม่ชัด'
    bb = d.textbbox((0, 0), body2, font=font_small)
    b2w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b2w) // 2, 72), body2, font=font_small, fill=1)

    # โซน Footer: สถานะ (Y: 104..127)
    d.line([(2, 104), (TFT_WIDTH - 3, 104)], fill=1)
    footer = 'ไม่พบข้อมูล (โหมดออฟไลน์)' if is_offline else 'ไม่มีสิทธิ์เข้าถึง (DENIED)'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 110), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 5. เรนเดอร์การ์ดนักศึกษา (User Card ภาษาไทยคมกริบ - 160x128 แนวนอน แสดงชื่อเต็ม + รหัส + คาบเรียน + ปุ่มกด)
def render_user_card(student_id, name, sched_info=None, room_name=None):
    global current_room_name
    active_room = room_name or current_room_name or 'ทค.1-101'
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    # โซน Header: ยืนยันตัวตนการเข้าเรียน (Y: 0..22)
    title = 'ข้อมูลการลงเวลาเรียน'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 4), title, font=font_title, fill=1)
    d.line([(2, 23), (TFT_WIDTH - 3, 23)], fill=1)

    # โซน Body: ชื่อนักศึกษา (Y < 60 เป็นสีขาว)
    display_name = name or 'Unknown'
    if len(display_name) > 26:
        display_name = display_name[:25] + '..'
    bb = d.textbbox((0, 0), display_name, font=font_name)
    nw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - nw) // 2, 27), display_name, font=font_name, fill=1)

    # ข้อมูลรหัสนักศึกษา และคาบเรียน (Y: 60..103 สีอำพัน/ฟ้า)
    sid = str(student_id) if student_id else '-'
    sid_text = f"รหัส: {sid}"
    bb = d.textbbox((0, 0), sid_text, font=font_small)
    sw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - sw) // 2, 48), sid_text, font=font_small, fill=1)

    sched = sched_info.get('schedule') if sched_info else None
    att_status = sched_info.get('attendanceStatus', 'OUT_OF_SCHEDULE') if sched_info else 'OUT_OF_SCHEDULE'

    if sched:
        short_name = sched.get('short_name') or sched.get('subject_name', 'Class')
        class_type = sched.get('class_type', 'T')
        subj_line = f"วิชา: {short_name} [{class_type}]"
        if len(subj_line) > 24:
            subj_line = subj_line[:23] + '..'
        bb = d.textbbox((0, 0), subj_line, font=font_small)
        slw = bb[2] - bb[0]
        d.text(((TFT_WIDTH - slw) // 2, 66), subj_line, font=font_small, fill=1)

        status_tag = 'ตรงเวลา' if att_status == 'ON_TIME' else 'มาสาย'
        room = sched.get('room_name', active_room)
        detail_line = f"ห้อง: {room}   สถานะ: [{status_tag}]"
        bb = d.textbbox((0, 0), detail_line, font=font_small)
        dlw = bb[2] - bb[0]
        d.text(((TFT_WIDTH - dlw) // 2, 84), detail_line, font=font_small, fill=1)
    else:
        subj_line = "วิชา: นอกเวลาเรียน (General)"
        bb = d.textbbox((0, 0), subj_line, font=font_small)
        slw = bb[2] - bb[0]
        d.text(((TFT_WIDTH - slw) // 2, 66), subj_line, font=font_small, fill=1)

        detail_line = f"ห้อง: {active_room}   [บันทึกทั่วไป]"
        bb = d.textbbox((0, 0), detail_line, font=font_small)
        dlw = bb[2] - bb[0]
        d.text(((TFT_WIDTH - dlw) // 2, 84), detail_line, font=font_small, fill=1)

    # โซน Footer: ปุ่มกด 2 สี (ปุ่มฟ้า D2 ยืนยัน X < 80 / ปุ่มแดง D3 ยกเลิก X >= 80)
    d.line([(2, 104), (TFT_WIDTH - 3, 104)], fill=1)
    
    prompt1 = '[ ฟ้า: ยืนยัน ]'
    bb1 = d.textbbox((0, 0), prompt1, font=font_small)
    w1 = bb1[2] - bb1[0]
    d.text((40 - (w1 // 2), 110), prompt1, font=font_small, fill=1)

    prompt2 = '[ แดง: ยกเลิก ]'
    bb2 = d.textbbox((0, 0), prompt2, font=font_small)
    w2 = bb2[2] - bb2[0]
    d.text((120 - (w2 // 2), 110), prompt2, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 5.1 เรนเดอร์หน้าจอยืนยันสำเร็จ (Confirm Success Screen - 160x128 แนวนอน)
def render_confirm_success(student_id, name, sched_info=None, is_offline=False):
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    # โซน Header: บันทึกสำเร็จ (Y: 0..22)
    title = '✓ บันทึกเวลาสำเร็จ ✓'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 4), title, font=font_title, fill=1)
    d.line([(2, 23), (TFT_WIDTH - 3, 23)], fill=1)

    # โซน Body: ชื่อ + รหัส + กล่องสถานะ
    display_name = name or 'Unknown'
    if len(display_name) > 26:
        display_name = display_name[:25] + '..'
    bb = d.textbbox((0, 0), display_name, font=font_name)
    nw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - nw) // 2, 27), display_name, font=font_name, fill=1)

    sid = str(student_id) if student_id else '-'
    sid_text = f"รหัส: {sid}"
    bb = d.textbbox((0, 0), sid_text, font=font_small)
    sw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - sw) // 2, 48), sid_text, font=font_small, fill=1)

    d.rectangle([14, 68, TFT_WIDTH - 15, 96], outline=1)
    status = 'บันทึกออฟไลน์ (รอเชื่อมต่อ)' if is_offline else '✓ บันทึกขึ้น Cloud เรียบร้อย'
    bb = d.textbbox((0, 0), status, font=font_small)
    stw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - stw) // 2, 75), status, font=font_small, fill=1)

    # โซน Footer: คำขอบคุณ
    d.line([(2, 104), (TFT_WIDTH - 3, 104)], fill=1)
    footer = 'ยินดีต้อนรับเข้าสู่ห้องเรียน'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 110), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 5.1.1 เรนเดอร์หน้าจอแจ้งเตือนลงเวลาซ้ำ (Already Checked In Screen - 160x128 แนวนอน)
def render_already_checked_in(name, subject_str):
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    # โซน Header: แจ้งเตือนการลงเวลา (Y: 0..22)
    title = 'แจ้งเตือนการลงเวลา'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 4), title, font=font_title, fill=1)
    d.line([(2, 23), (TFT_WIDTH - 3, 23)], fill=1)

    # โซน Body: ชื่อ + กรอบแจ้งเตือน (Y: 24..103)
    display_name = name or 'Student'
    if len(display_name) > 26:
        display_name = display_name[:25] + '..'
    bb = d.textbbox((0, 0), display_name, font=font_name)
    nw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - nw) // 2, 27), display_name, font=font_name, fill=1)

    d.rectangle([12, 48, TFT_WIDTH - 13, 96], outline=1)
    w1 = 'คุณได้ลงเวลาคาบนี้แล้ว'
    bb = d.textbbox((0, 0), w1, font=font_small)
    w1_w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - w1_w) // 2, 54), w1, font=font_small, fill=1)

    subj = subject_str or 'วิชาปัจจุบัน'
    if len(subj) > 24:
        subj = subj[:23] + '..'
    w2 = f'{subj} (ไม่บันทึกซ้ำ)'
    bb = d.textbbox((0, 0), w2, font=font_small)
    w2_w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - w2_w) // 2, 74), w2, font=font_small, fill=1)

    # โซน Footer: สแกน 1 ครั้ง/วิชา/สัปดาห์ (Y: 104..127)
    d.line([(2, 104), (TFT_WIDTH - 3, 104)], fill=1)
    footer = 'อนุญาตสแกน 1 ครั้ง/วิชา/สัปดาห์'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 110), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 5.2 เรนเดอร์หน้าจอยยกเลิก (Cancelled Screen - D3 Rescan 160x128 แนวนอน)
def render_cancelled_screen():
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    # โซน Header: ยกเลิกการลงเวลา (Y: 0..22)
    title = 'ยกเลิกการลงเวลา'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 4), title, font=font_title, fill=1)
    d.line([(2, 23), (TFT_WIDTH - 3, 23)], fill=1)

    # โซน Body: กล่องแจ้งเตือน (Y: 24..103)
    d.rectangle([14, 36, TFT_WIDTH - 15, 96], outline=1)
    body1 = 'ยกเลิกด้วยปุ่มแดง (D3)'
    bb = d.textbbox((0, 0), body1, font=font_name)
    b1w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b1w) // 2, 46), body1, font=font_name, fill=1)

    body2 = 'กรุณาวางนิ้วเพื่อสแกนใหม่อีกครั้ง'
    bb = d.textbbox((0, 0), body2, font=font_small)
    b2w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b2w) // 2, 72), body2, font=font_small, fill=1)

    # โซน Footer: สถานะยกเลิก (Y: 104..127)
    d.line([(2, 104), (TFT_WIDTH - 3, 104)], fill=1)
    footer = 'สถานะ: ยกเลิกรายการแล้ว'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 110), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

# 5.3 เรนเดอร์หน้าจอหมดเวลา (Timeout Screen - 10s Auto-Cancel 160x128 แนวนอน)
def render_timeout_screen():
    img = Image.new('1', (TFT_WIDTH, TFT_HEIGHT), 0)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1], outline=1)
    
    # โซน Header: หมดเวลาการยืนยัน (Y: 0..22)
    title = 'หมดเวลาการยืนยัน'
    bb = d.textbbox((0, 0), title, font=font_title)
    tw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - tw) // 2, 4), title, font=font_title, fill=1)
    d.line([(2, 23), (TFT_WIDTH - 3, 23)], fill=1)

    # โซน Body: ข้อความเตือนหมดเวลา (Y: 24..103)
    d.rectangle([14, 36, TFT_WIDTH - 15, 96], outline=1)
    body1 = 'ไม่มีการกดปุ่มยืนยัน'
    bb = d.textbbox((0, 0), body1, font=font_name)
    b1w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b1w) // 2, 46), body1, font=font_name, fill=1)

    body2 = 'ยกเลิกอัตโนมัติภายใน 10 วินาที'
    bb = d.textbbox((0, 0), body2, font=font_small)
    b2w = bb[2] - bb[0]
    d.text(((TFT_WIDTH - b2w) // 2, 72), body2, font=font_small, fill=1)

    # โซน Footer: สถานะไม่ได้บันทึกเวลา (Y: 104..127)
    d.line([(2, 104), (TFT_WIDTH - 3, 104)], fill=1)
    footer = 'สถานะ: ไม่ได้บันทึกเวลาเรียน'
    bb = d.textbbox((0, 0), footer, font=font_small)
    fw = bb[2] - bb[0]
    d.text(((TFT_WIDTH - fw) // 2, 110), footer, font=font_small, fill=1)

    return img_to_tft_buf(img)

if __name__ == '__main__':
    output_dir = os.path.join(os.path.dirname(__file__), '.scratch', 'png')
    os.makedirs(output_dir, exist_ok=True)
    print(f'🖼️ [UnoQ Views] กำลังส่งออกไฟล์ภาพพรีวิวหน้าจอทั้ง 7 ไปยัง: {output_dir}')

    screens = {
        'idle_default.png': render_idle_screen('ทค.1-101'),
        'denied_online.png': render_denied_screen(is_offline=False),
        'denied_offline.png': render_denied_screen(is_offline=True),
        'user_card_scheduled.png': render_user_card(
            '6404101312345',
            'นายทดสอบ ระบบดี',
            sched_info={
                'schedule': {'short_name': 'Adv Prog', 'class_type': 'T', 'room_name': 'ทค.1-101'},
                'attendanceStatus': 'ON_TIME'
            }
        ),
        'user_card_general.png': render_user_card('6404101312345', 'นายทดสอบ ระบบดี', sched_info=None),
        'confirm_success_online.png': render_confirm_success('6404101312345', 'นายทดสอบ ระบบดี', is_offline=False),
        'confirm_success_offline.png': render_confirm_success('6404101312345', 'นายทดสอบ ระบบดี', is_offline=True),
        'already_checked_in.png': render_already_checked_in('นายทดสอบ ระบบดี', 'Adv Prog [T]'),
        'cancelled.png': render_cancelled_screen(),
        'timeout.png': render_timeout_screen()
    }

    for filename, buf in screens.items():
        img = tft_buf_to_img(buf)
        filepath = os.path.join(output_dir, filename)
        img.save(filepath)
        print(f'  ✓ สร้างภาพ {filename} ({TFT_WIDTH}x{TFT_HEIGHT}, {len(buf)} bytes) สำเร็จ')

    print(f'🎉 [UnoQ Views] ส่งออกภาพตัวอย่างครบ {len(screens)} หน้าจอเรียบร้อย!')
