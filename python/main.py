import time
from machine import Pin, I2C, UART
import ssd1306

# ==========================================
# 1. ตั้งค่าการเชื่อมต่อ OLED & MCU Bridge
# ==========================================
try:
    i2c = I2C(0)
    oled = ssd1306.SSD1306_I2C(128, 64, i2c)
except Exception as e:
    print(f"OLED Init Warning: {e}")
    oled = None

# UART สำหรับสื่อสารกับเฟิร์มแวร์ C++ (sketch.ino) ที่ Baudrate 115200
mcu_serial = UART(0, baudrate=115200)

# ฐานข้อมูลผู้ใช้งาน (Mapping ID -> ชื่อผู้ใช้)
USERS = {
    1: "Poom",
    2: "Admin",
    3: "Member 1",
    4: "Member 2"
}

# ==========================================
# 2. ฟังก์ชันแสดงผลหน้าจอ OLED UI
# ==========================================
def show_screen(title="", line2="", line3="", line4=""):
    """วาดหน้าจอ UI สวยงามบน OLED"""
    if oled is None:
        return
    oled.fill(0)
    # วาดแถบหัวข้อ Title
    if title:
        oled.text(f"[{title}]"[:16], 0, 0)
        oled.hline(0, 10, 128, 1)
    if line2: oled.text(line2[:16], 0, 16)
    if line3: oled.text(line3[:16], 0, 32)
    if line4: oled.text(line4[:16], 0, 48)
    oled.show()


# ==========================================
# 3. คลาสสื่อสารกับ Firmware C++ (Bridge Client)
# ==========================================
class HybridBridge:
    def __init__(self, serial_port):
        self.ser = serial_port

    def send_cmd(self, cmd):
        """ส่งคำสั่งไปยัง C++ firmware"""
        # เคลียร์ buffer เก่า
        while self.ser.any():
            self.ser.read()
        self.ser.write((cmd + "\n").encode())

    def read_line(self, timeout_ms=3000):
        """อ่านข้อความตอบกลับจาก C++ firmware ทีละบรรทัด"""
        start = time.ticks_ms()
        buf = bytearray()
        while time.ticks_diff(time.ticks_ms(), start) < timeout_ms:
            if self.ser.any():
                ch = self.ser.read(1)
                if ch == b'\n':
                    return buf.decode().strip()
                elif ch != b'\r':
                    buf.extend(ch)
            time.sleep_ms(10)
        return buf.decode().strip() if len(buf) > 0 else None


bridge = HybridBridge(mcu_serial)


# ==========================================
# 4. ฟังก์ชัน Application Logic (ระดับสูง)
# ==========================================

def trigger_scan():
    """สั่ง C++ ให้สแกนลายนิ้วมือ และประมวลผลผลลัพธ์"""
    show_screen("SCANNING", "Place finger...", "Checking database")
    bridge.send_cmd("SCAN")
    
    start_t = time.ticks_ms()
    while time.ticks_diff(time.ticks_ms(), start_t) < 5000:
        line = bridge.read_line(timeout_ms=1000)
        if not line:
            continue
        
        print(f"[MCU] {line}")
        
        if line.startswith("EVENT:MATCH"):
            # ตัวอย่าง: EVENT:MATCH ID=1 SCORE=120
            parts = line.split()
            finger_id = int(parts[1].split('=')[1])
            score = int(parts[2].split('=')[1])
            
            user_name = USERS.get(finger_id, f"ID #{finger_id}")
            print(f">> ยินดีต้อนรับ: {user_name} (Score: {score})")
            show_screen("ACCESS GRANTED", f"Welcome, {user_name}", f"ID: #{finger_id}", f"Score: {score}")
            time.sleep(3)
            return finger_id
            
        elif line == "EVENT:NO_MATCH":
            print(">> ปฏิเสธการเข้าถึง (ไม่พบลายนิ้วมือในระบบ)")
            show_screen("ACCESS DENIED", "Unknown User", "Finger not found")
            time.sleep(2)
            return None
            
        elif line == "RESP:SCAN_NO_FINGER":
            show_screen("SCAN TIMEOUT", "No finger placed")
            time.sleep(1.5)
            return None

    show_screen("SCAN TIMEOUT", "Please try again")
    time.sleep(1)
    return None


def trigger_enroll(target_id, name=""):
    """สั่ง C++ ให้เริ่มกระบวนการบันทึก ID"""
    print(f"\n--- เริ่มบันทึกลายนิ้วมือ ID #{target_id} ---")
    bridge.send_cmd(f"ENROLL {target_id}")
    
    while True:
        line = bridge.read_line(timeout_ms=15000)
        if not line:
            print("Enroll Timeout")
            show_screen("ENROLL FAILED", "Timeout error")
            time.sleep(2)
            break
            
        print(f"[MCU] {line}")
        
        if line == "STATUS:ENROLL_STEP1_WAIT":
            show_screen("ENROLL: STEP 1", f"Target ID: #{target_id}", "Place finger...")
        elif line == "STATUS:ENROLL_REMOVE_FINGER":
            show_screen("ENROLL: STEP 1 OK", "Remove finger...", "Wait next step")
        elif line == "STATUS:ENROLL_STEP2_WAIT":
            show_screen("ENROLL: STEP 2", "Place SAME finger", "again...")
        elif line.startswith("RESP:ENROLL_OK"):
            if name:
                USERS[target_id] = name
            print(f">> บันทึก ID #{target_id} สำเร็จ!")
            show_screen("ENROLL SUCCESS", f"Saved ID: #{target_id}", f"Name: {USERS.get(target_id, '')}")
            time.sleep(3)
            break
        elif "FAIL" in line:
            print(f"Error: บันทึกล้มเหลว ({line})")
            show_screen("ENROLL FAILED", line)
            time.sleep(2)
            break


