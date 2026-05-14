"""Claude Sonnet vision call: frames + transcript -> structured YOSO taxonomy tags.

US-9.1 fields: SKU, format, hook_archetype, hook_mechanic, opening_subject,
on_screen_text, audio_type, audio_language, persona_implied, pain_addressed,
awareness_stage, angle, brand_visible_first_3s, product_reveal_second,
talent_type, setting, color_palette.

Plus YOSO/BSC-specific derived fields: follows_60pct_rule (US-7.3),
brand_visible_first_3s (US-7.4).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from app.config import settings
from app.tagging.frames import ExtractedFrame

log = logging.getLogger(__name__)


SKU_VOCAB = [
    "FBT",
    "FBT SE",
    "3@999",
    "18hr Sale",
    "Legend 365",
    "Blo Trimmer",
    "Sensi Smart 3",
    "Sensi Flo6",
    "HRS",
    "Bombae",
    "Fragrance",
    "Razors",
    "Remarketing",
    "Founder Content",
    "UNTAGGED",
]

PERSONA_VOCAB = [
    "Corporate Professional",
    "Gym-Goer",
    "College Student",
    "Tier-2 Aspirational",
    "Dad/Husband",
    "Newly-Single/Glow-up",
    "Dating-Active",
    "Body-Conscious",
    "Hygiene-Aware",
    "Undifferentiated",
]

AWARENESS_STAGE_VOCAB = [
    "Unaware",
    "Problem-Aware",
    "Solution-Aware",
    "Product-Aware",
    "Most-Aware",
]

HOOK_ARCHETYPE_VOCAB = [
    "POV/Relatable",
    "Humor Sketch",
    "Founder/Talking Head",
    "Product Demo",
    "Before/After Transformation",
    "Testimonial",
    "Meme Format",
    "UGC/Unboxing",
    "Listicle/Tips",
    "Trend-Jack",
    "Comparison",
    "Educational",
    "Offer/Discount Forward",
    "Cinematic Brand Film",
    "Other",
]

FORMAT_VOCAB = [
    "Talking Head",
    "Skit/Sketch",
    "Unboxing",
    "Product Demo",
    "Static Image",
    "Carousel Frame",
    "Explainer/VO over B-roll",
    "Lifestyle B-roll",
    "Trend Adaptation",
    "Other",
]

AUDIO_TYPE_VOCAB = [
    "Voiceover",
    "On-camera dialogue",
    "Music Only",
    "Trending Audio",
    "Silent",
    "Mixed",
]


SYSTEM_PROMPT = f"""You are the auto-tagger for BSC (Bombay Shaving Company) creatives.
You will receive frames from a paid social ad and (optionally) an audio transcript.
Your job: extract structured tags using the BSC/YOSO taxonomy below.

Output a single JSON object. NO prose, NO markdown fences. Top-level fields:

- sku: one of {SKU_VOCAB} (detected from visual content, NOT trusted Hawky labels)
- sku_confidence: float 0..1
- campaign: short string (e.g., "FBT Standalone", "3@999 Bundle", "18hr Sale"); null if unclear
- format: one of {FORMAT_VOCAB}
- hook_archetype: one of {HOOK_ARCHETYPE_VOCAB}
- hook_mechanic: short string describing the structural device (e.g., "POV first-person frame", "before/after split", "founder direct address")
- opening_subject: short string for who/what appears in the first frame (e.g., "young Indian man in bathroom", "FBT product on wooden surface", "Shantanu Deshpande to camera")
- on_screen_text: verbatim string of any text overlay visible in the first 0-3s; "" if none
- audio_type: one of {AUDIO_TYPE_VOCAB}
- audio_language: one of ["English", "Hindi", "Hinglish", "Other", "N/A"]
- persona_implied: one of {PERSONA_VOCAB}
- pain_addressed: short string describing the customer pain or desire (e.g., "razor bumps and ingrowns", "wants to look groomed for date")
- awareness_stage: one of {AWARENESS_STAGE_VOCAB}
- angle: short string for the strategic angle (e.g., "gifting", "convenience", "premium for less")
- brand_visible_first_3s: boolean — true if BSC logo/product/packaging is identifiable in the first 0-3s frames
- product_reveal_second: float seconds when product clearly appears; null if static image
- talent_type: one of ["Founder", "UGC Creator", "Actor/Model", "Animation/Graphics", "Voiceover Only", "Unknown"]
- setting: short string (e.g., "bathroom", "bedroom", "office", "gym", "neutral studio")
- color_palette: short string (e.g., "warm beige", "high-contrast neon", "muted earth tones")
- follows_60pct_rule: boolean — true if the product first clearly appears AFTER 60% of the video's duration
- _confidence: object with the same keys, each a float 0..1 representing extraction confidence

