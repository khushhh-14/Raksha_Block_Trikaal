#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://fpnlslaksffbvzyajvoi.supabase.co}"
: "${VITE_SUPABASE_ANON_KEY:?Set VITE_SUPABASE_ANON_KEY in .env.local or your shell}"

if [[ ! -d node_modules ]]; then
  echo "node_modules is missing; installing frontend dependencies..."
  npm ci
fi

PYTHON_BIN="python"
if [[ -x .venv/bin/python ]]; then
  PYTHON_BIN=".venv/bin/python"
elif [[ -x .venv/Scripts/python.exe ]]; then
  PYTHON_BIN=".venv/Scripts/python.exe"
fi

if ! "$PYTHON_BIN" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "FastAPI dependencies are missing from $PYTHON_BIN. Install requirements.txt first." >&2
  exit 1
fi

cleanup() {
  kill "$SOLVER_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

"$PYTHON_BIN" -m uvicorn server.fastapi_solver:app --host 0.0.0.0 --port 8000 &
SOLVER_PID=$!
npm run dev -- --host 0.0.0.0 --port 5173 &
WEB_PID=$!

echo "Solver: http://localhost:8000"
echo "Web:    http://localhost:5173"
wait -n "$SOLVER_PID" "$WEB_PID"
