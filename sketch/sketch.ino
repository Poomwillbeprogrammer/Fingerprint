#include <Arduino.h>
#include <Adafruit_Fingerprint.h>

// ==========================================
// 1. กำหนดขาเชื่อมต่อ Hardware
// ==========================================
#define OLED_SDA_PIN A4
#define OLED_SCL_PIN A5
#define OLED_I2C_ADDR 0x3C

// การเชื่อมต่อเซนเซอร์ลายนิ้วมือ R307 (Hardware Serial1 สำหรับ Uno Q: Pin 0 RX, Pin 1 TX)
#define mySerial Serial1
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);




// ==========================================
// 2. ไดรเวอร์ Software I2C (Bit-Banging สำหรับ Zephyr)
// ==========================================
class SoftwareI2C {
private:
  uint8_t _sda, _scl;

  inline void i2c_delay() {
    delayMicroseconds(4);
  }

  inline void sda_high() { pinMode(_sda, INPUT_PULLUP); }
  inline void sda_low()  { pinMode(_sda, OUTPUT); digitalWrite(_sda, LOW); }
  inline void scl_high() { pinMode(_scl, INPUT_PULLUP); }
  inline void scl_low()  { pinMode(_scl, OUTPUT); digitalWrite(_scl, LOW); }
  inline uint8_t sda_read() { pinMode(_sda, INPUT_PULLUP); return digitalRead(_sda); }

public:
  SoftwareI2C(uint8_t sda, uint8_t scl) : _sda(sda), _scl(scl) {}

  void begin() {
    sda_high();
    scl_high();
    i2c_delay();
  }

  void start() {
    sda_high(); scl_high(); i2c_delay();
    sda_low();  i2c_delay();
    scl_low();  i2c_delay();
  }

  void stop() {
    sda_low();  i2c_delay();
    scl_high(); i2c_delay();
    sda_high(); i2c_delay();
  }

  bool writeByte(uint8_t byte) {
    for (uint8_t i = 0; i < 8; i++) {
      if (byte & 0x80) sda_high();
      else sda_low();
      i2c_delay();
      scl_high();
      i2c_delay();
      scl_low();
      byte <<= 1;
    }
    sda_high();
    i2c_delay();
    scl_high();
    i2c_delay();
    bool ack = (sda_read() == LOW);
    scl_low();
    i2c_delay();
    return ack;
  }
};

