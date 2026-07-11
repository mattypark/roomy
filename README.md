# roomy

Ceiling-mounted Raspberry Pi camera that maps your room's cleanliness in real time — scores every zone, paints a red/green overlay, and suggests what to clean or buy to match the vibe you describe.

## How it works

```
┌─────────────────┐        frames         ┌──────────────────────────┐
│  Capture layer  │ ───────────────────▶  │   FastAPI backend :8000  │
│                 │                       │                          │
│  dev: webcam /  │                       │  1. Local CV engine      │
│  photo upload   │                       │     grid clutter score   │
│                 │                       │     (edge density +      │
│  later: Pi cam  │                       │      baseline diff)      │
│  on ceiling     │                       │                          │
└─────────────────┘                       │  2. Claude Vision        │
                                          │     deep analysis +      │
┌─────────────────┐    zones + scores     │     vibe suggestions     │
│ Next.js UI :3000│ ◀───────────────────  └──────────────────────────┘
│ red/green       │
│ overlay + rank  │
└─────────────────┘
```

**Hybrid vision:** a cheap local CV pass (OpenCV grid scoring against a "clean baseline" frame) runs constantly and free. Claude Vision runs on demand for deep analysis — it explains *why* a zone is messy and suggests items/changes matching your described style ("dark academia", "clean tech minimal").

## Build phases

### Technical phase (backend) — DONE
- [x] **Stage 1 — Tech stack & scaffold**: repo structure, Next.js frontend, FastAPI backend, shared types
- [x] **Stage 2 — Capture layer**: webcam + photo upload → backend snapshot pipeline, clean-baseline capture
- [x] **Stage 3 — Local CV clutter engine**: grid scoring via edge density, color variance, baseline diff (14 tests)
- [x] **Stage 5 — Claude deep analysis + vibe engine**: `POST /analyze` — frame + inspo photos + vibe text → per-zone reasons, style notes, shopping list. Strict tool schema, keyless demo mode, graceful local fallback on API errors
- [x] **Stage 5.5 — Scan history timeline**: every scan logged to JSONL; `GET /history` = room-cleanliness-over-time signal
- [x] **Stage 6 — Pi agent**: `pi-agent/capture.py` — picamera2 on the Pi, OpenCV webcam on dev machines, retry/backoff, systemd unit ([setup](./pi-agent/README.md))

### UI phase (commits resume here)
- [x] **Stage 4 — Overlay UI**: red/green heat cells over the frame, scan animation, room rank (S–D)
- [x] **Stage 7 — Vibe → analyze wiring**: VibePanel drives `POST /analyze`; per-zone reasons on hover; style notes + shopping list panels
- [x] **Stage 8 — History graph**: cleanliness-over-time chart from `/history`
- [ ] **Stage 9 — Polish + live Pi feed**

## Run

```bash
# backend (Python 3.10+ required — use uv)
cd backend
uv venv --python 3.13 .venv
uv pip install -r requirements.txt --python .venv/bin/python
.venv/bin/uvicorn main:app --reload --port 8000

# frontend (separate terminal)
cd frontend
npm install
npm run dev   # http://localhost:3000
```

Runs keyless — local CV needs no API key. Claude features activate when `ANTHROPIC_API_KEY` is set (see `.env.example`).
