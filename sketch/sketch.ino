#include <Arduino.h>
#include <Adafruit_Fingerprint.h>
#include "thai_font.h"

// ==========================================
// 1. กำหนดขาเชื่อมต่อ Hardware
// ==========================================
#define OLED_SDA_PIN A4
#define OLED_SCL_PIN A5
#define OLED_I2C_ADDR 0x3C

// การเชื่อมต่อเซนเซอร์ลายนิ้วมือ R307 (Hardware Serial1 สำหรับ Uno Q: Pin 0 RX, Pin 1 TX)
#define mySerial Serial1
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

// กำหนดขาปุ่มกด Physical Switch (Active LOW: ขาหนึ่งต่อ Pin อีกขาต่อ GND)
#define BTN_CONFIRM_PIN 2 // ขา D2: ปุ่มกดยืนยันบันทึกเวลา
#define BTN_RESCAN_PIN  3 // ขา D3: ปุ่มกดสแกนใหม่/ยกเลิก




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

  void keepAlive() {
    sendCommand(0xAD); sendCommand(0x8B); // Force DC-DC Charge Pump ON
    sendCommand(0xAF); // Force Display ON (Wake up if browned out)
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

  void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint8_t color = 1) {
    for (int16_t i = 0; i < h; i++) drawHLine(x, y + i, w, color);
  }

  // ตรวจสอบประเภทอักขระไทย (สระบน/ล่าง/วรรณยุกต์)
  bool isUpperDiacritic(uint16_t u) {
    return (u >= 0x0E31 && u <= 0x0E37) || (u >= 0x0E47 && u <= 0x0E4C);
  }
  bool isLowerDiacritic(uint16_t u) {
    return (u == 0x0E38 || u == 0x0E39 || u == 0x0E3A);
  }

  void drawThaiGlyph(int16_t x, int16_t y, uint16_t u, uint8_t color = 1) {
    if (u < 0x0E01 || u > 0x0E4C) return;
    int idx = u - 0x0E01;
    for (int r = 0; r < 12; r++) {
      uint8_t rowByte = THAI_FONT[idx][r];
      for (int c = 0; c < 8; c++) {
        if (rowByte & (1 << (7 - c))) {
          drawPixel(x + c, y + r, color);
        }
      }
    }
  }

  void drawStringUTF8(int16_t x, int16_t y, const char* str, uint8_t color = 1) {
    int curX = x;
    int curY = y;
    int len = strlen(str);
    int lastCharX = x;
    bool prevHasUpper = false;

    for (int i = 0; i < len; i++) {
      uint8_t b1 = (uint8_t)str[i];
      if (b1 < 128) {
        // Standard ASCII (0-9, A-Z, space, dash)
        if (b1 == ' ') {
          curX += 4;
          continue;
        }
        drawChar(curX, curY + 2, (char)b1, color);
        lastCharX = curX;
        curX += 6;
        prevHasUpper = false;
      } else if (b1 == 0xE0 && i + 2 < len) {
        // Thai UTF-8 (3 bytes)
        uint8_t b2 = (uint8_t)str[i + 1];
        uint8_t b3 = (uint8_t)str[i + 2];
        i += 2;
        uint16_t u = ((uint16_t)(b2 & 0x0F) << 6) | (b3 & 0x3F);
        u |= 0x0E00;

        bool isUpperVowel = (u >= 0x0E31 && u <= 0x0E37) || (u == 0x0E47);
        bool isTone = (u >= 0x0E48 && u <= 0x0E4C);
        bool isLower = (u == 0x0E38 || u == 0x0E39);

        if (isUpperVowel) {
          drawThaiGlyph(lastCharX, curY - 2, u, color);
          prevHasUpper = true;
        } else if (isTone) {
          int yOff = prevHasUpper ? (curY - 4) : (curY - 2);
          drawThaiGlyph(lastCharX, yOff, u, color);
        } else if (isLower) {
          drawThaiGlyph(lastCharX, curY + 2, u, color);
        } else {
          drawThaiGlyph(curX, curY, u, color);
          lastCharX = curX;
          curX += 7;
          prevHasUpper = false;
        }
      }
    }
  }

  void loadBitmapChunk(uint8_t part, const char* hexData) {
    if (part > 3) return;
    int offset = part * 256;
    int hexLen = strlen(hexData);
    for (int i = 0; i < hexLen && i < 512; i += 2) {
      char c1 = hexData[i];
      char c2 = hexData[i + 1];
      uint8_t b1 = (c1 >= '0' && c1 <= '9') ? (c1 - '0') : ((c1 >= 'A' && c1 <= 'F') ? (c1 - 'A' + 10) : ((c1 >= 'a' && c1 <= 'f') ? (c1 - 'a' + 10) : 0));
      uint8_t b2 = (c2 >= '0' && c2 <= '9') ? (c2 - '0') : ((c2 >= 'A' && c2 <= 'F') ? (c2 - 'A' + 10) : ((c2 >= 'a' && c2 <= 'f') ? (c2 - 'a' + 10) : 0));
      buffer[offset + (i / 2)] = (b1 << 4) | b2;
    }
  }

  void clearBuffer() {
    memset(buffer, 0, sizeof(buffer));
  }

  int loadFrameChunk(int offset, const char* hexData) {
    if (offset < 0 || offset >= 1024) return offset;
    int hexLen = strlen(hexData);
    int byteLen = hexLen / 2;
    for (int i = 0; i < byteLen && (offset + i) < 1024; i++) {
      char c1 = hexData[i * 2];
      char c2 = hexData[i * 2 + 1];
      uint8_t b1 = (c1 >= '0' && c1 <= '9') ? (c1 - '0') : ((c1 >= 'A' && c1 <= 'F') ? (c1 - 'A' + 10) : ((c1 >= 'a' && c1 <= 'f') ? (c1 - 'a' + 10) : 0));
      uint8_t b2 = (c2 >= '0' && c2 <= '9') ? (c2 - '0') : ((c2 >= 'A' && c2 <= 'F') ? (c2 - 'A' + 10) : ((c2 >= 'a' && c2 <= 'f') ? (c2 - 'a' + 10) : 0));
      buffer[offset + i] = (b1 << 4) | b2;
    }
    int nextOffset = offset + byteLen;
    if (nextOffset >= 1024) {
      display();
    }
    return nextOffset;
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
// 5. ฟังก์ชันแสดงสถานะ UI บนหน้าจอ OLED (Clean Standard UI)
// ==========================================
void showUI(const char* title, const char* line1, const char* line2 = "", const char* line3 = "") {
  oled.clear();
  oled.drawRect(0, 0, 128, 64);
  
  // แถบหัวข้อ Title
  oled.fillRect(0, 0, 128, 14, 1);
  oled.drawString(8, 3, title, 0);

  if (line1 && strlen(line1) > 0) oled.drawString(8, 20, line1);
  if (line2 && strlen(line2) > 0) oled.drawString(8, 34, line2);
  if (line3 && strlen(line3) > 0) oled.drawString(8, 48, line3);

  oled.display();
}

// การ์ดแสดงผลเมื่อสแกนผ่าน (Fallback เมื่อไม่มีบิตแมป)
void showUserCard(const char* stuId, const char* name) {
  oled.clear();
  oled.drawRect(0, 0, 128, 64);

  oled.fillRect(0, 0, 128, 14, 1);
  oled.drawString(10, 3, "ACCESS GRANTED", 0);

  oled.drawString(6, 20, "ID: ");
  oled.drawString(30, 20, stuId ? stuId : "-");

  oled.drawString(6, 34, name ? name : "Student");

  oled.drawHLine(4, 48, 120);
  oled.drawString(14, 51, "CHECK-IN SUCCESS");

  oled.display();
}

void showIdleScreen() {
  oled.clear();
  oled.drawRect(0, 0, 128, 64);

  oled.fillRect(0, 0, 128, 14, 1);
  oled.drawString(16, 3, "FINGERPRINT IOT", 0);

  oled.drawString(16, 24, "READY FOR SCAN");
  oled.drawHLine(4, 44, 120);
  oled.drawString(12, 49, "Place your finger");

  oled.display();
}

// ==========================================
// ==========================================
// 6. ฟังก์ชันจัดการลายนิ้วมือ (Continuous Polling เหมือน test.ino)
// ==========================================

// ฟังก์ชันสแกนภาพและค้นหาลายนิ้วมือใน Buffer 2 (Tier 1 Flash Search)
int scanFingerprint() {
  uint8_t p = finger.getImage();
  if (p != FINGERPRINT_OK) return p;

  // แปลงภาพลายนิ้วมือเป็น Character File เก็บไว้ใน Buffer 2 (เพื่อคงไว้เปรียบเทียบใน Tier 2 ได้)
  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) return p;

  // ค้นหา ID ที่ตรงกันใน Flash ออนบอร์ด (Tier 1) โดยใช้ Buffer 2
  p = finger.fingerSearch(2);
  if (p == FINGERPRINT_OK) {
    return FINGERPRINT_OK;
  } else if (p == FINGERPRINT_NOTFOUND) {
    return FINGERPRINT_NOTFOUND;
  } else {
    return p;
  }
}


