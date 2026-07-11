"""Shared data models — mirrored in frontend/src/lib/types.ts."""

from pydantic import BaseModel


class Zone(BaseModel):
    """One grid cell of the room frame."""

    row: int
    col: int
    # 0.0 = spotless, 1.0 = disaster
    clutterScore: float
    # filled by Claude deep analysis in Stage 5
    reason: str | None = None
    suggestion: str | None = None


class ScanResult(BaseModel):
    """Full analysis of one captured frame."""

    zones: list[Zone]
    gridRows: int
    gridCols: int
    # 0.0–1.0 overall, plus letter rank S/A/B/C/D
    overallScore: float
    rank: str
    # "local" = CV grid pass, "claude" = deep analysis, "demo" = mocked
    source: str
    # which stored frame was scanned (for drawing the overlay on it)
    frameId: str | None = None
    frameUrl: str | None = None
    baselineUsed: bool = False


class ShoppingItem(BaseModel):
    """One thing to get (or move/remove) to match the vibe."""

    item: str
    why: str


class AnalyzeRequest(BaseModel):
    """What the user wants the room to feel like."""

    vibeText: str = ""
    # inspo photos as data-URLs (frontend downscales to ~800px)
    inspo: list[str] = []


class AnalysisResult(ScanResult):
    """Deep analysis = local CV scan enriched by Claude Vision."""

    styleNotes: str | None = None
    shoppingList: list[ShoppingItem] = []
    # set when Claude was requested but unavailable and we fell back to local
    warning: str | None = None


class HistoryEntry(BaseModel):
    """One row of the room-cleanliness timeline."""

    timestamp: float
    frameId: str | None = None
    overallScore: float
    rank: str
    source: str


class HealthResponse(BaseModel):
    status: str
    stage: int
    claudeEnabled: bool


class FrameInfo(BaseModel):
    """Metadata for a stored frame (snapshot or baseline)."""

    id: str
    width: int
    height: int
    capturedAt: float
    url: str


class CaptureStatus(BaseModel):
    """What the capture pipeline currently holds."""

    baselineSet: bool
    latestSnapshotId: str | None = None
    latestSnapshotUrl: str | None = None
