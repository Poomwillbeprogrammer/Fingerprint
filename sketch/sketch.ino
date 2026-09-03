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




#include <U8g2lib.h>

// ==========================================
// 2. ไดรเวอร์จอ OLED SH1106 (Software I2C + รองรับภาษาไทย UTF-8 สมบูรณ์)
// ==========================================
U8G2_SH1106_128X64_NONAME_F_SW_I2C u8g2(U8G2_R0, /* clock=*/ OLED_SCL_PIN, /* data=*/ OLED_SDA_PIN, /* reset=*/ U8X8_PIN_NONE);

// แปลงรหัสอักขระ UTF-8 ภาษาไทยเป็นรหัส TIS-620 เพื่อแสดงผลผ่านฟอนต์ etl14thai_t ของ U8g2
String utf8ToTis620(const char* utf8) {
  if (!utf8) return "";
  String res = "";
  int len = strlen(utf8);
  for (int i = 0; i < len; i++) {
    uint8_t c = (uint8_t)utf8[i];
    if (c == 0xE0 && i + 2 < len) {
      uint8_t b2 = (uint8_t)utf8[i + 1];
      uint8_t b3 = (uint8_t)utf8[i + 2];
      if (b2 == 0xB8) {
        res += (char)(b3 + 0x20);
        i += 2;
      } else if (b2 == 0xB9) {
        res += (char)(b3 + 0x60);
        i += 2;
      } else {
        res += (char)c;
      }
    } else {
      res += (char)c;
    }
  }
  return res;
}

// ==========================================
// 3. ฟังก์ชันแสดงสถานะ UI บนหน้าจอ OLED (รองรับภาษาไทยผ่าน TIS-620)
// ==========================================
void showUI(const char* title, const char* line1, const char* line2 = "", const char* line3 = "") {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_etl14thai_t);

  // กรอบภายนอก
  u8g2.drawFrame(0, 0, 128, 64);

  // แถบหัวข้อ Title ด้านบน (Inverted Box)
  u8g2.drawBox(0, 0, 128, 15);
  u8g2.setDrawColor(0); // ตัวหนังสือสีดำบนแถบสีขาว
  u8g2.drawStr(4, 12, utf8ToTis620(title).c_str());

  u8g2.setDrawColor(1); // คืนค่าสีขาวสำหรับเนื้อหา
  if (line1 && strlen(line1) > 0) u8g2.drawStr(6, 29, utf8ToTis620(line1).c_str());
  if (line2 && strlen(line2) > 0) u8g2.drawStr(6, 44, utf8ToTis620(line2).c_str());
  if (line3 && strlen(line3) > 0) u8g2.drawStr(6, 59, utf8ToTis620(line3).c_str());

  u8g2.sendBuffer();
}

// การ์ดแสดงผลเมื่อสแกนผ่าน: แสดงรหัสนักศึกษา และชื่อ-นามสกุลภาษาไทย
void showUserCard(const char* stuId, const char* name) {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_etl14thai_t);

  // กรอบภายนอก
  u8g2.drawFrame(0, 0, 128, 64);

  // แถบหัวข้อด้านบน: ยินดีต้อนรับ (GRANTED)
  u8g2.drawBox(0, 0, 128, 15);
  u8g2.setDrawColor(0);
  u8g2.drawStr(6, 12, utf8ToTis620("ยินดีต้อนรับ (GRANTED)").c_str());

  u8g2.setDrawColor(1);

  // บรรทัดที่ 1: รหัสนักศึกษา (เด่น ชัดเจน)
  u8g2.drawStr(6, 30, stuId ? stuId : "-");

  // บรรทัดที่ 2: ชื่อ-นามสกุล ภาษาไทย
  u8g2.drawStr(6, 45, utf8ToTis620(name).c_str());

  // บรรทัดที่ 3: เส้นคั่นและสถานะบันทึกสำเร็จ
  u8g2.drawHLine(4, 49, 120);
  u8g2.drawStr(6, 61, utf8ToTis620("บันทึกเวลาสำเร็จ OK").c_str());

  u8g2.sendBuffer();
}

