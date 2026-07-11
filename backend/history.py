"""Room-cleanliness timeline — append-only JSONL log of every scan."""

import json
import time
from pathlib import Path

BASE_DIR = Path(__file__).parent
HISTORY_DIR = BASE_DIR / "history"
HISTORY_PATH = HISTORY_DIR / "scans.jsonl"

# keep the timeline bounded for the single-room use case
MAX_ENTRIES = 2000


def append(
    overall_score: float,
    rank: str,
    source: str,
    frame_id: str | None = None,
    timestamp: float | None = None,
) -> dict:
    """Record one scan on the timeline. Returns the entry written."""
    entry = {
        "timestamp": timestamp if timestamp is not None else time.time(),
        "frameId": frame_id,
        "overallScore": round(float(overall_score), 4),
        "rank": rank,
        "source": source,
    }
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    with HISTORY_PATH.open("a") as handle:
        handle.write(json.dumps(entry) + "\n")
    _trim()
    return entry


def read() -> list[dict]:
    """All timeline entries, oldest first. Corrupt lines skipped."""
    if not HISTORY_PATH.exists():
        return []
    entries = []
    for line in HISTORY_PATH.read_text().splitlines():
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return entries


def wipe() -> None:
    HISTORY_PATH.unlink(missing_ok=True)


def _trim() -> None:
    entries = read()
    if len(entries) <= MAX_ENTRIES:
        return
    keep = entries[-MAX_ENTRIES:]
    with HISTORY_PATH.open("w") as handle:
        for entry in keep:
            handle.write(json.dumps(entry) + "\n")
