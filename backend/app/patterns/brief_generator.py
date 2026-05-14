"""Brief Generator (Module 5 / US-5.1).

Takes a Magic Formula output and produces a creative brief: title, hook options
(3 verbal + 3 on-screen), mechanic, music/talent direction, duration target,
reference assets. Uses Claude to generate hooks following BSC voice rules.

YOSO script voice (per PRD §5.5):
- 'tum' not 'tu' (formal-but-warm Hindi)
- 'Bro' usage allowed
- Mandatory close: 'Khul ke Khel Bro'
- Hinglish > English where the audience allows
"""
from __future__ import annotations

import json
import logging

from app.config import settings
from app.patterns.formula import FormulaResult

log = logging.getLogger(__name__)


BSC_VOICE_RULES = """\
BSC SCRIPT VOICE RULES (non-negotiable):
- Hindi pronouns: 'tum' (NOT 'tu' — it reads aggressive). Always 'tum'.
- Casual male direct-address: 'Bro' is allowed and encouraged.
- Mandatory closing line on every script: "Khul ke Khel Bro"
- Default language for the BSC core audience (Indian men, 18-34): Hinglish.
  Hindi script for the on-screen lines is fine when the spoken hook is Hinglish.
- Avoid: 'aaj kal ke ladke', 'bhai sahab', 'guys'. These read either tired or off-brand.
- Pain points should feel observed, not preached at.
- The hook must do the work in the first 2 seconds. Brand/product reveal comes later
  (60% rule, unless the SKU + persona data says otherwise for this brief).
"""


HOOK_GENERATION_PROMPT = """\
You are the YOSO Hook Architect generating opening lines for a BSC creative brief.

CONTEXT — the data-grounded formula for this brief:
{formula_summary}

{voice_rules}

Generate exactly 3 verbal hook options and 3 on-screen text hook options.
- Verbal hooks: what the talent SAYS in the first 2 seconds. 1-2 sentences each.
- On-screen text hooks: what APPEARS as overlay text in the first 0-3s. 4-8 words each.
- Both should target the persona, address the pain, and respect the language constraint.
- Each verbal hook should feel like a different angle, not three rewrites of the same line.

Also propose:
- mechanic: ONE short sentence describing the creative mechanic (POV first-person, before/after split, founder direct-address, etc.)
- music_direction: ONE short sentence (e.g., "trending Hinglish hook track, mid-tempo")
- talent_direction: ONE short sentence (e.g., "early-20s college student type, glasses, casual t-shirt")
- duration_target_seconds: integer
- title: ONE short string (under 60 chars) for the brief

Return STRICT JSON, no prose, no markdown fences:
{{
  "title": "...",
  "verbal_hooks": ["...", "...", "..."],
  "on_screen_hooks": ["...", "...", "..."],
  "mechanic": "...",
  "music_direction": "...",
  "talent_direction": "...",
  "duration_target_seconds": 22
}}
"""


def _strip_to_json(text: str) -> str:
    import re
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        if text.endswith("```"):
            text = text[:-3].strip()
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
    return text


def _formula_summary(formula: FormulaResult) -> str:
    """Human-readable summary of the formula for the LLM prompt."""
    lines = [
        f"Target SKU: {formula.target_sku}",
        f"Optimizing for: {formula.metric}",
    ]
    if formula.persona:
        lines.append(f"Target persona: {formula.persona}")
    lines.append(f"Cohort: {formula.cohort_size} historical creatives, overall confidence {formula.overall_confidence}")
    lines.append("")
    lines.append("Recommended tag values:")
    for r in formula.recommendations:
        if r.value is None:
            continue
        lines.append(f"  - {r.label}: {r.value} (n={r.n}, {r.confidence})")
    if formula.references:
        lines.append("")
        lines.append("Top reference creatives:")
        for ref in formula.references:
            name = ref.ad_name or ref.asset_id
            lines.append(f"  - {name} (ROAS={ref.roas}, hook_rate={ref.hook_rate})")
    return "\n".join(lines)


