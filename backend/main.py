"""roomy backend — image ingest, local CV clutter engine, Claude Vision analysis."""

import base64
import os

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import history
import storage
from models import (
    AnalysisResult,
    AnalyzeRequest,
    CaptureStatus,
    FrameInfo,
    HealthResponse,
    HistoryEntry,
    ScanResult,
)
from vision import claude_analyzer, grid_scorer

load_dotenv()

STAGE = 6
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB — plenty for a room photo

app = FastAPI(title="roomy", version="0.6.0")

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


def _data_url_to_bytes(data_url: str) -> bytes | None:
    """Decode a frontend inspo data-URL to raw JPEG bytes. None on junk."""
    try:
        _, encoded = data_url.split(",", 1)
        return base64.standard_b64decode(encoded)
    except (ValueError, base64.binascii.Error):
        return None


def _latest_frame():
    """Latest stored snapshot as (info, image, jpeg_bytes). 404s when missing."""
    latest = storage.latest_snapshot_info()
    if latest is None:
        raise HTTPException(status_code=404, detail="no frame to scan — capture one first")
    image = storage.load_snapshot(latest["id"])
    if image is None:
        raise HTTPException(status_code=404, detail="stored frame unreadable")
    jpeg = (storage.SNAPSHOT_DIR / f"{latest['id']}.jpg").read_bytes()
    return latest, image, jpeg


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        stage=STAGE,
        claudeEnabled=claude_analyzer.enabled(),
    )


@app.post("/frames", response_model=FrameInfo)
async def capture_frame(file: UploadFile) -> FrameInfo:
    """Ingest a frame from the capture layer (webcam / upload / pi cam)."""
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
        info, image, _ = _latest_frame()

    baseline = storage.load_baseline()
    result = grid_scorer.scan(image, baseline=baseline)
    history.append(
        overall_score=result["overallScore"],
        rank=result["rank"],
        source=result["source"],
        frame_id=info["id"],
    )
    return ScanResult(
        **result,
        frameId=info["id"],
        frameUrl=info["url"],
        baselineUsed=baseline is not None,
    )


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_room(request: AnalyzeRequest) -> AnalysisResult:
    """Deep analysis: local CV scan + Claude Vision vibe/style pass.

    Keyless → deterministic demo mode. Claude API failure → local scan
    returned with a warning instead of a 5xx.
    """
    info, image, frame_jpeg = _latest_frame()
    baseline = storage.load_baseline()
    local_scan = grid_scorer.scan(image, baseline=baseline)

    inspo = [
        jpeg
        for jpeg in (_data_url_to_bytes(url) for url in request.inspo[:3])
        if jpeg is not None
    ]

    warning = None
    try:
        result = claude_analyzer.analyze(frame_jpeg, request.vibeText, inspo, local_scan)
    except anthropic.APIConnectionError:
        result = {**local_scan, "styleNotes": None, "shoppingList": []}
        warning = "Claude unreachable (network) — showing local scan only"
    except anthropic.APIStatusError as exc:
        result = {**local_scan, "styleNotes": None, "shoppingList": []}
        warning = f"Claude API error {exc.status_code} — showing local scan only"
    except ValueError as exc:
        result = {**local_scan, "styleNotes": None, "shoppingList": []}
        warning = f"Claude response unusable ({exc}) — showing local scan only"

    history.append(
        overall_score=result["overallScore"],
        rank=result["rank"],
        source=result["source"],
        frame_id=info["id"],
    )
    return AnalysisResult(
        **result,
        frameId=info["id"],
        frameUrl=info["url"],
        baselineUsed=baseline is not None,
        warning=warning,
    )


@app.get("/history", response_model=list[HistoryEntry])
def get_history() -> list[HistoryEntry]:
    """Room cleanliness timeline, oldest first."""
    return [HistoryEntry(**entry) for entry in history.read()]


@app.delete("/history")
def wipe_history() -> dict:
    history.wipe()
    return {"ok": True}


@app.get("/status", response_model=CaptureStatus)
def status() -> CaptureStatus:
    latest = storage.latest_snapshot_info()
    return CaptureStatus(
        baselineSet=storage.baseline_set(),
        latestSnapshotId=latest["id"] if latest else None,
        latestSnapshotUrl=latest["url"] if latest else None,
    )
