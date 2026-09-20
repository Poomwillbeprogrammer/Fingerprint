#include <Arduino.h>
#include <Adafruit_Fingerprint.h>
#include "protocol.h"
#include "ST7735_TFT.h"

// ==========================================
// 1. กำหนดขาเชื่อมต่อ Hardware
// ==========================================
// การเชื่อมต่อจอ 1.8" TFT SPI 128x160 (ST7735 v1.1)
#define TFT_CS_PIN    10 // ขา CS (Chip Select)
#define TFT_DC_PIN     9 // ขา DC / A0 (Data/Command)
#define TFT_RST_PIN    8 // ขา RES (Reset)
#define TFT_MOSI_PIN  11 // ขา SDA / MOSI (SPI Data)
#define TFT_SCK_PIN   13 // ขา SCL / SCK (SPI Clock)
#define TFT_BLK_PIN   -1 // ขา BLK / LED (ต่อ 3.3V ถาวร หรือระบุขาพิน เช่น 7)

// การเชื่อมต่อเซนเซอร์ลายนิ้วมือ R307 (Hardware Serial1 สำหรับ Uno Q: Pin 0 RX, Pin 1 TX)
#define mySerial Serial1
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

// กำหนดขาปุ่มกด Physical Switch (Active LOW: ขาหนึ่งต่อ Pin อีกขาต่อ GND)
#define BTN_CONFIRM_PIN 2 // ขา D2: ปุ่มกดยืนยันบันทึกเวลา
#define BTN_RESCAN_PIN  3 // ขา D3: ปุ่มกดสแกนใหม่/ยกเลิก

ST7735_TFT tft(TFT_CS_PIN, TFT_DC_PIN, TFT_RST_PIN, TFT_MOSI_PIN, TFT_SCK_PIN, TFT_BLK_PIN);
#define oled tft // รักษาความเข้ากันได้ย้อนหลัง 100%

// ==========================================
// 4. ฟังก์ชันแสดงสถานะ UI บนหน้าจอ TFT (Clean Standard UI 160x128 Landscape)
// ==========================================
void showUI(const char* title, const char* line1, const char* line2 = "", const char* line3 = "") {
  tft.clearBuffer();
  tft.drawRect(0, 0, TFT_WIDTH, TFT_HEIGHT);
  
  // แถบหัวข้อ Title ด้านบน (Y: 0..18)
  tft.fillRect(0, 0, TFT_WIDTH, 18, 1);
  tft.drawString(8, 5, title, 0);

  if (line1 && strlen(line1) > 0) tft.drawString(8, 30, line1);
  if (line2 && strlen(line2) > 0) tft.drawString(8, 50, line2);
  if (line3 && strlen(line3) > 0) tft.drawString(8, 70, line3);

  tft.drawHLine(4, TFT_HEIGHT - 22, TFT_WIDTH - 8);
  tft.drawString(12, TFT_HEIGHT - 16, "RMUTL Attendance System");

  tft.displayTheme("THEME=IDLE");
}

// การ์ดแสดงผลเมื่อสแกนผ่าน (Fallback เมื่อไม่มีบิตแมป)
void showUserCard(const char* stuId, const char* name) {
  tft.clearBuffer();
  tft.drawRect(0, 0, TFT_WIDTH, TFT_HEIGHT);

  tft.fillRect(0, 0, TFT_WIDTH, 18, 1);
  tft.drawString(12, 5, "ACCESS GRANTED", 0);

  tft.drawString(8, 28, "STUDENT ID:");
  tft.drawString(80, 28, stuId ? stuId : "-");

  tft.drawString(8, 48, name ? name : "Student");

  tft.drawHLine(4, 75, TFT_WIDTH - 8);
  tft.drawString(14, 84, "VERIFY & CONFIRM");

  tft.drawHLine(4, TFT_HEIGHT - 24, TFT_WIDTH - 8);
  tft.drawString(8, TFT_HEIGHT - 16, "[ D2: Confirm  |  D3: Cancel ]");

  tft.displayTheme("THEME=CARD");
}