// ==========================================
// 6.1 ฟังก์ชันสำรองข้อมูล (Backup) และกู้คืนลายนิ้วมือ (Restore)
// ==========================================

// ส่งข้อมูล Data Packet 256 bytes ไปยัง R307
void sendFingerprintDataPacket(uint8_t type, const uint8_t* data, uint16_t length) {
  mySerial.write((uint8_t)0xEF);
  mySerial.write((uint8_t)0x01);
  mySerial.write((uint8_t)0xFF);
  mySerial.write((uint8_t)0xFF);
  mySerial.write((uint8_t)0xFF);
  mySerial.write((uint8_t)0xFF);
  mySerial.write(type);

  uint16_t packetLen = length + 2;
  mySerial.write((uint8_t)(packetLen >> 8));
  mySerial.write((uint8_t)(packetLen & 0xFF));

  uint16_t checksum = type + (uint8_t)(packetLen >> 8) + (uint8_t)(packetLen & 0xFF);
  for (uint16_t i = 0; i < length; i++) {
    mySerial.write(data[i]);
    checksum += data[i];
  }

  mySerial.write((uint8_t)(checksum >> 8));
  mySerial.write((uint8_t)(checksum & 0xFF));
}

// ส่งคำสั่ง DownChar (0x09) ไปยัง Buffer 1 ของ R307 เพื่อเตรียมรับข้อมูล Template
bool sendDownCharCommand() {
  while (mySerial.available()) mySerial.read();

  mySerial.write((uint8_t)0xEF);
  mySerial.write((uint8_t)0x01);
  mySerial.write((uint8_t)0xFF);
  mySerial.write((uint8_t)0xFF);
  mySerial.write((uint8_t)0xFF);
  mySerial.write((uint8_t)0xFF);
  mySerial.write((uint8_t)0x01); // Command packet
  mySerial.write((uint8_t)0x00); // Length high
  mySerial.write((uint8_t)0x04); // Length low
  mySerial.write((uint8_t)0x09); // FINGERPRINT_DOWNLOAD (DownChar)
  mySerial.write((uint8_t)0x01); // Buffer 1
  mySerial.write((uint8_t)0x00); // Checksum high
  mySerial.write((uint8_t)0x0F); // Checksum low

  uint32_t start = millis();
  uint8_t ackBuf[12];
  int idx = 0;
  while (idx < 12 && (millis() - start) < 1500) {
    if (mySerial.available()) {
      ackBuf[idx++] = mySerial.read();
    }
  }

  if (idx >= 12 && ackBuf[6] == 0x07 && ackBuf[9] == 0x00) {
    return true;
  }
  return false;
}