// ==========================================
// 3. ตารางฟอนต์มาตรฐาน 5x7 ASCII
// ==========================================
const uint8_t FONT5x7[][5] = {
  {0x00, 0x00, 0x00, 0x00, 0x00}, // Space
  {0x00, 0x00, 0x5F, 0x00, 0x00}, // !
  {0x00, 0x07, 0x00, 0x07, 0x00}, // "
  {0x14, 0x7F, 0x14, 0x7F, 0x14}, // #
  {0x24, 0x2A, 0x7F, 0x2A, 0x12}, // $
  {0x23, 0x13, 0x08, 0x64, 0x62}, // %
  {0x36, 0x49, 0x55, 0x22, 0x50}, // &
  {0x00, 0x05, 0x03, 0x00, 0x00}, // '
  {0x00, 0x1C, 0x22, 0x41, 0x00}, // (
  {0x00, 0x41, 0x22, 0x1C, 0x00}, // )
  {0x14, 0x08, 0x3E, 0x08, 0x14}, // *
  {0x08, 0x08, 0x3E, 0x08, 0x08}, // +
  {0x00, 0x50, 0x30, 0x00, 0x00}, // ,
  {0x08, 0x08, 0x08, 0x08, 0x08}, // -
  {0x00, 0x60, 0x60, 0x00, 0x00}, // .
  {0x20, 0x10, 0x08, 0x04, 0x02}, // /
  {0x3E, 0x51, 0x49, 0x45, 0x3E}, // 0
  {0x00, 0x42, 0x7F, 0x40, 0x00}, // 1
  {0x42, 0x61, 0x51, 0x49, 0x46}, // 2
  {0x21, 0x41, 0x45, 0x4B, 0x31}, // 3
  {0x18, 0x14, 0x12, 0x7F, 0x10}, // 4
  {0x27, 0x45, 0x45, 0x45, 0x39}, // 5
  {0x3C, 0x4A, 0x49, 0x49, 0x30}, // 6
  {0x01, 0x71, 0x09, 0x05, 0x03}, // 7
  {0x36, 0x49, 0x49, 0x49, 0x36}, // 8
  {0x06, 0x49, 0x49, 0x29, 0x1E}, // 9
  {0x00, 0x36, 0x36, 0x00, 0x00}, // :
  {0x00, 0x56, 0x36, 0x00, 0x00}, // ;
  {0x08, 0x14, 0x22, 0x41, 0x00}, // <
  {0x14, 0x14, 0x14, 0x14, 0x14}, // =
  {0x00, 0x41, 0x22, 0x14, 0x08}, // >
  {0x02, 0x01, 0x51, 0x09, 0x06}, // ?
  {0x32, 0x49, 0x79, 0x41, 0x3E}, // @
  {0x7E, 0x11, 0x11, 0x11, 0x7E}, // A
  {0x7F, 0x49, 0x49, 0x49, 0x36}, // B
  {0x3E, 0x41, 0x41, 0x41, 0x22}, // C
  {0x7F, 0x41, 0x41, 0x22, 0x1C}, // D
  {0x7F, 0x49, 0x49, 0x49, 0x41}, // E
  {0x7F, 0x09, 0x09, 0x09, 0x01}, // F
  {0x3E, 0x41, 0x49, 0x49, 0x7A}, // G
  {0x7F, 0x08, 0x08, 0x08, 0x7F}, // H
  {0x00, 0x41, 0x7F, 0x41, 0x00}, // I
  {0x20, 0x40, 0x41, 0x3F, 0x01}, // J
  {0x7F, 0x08, 0x14, 0x22, 0x41}, // K
  {0x7F, 0x40, 0x40, 0x40, 0x40}, // L
  {0x7F, 0x02, 0x0C, 0x02, 0x7F}, // M
  {0x7F, 0x04, 0x08, 0x10, 0x7F}, // N
  {0x3E, 0x41, 0x41, 0x41, 0x3E}, // O
  {0x7F, 0x09, 0x09, 0x09, 0x06}, // P
  {0x3E, 0x41, 0x51, 0x21, 0x5E}, // Q
  {0x7F, 0x09, 0x19, 0x29, 0x46}, // R
  {0x46, 0x49, 0x49, 0x49, 0x31}, // S
  {0x01, 0x01, 0x7F, 0x01, 0x01}, // T
  {0x3F, 0x40, 0x40, 0x40, 0x3F}, // U
  {0x1F, 0x20, 0x40, 0x20, 0x1F}, // V
  {0x3F, 0x40, 0x38, 0x40, 0x3F}, // W
  {0x63, 0x14, 0x08, 0x14, 0x63}, // X
  {0x07, 0x08, 0x70, 0x08, 0x07}, // Y
  {0x61, 0x51, 0x49, 0x45, 0x43}, // Z
  {0x00, 0x7F, 0x41, 0x41, 0x00}, // [
  {0x02, 0x04, 0x08, 0x10, 0x20}, // '\'
  {0x00, 0x41, 0x41, 0x7F, 0x00}, // ]
  {0x04, 0x02, 0x01, 0x02, 0x04}, // ^
  {0x40, 0x40, 0x40, 0x40, 0x40}, // _
  {0x00, 0x01, 0x02, 0x04, 0x00}, // `
  {0x20, 0x54, 0x54, 0x54, 0x78}, // a
  {0x7F, 0x48, 0x44, 0x44, 0x38}, // b
  {0x38, 0x44, 0x44, 0x44, 0x20}, // c
  {0x38, 0x44, 0x44, 0x48, 0x7F}, // d
  {0x38, 0x54, 0x54, 0x54, 0x18}, // e
  {0x08, 0x7E, 0x09, 0x01, 0x02}, // f
  {0x0C, 0x52, 0x52, 0x52, 0x3E}, // g
  {0x7F, 0x08, 0x04, 0x04, 0x78}, // h
  {0x00, 0x44, 0x7D, 0x40, 0x00}, // i
  {0x20, 0x40, 0x44, 0x3D, 0x00}, // j
  {0x7F, 0x10, 0x28, 0x44, 0x00}, // k
  {0x00, 0x41, 0x7F, 0x40, 0x00}, // l
  {0x7C, 0x04, 0x18, 0x04, 0x78}, // m
  {0x7C, 0x08, 0x04, 0x04, 0x78}, // n
  {0x38, 0x44, 0x44, 0x44, 0x38}, // o
  {0x7C, 0x14, 0x14, 0x14, 0x08}, // p
  {0x08, 0x14, 0x14, 0x18, 0x7C}, // q
  {0x7C, 0x08, 0x04, 0x04, 0x08}, // r
  {0x48, 0x54, 0x54, 0x54, 0x20}, // s
  {0x04, 0x3F, 0x44, 0x40, 0x20}, // t
  {0x3C, 0x40, 0x40, 0x20, 0x7C}, // u
  {0x1C, 0x20, 0x40, 0x20, 0x1C}, // v
  {0x3C, 0x40, 0x30, 0x40, 0x3C}, // w
  {0x44, 0x28, 0x10, 0x28, 0x44}, // x
  {0x0C, 0x50, 0x50, 0x50, 0x3C}, // y
  {0x44, 0x64, 0x54, 0x4C, 0x44}, // z
  {0x00, 0x08, 0x36, 0x41, 0x00}, // {
  {0x00, 0x00, 0x7F, 0x00, 0x00}, // |
  {0x00, 0x41, 0x36, 0x08, 0x00}, // }
  {0x08, 0x08, 0x2A, 0x1C, 0x08}  // ~
};