void showIdleScreen() {
  tft.clearBuffer();
  tft.drawRect(0, 0, TFT_WIDTH, TFT_HEIGHT);

  tft.fillRect(0, 0, TFT_WIDTH, 18, 1);
  tft.drawString(14, 5, "RMUTL BIOMETRIC IOT", 0);

  tft.drawString(18, 36, "READY FOR SCAN");
  tft.drawString(18, 56, "Place finger on sensor");

  tft.drawHLine(4, TFT_HEIGHT - 24, TFT_WIDTH - 8);
  tft.drawString(14, TFT_HEIGHT - 16, "[ Status: System Ready ]");

  tft.displayTheme("THEME=IDLE");
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
  uint32_t lastByteTime = millis();
  while (count < 700 && (millis() - starttime) < 3000) {
    if (mySerial.available()) {
      rawBuf[count++] = mySerial.read();
      lastByteTime = millis();
    } else if (count >= 512 && (millis() - lastByteTime) > 50) {
      break; // ดึงข้อมูลครบ 512 Bytes และสายสื่อสารว่างแล้ว ออกจากลูปทันที
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
    restoreTargetId = 0;
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    Serial.println("EVENT:IDLE");
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
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    Serial.println("EVENT:IDLE");
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
bool fingerHeld = false;

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
      fingerHeld = true;
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
      Serial.println("EVENT:IDLE");
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
      delay(1000);
      fingerHeld = true;
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
      Serial.println("EVENT:IDLE");
      return true; // ยกเลิกสำเร็จ
    }
  }

  if (millis() - startTime > timeoutMs) {
    showUI("ENROLL TIMEOUT", "No finger placed", "Try again later");
    Serial.print("RESP:ENROLL_FAIL_TIMEOUT ID=");
    Serial.println(id);
    delay(1000);
    fingerHeld = true;
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    Serial.println("EVENT:IDLE");
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
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    Serial.println("EVENT:IDLE");
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
    delay(1500);
    fingerHeld = true;
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    Serial.println("EVENT:IDLE");
    return;
  }

  // ตรวจสอบลายนิ้วมือซ้ำในระบบ (Duplicate Fingerprint Check)
  uint8_t dupCheck = finger.fingerSearch(1);
  if (dupCheck == FINGERPRINT_OK) {
    char dupMsg[25];
    snprintf(dupMsg, sizeof(dupMsg), "Already Slot #%d", finger.fingerID);
    showUI("DUPLICATE FINGER", dupMsg, "Cannot enroll again");
    Serial.print("RESP:ENROLL_FAIL_DUPLICATE ID=");
    Serial.println(finger.fingerID);
    delay(2000);
    fingerHeld = true;
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    Serial.println("EVENT:IDLE");
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

  // ขั้นตอนที่ 2: วางนิ้วเดิมซ้ำอีกครั้ง (มีระบบ Retry สูงสุด 3 ครั้งโดยไม่ต้องเริ่ม Step 1 ใหม่)
  bool modelSuccess = false;
  for (int attempt = 1; attempt <= 3; attempt++) {
    if (attempt == 1) {
      showUI(idHeader, "Step 2: Place SAME", "finger again...");
    } else {
      char step2Retry[25];
      snprintf(step2Retry, sizeof(step2Retry), "Retry (%d/3): Place", attempt);
      showUI(idHeader, step2Retry, "SAME finger again");
    }
    Serial.print("STATUS:ENROLL_STEP2_WAIT TRY=");
    Serial.println(attempt);

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
      if (attempt < 3) {
        showUI(idHeader, "Image 2 blurry!", "Remove finger to retry");
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 2);
        delay(1200);
        uint32_t remWait = millis();
        while (finger.getImage() != FINGERPRINT_NOFINGER && (millis() - remWait < 5000)) {
          delay(40);
        }
        continue;
      } else {
        showUI("ENROLL FAILED", "Image 2 blurry (3x)", "Try enroll again");
        Serial.println("RESP:ENROLL_FAIL_IMAGE2");
        delay(1500);
        fingerHeld = true;
        finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
        Serial.println("EVENT:IDLE");
        return;
      }
    }

    // ประมวลผลสร้าง Model
    showUI(idHeader, "Creating model...", "Comparing images...");
    p = finger.createModel();
    if (p == FINGERPRINT_OK) {
      modelSuccess = true;
      break; // เทียบผ่าน สำเร็จ!
    } else {
      if (attempt < 3) {
        showUI(idHeader, "FINGER MISMATCH!", "Remove finger to retry");
        finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 2);
        delay(1200);
        uint32_t remWait = millis();
        while (finger.getImage() != FINGERPRINT_NOFINGER && (millis() - remWait < 5000)) {
          delay(40);
        }
        continue;
      } else {
        showUI("ENROLL FAILED", "Mismatch (3 times)", "Try enroll again");
        Serial.println("RESP:ENROLL_FAIL_MISMATCH");
        delay(1500);
        fingerHeld = true;
        finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
        Serial.println("EVENT:IDLE");
        return;
      }
    }
  }

  if (!modelSuccess) return;

  p = finger.storeModel(id);
  if (p == FINGERPRINT_OK) {
    int fingerIdx = (id % 3 == 0) ? 3 : (id % 3);
    char savedMsg[25];
    snprintf(savedMsg, sizeof(savedMsg), "Finger %d/3 Saved", fingerIdx);
    showUI("ENROLL SUCCESS!", savedMsg, "Backing up to DB...");
    
    Serial.print("RESP:ENROLL_OK ID=");
    Serial.println(id);

    // ดึง Template 512 Bytes ส่งขึ้น Database ทันที
    extractAndSendTemplate(id);

    // ตรวจสอบการยกนิ้วออก ป้องกันนิ้วเดิมค้าง
    uint32_t liftStart = millis();
    while (finger.getImage() != FINGERPRINT_NOFINGER && (millis() - liftStart) < 3000) {
      delay(50);
    }

    if (fingerIdx < 3) {
      // นิ้วที่ 1 หรือ 2: แจ้งเตือน Server ว่าพร้อมสำหรับนิ้วถัดไปทันที และค้างหน้าจอบอกสถานะ (ไม่คืนสู่ IDLE)
      showUI("ENROLL SUCCESS!", savedMsg, "Ready for next finger");
      Serial.print("RESP:ENROLL_SLOT_DONE ID=");
      Serial.println(id);
      return;
    } else {
      // นิ้วที่ 3: ลงทะเบียนครบทั้ง 3 นิ้วสมบูรณ์
      showUI("ENROLL COMPLETE!", "All 3 Fingers Saved", "Returning to idle...");
      delay(1500);
    }
  } else {
    showUI("ENROLL FAILED", "Flash write error", "Try again");
    Serial.println("RESP:ENROLL_FAIL_STORE");
    delay(1500);
  }

  fingerHeld = true;
  finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
  Serial.println("EVENT:IDLE");
}

