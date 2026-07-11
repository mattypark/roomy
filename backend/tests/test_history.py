"""Unit tests for the scan-history timeline."""

import json

import pytest

import history


@pytest.fixture(autouse=True)
def isolated_history(tmp_path, monkeypatch):
    """Point the history module at a temp file so tests never touch real data."""
    monkeypatch.setattr(history, "HISTORY_DIR", tmp_path)
    monkeypatch.setattr(history, "HISTORY_PATH", tmp_path / "scans.jsonl")


class TestAppendAndRead:
    def test_append_then_read_roundtrip(self):
        history.append(overall_score=0.42, rank="B", source="local", frame_id="frame-1")

        entries = history.read()

        assert len(entries) == 1
        assert entries[0]["overallScore"] == 0.42
        assert entries[0]["rank"] == "B"
        assert entries[0]["frameId"] == "frame-1"
        assert entries[0]["timestamp"] > 0

    def test_entries_kept_in_order(self):
        history.append(overall_score=0.9, rank="D", source="local", timestamp=1.0)
        history.append(overall_score=0.5, rank="C", source="local", timestamp=2.0)
        history.append(overall_score=0.1, rank="S", source="claude", timestamp=3.0)

        ranks = [entry["rank"] for entry in history.read()]

        assert ranks == ["D", "C", "S"]

    def test_read_empty_when_no_file(self):
        assert history.read() == []

    def test_corrupt_lines_skipped(self):
        history.append(overall_score=0.3, rank="B", source="local")
        with history.HISTORY_PATH.open("a") as handle:
            handle.write("NOT JSON{{{\n")
        history.append(overall_score=0.2, rank="A", source="local")

        entries = history.read()

        assert [e["rank"] for e in entries] == ["B", "A"]


class TestWipe:
    def test_wipe_clears_all(self):
        history.append(overall_score=0.3, rank="B", source="local")

        history.wipe()

        assert history.read() == []

    def test_wipe_when_empty_is_fine(self):
        history.wipe()
        assert history.read() == []


class TestTrim:
    def test_trims_past_max_entries(self, monkeypatch):
        monkeypatch.setattr(history, "MAX_ENTRIES", 5)
        for i in range(8):
            history.append(overall_score=i / 10, rank="B", source="local", timestamp=float(i))

        entries = history.read()

        assert len(entries) == 5
        assert entries[0]["timestamp"] == 3.0  # oldest three dropped

    def test_valid_jsonl_after_trim(self, monkeypatch):
        monkeypatch.setattr(history, "MAX_ENTRIES", 2)
        for i in range(4):
            history.append(overall_score=0.1, rank="A", source="local")

        for line in history.HISTORY_PATH.read_text().splitlines():
            json.loads(line)  # raises if trim corrupted the file