// ==========================================
// 4. ไดรเวอร์ SH1106 OLED (128x64, Offset 2)
// ==========================================
class SH1106_Display {
private:
  SoftwareI2C _i2c;
  uint8_t _addr;
  uint8_t buffer[1024]; // 128 * 64 / 8 = 1024 Bytes

  void sendCommand(uint8_t cmd) {
    _i2c.start();
    _i2c.writeByte(_addr << 1);
    _i2c.writeByte(0x80);
    _i2c.writeByte(cmd);
    _i2c.stop();
  }

public:
  SH1106_Display(uint8_t sda, uint8_t scl, uint8_t addr = 0x3C)
    : _i2c(sda, scl), _addr(addr) {}

  void begin() {
    _i2c.begin();
    delay(50);

    // ลำดับ Init Command สำหรับ SH1106
    sendCommand(0xAE); // Display OFF
    sendCommand(0x02); // Column Offset = 2
    sendCommand(0x10);
    sendCommand(0x40); // Start line 0
    sendCommand(0xB0); // Page 0
    sendCommand(0x81); // Contrast
    sendCommand(0x80);
    sendCommand(0xA1); // Segment Re-map
    sendCommand(0xC8); // COM Scan Direction
    sendCommand(0xA6); // Normal Display
    sendCommand(0xA8); // Multiplex
    sendCommand(0x3F); // 1/64 duty
    sendCommand(0xAD); // DC-DC Mode
    sendCommand(0x8B); // DC-DC ON
    sendCommand(0xD3); sendCommand(0x00);
    sendCommand(0xD5); sendCommand(0x80);
    sendCommand(0xD9); sendCommand(0x22);
    sendCommand(0xDA); sendCommand(0x12);
    sendCommand(0xDB); sendCommand(0x35);
    sendCommand(0xAF); // Display ON

    clear();
    display();
  }

  void clear() {
    memset(buffer, 0x00, sizeof(buffer));
  }

  void drawPixel(int16_t x, int16_t y, uint8_t color = 1) {
    if (x < 0 || x >= 128 || y < 0 || y >= 64) return;
    if (color) buffer[x + (y / 8) * 128] |= (1 << (y % 8));
    else buffer[x + (y / 8) * 128] &= ~(1 << (y % 8));
  }

  void drawChar(int16_t x, int16_t y, char c, uint8_t color = 1) {
    if (c < 32 || c > 126) c = '?';
    uint8_t index = c - 32;
    for (uint8_t col = 0; col < 5; col++) {
      uint8_t line = FONT5x7[index][col];
      for (uint8_t row = 0; row < 8; row++) {
        drawPixel(x + col, y + row, (line & (1 << row)) ? color : !color);
      }
    }
    for (uint8_t row = 0; row < 8; row++) {
      drawPixel(x + 5, y + row, !color);
    }
  }