void showIdleScreen() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_etl14thai_t);
  u8g2.drawFrame(0, 0, 128, 64);

  // แถบหัวข้อ
  u8g2.drawBox(0, 0, 128, 15);
  u8g2.setDrawColor(0);
  u8g2.drawStr(10, 12, utf8ToTis620("ระบบลงเวลาสแกนนิ้ว").c_str());

  u8g2.setDrawColor(1);
  u8g2.drawStr(12, 32, utf8ToTis620("กรุณาวางนิ้วเพื่อสแกน").c_str());
  u8g2.drawHLine(4, 46, 120);
  u8g2.drawStr(18, 59, utf8ToTis620("สถานะ: พร้อมใช้งาน").c_str());

  u8g2.sendBuffer();
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
  delay(1200);
  Serial.println("\n[SYSTEM] Starting UNO Q Zephyr Fingerprint & OLED System...");

  // เริ่มต้นหน้าจอ OLED SH1106 ผ่าน U8g2
  u8g2.begin();
  u8g2.enableUTF8Print();
  showUI("BOOTING...", "Initializing OLED", "Thai Font Ready");
  delay(1000);

  // เริ่มต้นเซนเซอร์ลายนิ้วมือ R307 (57600 baud)
  finger.begin(57600);
  if (finger.verifyPassword()) {
    Serial.println("STATUS:R307_READY");
    showUI("HARDWARE OK", "R307 Sensor Ready", "OLED Thai Ready");
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
    Serial.print("ECHO:");
    Serial.println(cmd.substring(0, 20));

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
      int firstSpace = cmd.indexOf(' ', 14);
      if (firstSpace != -1) {
        int chunkNum = cmd.substring(14, firstSpace).toInt();
        String hexChunk = cmd.substring(firstSpace + 1);
        handleRestoreChunk(chunkNum, hexChunk);
      }
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
    } else if (cmd.startsWith("MATCH_USER ")) {
      int stuIdx = cmd.indexOf("STU=");
      int nameIdx = cmd.indexOf("NAME=");
      if (stuIdx != -1 && nameIdx != -1) {
        String stuId = cmd.substring(stuIdx + 4, nameIdx);
        stuId.trim();
        String name = cmd.substring(nameIdx + 5);
        name.trim();
        showUserCard(stuId.c_str(), name.c_str());
      }
    } else if (cmd.startsWith("CANCEL_TIER2")) {
      tier2Searching = false;
      finger.LEDcontrol(FINGERPRINT_LED_FLASHING, 25, FINGERPRINT_LED_RED, 2);
      showUI("ACCESS DENIED", "ไม่พบในระบบ", "ไม่มีสิทธิ์เข้าถึง");
      Serial.println("EVENT:NO_MATCH");
      delay(1500);
      showIdleScreen();
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
      showUI("ACCESS DENIED", "ไม่พบในระบบ", "ไม่มีสิทธิ์เข้าถึง");
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

    // แสดงสถานะชั่วคราวระหว่างรอชื่อและรหัสนักศึกษา
    showUI("SCAN SUCCESS!", "กำลังตรวจสอบข้อมูล...", "กรุณารอสักครู่");

    // รอรับคำสั่ง MATCH_USER STU=... NAME=... จาก Server หรือ Linux Bridge ภายใน 2500ms
    uint32_t waitStart = millis();
    bool gotUser = false;
    while (millis() - waitStart < 2500) {
      while (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.startsWith("MATCH_USER ")) {
          int stuIdx = line.indexOf("STU=");
          int nameIdx = line.indexOf("NAME=");
          if (stuIdx != -1 && nameIdx != -1) {
            String stuId = line.substring(stuIdx + 4, nameIdx);
            stuId.trim();
            String name = line.substring(nameIdx + 5);
            name.trim();
            showUserCard(stuId.c_str(), name.c_str());
            gotUser = true;
            break;
          }
        }
      }
      if (gotUser) break;
      delay(15);
    }

    if (!gotUser) {
      char idStr[25];
      snprintf(idStr, sizeof(idStr), "Student Slot: #%d", finger.fingerID);
      showUI("ACCESS GRANTED", idStr, "ผ่านการยืนยันตัวตน");
    }

    delay(2800); // แสดงผลค้างไว้ 2.8 วินาที เพื่อให้อ่านชื่อและรหัสชัดเจน
    // รอยกนิ้วออกก่อนเพื่อไม่ให้สแกนซ้ำ
    while (finger.getImage() != FINGERPRINT_NOFINGER) {
      delay(50);
    }
    // กลับสู่โหมดไฟหายใจ Breathing นุ่มนวล
    finger.LEDcontrol(FINGERPRINT_LED_BREATHING, 100, FINGERPRINT_LED_RED);
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
    u8g2.setPowerSave(0);
  }

  delay(120); // หน่วงเวลาให้นุ่มนวล ไม่แยงตา
}

