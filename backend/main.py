"""roomy backend — image ingest, local CV clutter engine, Claude Vision analysis."""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import storage
from models import CaptureStatus, FrameInfo, HealthResponse

load_dotenv()

STAGE = 2
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB — plenty for a room photo

app = FastAPI(title="roomy", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# stored frames served straight to the UI
storage.SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
storage.BASELINE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/snapshots", StaticFiles(directory=storage.SNAPSHOT_DIR), name="snapshots")
app.mount("/baseline", StaticFiles(directory=storage.BASELINE_DIR), name="baseline")


async def _read_image(file: UploadFile):
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="image too large (15 MB max)")
    try:
        return storage.decode_image(data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        stage=STAGE,
        claudeEnabled=bool(os.environ.get("ANTHROPIC_API_KEY")),
    )


@app.post("/frames", response_model=FrameInfo)
async def capture_frame(file: UploadFile) -> FrameInfo:
    """Ingest a frame from the capture layer (webcam / upload / future Pi cam)."""
    image = await _read_image(file)
    return FrameInfo(**storage.save_snapshot(image))


@app.post("/baseline", response_model=FrameInfo)
async def set_baseline(file: UploadFile) -> FrameInfo:
    """Store the clean-baseline reference frame — the 'room at its best' shot."""
    image = await _read_image(file)
    return FrameInfo(**storage.save_baseline(image))


@app.get("/status", response_model=CaptureStatus)
def status() -> CaptureStatus:
    latest = storage.latest_snapshot_info()
    return CaptureStatus(
        baselineSet=storage.baseline_set(),
        latestSnapshotId=latest["id"] if latest else None,
        latestSnapshotUrl=latest["url"] if latest else None,
    )
