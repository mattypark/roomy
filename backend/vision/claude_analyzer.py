"""Claude Vision deep analyzer — the smart hybrid layer.

Sends the room frame + inspo photos + vibe text + the local CV grid to Claude,
which returns per-zone reasons/suggestions, style notes, and a shopping list.
Structured output is forced via a strict tool schema, so responses parse
deterministically.

Keyless (demo) mode builds a deterministic mock from the local scan so the
whole API works without an ANTHROPIC_API_KEY.
"""

import base64
import os

import anthropic

DEFAULT_MODEL = "claude-sonnet-5"
MAX_INSPO_IMAGES = 3
MAX_TOKENS = 8192

# local CV score is ground truth; Claude may adjust within this window.
# Bigger disagreements mean Claude is scoring style, not clutter — keep local.
MAX_SCORE_DRIFT = 0.35

ANALYSIS_TOOL = {
    "name": "report_room_analysis",
    "description": (
        "Report the room cleanliness + style analysis. Score every zone you "
        "were given, keeping row/col identical to the input grid."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "zones": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "row": {"type": "integer"},
                        "col": {"type": "integer"},
                        "clutterScore": {"type": "number"},
                        "reason": {
                            "type": "string",
                            "description": "What is in this zone and why it is/isn't clean. Short.",
                        },
                        "suggestion": {
                            "type": "string",
                            "description": "Concrete action for this zone (clean X / move Y / add Z). Short.",
                        },
                    },
                    "required": ["row", "col", "clutterScore", "reason", "suggestion"],
                    "additionalProperties": False,
                },
            },
            "styleNotes": {
                "type": "string",
                "description": "2-4 sentences: how well the room currently matches the requested vibe.",
            },
            "shoppingList": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "item": {"type": "string"},
                        "why": {"type": "string"},
                    },
                    "required": ["item", "why"],
                    "additionalProperties": False,
                },
                "description": "3-6 items to buy/move/remove to match the vibe.",
            },
        },
        "required": ["zones", "styleNotes", "shoppingList"],
        "additionalProperties": False,
    },
}


def enabled() -> bool:
    """True when a real Claude call is possible."""
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def model_id() -> str:
    return os.environ.get("ROOMY_MODEL", DEFAULT_MODEL)


def _image_block(jpeg_bytes: bytes) -> dict:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": base64.standard_b64encode(jpeg_bytes).decode(),
        },
    }


def _build_prompt(vibe_text: str, local_scan: dict, inspo_count: int) -> str:
    zone_lines = [
        f"({zone['row']},{zone['col']}): {zone['clutterScore']:.2f}"
        for zone in local_scan["zones"]
    ]
    inspo_note = (
        f"The first {inspo_count} image(s) are style inspiration the user wants "
        "their room to feel like. The LAST image is the actual room."
        if inspo_count
        else "The image is the user's actual room."
    )
    vibe = vibe_text.strip() or "no specific vibe given — default to clean and organized"
    return f"""You are roomy, a ceiling-camera room cleanliness and style analyst.

{inspo_note}

The user's desired vibe: "{vibe}"

A local CV pass already scored the room as a {local_scan['gridRows']}x{local_scan['gridCols']} grid
(row,col): clutterScore where 0.0 = spotless and 1.0 = disaster:
{chr(10).join(zone_lines)}

The grid maps onto the room image: row 0 = top edge, col 0 = left edge, evenly divided.

Report your analysis with the report_room_analysis tool:
- Score EVERY zone in the same grid. Trust the CV scores as a clutter baseline; adjust
  where you can see the CV is wrong (e.g. a busy bookshelf is not mess).
- reasons/suggestions: name actual objects you see. Be specific and useful.
- styleNotes: honestly assess how the room matches the vibe.
- shoppingList: concrete items to buy, move, or remove to hit the vibe."""