uint8_t hexCharToByte(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return 0;
}

// ดึง Template 512 Bytes จาก R307 แล้วส่งออกทาง Serial เป็น HEX
bool extractAndSendTemplate(int id) {
  while (mySerial.available()) mySerial.read();

  // 1. โหลดข้อมูลโมเดลจาก Flash ID เข้า Buffer 1 ของ R307 ก่อนเสมอ
  uint8_t p = finger.loadModel(id);
  if (p != FINGERPRINT_OK) {
    Serial.print("RESP:BACKUP_FAIL ID=");
    Serial.print(id);
    Serial.println(" ERR=NOT_FOUND_IN_SENSOR");
    return false;
  }

  // 2. สั่ง R307 ให้อัปโหลด Template จาก Buffer 1 ออกมา
  p = finger.getModel();
  if (p != FINGERPRINT_OK) {
    Serial.print("RESP:BACKUP_FAIL ID=");
    Serial.print(id);
    Serial.println(" ERR=GET_MODEL_FAILED");
    return false;
  }

  uint8_t rawBuf[700];
  int count = 0;
  uint32_t starttime = millis();
  while (count < 700 && (millis() - starttime) < 4000) {
    if (mySerial.available()) {
      rawBuf[count++] = mySerial.read();
    }
  }

  uint8_t templateData[512];
  memset(templateData, 0, sizeof(templateData));
  int totalBytes = 0;
  int pos = 0;

  while (pos < count - 9 && totalBytes < 512) {
    if (rawBuf[pos] == 0xEF && rawBuf[pos + 1] == 0x01) {
      uint8_t pktType = rawBuf[pos + 6];
      uint16_t pktLen = (rawBuf[pos + 7] << 8) | rawBuf[pos + 8];
      uint16_t dataLen = (pktLen >= 2) ? (pktLen - 2) : 0;
      if (pos + 9 + dataLen <= count && (pktType == 0x02 || pktType == 0x08)) {
        int toCopy = min((int)dataLen, 512 - totalBytes);
        memcpy(templateData + totalBytes, rawBuf + pos + 9, toCopy);
        totalBytes += toCopy;
        pos += (9 + pktLen);
        continue;
      }
    }
    pos++;
  }

  if (totalBytes < 512) {
    Serial.print("RESP:BACKUP_FAIL ID=");
    Serial.print(id);
    Serial.print(" ERR=INCOMPLETE_DATA_");
    Serial.println(totalBytes);
    return false;
  }

  Serial.print("TEMPLATE:ID=");
  Serial.print(id);
  Serial.print(" DATA=");
  for (int i = 0; i < 512; i++) {
    if (templateData[i] < 0x10) Serial.print('0');
    Serial.print(templateData[i], HEX);
  }
  Serial.println();

  return true;
}

