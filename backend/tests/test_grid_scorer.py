"""Unit tests for the local CV grid clutter engine — written before the implementation (TDD)."""

import numpy as np
import pytest

from vision import grid_scorer


def _flat_image(value: int = 128, size: tuple[int, int] = (240, 320)) -> np.ndarray:
    """Uniform gray frame — the theoretical perfectly clean room."""
    return np.full((*size, 3), value, dtype=np.uint8)


def _noisy_patch(image: np.ndarray, y0: int, y1: int, x0: int, x1: int) -> np.ndarray:
    """Return a copy with dense random noise in one region — simulated clutter."""
    rng = np.random.default_rng(42)
    out = image.copy()
    out[y0:y1, x0:x1] = rng.integers(0, 255, (y1 - y0, x1 - x0, 3), dtype=np.uint8)
    return out


class TestScoreGrid:
    def test_returns_expected_grid_shape(self):
        # Arrange
        image = _flat_image()

        # Act
        grid = grid_scorer.score_grid(image, rows=6, cols=8)

        # Assert
        assert grid.shape == (6, 8)

    def test_scores_are_bounded_zero_to_one(self):
        image = _noisy_patch(_flat_image(), 0, 240, 0, 320)

        grid = grid_scorer.score_grid(image, rows=4, cols=4)

        assert float(grid.min()) >= 0.0
        assert float(grid.max()) <= 1.0

    def test_uniform_image_scores_near_zero(self):
        image = _flat_image()

        grid = grid_scorer.score_grid(image, rows=4, cols=4)

        assert float(grid.max()) < 0.1

    def test_noisy_region_scores_higher_than_flat_region(self):
        # noise in the top-left quadrant only
        image = _noisy_patch(_flat_image(), 0, 120, 0, 160)

        grid = grid_scorer.score_grid(image, rows=2, cols=2)

        assert grid[0, 0] > grid[1, 1] + 0.2


class TestBaselineDiff:
    def test_identical_frames_diff_near_zero(self):
        image = _flat_image()

        grid = grid_scorer.score_grid(image, baseline=image.copy(), rows=4, cols=4)

        assert float(grid.max()) < 0.1

    def test_new_object_lights_up_its_cell(self):
        baseline = _flat_image()
        # "dropped a hoodie" in the bottom-right quadrant
        current = _noisy_patch(baseline, 120, 240, 160, 320)

        grid = grid_scorer.score_grid(current, baseline=baseline, rows=2, cols=2)

        assert grid[1, 1] > 0.3
        assert grid[0, 0] < 0.1

    def test_baseline_with_different_resolution_still_works(self):
        baseline = _flat_image(size=(480, 640))
        current = _noisy_patch(_flat_image(size=(240, 320)), 0, 120, 0, 160)

        grid = grid_scorer.score_grid(current, baseline=baseline, rows=2, cols=2)

        assert grid[0, 0] > grid[1, 1]


class TestRank:
    @pytest.mark.parametrize(
        ("score", "expected"),
        [
            (0.05, "S"),
            (0.2, "A"),
            (0.3, "B"),
            (0.5, "C"),
            (0.8, "D"),
        ],
    )
    def test_rank_thresholds(self, score: float, expected: str):
        assert grid_scorer.rank_from_score(score) == expected


class TestScan:
    def test_scan_returns_scanresult_shape(self):
        image = _noisy_patch(_flat_image(), 0, 120, 0, 160)

        result = grid_scorer.scan(image, baseline=None, rows=3, cols=4)

        assert result["gridRows"] == 3
        assert result["gridCols"] == 4
        assert len(result["zones"]) == 12
        assert result["source"] == "local"
        assert result["rank"] in {"S", "A", "B", "C", "D"}
        assert 0.0 <= result["overallScore"] <= 1.0

    def test_zone_coordinates_cover_full_grid(self):
        image = _flat_image()

        result = grid_scorer.scan(image, baseline=None, rows=2, cols=2)

        coords = {(zone["row"], zone["col"]) for zone in result["zones"]}
        assert coords == {(0, 0), (0, 1), (1, 0), (1, 1)}
