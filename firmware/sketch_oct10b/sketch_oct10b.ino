#include <WiFi.h>

unsigned long scanNumber = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
}

void loop() {
  int count = WiFi.scanNetworks();
  scanNumber++;

  // One JSON object per scan
  Serial.print("{\"scanId\":");
  Serial.print(scanNumber);

  Serial.print(",\"networkCount\":");
  Serial.print(count < 0 ? 0 : count);

  Serial.print(",\"scanSuccess\":");
  Serial.print(count >= 0 ? "true" : "false");

  Serial.print(",\"networks\":[");

  if (count > 0) {
    for (int i = 0; i < count; i++) {
      if (i > 0) Serial.print(",");

      Serial.print("{\"ssid\":");
      Serial.print("\"");
      // Escape SSID for valid JSON
      String ssid = WiFi.SSID(i);
      for (size_t j = 0; j < ssid.length(); j++) {
        char c = ssid[j];
        if (c == '"' || c == '\\') Serial.print('\\');
        if ((unsigned char)c < 32) continue;
        Serial.print(c);
      }
      Serial.print("\"");

      Serial.print(",\"bssid\":\"");
      Serial.print(WiFi.BSSIDstr(i));
      Serial.print("\"");

      Serial.print(",\"rssi\":");
      Serial.print(WiFi.RSSI(i));

      Serial.print(",\"channel\":");
      Serial.print(WiFi.channel(i));

      Serial.print(",\"securityType\":\"");
      Serial.print(
        WiFi.encryptionType(i) == WIFI_AUTH_OPEN
          ? "OPEN" : "SECURED"
      );
      Serial.print("\"}");
    }
  }

  Serial.println("]}");
  WiFi.scanDelete();

  delay(4000);
}