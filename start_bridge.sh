#!/bin/bash
# Wait for Wi-Fi to establish connection
sleep 8

while true; do
    echo "[$(date)] Starting Uno Q Standalone Bridge..." >> /home/arduino/bridge.log
    python3 -u /home/arduino/unoq_bridge.py >> /home/arduino/bridge.log 2>&1
    sleep 3
done
