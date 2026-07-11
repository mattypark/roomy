"""Local CV clutter engine — the cheap hybrid layer.

Divides a frame into a grid and scores each cell 0.0 (spotless) → 1.0 (disaster)
using three signals:

  1. edge density   — cluttered surfaces are busy with edges (Canny)
  2. color variance — piles of stuff have chaotic color, clean surfaces are flat
  3. baseline diff  — what changed vs the "room at its best" reference frame

With a baseline the diff signal dominates (it directly answers "what appeared
since clean"). Without one we fall back to absolute busyness. Pure functions,
no I/O — runs identically on the dev Mac and the future ceiling Pi.
"""

import cv2
import numpy as np

DEFAULT_ROWS = 6
DEFAULT_COLS = 8

# canny thresholds tuned for indoor lighting
CANNY_LOW = 60
CANNY_HIGH = 160

# signal normalization — empirical scale factors mapping raw values to ~0..1
EDGE_SCALE = 4.0
VARIANCE_SCALE = 1.0 / 80.0
DIFF_SCALE = 1.0 / 60.0

# signal weights
WEIGHTS_WITH_BASELINE = {"diff": 0.6, "edges": 0.25, "variance": 0.15}
WEIGHTS_NO_BASELINE = {"edges": 0.6, "variance": 0.4}

# rank cutoffs: score < threshold → rank
RANK_THRESHOLDS = [(0.12, "S"), (0.25, "A"), (0.4, "B"), (0.6, "C")]


def _cell_bounds(length: int, parts: int) -> list[tuple[int, int]]:
    """Integer boundaries splitting `length` pixels into `parts` near-equal spans."""
    edges = np.linspace(0, length, parts + 1, dtype=int)
    return [(int(edges[i]), int(edges[i + 1])) for i in range(parts)]


def _per_cell_mean(field: np.ndarray, rows: int, cols: int) -> np.ndarray:
    """Reduce a per-pixel field (H, W) to a per-cell mean grid (rows, cols)."""
    grid = np.zeros((rows, cols), dtype=np.float64)
    row_bounds = _cell_bounds(field.shape[0], rows)
    col_bounds = _cell_bounds(field.shape[1], cols)
    for r, (y0, y1) in enumerate(row_bounds):
        for c, (x0, x1) in enumerate(col_bounds):
            grid[r, c] = float(field[y0:y1, x0:x1].mean())
    return grid


def edge_density_grid(image: np.ndarray, rows: int, cols: int) -> np.ndarray:
    """Fraction of edge pixels per cell, scaled to ~0..1."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, CANNY_LOW, CANNY_HIGH).astype(np.float64) / 255.0
    return np.clip(_per_cell_mean(edges, rows, cols) * EDGE_SCALE, 0.0, 1.0)


def color_variance_grid(image: np.ndarray, rows: int, cols: int) -> np.ndarray:
    """Local color chaos per cell, scaled to ~0..1."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float64)
    # local std via blur trick: sqrt(E[x^2] - E[x]^2) in a 15px window
    mean = cv2.blur(gray, (15, 15))
    mean_sq = cv2.blur(gray * gray, (15, 15))
    local_std = np.sqrt(np.clip(mean_sq - mean * mean, 0.0, None))
    return np.clip(_per_cell_mean(local_std, rows, cols) * VARIANCE_SCALE, 0.0, 1.0)


def baseline_diff_grid(
    image: np.ndarray, baseline: np.ndarray, rows: int, cols: int
) -> np.ndarray:
    """Mean absolute difference vs the clean reference, per cell, ~0..1."""
    if baseline.shape[:2] != image.shape[:2]:
        baseline = cv2.resize(baseline, (image.shape[1], image.shape[0]))
    gray_now = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float64)
    gray_base = cv2.cvtColor(baseline, cv2.COLOR_BGR2GRAY).astype(np.float64)
    # diff FIRST, then blur the diff map — blurring the frames first averages
    # textured objects back toward the background and erases the signal
    diff = np.abs(gray_now - gray_base)
    diff = cv2.GaussianBlur(diff, (5, 5), 0)
    return np.clip(_per_cell_mean(diff, rows, cols) * DIFF_SCALE, 0.0, 1.0)


def score_grid(
    image: np.ndarray,
    baseline: np.ndarray | None = None,
    rows: int = DEFAULT_ROWS,
    cols: int = DEFAULT_COLS,
) -> np.ndarray:
    """Blend the signals into one clutter score grid (rows, cols) in 0..1."""
    edges = edge_density_grid(image, rows, cols)
    variance = color_variance_grid(image, rows, cols)

    if baseline is not None:
        diff = baseline_diff_grid(image, baseline, rows, cols)
        weights = WEIGHTS_WITH_BASELINE
        # edges/variance only count where something actually changed —
        # furniture is busy with edges but it was there in the clean shot too
        blended = (
            weights["diff"] * diff
            + weights["edges"] * edges * diff
            + weights["variance"] * variance * diff
        ) / (weights["diff"] + weights["edges"] + weights["variance"])
        # re-expand: diff-gated signals shrink the range, normalize back
        blended = blended * (1.0 + weights["edges"] + weights["variance"])
    else:
        weights = WEIGHTS_NO_BASELINE
        blended = weights["edges"] * edges + weights["variance"] * variance

    return np.clip(blended, 0.0, 1.0)


def rank_from_score(score: float) -> str:
    """Map an overall 0..1 clutter score to an S/A/B/C/D room rank."""
    for threshold, rank in RANK_THRESHOLDS:
        if score < threshold:
            return rank
    return "D"


def scan(
    image: np.ndarray,
    baseline: np.ndarray | None = None,
    rows: int = DEFAULT_ROWS,
    cols: int = DEFAULT_COLS,
) -> dict:
    """Full local scan → ScanResult-shaped dict (see models.ScanResult)."""
    grid = score_grid(image, baseline=baseline, rows=rows, cols=cols)
    zones = [
        {"row": r, "col": c, "clutterScore": round(float(grid[r, c]), 4)}
        for r in range(rows)
        for c in range(cols)
    ]
    # dirtiest third drives the overall — one trashed corner should tank the
    # grade even if the rest of the room is spotless
    flat = np.sort(grid.flatten())[::-1]
    worst_third = flat[: max(1, flat.size // 3)]
    overall = float(0.5 * worst_third.mean() + 0.5 * grid.mean())
    return {
        "zones": zones,
        "gridRows": rows,
        "gridCols": cols,
        "overallScore": round(overall, 4),
        "rank": rank_from_score(overall),
        "source": "local",
    }
