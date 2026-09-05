# AI-Powered Wi-Fi Interference Detection & Adaptive Mitigation Platform
## Telecommunications Engineering Project Architecture & Specification

### 1. Executive Summary & Objective
This platform addresses channel congestion and co-channel/adjacent-channel RF interference in IEEE 802.11 Wi-Fi networks (predominantly the 2.4 GHz ISM band). The system progressively ingests real Wi-Fi scan observations, extracts raw physical metrics, computes derived spectral parameters, detects congestion patterns, and outputs actionable channel mitigation recommendations with before-and-after comparison.

---

### 2. Architectural Data Flow
```
+------------------------------------+
|  Physical Sensor: ESP32 Hardware   |
|  802.11 b/g/n Promiscuous / Active |
|  Wi-Fi Scan Sweep (Channels 1-13)  |
+-----------------+------------------+
                  |
                  | HTTP POST (JSON)
                  v
+-----------------+------------------+       +-------------------------------+
|  REST Ingestion API                | <---  | Wi-Fi Scanner Simulator       |
|  POST /api/scan/ingest             |       | (Isolated test-bench profiles)|
+-----------------+------------------+       +-------------------------------+
                  |
                  v
+-----------------+------------------+
|  In-Memory Storage & Ingestion     |
|  Raw Scan Batch & Observation Ring |
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|  Derived Parameter Engine          |
|  - Channel Density                 |
|  - RF Power-averaged RSSI          |
|  - Spectral Overlap (CCI & ACI)    |
|  - Congestion Index Scoring        |
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|  Future AI/ML Classifier           |
|  (Python scikit-learn / REST API)  |
|  Baseline: Analytical Rules Engine |
+-----------------+------------------+
                  |
                  v
+-----------------+------------------+
|  Mitigation Engine & Dashboard     |
|  - Best-channel recommendation     |
|  - Spectral heatmaps & metrics     |
|  - Before/After network evaluation |
+------------------------------------+
```

---

### 3. Separation of Parameters

| Parameter Class | Examples | Provenance / Acquisition Method | Status in Phase 1 |
|---|---|---|---|
| **Raw Measurements** | RSSI (dBm), Channel (1-14), BSSID, SSID, Security Type, Timestamp, Count of APs | Directly measured by ESP32 physical radio via `WiFi.scanNetworks()` or simulator | **ACTIVE** |
| **Derived Parameters** | Channel Density, Average RSSI, Peak RSSI, Co-Channel Score, Adjacent Channel Bleed, Composite Congestion Index, Severity (NORMAL/LOW/MEDIUM/HIGH) | Calculated deterministically by the analytical engine from raw measurements | **ACTIVE** |
| **Network Performance** | Packet Loss (%), RTT Latency (ms), Downlink/Uplink Throughput (Mbps) | End-to-end active network probes (e.g., ICMP ping, iPerf3 client) | **FUTURE STAGE** (Explicit placeholder without fabricated values) |

---

### 4. ESP32 Ingestion Contract

The physical ESP32 connects to an accessible Wi-Fi access point or local network and posts its scan sweeps to the backend:

**Endpoint:** `POST /api/scan/ingest`  
**Content-Type:** `application/json`

#### Ingest Payload Schema:
```json
{
  "sensorId": "ESP32-NODE-LAB-01",
  "scanDurationMs": 1850,
  "observations": [
    {
      "ssid": "Campus-Net",
      "bssid": "30:23:03:01:00:10",
      "rssi": -48,
      "channel": 6,
      "securityType": "WPA2_PSK",
      "bandwidthMhz": 20
    },
    {
      "ssid": "Research_Lab",
      "bssid": "58:D9:D5:20:10:01",
      "rssi": -65,
      "channel": 1,
      "securityType": "WPA2_PSK",
      "bandwidthMhz": 20
    }
  ]
}
```

---

### 5. Derived Mathematical Calculations

#### A. Linear Power Average RSSI
RSSI in dBm cannot be simply averaged arithmetically because the decibel scale is logarithmic. The engine transforms each reading into linear milliwatts ($P_{mW} = 10^{\frac{RSSI}{10}}$), averages the power, and converts back to dBm:
$$P_{avg\text{ (dBm)}} = 10 \cdot \log_{10}\left(\frac{1}{N}\sum_{i=1}^N 10^{\frac{RSSI_i}{10}}\right)$$

#### B. 2.4 GHz Spectral Overlap Modeling
In 802.11b/g/n, channels are centered at 5 MHz intervals while occupying 20 MHz (or 22 MHz) of bandwidth. The spectral overlap factor between channels $A$ and $B$ is:
$$\text{Overlap}(A, B) = \begin{cases} 
1.00 & |A - B| = 0 \quad (\text{Co-Channel}) \\
0.82 & |A - B| = 1 \quad (\text{Direct adjacent bleed}) \\
0.58 & |A - B| = 2 \\
0.32 & |A - B| = 3 \\
0.12 & |A - B| = 4 \\
0.00 & |A - B| \ge 5 \quad (\text{Orthogonal non-overlapping})
\end{cases}$$

#### C. Composite Congestion Index
$$\text{Congestion}(ch) = 0.70 \times \text{CoChannel}(ch) + 0.30 \times \text{AdjacentBleed}(ch)$$
where CoChannel combines both access point density and normalized signal power.

---

### 6. Machine Learning Separation Strategy
The machine-learning interference classifier will be trained on empirical datasets collected from real environments. 
- Input vector: $[AP\_count, RSSI_{mean}, RSSI_{max}, CCI\_score, ACI\_score, Congestion\_index]$
- Target classes: `['NORMAL', 'LOW', 'MEDIUM', 'HIGH']`
- Interface: Exposes a standalone REST microservice (e.g. FastAPI / scikit-learn). The Node.js backend or frontend client will seamlessly forward the derived feature vector to the model endpoint when ready.
- **LLM Boundary**: Generative LLMs (e.g. Gemini) are strictly excluded from classifying the interference; only deterministic calculations and real ML models trained on wireless telemetry are used.
