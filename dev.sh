#!/bin/bash
# Start both FastAPI backend and Next.js frontend with one command

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")"

cleanup() {
    echo ""
    echo "Shutting down..."
    kill $API_PID $NEXT_PID 2>/dev/null
    wait $API_PID $NEXT_PID 2>/dev/null
    echo "Done."
    exit 0
}
trap cleanup INT TERM

# Start FastAPI backend
echo "Starting FastAPI backend on :8000 ..."
uvicorn api.main:app --reload --port 8000 &
API_PID=$!

# Start Next.js frontend
echo "Starting Next.js frontend on :3000 ..."
cd frontend && npm run dev &
NEXT_PID=$!
cd ..

echo ""
echo "✅ Both servers running:"
echo "   Frontend → http://localhost:3000"
echo "   Backend  → http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop both."
echo ""

wait
