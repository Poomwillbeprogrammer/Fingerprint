#ifndef ST7735_TFT_H
#define ST7735_TFT_H

#include <Arduino.h>

// ==========================================
// 1. ขนาดความละเอียดจอ 1.8" TFT SPI แนวนอน (160x128 Landscape)
// ==========================================
#define TFT_WIDTH     160
#define TFT_HEIGHT    128
#define TFT_BUF_SIZE  (TFT_WIDTH * TFT_HEIGHT / 8) // 2560 Bytes (1-bit Horizontal Raster)

// โทนสี 16-bit RGB565 มาตรฐาน (อิงตามอัตลักษณ์ RMUTL Lanna Golden Brown ใน DESIGN.md)
#define TFT_BLACK       0x0000 // ดำสนิท (#000000)
#define TFT_DARK        0x0821 // Deep Void Espresso (#0c0a09)
#define TFT_SURFACE     0x18C3 // Warm Stone Surface (#1c1917)
#define TFT_WHITE       0xFFFF // Pure Crisp White (#ffffff)
#define TFT_GOLD        0xFD20 // Lanna Royal Gold (#f59e0b)
#define TFT_AMBER       0xFBE0 // Lanna Solar Amber (#fbbf24)
#define TFT_BRONZE      0xD3A0 // Lanna Deep Bronze (#b45309)
#define TFT_GREEN       0x15D0 // Bio Emerald (#10b981)
#define TFT_RED         0xF9F8 // Alert Crimson (#f43f5e)
#define TFT_CYAN        0x3DFE // Sky Blue Confirm (#38bdf8 สำหรับปุ่มฟ้า D2)
#define TFT_GRAY        0xAD55 // Text Muted Silver (#a8a29e)
#define TFT_BORDER      0x4440 // Border Stone (#44403c)