// 3. ลบลายนิ้วมือตาม ID (Delete - Silent background operation)
void handleDelete(int id) {
  uint8_t p = finger.deleteModel(id);
  if (p == FINGERPRINT_OK) {
    Serial.print("RESP:DELETE_OK ID=");
    Serial.println(id);
  } else {
    Serial.print("RESP:DELETE_FAIL ID=");
    Serial.println(id);
  }
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
  finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
  Serial.println("EVENT:IDLE");
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
  finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
  Serial.println("EVENT:IDLE");
}

// ==========================================
// 8. Setup & Loop
// ==========================================
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);
  delay(1000);
  Serial.println("\n[SYSTEM] Starting UNO Q Zephyr Fingerprint & 1.8 TFT SPI System...");

  // กำหนดขาปุ่มกด Physical Switch (Active LOW, Internal Pullup)
  pinMode(BTN_CONFIRM_PIN, INPUT_PULLUP);
  pinMode(BTN_RESCAN_PIN, INPUT_PULLUP);

  // เริ่มต้นหน้าจอ 1.8" TFT SPI 128x160 (ST7735 v1.1)
  tft.begin();
  bool tftDetected = tft.isDetected();
  if (tftDetected) {
    showUI("BOOTING...", "Initializing TFT", "ST7735 128x160 OK");
    delay(400);
  }

  // เริ่มต้นเซนเซอร์ลายนิ้วมือ R307 (57600 baud)
  finger.begin(57600);
  bool r307Detected = finger.verifyPassword();
  if (r307Detected) {
    if (tftDetected) {
      showUI("HARDWARE OK", "R307 Sensor Ready", "TFT ST7735 Ready");
    }
    // เปิดโหมดไฟหายใจ (Breathing LED) นุ่มนวลสวยงาม ไม่กระพริบกวนตา
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
  } else {
    if (tftDetected) {
      showUI("HARDWARE ERROR", "R307 NOT FOUND!", "Check wiring (Pin 0/1)");
    }
  }
  delay(800);

  Serial.print("STATUS:HARDWARE R307=");
  Serial.print(r307Detected ? "READY" : "NOT_FOUND");
  Serial.print(" OLED=");
  Serial.print(tftDetected ? "READY" : "NOT_FOUND");
  Serial.print(" TFT=");
  Serial.println(tftDetected ? "READY" : "NOT_FOUND");

  if (r307Detected) {
    Serial.println("STATUS:R307_READY");
  } else {
    Serial.println("STATUS:R307_NOT_FOUND");
  }

  if (tftDetected) {
    showIdleScreen();
  }
  Serial.println("EVENT:IDLE");
}