  void drawString(int16_t x, int16_t y, const char *str, uint8_t color = 1) {
    while (*str) {
      if (x + 6 > 128) { x = 0; y += 9; }
      if (y + 8 > 64) break;
      drawChar(x, y, *str++, color);
      x += 6;
    }
  }

  void drawHLine(int16_t x, int16_t y, int16_t w, uint8_t color = 1) {
    for (int16_t i = 0; i < w; i++) drawPixel(x + i, y, color);
  }

  void drawRect(int16_t x, int16_t y, int16_t w, int16_t h, uint8_t color = 1) {
    drawHLine(x, y, w, color);
    drawHLine(x, y + h - 1, w, color);
    for (int16_t i = 0; i < h; i++) {
      drawPixel(x, y + i, color);
      drawPixel(x + w - 1, y + i, color);
    }
  }

  // ส่งข้อมูล Frame Buffer 1024 Bytes ไปยัง SH1106 ด้วย Offset = 2
  void display() {
    for (uint8_t page = 0; page < 8; page++) {
      sendCommand(0xB0 + page);
      sendCommand(0x02); // Column Offset = 2
      sendCommand(0x10);

      _i2c.start();
      _i2c.writeByte(_addr << 1);
      _i2c.writeByte(0x40);
      for (uint8_t col = 0; col < 128; col++) {
        _i2c.writeByte(buffer[col + (page * 128)]);
      }
      _i2c.stop();
    }
  }
};

SH1106_Display oled(OLED_SDA_PIN, OLED_SCL_PIN, OLED_I2C_ADDR);

// ==========================================
// 5. ฟังก์ชันแสดงสถานะ UI บนหน้าจอ OLED
// ==========================================
void showUI(const char* title, const char* line1, const char* line2 = "", const char* line3 = "") {
  oled.clear();
  oled.drawRect(0, 0, 128, 64);
  
  // แถบหัวข้อ Title
  oled.drawString(6, 4, title);
  oled.drawHLine(4, 14, 120);

  if (line1 && strlen(line1) > 0) oled.drawString(8, 20, line1);
  if (line2 && strlen(line2) > 0) oled.drawString(8, 34, line2);
  if (line3 && strlen(line3) > 0) oled.drawString(8, 48, line3);

  oled.display();
}

void showIdleScreen() {
  showUI("FINGERPRINT R307", "Place finger to scan", "or send command", "Status: READY");
}

// ==========================================
// ==========================================
// 6. ฟังก์ชันจัดการลายนิ้วมือ (Continuous Polling เหมือน test.ino)
// ==========================================

// ฟังก์ชันสแกนภาพและค้นหาลายนิ้วมือใน Buffer 1
int scanFingerprint() {
  uint8_t p = finger.getImage();
  if (p != FINGERPRINT_OK) return p;

  // แปลงภาพลายนิ้วมือเป็น Character File เก็บไว้ใน Buffer 1
  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) return p;

  // ค้นหา ID ที่ตรงกันในฐานข้อมูล
  p = finger.fingerSearch();
  if (p == FINGERPRINT_OK) {
    return FINGERPRINT_OK;
  } else if (p == FINGERPRINT_NOTFOUND) {
    return FINGERPRINT_NOTFOUND;
  } else {
    return p;
  }
}