Rules:
- If the asset is a static image (only one frame provided), set product_reveal_second=null and follows_60pct_rule=null.
- Auto-detect SKU from visual content. Hawky labels are unreliable; do NOT use the user-provided Hawky label.
- Be conservative with confidence: if a frame is blurry/ambiguous, lower the confidence.
- Output ONLY valid JSON. No comments, no markdown.
"""


@dataclass
class TaggingResult:
    raw_response: str
    parsed: dict
    cost_inr: float
    model: str
    error: str | None = None


def _model_costs(model: str) -> tuple[float, float]:
    """Return (input_per_mtok_usd, output_per_mtok_usd). Best effort."""
    if "opus" in model:
        return (15.0, 75.0)
    if "haiku" in model:
        return (1.0, 5.0)
    # default Sonnet pricing
    return (3.0, 15.0)


def _strip_to_json(text: str) -> str:
    """Strip ```json fences and any leading prose."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        if text.endswith("```"):
            text = text[:-3].strip()
    # find first { and last } if there's still cruft
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
    return text


def tag_with_claude(
    *,
    frames: list[ExtractedFrame],
    transcript: str,
    actual_duration_seconds: float | None,
    asset_type: str,
    hawky_ad_name: str | None = None,
) -> TaggingResult:
    if not settings.anthropic_api_key:
        return TaggingResult("", {}, 0.0, settings.vision_model, error="ANTHROPIC_API_KEY not set")
    if not frames:
        return TaggingResult("", {}, 0.0, settings.vision_model, error="no frames extracted")

    try:
        from anthropic import Anthropic
    except ImportError:
        return TaggingResult("", {}, 0.0, settings.vision_model, error="anthropic package not installed")

    user_blocks: list[dict] = []
    user_blocks.append(
        {
            "type": "text",
            "text": (
                f"Asset type: {asset_type}\n"
                f"Actual duration: {actual_duration_seconds:.2f}s" if actual_duration_seconds else "Actual duration: unknown"
            )
            + (f"\nHawky ad name (for reference only — may be wrong): {hawky_ad_name}" if hawky_ad_name else "")
            + (f"\nAudio transcript: {transcript}" if transcript else "\nAudio transcript: (empty / music-only)"),
        }
    )

    for frame in frames:
        user_blocks.append(
            {
                "type": "text",
                "text": f"Frame {frame.label} @ {frame.timestamp:.2f}s:",
            }
        )
        user_blocks.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": frame.as_base64(),
                },
            }
        )

    user_blocks.append(
        {
            "type": "text",
            "text": "Tag this asset using the BSC/YOSO taxonomy. Return ONE JSON object, nothing else.",
        }
    )

    client = Anthropic(api_key=settings.anthropic_api_key)

    try:
        message = client.messages.create(
            model=settings.vision_model,
            max_tokens=1500,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_blocks}],
        )
    except Exception as e:
        return TaggingResult("", {}, 0.0, settings.vision_model, error=f"anthropic_api_error: {e}")

    raw_text = "".join(
        block.text for block in message.content if getattr(block, "type", None) == "text"
    )

    try:
        parsed = json.loads(_strip_to_json(raw_text))
    except json.JSONDecodeError as e:
        return TaggingResult(raw_text, {}, 0.0, settings.vision_model, error=f"json_parse_error: {e}")

    in_cost, out_cost = _model_costs(settings.vision_model)
    usage = getattr(message, "usage", None)
    input_tok = getattr(usage, "input_tokens", 0) if usage else 0
    output_tok = getattr(usage, "output_tokens", 0) if usage else 0
    cost_usd = (input_tok / 1_000_000) * in_cost + (output_tok / 1_000_000) * out_cost
    cost_inr = round(cost_usd * 83.0, 4)

    return TaggingResult(
        raw_response=raw_text,
        parsed=parsed,
        cost_inr=cost_inr,
        model=settings.vision_model,
    )
