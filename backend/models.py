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
