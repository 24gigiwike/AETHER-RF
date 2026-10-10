# Local ESP32 dataset collection

Recording is off unless you set `AETHER_RECORD_SCANS` before starting the one API process. That process is the only owner of COM4. The dashboard poll does not write rows.

SSIDs and BSSIDs can identify a household or device. Recordings stay in `backend/data/recordings/`, which is gitignored. Do not publish that folder.

## Start a session

```powershell
cd C:\Users\user\Desktop\AETHER-RF\backend
$env:AETHER_RECORD_SCANS = "1"
$env:AETHER_SESSION_NAME = "home_morning_01"
$env:AETHER_SESSION_ENVIRONMENT = "home"
$env:AETHER_SESSION_SCENARIO = "morning"
$env:AETHER_SESSION_NOTES = "Laptop near the router"
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Stop the API process already using COM4 before starting this one. Optional directory override: `AETHER_DATASET_DIR`.

`session_id` is still a random UUID and is the value that links scans, access points, and channel features. The four `AETHER_SESSION_*` variables are optional labels stored only on the session row. Leave them unset to record with blank labels. Limits are 64 characters for the name, environment, and scenario, and 500 characters for notes. Line breaks are turned into spaces.

Each start with recording enabled creates a new `session_id` and appends to the existing CSV files. It does not overwrite scan, access-point, or feature rows. An older `sessions.csv` that has only `session_id` and `started_at_utc` is rewritten once to add the new columns; every existing session row is kept, with blank metadata. A start without `AETHER_RECORD_SCANS` leaves those files unchanged. The process logs `ESP32 dataset recording is disabled` or `ESP32 dataset recording is enabled`.

## Stop a session

Stop the API process. To keep serving scans without recording, start it again without `AETHER_RECORD_SCANS`.

## Files

| File | Contents |
|---|---|
| `sessions.csv` | `session_id`, `started_at_utc`, `session_name`, `session_environment`, `session_scenario`, `session_notes` |
| `scans.csv` | `session_id`, `scan_id`, `received_at_utc`, `network_count`, `scan_success` |
| `access_points.csv` | `session_id`, `scan_id`, `received_at_utc`, `ssid`, `bssid`, `rssi`, `channel`, `security_type` |
| `channel_features.csv` | Per channel 1–13: occupancy, linear-power mean RSSI, strongest RSSI, adjacent AP count, overlap-weighted AP count |

A successful scan with zero access points is kept in `scans.csv`. It has no access-point rows. Empty channel RSSI cells are blank, not a guessed value.

`channel_features.csv` does not contain a congestion score, severity class, or ground-truth label. Those overlap columns are measurements derived from the recorded access points. They are not verified training labels.

## Pseudonymized export

```powershell
cd C:\Users\user\Desktop\AETHER-RF\backend
.\.venv\Scripts\python.exe dataset_recorder.py export --pseudonymize
```

The export is written under `backend/data/exports/`. SSID and BSSID values become stable tokens. The salt file `.pseudonym_salt` stays in the recordings directory and is not copied. Empty SSIDs stay empty.
