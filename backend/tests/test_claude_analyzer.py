"""Unit tests for the Claude analyzer's pure logic — no network calls."""

from vision import claude_analyzer


def _local_scan(scores: dict[tuple[int, int], float], rows: int = 2, cols: int = 2) -> dict:
    zones = [
        {"row": r, "col": c, "clutterScore": scores.get((r, c), 0.0)}
        for r in range(rows)
        for c in range(cols)
    ]
    return {
        "zones": zones,
        "gridRows": rows,
        "gridCols": cols,
        "overallScore": 0.1,
        "rank": "S",
        "source": "local",
    }


class TestMergeZoneScores:
    def test_claude_reasons_attach_to_local_zones(self):
        local = _local_scan({(0, 0): 0.5})["zones"]
        claude = [
            {"row": 0, "col": 0, "clutterScore": 0.55, "reason": "pile of hoodies", "suggestion": "hang them up"},
        ]

        merged = claude_analyzer.merge_zone_scores(local, claude)

        assert merged[0]["reason"] == "pile of hoodies"
        assert merged[0]["suggestion"] == "hang them up"

    def test_close_scores_are_averaged(self):
        local = _local_scan({(0, 0): 0.5})["zones"]
        claude = [{"row": 0, "col": 0, "clutterScore": 0.7, "reason": "r", "suggestion": "s"}]

        merged = claude_analyzer.merge_zone_scores(local, claude)

        assert merged[0]["clutterScore"] == 0.6

    def test_wild_disagreement_keeps_local_score(self):
        # local says spotless; Claude says disaster → style opinion, not clutter
        local = _local_scan({(0, 0): 0.05})["zones"]
        claude = [{"row": 0, "col": 0, "clutterScore": 0.95, "reason": "r", "suggestion": "s"}]

        merged = claude_analyzer.merge_zone_scores(local, claude)

        assert merged[0]["clutterScore"] == 0.05

    def test_claude_score_clamped_to_valid_range(self):
        local = _local_scan({(0, 0): 0.9})["zones"]
        claude = [{"row": 0, "col": 0, "clutterScore": 5.0, "reason": "r", "suggestion": "s"}]

        merged = claude_analyzer.merge_zone_scores(local, claude)

        assert merged[0]["clutterScore"] <= 1.0

    def test_missing_claude_cell_leaves_local_untouched(self):
        local = _local_scan({(1, 1): 0.4})["zones"]

        merged = claude_analyzer.merge_zone_scores(local, [])

        assert merged == local

    def test_all_cells_preserved(self):
        local = _local_scan({}, rows=3, cols=4)["zones"]
        claude = [{"row": 0, "col": 0, "clutterScore": 0.1, "reason": "r", "suggestion": "s"}]

        merged = claude_analyzer.merge_zone_scores(local, claude)

        assert len(merged) == 12


class TestDemoAnalysis:
    def test_demo_shape_matches_analysis_result(self):
        scan = _local_scan({(0, 0): 0.8, (0, 1): 0.6, (1, 0): 0.4})

        result = claude_analyzer.demo_analysis(scan, "dark academia")

        assert result["source"] == "demo"
        assert isinstance(result["styleNotes"], str)
        assert "dark academia" in result["styleNotes"]
        assert len(result["shoppingList"]) >= 1
        assert {"item", "why"} <= set(result["shoppingList"][0])

    def test_demo_annotates_dirtiest_zones_only(self):
        scan = _local_scan({(0, 0): 0.9, (0, 1): 0.05, (1, 0): 0.05, (1, 1): 0.05})

        result = claude_analyzer.demo_analysis(scan, "")

        annotated = [z for z in result["zones"] if z.get("reason")]
        assert len(annotated) == 1
        assert annotated[0]["row"] == 0 and annotated[0]["col"] == 0

    def test_demo_does_not_mutate_input(self):
        scan = _local_scan({(0, 0): 0.9})
        before = [dict(z) for z in scan["zones"]]

        claude_analyzer.demo_analysis(scan, "")

        assert scan["zones"] == before


class TestEnabled:
    def test_disabled_without_key(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        assert claude_analyzer.enabled() is False

    def test_enabled_with_key(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
        assert claude_analyzer.enabled() is True

    def test_model_override(self, monkeypatch):
        monkeypatch.setenv("ROOMY_MODEL", "claude-opus-4-8")
        assert claude_analyzer.model_id() == "claude-opus-4-8"