int restoreTargetId = 0;
uint32_t restoreStartTime = 0;

// เริ่มต้นเตรียม R307 สำหรับเขียน Template คืน
void handleRestoreInit(int id) {
  restoreTargetId = id;
  restoreStartTime = millis();
  char restoreMsg[25];
  snprintf(restoreMsg, sizeof(restoreMsg), "Restoring ID #%d...", id);
  showUI("RESTORE TEMPLATE", restoreMsg, "Preparing sensor...");

  if (sendDownCharCommand()) {
    Serial.print("RESP:RESTORE_READY ID=");
    Serial.println(id);
  } else {
    Serial.print("RESP:RESTORE_FAIL ID=");
    Serial.print(id);
    Serial.println(" ERR=DOWNCHAR_REJECTED");
    showUI("RESTORE FAILED", "Sensor rejected write", "Try again");
    delay(1500);
    showIdleScreen();
    restoreTargetId = 0;
  }
}

// รับข้อมูลทีละ Chunk (128 Bytes / 256 HEX chars) และส่งให้ R307
void handleRestoreChunk(int chunkNum, const String& hexChunk) {
  if (restoreTargetId <= 0) {
    Serial.println("RESP:RESTORE_FAIL ERR=NO_TARGET_ID");
    return;
  }

  uint8_t buf[128];
  memset(buf, 0, sizeof(buf));
  int hexLen = hexChunk.length();
  int byteLen = hexLen / 2;
  if (byteLen > 128) byteLen = 128;

  for (int i = 0; i < byteLen; i++) {
    char h = hexChunk.charAt(i * 2);
    char l = hexChunk.charAt(i * 2 + 1);
    buf[i] = (hexCharToByte(h) << 4) | hexCharToByte(l);
  }

  uint8_t pktType = (chunkNum == 4) ? 0x08 : 0x02;
  sendFingerprintDataPacket(pktType, buf, 128);

  if (chunkNum == 4) {
    delay(60);
    uint8_t p = finger.storeModel(restoreTargetId);
    if (p == FINGERPRINT_OK) {
      char okMsg[25];
      snprintf(okMsg, sizeof(okMsg), "ID #%d Restored!", restoreTargetId);
      showUI("RESTORE SUCCESS", okMsg, "Saved to R307");
      Serial.print("RESP:RESTORE_OK ID=");
      Serial.println(restoreTargetId);
    } else {
      Serial.print("RESP:RESTORE_FAIL ID=");
      Serial.print(restoreTargetId);
      Serial.print(" ERR=STORE_FAILED_");
      Serial.println(p);
      showUI("RESTORE FAILED", "Flash write error", "Check sensor");
    }
    restoreTargetId = 0;
    delay(1500);
    showIdleScreen();
  } else {
    Serial.print("RESP:CHUNK_ACK PART=");
    Serial.println(chunkNum);
  }
}