// 2. บันทึกลายนิ้วมือใหม่ (Enroll)
void handleEnroll(int id) {
  if (id < 1 || id > 300) {
    showUI("ENROLL ERROR", "Invalid ID (1-300)");
    Serial.println("RESP:ENROLL_INVALID_ID");
    delay(2000);
    showIdleScreen();
    return;
  }

  char idHeader[25];
  snprintf(idHeader, sizeof(idHeader), "ENROLL ID #%d", id);

  // ขั้นตอนที่ 1: สแกนครั้งแรก
  showUI(idHeader, "Step 1: Put finger", "on sensor now...");
  Serial.println("STATUS:ENROLL_STEP1_WAIT");

  int p = -1;
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    if (p == FINGERPRINT_NOFINGER) {
      delay(50);
      continue;
    }
  }

  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) {
    showUI("ENROLL FAILED", "Image 1 blurry", "Try again");
    Serial.println("RESP:ENROLL_FAIL_IMAGE1");
    delay(2000);
    showIdleScreen();
    return;
  }

  // ให้ยกนิ้วออก
  showUI(idHeader, "Step 1 OK!", "Please REMOVE finger");
  Serial.println("STATUS:ENROLL_REMOVE_FINGER");
  delay(1000);
  p = 0;
  while (p != FINGERPRINT_NOFINGER) {
    p = finger.getImage();
  }

  // ขั้นตอนที่ 2: วางนิ้วเดิมซ้ำอีกครั้ง
  showUI(idHeader, "Step 2: Place SAME", "finger again...");
  Serial.println("STATUS:ENROLL_STEP2_WAIT");

  p = -1;
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    if (p == FINGERPRINT_NOFINGER) {
      delay(50);
      continue;
    }
  }

  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) {
    showUI("ENROLL FAILED", "Image 2 blurry", "Try again");
    Serial.println("RESP:ENROLL_FAIL_IMAGE2");
    delay(2000);
    showIdleScreen();
    return;
  }

  // ประมวลผลสร้าง Model และบันทึก
  showUI(idHeader, "Creating model...", "Saving to Flash...");
  p = finger.createModel();
  if (p != FINGERPRINT_OK) {
    showUI("ENROLL FAILED", "Fingerprints differ", "Try again");
    Serial.println("RESP:ENROLL_FAIL_MISMATCH");
    delay(2000);
    showIdleScreen();
    return;
  }

  p = finger.storeModel(id);
  if (p == FINGERPRINT_OK) {
    // บันทึกสำเร็จ: แสดงผลบนหน้าจอ
    char savedMsg[25];
    snprintf(savedMsg, sizeof(savedMsg), "Saved as ID: #%d", id);
    showUI("ENROLL SUCCESS!", savedMsg, "Finger registered!");
    
    Serial.print("RESP:ENROLL_OK ID=");
    Serial.println(id);
    
    delay(3000); // แสดงผลความสำเร็จ 3 วินาที
  } else {
    showUI("ENROLL FAILED", "Flash write error", "Try again");
    Serial.println("RESP:ENROLL_FAIL_STORE");
    delay(2000);
  }

  showIdleScreen();
}

// 3. ลบลายนิ้วมือตาม ID (Delete)
void handleDelete(int id) {
  char idStr[25];
  snprintf(idStr, sizeof(idStr), "Deleting ID #%d...", id);
  showUI("DELETE ID", idStr, "Please wait...");

  uint8_t p = finger.deleteModel(id);
  if (p == FINGERPRINT_OK) {
    // ลบลายนิ้วมือสำเร็จ
    char delSuccess[25];
    snprintf(delSuccess, sizeof(delSuccess), "ID #%d REMOVED", id);
    showUI("DELETE SUCCESS!", delSuccess, "Deleted from database");
    
    Serial.print("RESP:DELETE_OK ID=");
    Serial.println(id);
    delay(2500);
  } else {
    char delFail[25];
    snprintf(delFail, sizeof(delFail), "ID #%d NOT FOUND", id);
    showUI("DELETE FAILED!", delFail, "Check ID number");
    
    Serial.print("RESP:DELETE_FAIL ID=");
    Serial.println(id);
    delay(2500);
  }

  showIdleScreen();
}

// 4. ลบลายนิ้วมือทั้งหมด (Clear All)
void handleClearAll() {
  showUI("CLEAR DATABASE", "Deleting all...", "Please wait...");
  uint8_t p = finger.emptyDatabase();
  if (p == FINGERPRINT_OK) {
    showUI("CLEAR SUCCESS!", "All templates deleted", "Database Empty");
    Serial.println("RESP:CLEAR_OK");
    delay(2500);
  } else {
    showUI("CLEAR FAILED!", "Operation error", "Try again");
    Serial.println("RESP:CLEAR_FAIL");
    delay(2500);
  }
  showIdleScreen();
}

