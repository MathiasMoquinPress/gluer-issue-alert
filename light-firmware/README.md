# Gluer light controller (Waveshare ESP32-S3-Relay-6CH)

1. Install **Arduino IDE 2**.
2. Boards Manager: install **esp32 by Espressif Systems**, version **2.0.12** (the version Waveshare's page uses).
3. Library Manager: install **WebSockets** (Markus Sattler) and **ArduinoJson** (Benoit Blanchon, version 7).
4. Open `gluer_light/gluer_light.ino`, edit the three lines at the top (Wi-Fi name, Wi-Fi password, light code from the app).
5. Tools: Board = **ESP32S3 Dev Module**, **USB CDC On Boot = Enabled**, pick the board's COM port.
6. If it will not connect: hold **BOOT**, tap **RESET**, release BOOT, then upload.

The board's small RGB LED: blue = no Wi-Fi, yellow = Wi-Fi but the light service is not reached, green = connected.