bool handleFrameReceive(const String& startLine = "") {
  String theme = startLine.length() > 0 ? startLine : "THEME=IDLE";

  tft.clearBuffer();
  uint32_t lastActivity = millis();
  while (millis() - lastActivity < 3000) {
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
          tft.loadFrameChunk(offset, hex.c_str());
        }
      } else if (line == "FRAME_END") {
        tft.displayTheme(theme);
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
      fingerHeld = true;
      finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 2);
      Serial.println("EVENT:NO_MATCH");
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
    } else if (cmd.startsWith("FRAME_START")) {
      handleFrameReceive(cmd);
    } else if (cmd == "PING") {
      Serial.println("RESP:PONG");
    } else if (cmd == "CHECK_R307" || cmd == "CHECK_HARDWARE") {
      bool r307Ok = finger.verifyPassword();
      bool tftOk = tft.isConnected();
      Serial.print("STATUS:HARDWARE R307=");
      Serial.print(r307Ok ? "READY" : "NOT_FOUND");
      Serial.print(" OLED=");
      Serial.print(tftOk ? "READY" : "NOT_FOUND");
      Serial.print(" TFT=");
      Serial.println(tftOk ? "READY" : "NOT_FOUND");
      if (r307Ok) {
        Serial.println("STATUS:R307_READY");
      } else {
        Serial.println("STATUS:R307_NOT_FOUND");
      }
    }
  }

  // หากอยู่ในระหว่าง Restore ลายนิ้วมือ ห้ามสแกนนิ้วแทรกแซง UART ของ R307
  if (restoreTargetId > 0) {
    if (millis() - restoreStartTime > 10000) {
      restoreTargetId = 0;
      Serial.println("RESP:RESTORE_FAIL ERR=TIMEOUT");
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
      Serial.println("EVENT:IDLE");
    }
    delay(5);
    return;
  }

  // หากอยู่ในระหว่างค้นหา Tier 2 ตรวจสอบ Timeout
  if (tier2Searching) {
    if (millis() - tier2StartTime > 5500) {
      tier2Searching = false;
      fingerHeld = true;
      finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 2);
      Serial.println("EVENT:NO_MATCH");
      finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    }
    delay(5);
    return;
  }

  // 2. Smart Polling ตรวจจับลายนิ้วมืออัตโนมัติ (Non-blocking พร้อมระบบตรวจจับปล่อยนิ้ว)
  int result = FINGERPRINT_NOFINGER;
  if (fingerHeld) {
    if (finger.getImage() == FINGERPRINT_NOFINGER) {
      fingerHeld = false;
    }
  } else {
    result = scanFingerprint();
  }
  
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
          gotCard = handleFrameReceive(line);
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
      // ตรวจสอบคำสั่ง Serial หากเป็นคำสั่งตรวจเช็คฮาร์ดแวร์ให้ตอบกลับทันทีโดยไม่ยกเลิกลูปปุ่มกด
      if (Serial.available()) {
        String pendingCmd = Serial.readStringUntil('\n');
        pendingCmd.trim();
        if (pendingCmd.startsWith("ENROLL") || pendingCmd == "CANCEL" || pendingCmd == "CANCEL_ENROLL" || pendingCmd == "RESET") {
          btnAction = 3;
          break;
        } else if (pendingCmd == "CHECK_R307" || pendingCmd == "CHECK_HARDWARE") {
          bool r307Ok = finger.verifyPassword();
          bool tftOk = tft.isDetected();
          Serial.print("STATUS:HARDWARE R307=");
          Serial.print(r307Ok ? "READY" : "NOT_FOUND");
          Serial.print(" OLED=");
          Serial.print(tftOk ? "READY" : "NOT_FOUND");
          Serial.print(" TFT=");
          Serial.println(tftOk ? "READY" : "NOT_FOUND");
          if (r307Ok) {
            Serial.println("STATUS:R307_READY");
          } else {
            Serial.println("STATUS:R307_NOT_FOUND");
          }
        }
      }

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

    if (btnAction == 3) {
      // มีคำสั่งใหม่เข้ามา ให้ข้ามขั้นตอนปุ่มกดแล้วกลับไปอ่านคำสั่งใน loop() ทันที
      return;
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
            handleFrameReceive(line);
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
            handleFrameReceive(line);
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
            handleFrameReceive(line);
            break;
          }
        }
        delay(5);
      }
      delay(3000); // ค้างหน้าจอหมดเวลา 3.0 วินาที
    }

    // บันทึกสถานะนิ้วยังวางอยู่ ป้องกันการสแกนซ้ำซ้อนโดยไม่ต้องวนลูปบล็อค
    fingerHeld = true;
    // กลับสู่โหมดไฟหายใจ Breathing นุ่มนวล
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
    Serial.println("EVENT:IDLE");
  } else if (result == FINGERPRINT_NOTFOUND) {
    // Tier 1 Flash ไม่พบ: เริ่มต้นเข้าสู่โหมดค้นหา Tier 2 ใน Database
    fingerHeld = true;
    tier2Searching = true;
    tier2StartTime = millis();
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 80, FINGERPRINT_LED_RED);
    showUI("SEARCHING DB...", "Checking Tier 2...", "Please wait...");
    Serial.println("EVENT:TIER1_NO_MATCH");
  }

  // ป้องกันจอ TFT เข้าสู่ Sleep Mode หรือไฟตก (TFT Keep-Alive Watchdog)
  static unsigned long lastKeepAlive = 0;
  if (millis() - lastKeepAlive > 5000) {
    lastKeepAlive = millis();
    tft.keepAlive();
  }

  delay(50); // หน่วงเวลาสั้นลง นุ่มนวล ตอบสนอง Serial ทันที
}





