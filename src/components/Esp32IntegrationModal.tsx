import React, { useState } from 'react';
import { X, Copy, Check, Terminal, Cpu, FileCode } from 'lucide-react';

interface Esp32IntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Esp32IntegrationModal: React.FC<Esp32IntegrationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const curlExample = `curl -X POST https://YOUR_APP_URL/api/scan/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "sensorId": "ESP32-HARDWARE-NODE-01",
    "scanDurationMs": 1850,
    "observations": [
      {
        "ssid": "Department_Wi-Fi",
        "bssid": "24:0A:C4:11:22:33",
        "rssi": -55,
        "channel": 1,
        "securityType": "WPA2_PSK"
      },
      {
        "ssid": "EDUROAM",
        "bssid": "00:11:22:33:44:55",
        "rssi": -48,
        "channel": 6,
        "securityType": "WPA2_PSK"
      }
    ]
  }'`;

  const arduinoSnippet = `/**
 * ESP32 Wi-Fi Scanner Client
 * Project: AI-Powered Wi-Fi Interference Detection Platform
 * Target: ESP32 Dev Module (WROOM / WROVER)
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* BACKEND_URL = "http://YOUR_SERVER_IP:3000/api/scan/ingest";

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  Serial.println("ESP32 Wi-Fi Scanner Initialized.");
}

void loop() {
  Serial.println("\\nStarting passive 2.4 GHz spectrum sweep...");
  unsigned long startTime = millis();
  
  // Perform active/passive 802.11 scan across channels 1 to 13
  int numNetworks = WiFi.scanNetworks(false, true); 
  unsigned long duration = millis() - startTime;
  
  if (numNetworks >= 0) {
    Serial.printf("Discovered %d access points in %lu ms\\n", numNetworks, duration);

    // Construct JSON payload
    StaticJsonDocument<4096> doc;
    doc["sensorId"] = "ESP32-HARDWARE-WROOM";
    doc["scanDurationMs"] = duration;
    JsonArray obsArray = doc.createNestedArray("observations");

    for (int i = 0; i < numNetworks; i++) {
      JsonObject obs = obsArray.createNestedObject();
      obs["ssid"] = WiFi.SSID(i);
      obs["bssid"] = WiFi.BSSIDstr(i);
      obs["rssi"] = WiFi.RSSI(i);
      obs["channel"] = WiFi.channel(i);
      obs["securityType"] = getAuthModeName(WiFi.encryptionType(i));
    }

    String jsonString;
    serializeJson(doc, jsonString);

    // Send HTTP POST to Platform Ingestion Endpoint
    HTTPClient http;
    http.begin(BACKEND_URL);
    http.addHeader("Content-Type", "application/json");
    int httpResponseCode = http.POST(jsonString);
    
    Serial.printf("Ingest response code: %d\\n", httpResponseCode);
    http.end();
  }

  WiFi.scanDelete(); // Free scan buffer
  delay(5000);       // Wait 5 seconds before next sweep
}

const char* getAuthModeName(wifi_auth_mode_t authMode) {
  switch (authMode) {
    case WIFI_AUTH_OPEN: return "OPEN";
    case WIFI_AUTH_WEP: return "WEP";
    case WIFI_AUTH_WPA_PSK: return "WPA_PSK";
    case WIFI_AUTH_WPA2_PSK: return "WPA2_PSK";
    case WIFI_AUTH_WPA_WPA2_PSK: return "WPA_WPA2_PSK";
    case WIFI_AUTH_WPA3_PSK: return "WPA3_PSK";
    default: return "UNKNOWN";
  }
}`;

  return (
    <div className="fixed inset-0 z-50 bg-[#141414]/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto font-mono">
      <div className="bg-white max-w-3xl w-full border border-[#141414] shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-3.5 border-b border-[#141414] flex items-center justify-between bg-neutral-100">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#141414]" />
            <div>
              <h2 className="text-xs font-bold text-[#141414] uppercase tracking-wider">
                ESP32 Hardware Ingestion Specification
              </h2>
              <p className="text-[10px] opacity-60 font-mono">
                Direct Telecommunications Integration Architecture
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#141414] hover:bg-neutral-200 border border-black/20 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-[#141414] font-mono">
          {/* Section 1: Ingestion API Endpoint */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#141414] uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-[#141414]" />
              1. Hardware REST Ingestion Endpoint
            </h3>
            <p className="text-neutral-700 text-[11px] leading-relaxed">
              The platform exposes a dedicated, decoupled ingestion endpoint for physical ESP32 Wi-Fi scan batches.
              Observations sent to this endpoint are automatically tagged with provenance <code className="bg-neutral-100 px-1 border border-black/20">source: "ESP32_HARDWARE"</code> and immediately passed into the derived parameters engine.
            </p>
            <div className="p-2.5 bg-[#141414] text-emerald-400 font-mono text-[11px] border border-black flex items-center justify-between">
              <span>POST /api/scan/ingest</span>
              <span className="text-[10px] text-neutral-400">Content-Type: application/json</span>
            </div>
          </div>

          {/* Section 2: Test with cURL */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-[#141414] uppercase text-[11px]">Test Ingestion with cURL:</h4>
              <button
                onClick={() => copyToClipboard(curlExample, 'curl')}
                className="flex items-center gap-1 text-[10px] uppercase font-bold border border-[#141414] px-2 py-0.5 bg-white hover:bg-neutral-100 cursor-pointer"
              >
                {copiedSection === 'curl' ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSection === 'curl' ? 'Copied' : 'Copy cURL'}</span>
              </button>
            </div>
            <pre className="p-3 bg-[#141414] text-neutral-200 font-mono text-[11px] border border-black overflow-x-auto">
              {curlExample}
            </pre>
          </div>

          {/* Section 3: ESP32 Arduino / PlatformIO Firmware */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#141414] uppercase tracking-wider flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-[#141414]" />
                2. Ready-to-Flash ESP32 C++ Sketch
              </h3>
              <button
                onClick={() => copyToClipboard(arduinoSnippet, 'arduino')}
                className="flex items-center gap-1 text-[10px] uppercase font-bold border border-[#141414] px-2 py-0.5 bg-white hover:bg-neutral-100 cursor-pointer"
              >
                {copiedSection === 'arduino' ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSection === 'arduino' ? 'Copied' : 'Copy C++ Code'}</span>
              </button>
            </div>
            <p className="text-neutral-700 text-[11px]">
              Flash this code to your ESP32 board using Arduino IDE or PlatformIO. It performs continuous 802.11 sweeps and streams raw telemetry to this platform.
            </p>
            <pre className="p-3 bg-[#141414] text-neutral-200 font-mono text-[11px] border border-black max-h-64 overflow-y-auto">
              {arduinoSnippet}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#141414] bg-neutral-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#141414] hover:bg-[#2c2c2c] text-white font-bold text-[10px] uppercase tracking-wider border border-[#141414] cursor-pointer"
          >
            Close Reference
          </button>
        </div>
      </div>
    </div>
  );
};