// 5. อ่านจำนวนลายนิ้วมือทั้งหมด (Count)
void handleCount() {
  finger.getTemplateCount();
  char countStr[25];
  snprintf(countStr, sizeof(countStr), "Total: %d templates", finger.templateCount);
  showUI("DATABASE COUNT", countStr, "Enrolled in R307");
  Serial.print("RESP:COUNT=");
  Serial.println(finger.templateCount);
  delay(2500);
  showIdleScreen();
}

// ==========================================
// 8. Setup & Loop
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n[SYSTEM] Starting UNO Q Zephyr Fingerprint & OLED System...");

  // เริ่มต้นหน้าจอ OLED SH1106 ผ่าน Software I2C
  oled.begin();
  showUI("BOOTING...", "Initializing OLED", "SH1106 128x64 OK");
  delay(1000);

  // เริ่มต้นเซนเซอร์ลายนิ้วมือ R307 (57600 baud)
  finger.begin(57600);
  if (finger.verifyPassword()) {
    Serial.println("STATUS:R307_READY");
    showUI("HARDWARE OK", "R307 Sensor Ready", "OLED SH1106 Ready");
    // เปิดโหมดไฟหายใจ (Breathing LED) นุ่มนวลสวยงาม ไม่กระพริบกวนตา
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
  } else {
    Serial.println("STATUS:R307_NOT_FOUND");
    showUI("HARDWARE ERROR", "R307 NOT FOUND!", "Check wiring (Pin 0/1)");
  }
  delay(1500);

  showIdleScreen();
}

void loop() {
  // 1. รับคำสั่ง Command ผ่าน Serial (จาก Server / Web Admin / Serial Monitor)
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd.startsWith("ENROLL ")) {
      int id = cmd.substring(7).toInt();
      handleEnroll(id);
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    } else if (cmd.startsWith("DELETE ")) {
      int id = cmd.substring(7).toInt();
      handleDelete(id);
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    } else if (cmd == "COUNT") {
      handleCount();
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    } else if (cmd == "CLEAR_ALL") {
      handleClearAll();
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    } else if (cmd == "PING") {
      Serial.println("RESP:PONG");
    }
  }

  // 2. Smart Polling ตรวจจับลายนิ้วมืออัตโนมัติ (100% สแกนติดทันทีเมื่อวางนิ้ว)
  int result = scanFingerprint();
  
  if (result == FINGERPRINT_OK) {
    // สแกนสำเร็จ: ไฟติดนิ่งชัดเจน
    finger.LEDcontrol(FINGERPRINT_LED_ON, 0, FINGERPRINT_LED_RED);

    char idStr[25];
    char scoreStr[25];
    snprintf(idStr, sizeof(idStr), "Found ID: #%d", finger.fingerID);
    snprintf(scoreStr, sizeof(scoreStr), "Score: %d", finger.confidence);
    
    showUI("SCAN SUCCESS!", idStr, scoreStr, "ACCESS GRANTED");
    
    Serial.print("EVENT:MATCH ID=");
    Serial.print(finger.fingerID);
    Serial.print(" SCORE=");
    Serial.println(finger.confidence);
    
    delay(2000);
    // รอยกนิ้วออกก่อนเพื่อไม่ให้สแกนซ้ำ
    while (finger.getImage() != FINGERPRINT_NOFINGER) {
      delay(50);
    }
    // กลับสู่โหมดไฟหายใจ Breathing นุ่มนวล
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    showIdleScreen();
  } else if (result == FINGERPRINT_NOTFOUND) {
    // สแกนไม่ผ่าน: ไฟกระพริบเตือน 2 ครั้ง
    finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 2);

    showUI("ACCESS DENIED", "No match found", "Unauthorized finger");
    Serial.println("EVENT:NO_MATCH");
    
    delay(2000);
    // รอยกนิ้วออกก่อนเพื่อไม่ให้สแกนซ้ำ
    while (finger.getImage() != FINGERPRINT_NOFINGER) {
      delay(50);
    }
    // กลับสู่โหมดไฟหายใจ Breathing นุ่มนวล
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    showIdleScreen();
  }

  delay(120); // หน่วงเวลาให้นุ่มนวล ไม่แยงตา
}





