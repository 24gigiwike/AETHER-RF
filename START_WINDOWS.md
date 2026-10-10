# Start AETHER-RF on Windows

Use one API process. It is the only program that should open COM4. Close the Arduino Serial Monitor before starting it.

The dashboard is http://localhost:3000. The hardware API is http://127.0.0.1:8000. The trained model is already at `backend/data/model/random_forest.joblib`.

## First-time setup

From the project root:

```powershell
cd C:\Users\user\Desktop\AETHER-RF
npm install
python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

If `backend\data\model\random_forest.joblib` is missing, train it once from the backend directory:

```powershell
cd C:\Users\user\Desktop\AETHER-RF\backend
.\.venv\Scripts\python.exe train_model.py
```

That reads local recordings if they exist and writes only under `backend\data\model\`. It does not replace the recording files.

## Demonstration

Open two PowerShell windows.

Window 1, API, recording off:

```powershell
cd C:\Users\user\Desktop\AETHER-RF\backend
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Do not add `--reload`.

Window 2, dashboard:

```powershell
cd C:\Users\user\Desktop\AETHER-RF
npm run dev
```

Open http://localhost:3000 and choose ESP32 Live. The ESP32 must be on COM4.

## Recording

Stop the API already using COM4, then start one replacement process:

```powershell
cd C:\Users\user\Desktop\AETHER-RF\backend
$env:AETHER_RECORD_SCANS = "1"
$env:AETHER_SESSION_NAME = "home_morning_01"
$env:AETHER_SESSION_ENVIRONMENT = "home"
$env:AETHER_SESSION_SCENARIO = "morning"
$env:AETHER_SESSION_NOTES = "Laptop near the router"
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Recordings stay in `backend\data\recordings\` and are not part of the Git backup. The firmware sketch used with this API is `firmware\sketch_oct10b\sketch_oct10b.ino`.