// ==========================================
// 6.2 ฟังก์ชันสำหรับค้นหา Tier 2 (เปรียบเทียบกับ Candidate จาก Database)
// ==========================================
bool tier2Searching = false;
uint32_t tier2StartTime = 0;
int tier2CandidateId = 0;

// ส่งคำสั่ง 0x03 เพื่อเปรียบเทียบลายนิ้วมือ Buffer 1 (Candidate) กับ Buffer 2 (Scanned Finger)
uint8_t matchCharBuffers(uint16_t &score) {
  while (mySerial.available()) mySerial.read();

  // Command 0x03: EF 01 FF FF FF FF 01 00 03 03 00 07
  uint8_t packet[] = {0xEF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0x01, 0x00, 0x03, 0x03, 0x00, 0x07};
  mySerial.write(packet, sizeof(packet));

  uint8_t reply[14];
  uint32_t start = millis();
  int idx = 0;
  while ((millis() - start) < 200 && idx < 14) {
    if (mySerial.available()) {
      reply[idx++] = mySerial.read();
    }
  }

  if (idx >= 12 && reply[0] == 0xEF && reply[1] == 0x01 && reply[6] == 0x07) {
    uint8_t ack = reply[9];
    score = ((uint16_t)reply[10] << 8) | reply[11];
    return ack; // 0x00 = Match, 0x08 = Mismatch
  }
  return 0xFF;
}

void handleCompareInit(int id) {
  tier2CandidateId = id;
  if (sendDownCharCommand()) {
    Serial.print("RESP:COMPARE_READY ID=");
    Serial.println(id);
  } else {
    Serial.print("RESP:COMPARE_FAIL ID=");
    Serial.print(id);
    Serial.println(" ERR=DOWNCHAR_FAILED");
  }
}

void handleCompareChunk(int chunkNum, const String& hexChunk) {
  uint8_t buf[128];
  memset(buf, 0, sizeof(buf));
  int hexLen = hexChunk.length();
  int byteLen = hexLen / 2;
  if (byteLen > 128) byteLen = 128;

  for (int i = 0; i < byteLen; i++) {
    char h = hexChunk.charAt(i * 2);
    char l = hexChunk.charAt(i * 2 + 1);
    buf[i] = (hexCharToByte(h) << 4) | hexCharToByte(l);
  }

  uint8_t pktType = (chunkNum == 4) ? 0x08 : 0x02;
  sendFingerprintDataPacket(pktType, buf, 128);

  if (chunkNum == 4) {
    delay(20);
    uint16_t score = 0;
    uint8_t ack = matchCharBuffers(score);
    if (ack == 0x00 && score >= 45) {
      // ตรวจพบว่าตรงกันใน Tier 2!
      tier2Searching = false;
      finger.LEDcontrol(FINGERPRINT_LED_ON, 0, FINGERPRINT_LED_RED);

      char idStr[25];
      char scoreStr[25];
      snprintf(idStr, sizeof(idStr), "Found ID: #%d", tier2CandidateId);
      snprintf(scoreStr, sizeof(scoreStr), "Score: %d (Tier 2)", score);
      showUI("SCAN SUCCESS!", idStr, scoreStr, "ACCESS GRANTED");

      Serial.print("RESP:TIER2_MATCH ID=");
      Serial.print(tier2CandidateId);
      Serial.print(" SCORE=");
      Serial.println(score);

      delay(1800);
      while (finger.getImage() != FINGERPRINT_NOFINGER) {
        delay(50);
      }
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
      showIdleScreen();
    } else {
      // ลายนิ้วมือไม่ตรงกัน ส่งผลกลับไปยัง Server เพื่อตรวจ candidate ถัดไป
      Serial.print("RESP:TIER2_MISMATCH ID=");
      Serial.println(tier2CandidateId);
    }
  } else {
    Serial.print("RESP:COMPARE_CHUNK_ACK PART=");
    Serial.println(chunkNum);
  }
}

