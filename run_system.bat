@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if exist ".env.local" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.local") do (
    if not "%%A"=="" if not "%%A:~0,1%%"=="#" set "%%A=%%B"
  )
)

if not defined VITE_SUPABASE_URL set "VITE_SUPABASE_URL=https://fpnlslaksffbvzyajvoi.supabase.co"
if not defined VITE_SUPABASE_ANON_KEY (
  echo VITE_SUPABASE_ANON_KEY is missing. Add it to .env.local or set it in this terminal.
  exit /b 1
)

if not exist "node_modules" (
  echo node_modules is missing; installing frontend dependencies...
  call npm ci || exit /b 1
)

set "PYTHON=python"
if exist ".venv\Scripts\python.exe" set "PYTHON=.venv\Scripts\python.exe"

%PYTHON% -c "import fastapi, uvicorn" >nul 2>&1
if errorlevel 1 (
  echo FastAPI dependencies are missing from %PYTHON%. Install requirements.txt first.
  exit /b 1
)

start "RAKSHA Solver" cmd /k "cd /d "%~dp0" && %PYTHON% -m uvicorn server.fastapi_solver:app --host 0.0.0.0 --port 8000"
start "RAKSHA Web" cmd /k "cd /d "%~dp0" && npm run dev -- --host 0.0.0.0 --port 5173"

echo Solver: http://localhost:8000
echo Web:    http://localhost:5173
endlocal
