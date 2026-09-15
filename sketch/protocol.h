#ifndef PROTOCOL_H
#define PROTOCOL_H

// ==========================================
// Protocol Constants & Serial Command Specification
// IoT Biometric Attendance System (Uno Q - Zephyr OS)
// ==========================================

// UART Buffer & Protocol Frame Constraints
#define UART_RX_FIFO_LIMIT       64   // Zephyr OS UART RX FIFO hardware limit (bytes)
#define FRAME_CHUNK_SIZE         16   // 16 bytes per chunk (32 hex characters)
#define FRAME_TOTAL_CHUNKS       160  // 160 chunks = 2560 bytes (160x128 1-bit raster)
#define FRAME_INITIAL_WAIT_MS    200  // Pacing delay before first chunk
#define FRAME_INTER_CHUNK_DELAY  6    // Pacing delay between chunks (ms)

// Hardware Timers & Timeouts
#define CONFIRM_TIMEOUT_MS       10000 // 10 seconds auto-cancel if no button pressed
#define TIER2_TIMEOUT_MS         5500  // 5.5 seconds cloud candidate search timeout
#define RESTORE_TIMEOUT_MS       10000 // 10 seconds template restore timeout
#define STEP2_MAX_ATTEMPTS       3     // Maximum in-place retries for Step 2 enrollment

// Serial Command Headers (Inbound from Linux/Cloud Bridge)
#define CMD_PING                 "PING"
#define CMD_CHECK_R307           "CHECK_R307"
#define CMD_CHECK_HARDWARE       "CHECK_HARDWARE"
#define CMD_ENROLL_PREFIX        "ENROLL "
#define CMD_DELETE_PREFIX        "DELETE "
#define CMD_COUNT                "COUNT"
#define CMD_CLEAR_ALL            "CLEAR_ALL"
#define CMD_BACKUP_PREFIX        "BACKUP "
#define CMD_RESTORE_INIT_PREFIX  "RESTORE_INIT "
#define CMD_RESTORE_CHUNK_PREFIX "RESTORE_CHUNK "
#define CMD_COMPARE_INIT_PREFIX  "COMPARE_INIT "
#define CMD_COMPARE_CHUNK_PREFIX "COMPARE_CHUNK "
#define CMD_CANCEL_TIER2         "CANCEL_TIER2"
#define CMD_FRAME_START          "FRAME_START"
#define CMD_FRAME_DATA           "FRAME_DATA "
#define CMD_FRAME_END            "FRAME_END"

// Serial Event & Status Headers (Outbound to Linux/Cloud Bridge)
#define EVENT_IDLE               "EVENT:IDLE"
#define EVENT_MATCH              "EVENT:MATCH"
#define EVENT_NO_MATCH           "EVENT:NO_MATCH"
#define EVENT_TIER1_NO_MATCH     "EVENT:TIER1_NO_MATCH"
#define EVENT_CONFIRM            "EVENT:CONFIRM"
#define EVENT_CANCEL             "EVENT:CANCEL"
#define EVENT_TIMEOUT            "EVENT:TIMEOUT"

#define STATUS_R307_READY        "STATUS:R307_READY"
#define STATUS_R307_NOT_FOUND    "STATUS:R307_NOT_FOUND"
#define STATUS_STEP1_WAIT        "STATUS:ENROLL_STEP1_WAIT"
#define STATUS_REMOVE_FINGER     "STATUS:ENROLL_REMOVE_FINGER"
#define STATUS_STEP2_WAIT        "STATUS:ENROLL_STEP2_WAIT"

#define RESP_PONG                "RESP:PONG"
#define RESP_CLEAR_OK            "RESP:CLEAR_OK"
#define RESP_CLEAR_FAIL          "RESP:CLEAR_FAIL"
#define RESP_DELETE_OK           "RESP:DELETE_OK"
#define RESP_DELETE_FAIL         "RESP:DELETE_FAIL"

#endif // PROTOCOL_H
