"""Cultural Moment Calendar — Indian male audience 18-34 (BSC core).

Hardcoded for the pilot. Each moment is a recurring annual date (or short window)
with suggested creative angle, persona match, and lead time.

Months: 1=Jan ... 12=Dec. Days are ISO calendar.
For non-fixed dates (e.g., IPL, cricket matches), we use approximate windows.
The frontend renders a rolling 3-week window relative to today.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CulturalMoment:
    id: str
    name: str
    category: str  # Festival | Sports | College | QuickCommerce | BSC | Cultural
    month: int
    day: int  # 1..31; for windows, this is the start day
    window_days: int = 1
    relevance: str = "Medium"  # High | Medium | Low
    persona: str | None = None
    suggested_sku: list[str] = None
    angle: str = ""
    example_hook: str = ""
    lead_time_days: int = 7
    sensitive: bool = False  # If true, must be reviewed before activation

    def __post_init__(self):
        if self.suggested_sku is None:
            self.suggested_sku = []


# Note: months use the Gregorian calendar; festival dates approximate
# the typical year and slip a few days due to lunar calendars.
CULTURAL_MOMENTS: list[CulturalMoment] = [
    # ===== Festivals =====
    CulturalMoment(
        id="valentines",
        name="Valentine's Day",
        category="Festival",
        month=2, day=14, window_days=1,
        relevance="High",
        persona="Dating-Active",
        suggested_sku=["FBT SE", "Fragrance", "Razors"],
        angle="Gifting — she is the buyer, he is the beneficiary",
        example_hook="POV: she finally found a gift that won't end up in a drawer",
        lead_time_days=10,
    ),
    CulturalMoment(
        id="holi",
        name="Holi",
        category="Festival",
        month=3, day=14, window_days=1,
        relevance="Medium",
        persona="College Student",
        suggested_sku=["Bombae", "Blo Trimmer"],
        angle="Pre-Holi grooming for the squad photo",
        example_hook="Holi ke pehle, fresh dikhna mandatory hai",
        lead_time_days=10,
    ),
    CulturalMoment(
        id="raksha-bandhan",
        name="Raksha Bandhan",
        category="Festival",
        month=8, day=19, window_days=1,
        relevance="Medium",
        persona="Dad/Husband",
        suggested_sku=["FBT SE", "3@999"],
        angle="Sister gifting — gift bundle for the brother who never buys for himself",
        example_hook="Bhai ka gift, bhai jaise se",
        lead_time_days=10,
    ),
    CulturalMoment(
        id="diwali",
        name="Diwali",
        category="Festival",
        month=11, day=1, window_days=3,
        relevance="High",
        persona="Dad/Husband",
        suggested_sku=["FBT SE", "3@999", "Fragrance"],
        angle="Festive grooming + corporate gifting + family photos",
        example_hook="Diwali photos mein perfect dikhne ka secret",
        lead_time_days=14,
    ),
    CulturalMoment(
        id="new-year",
        name="New Year",
        category="Festival",
        month=12, day=31, window_days=1,
        relevance="High",
        persona="Newly-Single/Glow-up",
        suggested_sku=["Blo Trimmer", "Fragrance"],
        angle="Glow-up resolution — 'new year, new you'",
        example_hook="2027 main koi naya tum dekhega",
        lead_time_days=14,
    ),
    CulturalMoment(
        id="karva-chauth",
        name="Karva Chauth",
        category="Festival",
        month=10, day=20, window_days=1,
        relevance="Medium",
        persona="Dad/Husband",
        suggested_sku=["FBT SE", "Fragrance"],
        angle="Wife gifting — 'he forgot, but you got him this'",
        example_hook="Karva Chauth gift idea jo wo actually use karega",
        lead_time_days=10,
    ),
    # ===== Sports =====
    CulturalMoment(
        id="ipl-start",
        name="IPL Season Start",
        category="Sports",
        month=3, day=22, window_days=70,
        relevance="High",
        persona="Gym-Goer",
        suggested_sku=["Blo Trimmer", "FBT"],
        angle="Match-day grooming — be camera-ready for friends watching with you",
        example_hook="Match dekhne se pehle 2 min lagao, screen pe accha lagega",
        lead_time_days=14,
    ),
    CulturalMoment(
        id="cricket-final",
        name="ICC Tournament Final Windows",
        category="Sports",
        month=10, day=15, window_days=20,
        relevance="Medium",
        persona="Gym-Goer",
        suggested_sku=["Blo Trimmer", "Razors"],
        angle="Cricket finale culture — reactive content",
        example_hook="Final ke din nashta + grooming = jeet",
        lead_time_days=3,
    ),
    # ===== College Calendar =====
    CulturalMoment(
        id="exams-end",
        name="College Exam End",
        category="College",
        month=5, day=15, window_days=20,
        relevance="High",
        persona="College Student",
        suggested_sku=["3@999", "Blo Trimmer"],
        angle="Post-exam vibe shift — getting ready to socialize again",
        example_hook="Exams khatam, ab apne aap pe focus",
        lead_time_days=10,
    ),
    CulturalMoment(
        id="freshers",
        name="College Freshers Season",
        category="College",
        month=8, day=15, window_days=30,
        relevance="High",
        persona="College Student",
        suggested_sku=["3@999", "FBT", "Blo Trimmer"],
        angle="First-impression grooming for college freshers",
        example_hook="College ka first day, judging starts from your skin",
        lead_time_days=14,
    ),
    # ===== BSC =====
    CulturalMoment(
        id="18hr-sale",
        name="BSC 18hr Sale",
        category="BSC",
        month=5, day=18, window_days=1,
        relevance="High",
        persona=None,
        suggested_sku=["18hr Sale"],
        angle="Flash-sale offer urgency",
        example_hook="18 ghante. Saath baar nahi milega",
        lead_time_days=5,
    ),
    CulturalMoment(
        id="18hr-sale-jun",
        name="BSC 18hr Sale",
        category="BSC",
        month=6, day=18, window_days=1,
        relevance="High",
        persona=None,
        suggested_sku=["18hr Sale"],
        angle="Flash-sale offer urgency",
        example_hook="18 ghante. Saath baar nahi milega",
        lead_time_days=5,
    ),
    CulturalMoment(
        id="18hr-sale-jul",
        name="BSC 18hr Sale",
        category="BSC",
        month=7, day=18, window_days=1,
        relevance="High",
        persona=None,
        suggested_sku=["18hr Sale"],
        angle="Flash-sale offer urgency",
        example_hook="18 ghante. Saath baar nahi milega",
        lead_time_days=5,
    ),
    # ===== Quick Commerce =====
    CulturalMoment(
        id="zepto-peak-eve",
        name="Quick-Commerce Friday Eve",
        category="QuickCommerce",
        month=1, day=1, window_days=365,  # weekly recurring — frontend special-cases
        relevance="Medium",
        persona="Corporate Professional",
        suggested_sku=["FBT SE", "Fragrance"],
        angle="Friday-evening, last-minute weekend prep — Zepto/Blinkit window",
        example_hook="Shaam ko date plan ho gaya? 10 min mein ready",
        lead_time_days=2,
    ),
]


def moments_in_window(today, weeks_ahead: int = 3) -> list[dict]:
    """Return moments whose date falls within today..today+weeks_ahead.

    For recurring annual moments, we project the current-year date and only
    include if it lies inside the window.
    """
    from datetime import datetime, timedelta
    end = today + timedelta(weeks=weeks_ahead)
    results = []
    for m in CULTURAL_MOMENTS:
        # Project to current year (or next if already passed by today)
        try:
            event_date = datetime(today.year, m.month, m.day)
        except ValueError:
            continue
        if event_date < today:
            try:
                event_date = datetime(today.year + 1, m.month, m.day)
            except ValueError:
                continue
        if event_date <= end:
            days_until = (event_date - today).days
            production_critical = days_until < m.lead_time_days
            results.append({
                "id": m.id,
                "name": m.name,
                "category": m.category,
                "date": event_date.strftime("%Y-%m-%d"),
                "days_until": days_until,
                "window_days": m.window_days,
                "relevance": m.relevance,
                "persona": m.persona,
                "suggested_sku": m.suggested_sku,
                "angle": m.angle,
                "example_hook": m.example_hook,
                "lead_time_days": m.lead_time_days,
                "production_critical": production_critical,
                "sensitive": m.sensitive,
            })
    results.sort(key=lambda r: r["days_until"])
    return results
