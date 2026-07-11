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

## Build stages

- [x] **Stage 1 — Tech stack & scaffold**: repo structure, Next.js frontend, FastAPI backend, shared types
- [x] **Stage 2 — Capture layer**: webcam + photo upload → backend snapshot pipeline, clean-baseline capture
- [x] **Stage 3 — Local CV clutter engine**: grid scoring via edge density, color variance, baseline diff
- [x] **Stage 4 — Overlay UI**: red/green heat cells over the frame, scan animation, room rank (S–D)
- [ ] **Stage 5 — Claude deep analysis + vibe engine**: per-zone reasoning + vibe-matched suggestions
- [ ] **Stage 6 — Pi agent**: picamera2 capture script for the ceiling-mounted Raspberry Pi

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
