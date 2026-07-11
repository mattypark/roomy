"""Frame storage — captured snapshots + the clean-baseline reference frame."""

import time
from pathlib import Path

import cv2
import numpy as np

BASE_DIR = Path(__file__).parent
SNAPSHOT_DIR = BASE_DIR / "snapshots"
BASELINE_DIR = BASE_DIR / "baseline"
BASELINE_PATH = BASELINE_DIR / "baseline.jpg"

# keep dev disk usage sane — oldest snapshots pruned past this count
MAX_SNAPSHOTS = 50
JPEG_QUALITY = 90


def decode_image(data: bytes) -> np.ndarray:
    """Decode raw upload bytes into a BGR image. Raises ValueError on junk."""
    buffer = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("could not decode image — expected jpeg/png bytes")
    return image


def _write_jpeg(path: Path, image: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok = cv2.imwrite(str(path), image, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise IOError(f"failed to write {path}")


def _prune_snapshots() -> None:
    snapshots = sorted(SNAPSHOT_DIR.glob("*.jpg"))
    for stale in snapshots[:-MAX_SNAPSHOTS]:
        stale.unlink(missing_ok=True)


def save_snapshot(image: np.ndarray) -> dict:
    """Persist a captured frame. Returns frame metadata."""
    frame_id = f"frame-{int(time.time() * 1000)}"
    path = SNAPSHOT_DIR / f"{frame_id}.jpg"
    _write_jpeg(path, image)
    _prune_snapshots()
    height, width = image.shape[:2]
    return {
        "id": frame_id,
        "width": width,
        "height": height,
        "capturedAt": time.time(),
        "url": f"/snapshots/{frame_id}.jpg",
    }


def save_baseline(image: np.ndarray) -> dict:
    """Persist the clean-baseline reference frame (single slot, overwritten)."""
    _write_jpeg(BASELINE_PATH, image)
    height, width = image.shape[:2]
    return {
        "id": "baseline",
        "width": width,
        "height": height,
        "capturedAt": time.time(),
        "url": "/baseline/baseline.jpg",
    }


def load_baseline() -> np.ndarray | None:
    if not BASELINE_PATH.exists():
        return None
    return cv2.imread(str(BASELINE_PATH), cv2.IMREAD_COLOR)


def load_snapshot(frame_id: str) -> np.ndarray | None:
    path = SNAPSHOT_DIR / f"{frame_id}.jpg"
    if not path.exists():
        return None
    return cv2.imread(str(path), cv2.IMREAD_COLOR)


def latest_snapshot_info() -> dict | None:
    snapshots = sorted(SNAPSHOT_DIR.glob("*.jpg"))
    if not snapshots:
        return None
    latest = snapshots[-1]
    return {"id": latest.stem, "url": f"/snapshots/{latest.name}"}


def baseline_set() -> bool:
    return BASELINE_PATH.exists()