// ==========================================
// 2. ตารางฟอนต์มาตรฐาน 5x7 ASCII
// ==========================================
static const uint8_t FONT5x7[][5] = {
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
// 3. ไดรเวอร์จอ 1.8" TFT SPI 128x160 (ST7735 v1.1)
// ==========================================
class ST7735_TFT {
private:
  int8_t _cs, _dc, _rst, _mosi, _sck, _blk;
  uint16_t _width, _height;
  bool _detected;
  uint8_t buffer[TFT_BUF_SIZE]; // 2560 Bytes (128x160 1-bit Monochrome Horizontal Buffer)

  inline void writeByte(uint8_t b) {
    for (uint8_t i = 0; i < 8; i++) {
      if (b & 0x80) digitalWrite(_mosi, HIGH);
      else digitalWrite(_mosi, LOW);
      digitalWrite(_sck, HIGH);
      b <<= 1;
      digitalWrite(_sck, LOW);
    }
  }

  void writeCommand(uint8_t cmd) {
    digitalWrite(_dc, LOW);
    digitalWrite(_cs, LOW);
    writeByte(cmd);
    digitalWrite(_cs, HIGH);
  }

  void writeData(uint8_t data) {
    digitalWrite(_dc, HIGH);
    digitalWrite(_cs, LOW);
    writeByte(data);
    digitalWrite(_cs, HIGH);
  }

  void writeData16(uint16_t data) {
    digitalWrite(_dc, HIGH);
    digitalWrite(_cs, LOW);
    writeByte(data >> 8);
    writeByte(data & 0xFF);
    digitalWrite(_cs, HIGH);
  }

public:
  ST7735_TFT(int8_t cs, int8_t dc, int8_t rst, int8_t mosi, int8_t sck, int8_t blk = -1)
    : _cs(cs), _dc(dc), _rst(rst), _mosi(mosi), _sck(sck), _blk(blk),
      _width(TFT_WIDTH), _height(TFT_HEIGHT), _detected(false) {
    memset(buffer, 0, sizeof(buffer));
  }

  bool isConnected() {
    return _detected;
  }

  bool isDetected() const {
    return _detected;
  }

  void setAddrWindow(uint8_t x0, uint8_t y0, uint8_t x1, uint8_t y1) {
    writeCommand(0x2A); // CASET (Column Address Set)
    digitalWrite(_dc, HIGH);
    digitalWrite(_cs, LOW);
    writeByte(0x00); writeByte(x0);
    writeByte(0x00); writeByte(x1);
    digitalWrite(_cs, HIGH);

    writeCommand(0x2B); // RASET (Row Address Set)
    digitalWrite(_dc, HIGH);
    digitalWrite(_cs, LOW);
    writeByte(0x00); writeByte(y0);
    writeByte(0x00); writeByte(y1);
    digitalWrite(_cs, HIGH);

    writeCommand(0x2C); // RAMWR (Memory Write)
  }

  void begin() {
    pinMode(_cs, OUTPUT);
    pinMode(_dc, OUTPUT);
    pinMode(_mosi, OUTPUT);
    pinMode(_sck, OUTPUT);
    digitalWrite(_cs, HIGH);
    digitalWrite(_dc, HIGH);
    digitalWrite(_sck, LOW);

    if (_rst >= 0) {
      pinMode(_rst, OUTPUT);
      digitalWrite(_rst, HIGH);
      delay(10);
      digitalWrite(_rst, LOW);
      delay(20);
      digitalWrite(_rst, HIGH);
      delay(150);
    }

    if (_blk >= 0) {
      pinMode(_blk, OUTPUT);
      digitalWrite(_blk, HIGH);
    }

    // ลำดับ Init Command สำหรับ ST7735 (1.8 TFT SPI 128x160 v1.1)
    writeCommand(0x01); // Software Reset
    delay(150);

    writeCommand(0x11); // Sleep Out
    delay(200);

    // Frame Rate Control
    writeCommand(0xB1);
    writeData(0x01); writeData(0x2C); writeData(0x2D);
    writeCommand(0xB2);
    writeData(0x01); writeData(0x2C); writeData(0x2D);
    writeCommand(0xB3);
    writeData(0x01); writeData(0x2C); writeData(0x2D);
    writeData(0x01); writeData(0x2C); writeData(0x2D);

    // Inversion Control
    writeCommand(0xB4);
    writeData(0x07);

    // Power Control
    writeCommand(0xC0); // PWCTR1
    writeData(0xA2); writeData(0x02); writeData(0x84);
    writeCommand(0xC1); // PWCTR2
    writeData(0xC5);
    writeCommand(0xC2); // PWCTR3
    writeData(0x0A); writeData(0x00);
    writeCommand(0xC3); // PWCTR4
    writeData(0x8A); writeData(0x2A);
    writeCommand(0xC4); // PWCTR5
    writeData(0x8A); writeData(0xEE);

    // VCOM Control
    writeCommand(0xC5); // VMCTR1
    writeData(0x0E);

    // Inversion OFF
    writeCommand(0x20);

    // Memory Access Data Control (MADCTL) - กำหนดแนวนอน 160x128 Landscape RGB
    writeCommand(0x36);
    writeData(0x60); // MY=0, MX=1, MV=1, RGB Order (160x128 Landscape orientation - Header on top, Footer on bottom)

    // Color Format: 16-bit RGB565
    writeCommand(0x3A); // COLMOD
    writeData(0x05);

    // Gamma Sequence
    writeCommand(0xE0);
    writeData(0x02); writeData(0x1C); writeData(0x07); writeData(0x12);
    writeData(0x37); writeData(0x32); writeData(0x29); writeData(0x2D);
    writeData(0x29); writeData(0x25); writeData(0x2B); writeData(0x39);
    writeData(0x00); writeData(0x01); writeData(0x03); writeData(0x10);

    writeCommand(0xE1);
    writeData(0x03); writeData(0x1D); writeData(0x07); writeData(0x06);
    writeData(0x2E); writeData(0x2C); writeData(0x29); writeData(0x2D);
    writeData(0x2E); writeData(0xE2); writeData(0x37); writeData(0x3F);
    writeData(0x00); writeData(0x00); writeData(0x02); writeData(0x10);

    // Normal Display Mode On
    writeCommand(0x13); // NORON
    delay(10);

    // Display ON
    writeCommand(0x29); // DISPON
    delay(100);

    _detected = true;
    clear(TFT_BLACK);
  }

  void keepAlive() {
    if (!_detected) return;
    writeCommand(0x29); // Force Display ON
  }

  void fillScreen(uint16_t color) {
    if (!_detected) return;
    setAddrWindow(0, 0, _width - 1, _height - 1);
    digitalWrite(_dc, HIGH);
    digitalWrite(_cs, LOW);
    for (uint32_t i = 0; i < (uint32_t)_width * _height; i++) {
      writeByte(color >> 8);
      writeByte(color & 0xFF);
    }
    digitalWrite(_cs, HIGH);
  }

  void clear(uint16_t color = TFT_BLACK) {
    memset(buffer, 0x00, sizeof(buffer));
    fillScreen(color);
  }

  void clearBuffer() {
    memset(buffer, 0x00, sizeof(buffer));
  }

  // วาดจุดพิกเซลลงบน Frame Buffer (1-bit Horizontal Raster)
  void drawPixel(int16_t x, int16_t y, uint8_t color = 1) {
    if (x < 0 || x >= _width || y < 0 || y >= _height) return;
    uint16_t byteIdx = (y * (_width / 8)) + (x / 8);
    uint8_t bitIdx = 7 - (x % 8);
    if (color) buffer[byteIdx] |= (1 << bitIdx);
    else buffer[byteIdx] &= ~(1 << bitIdx);
  }

  void drawHLine(int16_t x, int16_t y, int16_t w, uint8_t color = 1) {
    for (int16_t i = 0; i < w; i++) drawPixel(x + i, y, color);
  }

  void drawVLine(int16_t x, int16_t y, int16_t h, uint8_t color = 1) {
    for (int16_t i = 0; i < h; i++) drawPixel(x, y + i, color);
  }

  void drawRect(int16_t x, int16_t y, int16_t w, int16_t h, uint8_t color = 1) {
    drawHLine(x, y, w, color);
    drawHLine(x, y + h - 1, w, color);
    drawVLine(x, y, h, color);
    drawVLine(x + w - 1, y, h, color);
  }

  void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint8_t color = 1) {
    for (int16_t i = 0; i < h; i++) drawHLine(x, y + i, w, color);
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
      if (x + 6 > _width) { x = 0; y += 9; }
      if (y + 8 > _height) break;
      drawChar(x, y, *str++, color);
      x += 6;
    }
  }

  int loadFrameChunk(int offset, const char* hexData) {
    if (offset < 0 || offset >= TFT_BUF_SIZE) return offset;
    int hexLen = strlen(hexData);
    int byteLen = hexLen / 2;
    for (int i = 0; i < byteLen && (offset + i) < TFT_BUF_SIZE; i++) {
      char c1 = hexData[i * 2];
      char c2 = hexData[i * 2 + 1];
      uint8_t b1 = (c1 >= '0' && c1 <= '9') ? (c1 - '0') : ((c1 >= 'A' && c1 <= 'F') ? (c1 - 'A' + 10) : ((c1 >= 'a' && c1 <= 'f') ? (c1 - 'a' + 10) : 0));
      uint8_t b2 = (c2 >= '0' && c2 <= '9') ? (c2 - '0') : ((c2 >= 'A' && c2 <= 'F') ? (c2 - 'A' + 10) : ((c2 >= 'a' && c2 <= 'f') ? (c2 - 'a' + 10) : 0));
      buffer[offset + i] = (b1 << 4) | b2;
    }
    int nextOffset = offset + byteLen;
    return nextOffset;
  }

  // ส่งข้อมูล Frame Buffer 2560 Bytes ไปยังหน้าจอ TFT พร้อมกำหนดชุดสีระดับโซน (Zone-based RGB Theme ตาม DESIGN.md)
  void displayTheme(const String& theme) {
    if (!_detected) return;
    setAddrWindow(0, 0, _width - 1, _height - 1);
    digitalWrite(_dc, HIGH);
    digitalWrite(_cs, LOW);

    bool isSuccess = (theme.indexOf("SUCCESS") >= 0);
    bool isDenied  = (theme.indexOf("DENIED") >= 0 || theme.indexOf("TIMEOUT") >= 0);
    bool isAlready = (theme.indexOf("ALREADY") >= 0);
    bool isCard    = (theme.indexOf("CARD") >= 0);
    bool isCancel  = (theme.indexOf("CANCEL") >= 0);

    for (uint16_t y = 0; y < _height; y++) {
      uint16_t rowOffset = y * (_width / 8);
      for (uint16_t x = 0; x < _width; x++) {
        uint8_t byteVal = buffer[rowOffset + (x / 8)];
        bool pixelOn = (byteVal >> (7 - (x % 8))) & 0x01;
        uint16_t color;

        if (y <= 22) {
          // โซน 1: HEADER (แถบหัวข้อ Y: 0..22)
          if (isSuccess) {
            color = pixelOn ? TFT_WHITE : TFT_GREEN;
          } else if (isDenied) {
            color = pixelOn ? TFT_WHITE : TFT_RED;
          } else if (isAlready) {
            color = pixelOn ? TFT_DARK : TFT_AMBER;
          } else if (isCard) {
            color = pixelOn ? TFT_GOLD : TFT_SURFACE;
          } else if (isCancel) {
            color = pixelOn ? TFT_WHITE : TFT_BRONZE;
          } else { // IDLE
            color = pixelOn ? TFT_GOLD : TFT_DARK;
          }
        } else if (y == 23) {
          // เส้นคั่นระหว่าง Header และ Body
          if (isSuccess) color = TFT_GREEN;
          else if (isDenied) color = TFT_RED;
          else if (isAlready) color = TFT_AMBER;
          else color = TFT_BRONZE;
        } else if (y >= 104) {
          // โซน 3: FOOTER (แถบคำแนะนำปุ่มกด / สถานะ Y: 104..127)
          if (y == 104) {
            color = TFT_BORDER;
          } else {
            if (!pixelOn) {
              color = TFT_SURFACE;
            } else {
              if (isCard) {
                // ปุ่มฟ้า D2 (x < 80) / ปุ่มแดง D3 (x >= 80)
                color = (x < 80) ? TFT_CYAN : TFT_RED;
              } else if (isSuccess) {
                color = TFT_GREEN;
              } else if (isDenied) {
                color = TFT_RED;
              } else if (isAlready) {
                color = TFT_AMBER;
              } else {
                color = TFT_GREEN; // IDLE พร้อมใช้งาน
              }
            }
          }
        } else {
          // โซน 2: BODY (เนื้อหาหลัก Y: 24..103)
          if (!pixelOn) {
            color = TFT_DARK;
          } else {
            if (isSuccess) {
              color = (y < 65) ? TFT_GREEN : TFT_WHITE;
            } else if (isDenied) {
              color = (y < 65) ? TFT_RED : TFT_WHITE;
            } else if (isAlready) {
              color = (y < 65) ? TFT_AMBER : TFT_WHITE;
            } else if (isCard) {
              // การ์ดนักศึกษา: ชื่อ (ขาวบริสุทธิ์), รหัส (ทองอร่าม), วิชา (ฟ้าสดใส)
              if (y < 60) color = TFT_WHITE;
              else if (y < 82) color = TFT_AMBER;
              else color = TFT_CYAN;
            } else { // IDLE
              if (y < 68) color = TFT_WHITE;
              else color = TFT_AMBER;
            }
          }
        }

        writeByte(color >> 8);
        writeByte(color & 0xFF);
      }
    }
    digitalWrite(_cs, HIGH);
  }

  // ส่งข้อมูล Frame Buffer 2560 Bytes ไปยังหน้าจอ TFT พร้อมกำหนดคู่สี (Theme Color)
  void display(uint16_t fgColor = TFT_WHITE, uint16_t bgColor = TFT_BLACK) {
    if (!_detected) return;
    setAddrWindow(0, 0, _width - 1, _height - 1);
    digitalWrite(_dc, HIGH);
    digitalWrite(_cs, LOW);
    for (uint16_t y = 0; y < _height; y++) {
      uint16_t rowOffset = y * (_width / 8);
      for (uint16_t x = 0; x < _width; x++) {
        uint8_t byteVal = buffer[rowOffset + (x / 8)];
        bool pixelOn = (byteVal >> (7 - (x % 8))) & 0x01;
        uint16_t color = pixelOn ? fgColor : bgColor;
        writeByte(color >> 8);
        writeByte(color & 0xFF);
      }
    }
    digitalWrite(_cs, HIGH);
  }
};

#endif // ST7735_TFT_H