def generate_brief_content(formula: FormulaResult) -> dict:
    """Call Claude to draft hooks + brief metadata from the formula."""
    if not settings.anthropic_api_key:
        return {"error": "ANTHROPIC_API_KEY not set"}

    try:
        from anthropic import Anthropic
    except ImportError:
        return {"error": "anthropic package not installed"}

    prompt = HOOK_GENERATION_PROMPT.format(
        formula_summary=_formula_summary(formula),
        voice_rules=BSC_VOICE_RULES,
    )

    client = Anthropic(api_key=settings.anthropic_api_key)
    try:
        message = client.messages.create(
            model=settings.vision_model,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        log.exception("brief hook generation failed")
        return {"error": f"anthropic_api_error: {e}"}

    raw_text = "".join(
        block.text for block in message.content if getattr(block, "type", None) == "text"
    )

    try:
        parsed = json.loads(_strip_to_json(raw_text))
    except json.JSONDecodeError as e:
        return {"error": f"json_parse_error: {e}", "raw": raw_text[:500]}

    # Defensive guards — if the model returned the wrong shape, normalize
    parsed.setdefault("title", f"{formula.target_sku} — auto-generated brief")
    parsed.setdefault("verbal_hooks", [])
    parsed.setdefault("on_screen_hooks", [])
    parsed.setdefault("mechanic", "")
    parsed.setdefault("music_direction", "")
    parsed.setdefault("talent_direction", "")
    parsed.setdefault("duration_target_seconds", 22)

    # Cost accounting (best-effort)
    usage = getattr(message, "usage", None)
    input_tok = getattr(usage, "input_tokens", 0) if usage else 0
    output_tok = getattr(usage, "output_tokens", 0) if usage else 0
    cost_usd = (input_tok / 1_000_000) * 3.0 + (output_tok / 1_000_000) * 15.0
    parsed["_cost_inr"] = round(cost_usd * 83.0, 4)

    return parsed


def assemble_brief_markdown(formula: FormulaResult, generated: dict) -> str:
    """Render the brief as markdown ready for the rich-text editor."""
    lines = [
        f"# {generated.get('title', formula.target_sku)}",
        "",
        f"**SKU:** {formula.target_sku}  ",
        f"**Target persona:** {formula.persona or '— any —'}  ",
        f"**Optimizing for:** {formula.metric}  ",
        f"**Overall confidence:** {formula.overall_confidence}  ",
        f"**Cohort size:** {formula.cohort_size} historical creatives",
        "",
        "## Tag manifest",
    ]
    for r in formula.recommendations:
        if r.value is None:
            continue
        lines.append(f"- **{r.label}**: {r.value} _(n={r.n}, {r.confidence})_")
    lines.append("")
    lines.append("## Verbal hook options")
    for i, h in enumerate(generated.get("verbal_hooks", []), 1):
        lines.append(f"{i}. {h}")
    lines.append("")
    lines.append("## On-screen text options")
    for i, h in enumerate(generated.get("on_screen_hooks", []), 1):
        lines.append(f"{i}. {h}")
    lines.append("")
    lines.append("## Production direction")
    lines.append(f"- **Mechanic:** {generated.get('mechanic', '')}")
    lines.append(f"- **Music:** {generated.get('music_direction', '')}")
    lines.append(f"- **Talent:** {generated.get('talent_direction', '')}")
    lines.append(f"- **Duration target:** {generated.get('duration_target_seconds', 22)}s")
    lines.append("")
    lines.append("## Mandatory close")
    lines.append("> Khul ke Khel Bro")
    lines.append("")
    if formula.references:
        lines.append("## Reference creatives (data-validated)")
        for ref in formula.references:
            name = ref.ad_name or ref.asset_id
            lines.append(
                f"- **{name}** — ROAS {ref.roas or '—'}, "
                f"Hook {(ref.hook_rate or 0) * 100:.1f}%, "
                f"match {ref.match_score * 100:.0f}%"
            )
    if formula.risks:
        lines.append("")
        lines.append("## Risks to flag with editor")
        for r in formula.risks:
            lines.append(f"- {r}")
    return "\n".join(lines)