def merge_zone_scores(local_zones: list[dict], claude_zones: list[dict]) -> list[dict]:
    """Merge Claude's zone analysis onto the local CV grid.

    Local scores are ground truth for clutter; Claude scores are kept when they
    stay within MAX_SCORE_DRIFT of local (averaged), otherwise local wins.
    Claude's reason/suggestion always attach. Pure function — unit tested.
    """
    claude_by_cell = {(z["row"], z["col"]): z for z in claude_zones}
    merged = []
    for local in local_zones:
        cell = (local["row"], local["col"])
        claude = claude_by_cell.get(cell)
        zone = dict(local)
        if claude is not None:
            claude_score = float(min(max(claude.get("clutterScore", 0.0), 0.0), 1.0))
            if abs(claude_score - local["clutterScore"]) <= MAX_SCORE_DRIFT:
                zone["clutterScore"] = round((claude_score + local["clutterScore"]) / 2, 4)
            zone["reason"] = claude.get("reason")
            zone["suggestion"] = claude.get("suggestion")
        merged.append(zone)
    return merged


def demo_analysis(local_scan: dict, vibe_text: str) -> dict:
    """Deterministic keyless mock — canned insight on the dirtiest zones."""
    zones = [dict(zone) for zone in local_scan["zones"]]
    dirtiest = sorted(zones, key=lambda z: z["clutterScore"], reverse=True)[:3]
    canned = [
        ("Cluttered surface detected — likely loose items piled up.", "Clear this spot first; it drags the whole room down."),
        ("Higher visual noise than the clean baseline here.", "Put stray items back where they live."),
        ("This zone changed most since the room was last clean.", "Two-minute tidy: fold, stack, or bin what's here."),
    ]
    for zone, (reason, suggestion) in zip(dirtiest, canned):
        if zone["clutterScore"] > 0.15:
            zone["reason"] = reason
            zone["suggestion"] = suggestion
    vibe = vibe_text.strip()
    return {
        **local_scan,
        "zones": zones,
        "source": "demo",
        "styleNotes": (
            f"Demo mode — add an ANTHROPIC_API_KEY for real style analysis. "
            f"Requested vibe: '{vibe or 'none set'}'."
        ),
        "shoppingList": [
            {"item": "ANTHROPIC_API_KEY", "why": "unlocks real Claude Vision analysis + vibe-matched suggestions"},
        ],
    }


def analyze(
    frame_jpeg: bytes,
    vibe_text: str,
    inspo_jpegs: list[bytes],
    local_scan: dict,
) -> dict:
    """Full deep analysis. Falls back to demo mode when keyless.

    Raises anthropic.APIError variants on API failure — caller handles fallback.
    """
    if not enabled():
        return demo_analysis(local_scan, vibe_text)

    client = anthropic.Anthropic()
    content: list[dict] = [_image_block(jpeg) for jpeg in inspo_jpegs[:MAX_INSPO_IMAGES]]
    content.append(_image_block(frame_jpeg))
    content.append({
        "type": "text",
        "text": _build_prompt(vibe_text, local_scan, len(inspo_jpegs[:MAX_INSPO_IMAGES])),
    })

    response = client.messages.create(
        model=model_id(),
        max_tokens=MAX_TOKENS,
        tools=[ANALYSIS_TOOL],
        tool_choice={"type": "tool", "name": "report_room_analysis"},
        messages=[{"role": "user", "content": content}],
    )

    tool_input = next(
        (block.input for block in response.content if block.type == "tool_use"),
        None,
    )
    if tool_input is None:
        raise ValueError("Claude returned no tool_use block")

    merged_zones = merge_zone_scores(local_scan["zones"], tool_input["zones"])
    overall = _recompute_overall(merged_zones)
    return {
        **local_scan,
        "zones": merged_zones,
        "overallScore": overall["score"],
        "rank": overall["rank"],
        "source": "claude",
        "styleNotes": tool_input["styleNotes"],
        "shoppingList": tool_input["shoppingList"],
    }


def _recompute_overall(zones: list[dict]) -> dict:
    """Same worst-third weighting as grid_scorer.scan, over merged scores."""
    from vision import grid_scorer

    scores = sorted((z["clutterScore"] for z in zones), reverse=True)
    worst_third = scores[: max(1, len(scores) // 3)]
    overall = 0.5 * (sum(worst_third) / len(worst_third)) + 0.5 * (sum(scores) / len(scores))
    return {"score": round(overall, 4), "rank": grid_scorer.rank_from_score(overall)}