def trigger_delete(target_id):
    """สั่ง C++ ลบลายนิ้วมือตาม ID"""
    show_screen("DELETE ID", f"Deleting ID #{target_id}...")
    bridge.send_cmd(f"DELETE {target_id}")
    line = bridge.read_line(timeout_ms=3000)
    print(f"[MCU] {line}")
    if line and "DELETE_OK" in line:
        if target_id in USERS:
            del USERS[target_id]
        print(f">> ลบ ID #{target_id} สำเร็จ!")
        show_screen("DELETE SUCCESS", f"ID #{target_id} removed")
    else:
        print(f"Error: ลบ ID #{target_id} ไม่สำเร็จ")
        show_screen("DELETE FAILED", f"ID #{target_id} error")
    time.sleep(2)


def trigger_count():
    """สั่ง C++ ดึงจำนวนลายนิ้วมือ"""
    bridge.send_cmd("COUNT")
    line = bridge.read_line(timeout_ms=3000)
    print(f"[MCU] {line}")
    if line and "RESP:COUNT=" in line:
        count = line.split('=')[1]
        print(f">> จำนวนลายนิ้วมือที่บันทึกไว้: {count}")
        show_screen("TOTAL TEMPLATES", f"Enrolled: {count}")
    else:
        show_screen("COUNT ERROR", "Could not read")
    time.sleep(2)


def trigger_clear_all():
    """สั่ง C++ ลบฐานข้อมูลทั้งหมด"""
    show_screen("CLEAR ALL", "Deleting database...")
    bridge.send_cmd("CLEAR_ALL")
    line = bridge.read_line(timeout_ms=5000)
    print(f"[MCU] {line}")
    if line and "CLEAR_OK" in line:
        USERS.clear()
        print(">> ลบข้อมูลทั้งหมดสำเร็จ!")
        show_screen("CLEAR SUCCESS", "All data wiped")
    else:
        show_screen("CLEAR FAILED", "Operation failed")
    time.sleep(2)


# ==========================================
# 5. Main Loop & Interactive CLI Menu
# ==========================================
def main():
    show_screen("HYBRID SYSTEM", "Firmware Bridge", "Ready...")
    time.sleep(1)

    while True:
        # เช็คว่ามี Event ส่งมาจาก MCU หรือไม่ (เช่น จาก Touch Interrupt)
        if mcu_serial.any():
            incoming = bridge.read_line(timeout_ms=200)
            if incoming:
                print(f"[Event from MCU] {incoming}")
                if "TOUCH_DETECTED" in incoming:
                    trigger_scan()

        print("\n===============================")
        print("   HYBRID FINGERPRINT SYSTEM   ")
        print("===============================")
        print("1. สแกนตรวจสอบลายนิ้วมือ (Verify / Scan)")
        print("2. บันทึกลายนิ้วมือใหม่ (Enroll)")
        print("3. ลบลายนิ้วมือตาม ID (Delete)")
        print("4. ดูจำนวนลายนิ้วมือ (Count)")
        print("5. ลบลายนิ้วมือทั้งหมด (Clear All)")
        print("6. ตรวจสอบรายชื่อผู้ใช้งาน (User List)")
        print("===============================")
        
        show_screen("SYSTEM READY", "Touch sensor", "or select menu 1-6")
        
        choice = input("เลือกคำสั่ง (1-6): ").strip()
        
        if choice == '1':
            trigger_scan()
        elif choice == '2':
            try:
                enroll_id = int(input("ใส่หมายเลข ID ที่ต้องการบันทึก (1-300): "))
                user_name = input("ใส่ชื่อผู้ใช้งาน (เช่น Poom): ").strip()
                trigger_enroll(enroll_id, user_name)
            except ValueError:
                print("กรุณากรอกตัวเลข ID ให้ถูกต้อง")
        elif choice == '3':
            try:
                del_id = int(input("ใส่หมายเลข ID ที่ต้องการลบ: "))
                trigger_delete(del_id)
            except ValueError:
                print("กรุณากรอกตัวเลข ID ให้ถูกต้อง")
        elif choice == '4':
            trigger_count()
        elif choice == '5':
            confirm = input("ยืนยันจะลบข้อมูลทั้งหมดหรือไม่ (y/N)? ").strip().lower()
            if confirm == 'y':
                trigger_clear_all()
        elif choice == '6':
            print("\n--- รายชื่อผู้ใช้ในระบบ ---")
            for uid, uname in USERS.items():
                print(f"ID #{uid}: {uname}")
        else:
            print("ตัวเลือกไม่ถูกต้อง")


if __name__ == "__main__":
    main()