// ตรวจสอบคำสั่งยกเลิก (CANCEL) หรือ Timeout ระหว่างขั้นตอนลงทะเบียนนิ้ว
bool checkEnrollCancelOrTimeout(int id, uint32_t startTime, uint32_t timeoutMs = 20000) {
  if (Serial.available()) {
    String inCmd = Serial.readStringUntil('\n');
    inCmd.trim();
    if (inCmd.startsWith("CANCEL")) {
      showUI("ENROLL CANCELLED", "Cancelled by user", "Returning to idle");
      Serial.print("RESP:ENROLL_CANCELLED ID=");
      Serial.println(id);
      delay(1500);
      showIdleScreen();
      return true; // ยกเลิกสำเร็จ
    }
  }

  if (millis() - startTime > timeoutMs) {
    showUI("ENROLL TIMEOUT", "No finger placed", "Try again later");
    Serial.print("RESP:ENROLL_FAIL_TIMEOUT ID=");
    Serial.println(id);
    delay(2000);
    showIdleScreen();
    return true; // หมดเวลา
  }

  return false;
}

// 2. บันทึกลายนิ้วมือใหม่ (Enroll พร้อมระบบ Cancel & Timeout)
void handleEnroll(int id) {
  if (id < 1 || id > 1000) {
    showUI("ENROLL ERROR", "Invalid ID (1-1000)");
    Serial.println("RESP:ENROLL_INVALID_ID");
    delay(2000);
    showIdleScreen();
    return;
  }

  char idHeader[25];
  snprintf(idHeader, sizeof(idHeader), "ENROLL ID #%d", id);

  // ขั้นตอนที่ 1: สแกนครั้งแรก (พร้อม Timeout 20 วิ และรับคำสั่ง CANCEL_ENROLL)
  showUI(idHeader, "Step 1: Put finger", "on sensor now...");
  Serial.println("STATUS:ENROLL_STEP1_WAIT");

  uint32_t step1Start = millis();
  int p = -1;
  while (p != FINGERPRINT_OK) {
    if (checkEnrollCancelOrTimeout(id, step1Start, 20000)) return;

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
  delay(500);
  uint32_t removeStart = millis();
  p = 0;
  while (p != FINGERPRINT_NOFINGER) {
    if (checkEnrollCancelOrTimeout(id, removeStart, 10000)) return;
    p = finger.getImage();
    delay(50);
  }

  // ขั้นตอนที่ 2: วางนิ้วเดิมซ้ำอีกครั้ง (พร้อม Timeout 20 วิ และรับคำสั่ง CANCEL_ENROLL)
  showUI(idHeader, "Step 2: Place SAME", "finger again...");
  Serial.println("STATUS:ENROLL_STEP2_WAIT");

  uint32_t step2Start = millis();
  p = -1;
  while (p != FINGERPRINT_OK) {
    if (checkEnrollCancelOrTimeout(id, step2Start, 20000)) return;

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
    showUI("ENROLL SUCCESS!", savedMsg, "Backing up to DB...");
    
    Serial.print("RESP:ENROLL_OK ID=");
    Serial.println(id);

    // ดึง Template 512 Bytes ส่งขึ้น Database ทันที
    extractAndSendTemplate(id);
    
    delay(2000);
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
  Serial.setTimeout(50);
  delay(1000);
  Serial.println("\n[SYSTEM] Starting UNO Q Zephyr Fingerprint & OLED System...");

  // กำหนดขาปุ่มกด Physical Switch (Active LOW, Internal Pullup)
  pinMode(BTN_CONFIRM_PIN, INPUT_PULLUP);
  pinMode(BTN_RESCAN_PIN, INPUT_PULLUP);

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

bool handleFrameReceive() {
  oled.clearBuffer();
  uint32_t lastActivity = millis();
  while (millis() - lastActivity < 2000) {
    if (Serial.available()) {
      lastActivity = millis();
      String line = Serial.readStringUntil('\n');
      line.trim();
      if (line.startsWith("FRAME_DATA ")) {
        int space1 = 11;
        int space2 = line.indexOf(' ', space1);
        if (space2 > 0) {
          int offset = line.substring(space1, space2).toInt();
          String hex = line.substring(space2 + 1);
          hex.trim();
          oled.loadFrameChunk(offset, hex.c_str());
        }
      } else if (line == "FRAME_END") {
        oled.display();
        Serial.println("FRAME_DONE");
        return true;
      }
    }
  }
  return false;
}

void loop() {
  // 1. รับคำสั่ง Command ผ่าน Serial (จาก Server / Web Admin / Serial Monitor)
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() == 0) return;

    if (!cmd.startsWith("FRAME_DATA") && !cmd.startsWith("FRAME_START")) {
      Serial.print("ECHO:");
      Serial.println(cmd.substring(0, 20));
    }

    if (cmd.startsWith("ENROLL ")) {
      int id = cmd.substring(7).toInt();
      handleEnroll(id);
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    } else if (cmd.startsWith("BACKUP ")) {
      int id = cmd.substring(7).toInt();
      extractAndSendTemplate(id);
    } else if (cmd.startsWith("RESTORE_INIT ")) {
      int id = cmd.substring(13).toInt();
      handleRestoreInit(id);
    } else if (cmd.startsWith("RESTORE_CHUNK ")) {
      int spaceIdx = cmd.indexOf(' ', 14);
      if (spaceIdx > 0) {
        int part = cmd.substring(14, spaceIdx).toInt();
        String hexChunk = cmd.substring(spaceIdx + 1);
        hexChunk.trim();
        handleRestoreChunk(part, hexChunk);
      }
    } else if (cmd.startsWith("COMPARE_INIT ")) {
      int id = cmd.substring(13).toInt();
      handleCompareInit(id);
    } else if (cmd.startsWith("COMPARE_CHUNK ")) {
      int spaceIdx = cmd.indexOf(' ', 14);
      if (spaceIdx > 0) {
        int part = cmd.substring(14, spaceIdx).toInt();
        String hexChunk = cmd.substring(spaceIdx + 1);
        hexChunk.trim();
        handleCompareChunk(part, hexChunk);
      }
    } else if (cmd.startsWith("CANCEL_TIER2")) {
      tier2Searching = false;
      finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 2);
      showUI("ACCESS DENIED", "No match in DB", "Unauthorized finger");
      Serial.println("EVENT:NO_MATCH");
      delay(1500);
      showIdleScreen();
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
    } else if (cmd.startsWith("FRAME_START")) {
      handleFrameReceive();
    } else if (cmd == "PING") {
      Serial.println("RESP:PONG");
    }
  }

  // หากอยู่ในระหว่าง Restore ลายนิ้วมือ ห้ามสแกนนิ้วแทรกแซง UART ของ R307
  if (restoreTargetId > 0) {
    if (millis() - restoreStartTime > 10000) {
      restoreTargetId = 0;
      Serial.println("RESP:RESTORE_FAIL ERR=TIMEOUT");
      showIdleScreen();
    }
    delay(5);
    return;
  }

  // หากอยู่ในระหว่างค้นหา Tier 2 ตรวจสอบ Timeout
  if (tier2Searching) {
    if (millis() - tier2StartTime > 5500) {
      tier2Searching = false;
      finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 2);
      showUI("ACCESS DENIED", "ไม่พบลายนิ้วมือ", "ไม่มีสิทธิ์เข้าถึง");
      Serial.println("EVENT:NO_MATCH");
      delay(1500);
      showIdleScreen();
    }
    delay(5);
    return;
  }

  // 2. Smart Polling ตรวจจับลายนิ้วมืออัตโนมัติ (100% สแกนติดทันทีเมื่อวางนิ้ว)
  int result = scanFingerprint();
  
  if (result == FINGERPRINT_OK) {
    // สแกนสำเร็จ: ไฟติดนิ่งชัดเจน
    finger.LEDcontrol(FINGERPRINT_LED_ON, 0, FINGERPRINT_LED_RED);

    Serial.print("EVENT:MATCH ID=");
    Serial.print(finger.fingerID);
    Serial.print(" SCORE=");
    Serial.println(finger.confidence);

    uint32_t waitStart = millis();
    bool gotCard = false;
    while (millis() - waitStart < 2500) {
      if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.startsWith("FRAME_START")) {
          gotCard = handleFrameReceive();
          if (gotCard) break;
        }
      }
      delay(5);
    }

    if (!gotCard) {
      char idStr[25];
      snprintf(idStr, sizeof(idStr), "ID Slot: #%d", finger.fingerID);
      showUI("CHECK-IN MATCH", idStr, "[D2:OK | D3:Cancel]");
    }

    // ==========================================
    // ตรวจจับปุ่มกด: D2 (Confirm) หรือ D3 (Rescan) หรือ Timeout 10 วินาที
    // ==========================================
    // รอปล่อยปุ่มก่อนเริ่มตรวจจับ ป้องกันการกดค้าง
    uint32_t releaseWait = millis();
    while ((digitalRead(BTN_CONFIRM_PIN) == LOW || digitalRead(BTN_RESCAN_PIN) == LOW) && (millis() - releaseWait < 600)) {
      delay(10);
    }

    uint32_t btnWaitStart = millis();
    int btnAction = 0; // 0 = Timeout (Auto-Cancel), 1 = Confirm (D2), 2 = Rescan (D3)

    while (millis() - btnWaitStart < 10000) {
      // ตรวจจับปุ่ม D2 (Confirm - Active LOW)
      if (digitalRead(BTN_CONFIRM_PIN) == LOW) {
        delay(30); // Debounce
        if (digitalRead(BTN_CONFIRM_PIN) == LOW) {
          btnAction = 1;
          break;
        }
      }
      // ตรวจจับปุ่ม D3 (Rescan - Active LOW)
      if (digitalRead(BTN_RESCAN_PIN) == LOW) {
        delay(30); // Debounce
        if (digitalRead(BTN_RESCAN_PIN) == LOW) {
          btnAction = 2;
          break;
        }
      }
      delay(10);
    }

    if (btnAction == 1) {
      // กดยืนยัน D2: ส่ง EVENT:CONFIRMED ให้ Linux บันทึกลง Cloud
      Serial.print("EVENT:CONFIRMED ID=");
      Serial.print(finger.fingerID);
      Serial.print(" SCORE=");
      Serial.println(finger.confidence);

      // รอรับ Frame ยืนยันสำเร็จจาก Linux
      uint32_t ackWait = millis();
      while (millis() - ackWait < 2000) {
        if (Serial.available()) {
          String line = Serial.readStringUntil('\n');
          line.trim();
          if (line.startsWith("FRAME_START")) {
            handleFrameReceive();
            break;
          }
        }
        delay(5);
      }
      delay(3500); // ค้างหน้าจอยืนยันสำเร็จ 3.5 วินาที ให้อ่านชัดเจน
    } else if (btnAction == 2) {
      // กดสแกนใหม่ D3: ส่ง EVENT:CANCELLED
      Serial.print("EVENT:CANCELLED ID=");
      Serial.println(finger.fingerID);

      // รอรับ Frame แจ้งยกเลิกจาก Linux
      uint32_t ackWait = millis();
      while (millis() - ackWait < 2000) {
        if (Serial.available()) {
          String line = Serial.readStringUntil('\n');
          line.trim();
          if (line.startsWith("FRAME_START")) {
            handleFrameReceive();
            break;
          }
        }
        delay(5);
      }
      delay(3000); // ค้างหน้าจอยกเลิก 3.0 วินาที
    } else {
      // หมดเวลา 10 วินาที: ส่ง EVENT:TIMEOUT (Auto-Cancel)
      Serial.println("EVENT:TIMEOUT");

      uint32_t ackWait = millis();
      while (millis() - ackWait < 2000) {
        if (Serial.available()) {
          String line = Serial.readStringUntil('\n');
          line.trim();
          if (line.startsWith("FRAME_START")) {
            handleFrameReceive();
            break;
          }
        }
        delay(5);
      }
      delay(3000); // ค้างหน้าจอหมดเวลา 3.0 วินาที
    }

    // รอยกนิ้วออกก่อนเพื่อไม่ให้สแกนซ้ำ
    while (finger.getImage() != FINGERPRINT_NOFINGER) {
      delay(50);
    }
    // กลับสู่โหมดไฟหายใจ Breathing นุ่มนวล
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    Serial.println("EVENT:IDLE");
    showIdleScreen();
  } else if (result == FINGERPRINT_NOTFOUND) {
    // Tier 1 Flash ไม่พบ: เริ่มต้นเข้าสู่โหมดค้นหา Tier 2 ใน Database
    tier2Searching = true;
    tier2StartTime = millis();
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 80, FINGERPRINT_LED_RED);
    showUI("SEARCHING DB...", "Checking Tier 2...", "Please wait...");
    Serial.println("EVENT:TIER1_NO_MATCH");
  }

  // ป้องกันจอ OLED เข้าสู่ Sleep Mode หรือไฟตก (OLED Keep-Alive Watchdog)
  static unsigned long lastKeepAlive = 0;
  if (millis() - lastKeepAlive > 3000) {
    lastKeepAlive = millis();
    oled.keepAlive();
  }

  delay(120); // หน่วงเวลาให้นุ่มนวล ไม่แยงตา
}





