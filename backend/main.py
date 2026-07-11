"""roomy backend — image ingest, local CV clutter engine, Claude Vision analysis."""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import storage
from models import CaptureStatus, FrameInfo, HealthResponse, ScanResult
from vision import grid_scorer

load_dotenv()

STAGE = 4
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


@app.post("/scan", response_model=ScanResult)
async def scan_frame(file: UploadFile | None = None) -> ScanResult:
    """Run the local CV clutter engine.

    With a file: scans that frame (stored as a snapshot first).
    Without: scans the latest stored snapshot.
    Uses the clean baseline automatically when one is set.
    """
    if file is not None:
        image = await _read_image(file)
        info = storage.save_snapshot(image)
    else:
        latest = storage.latest_snapshot_info()
        if latest is None:
            raise HTTPException(status_code=404, detail="no frame to scan — capture one first")
        image = storage.load_snapshot(latest["id"])
        if image is None:
            raise HTTPException(status_code=404, detail="stored frame unreadable")
        info = latest

    baseline = storage.load_baseline()
    result = grid_scorer.scan(image, baseline=baseline)
    return ScanResult(
        **result,
        frameId=info["id"],
        frameUrl=info["url"],
        baselineUsed=baseline is not None,
    )


@app.get("/status", response_model=CaptureStatus)
def status() -> CaptureStatus:
    latest = storage.latest_snapshot_info()
    return CaptureStatus(
        baselineSet=storage.baseline_set(),
        latestSnapshotId=latest["id"] if latest else None,
        latestSnapshotUrl=latest["url"] if latest else None,
    )
