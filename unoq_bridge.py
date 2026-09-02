import socket
import threading
import time
import sys
import socketio

RENDER_URL = sys.argv[1] if len(sys.argv) > 1 else 'https://fingerprint-hrkp.onrender.com'
LOCAL_PORT = 7500

sio = socketio.Client(reconnection=True, reconnection_delay=2)
mcu_sock = None

def connect_mcu():
    global mcu_sock
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect(('127.0.0.1', LOCAL_PORT))
            mcu_sock = s
            print('✅ [Uno Q MCU] เชื่อมต่อกับ STM32 พอร์ต 7500 สำเร็จ')
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
                if line:
                    print(f'📥 [MCU -> Cloud] {line}')
                    if sio.connected:
                        sio.emit('bridge_serial_data', line)
        except Exception as e:
            print(f'❌ [Uno Q MCU Error] {e}')
            mcu_sock = None
            time.sleep(2)

@sio.event
def connect():
    print(f'☁️ [Cloud] เชื่อมต่อกับ Render สำเร็จ: {RENDER_URL} (SID: {sio.sid})')
    sio.emit('register_bridge')

@sio.event
def disconnect():
    print('⚠️ [Cloud] หลุดการเชื่อมต่อจาก Render กำลังเชื่อมต่อใหม่...')

@sio.on('bridge_command')
def on_bridge_command(cmd):
    print(f'📤 [Cloud -> MCU] {cmd}')
    if mcu_sock:
        try:
            full_cmd = (cmd.strip() + '\n').encode('utf-8')
            mcu_sock.sendall(full_cmd)
        except Exception as e:
            print(f'❌ [Error sending to MCU] {e}')

if __name__ == '__main__':
    print('====================================================')
    print('🚀 กำลังเริ่ม Standalone Hardware Bridge บน Uno Q Linux')
    print(f'🌐 เซิร์ฟเวอร์เป้าหมาย: {RENDER_URL}')
    print('====================================================')
    
    t = threading.Thread(target=mcu_reader_thread, daemon=True)
    t.start()
    
    while True:
        try:
            sio.connect(RENDER_URL, wait_timeout=15)
            sio.wait()
        except Exception as e:
            print(f'⚠️ [Cloud Connection Error] {e}')
            time.sleep(4)
