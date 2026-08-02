"""Synthetic priced history for demos, tests and cold starts.

Nothing here is a substitute for your own won/lost bids — it exists so the
package runs end to end the moment it is installed, and so the test suite has a
dataset with a *known* generating process to check the models against.

The generator deliberately mimics the awkward parts of real bills: the same
work described several different ways, trade shorthand, economies of scale on
big quantities, regional and inflationary drift, and per-project pricing
character (one contractor's site team is simply dearer than another's).
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .indexation import IndexationPolicy


@dataclass
class ItemTemplate:
    category: str
    text: str  # may contain a "{variant}" placeholder
    unit: str
    base_rate: float  # € at base date, baseline region
    rate_sigma: float  # lognormal dispersion of the "true" rate
    quantity_median: float
    quantity_sigma: float = 0.8
    elasticity: float = 0.06  # rate discount as quantity grows
    variants: tuple[tuple[str, float], ...] = (("", 1.0),)
    tags: tuple[str, ...] = field(default=())


# --------------------------------------------------------------------------
# Item library (indicative Irish civils / utilities rates, € ex-VAT)
# --------------------------------------------------------------------------
TEMPLATES: tuple[ItemTemplate, ...] = (
    # --- Preliminaries -------------------------------------------------
    ItemTemplate("Preliminaries & Site Setup", "Site set up, welfare unit and secure compound", "week", 900, 0.18, 12, 0.5),
    ItemTemplate("Preliminaries & Site Setup", "Site supervision - {variant}", "week", 1800, 0.14, 12, 0.5,
                 variants=(("site agent", 1.0), ("ganger", 0.62), ("project engineer", 0.92))),
    ItemTemplate("Preliminaries & Site Setup", "Mobilisation and demobilisation of plant to site", "item", 3200, 0.25, 1, 0.15),
    ItemTemplate("Preliminaries & Site Setup", "Temporary fencing and site security hoarding", "m", 34, 0.22, 180, 0.7),
    ItemTemplate("Preliminaries & Site Setup", "Insurances, bonds and statutory notices", "item", 4200, 0.3, 1, 0.15),
    # --- Traffic management --------------------------------------------
    ItemTemplate("Traffic Management", "Provision of traffic management {variant}", "week", 1400, 0.2, 10, 0.6,
                 variants=(("including stop/go operatives and signage", 1.0),
                           ("with two-way portable signals", 1.35),
                           ("for footpath closure and pedestrian diversion", 0.55))),
    ItemTemplate("Traffic Management", "Preparation and approval of traffic management plan (Chapter 8)", "item", 650, 0.28, 1, 0.2),
    ItemTemplate("Traffic Management", "Road closure licence and advance warning signage", "item", 1150, 0.3, 1, 0.3),
    # --- Excavation -----------------------------------------------------
    ItemTemplate("Excavation & Earthworks", "Excavate trench {variant} in soft ground including support and backfill", "m", 26, 0.24, 420, 0.9, 0.07,
                 variants=((r"450mm wide x 750mm deep", 0.72), (r"600mm wide x 1.0m deep", 1.0),
                           (r"750mm wide x 1.2m deep", 1.34), (r"900mm wide x 1.5m deep", 1.85))),
    ItemTemplate("Excavation & Earthworks", "Excavate trench in existing carriageway including saw cutting and breaking out", "m", 48, 0.26, 260, 0.9, 0.06),
    ItemTemplate("Excavation & Earthworks", "Excavation in rock including breaking and removal", "m3", 120, 0.3, 45, 1.0, 0.05),
    ItemTemplate("Excavation & Earthworks", "Disposal of surplus excavated material off site to licensed facility", "m3", 34, 0.22, 320, 0.9, 0.08),
    ItemTemplate("Excavation & Earthworks", "Supply and place imported granular fill Clause 804", "m3", 48, 0.18, 210, 0.9, 0.08),
    ItemTemplate("Excavation & Earthworks", "Dewatering of excavations including pumps and settlement tank", "week", 780, 0.3, 6, 0.7),
    ItemTemplate("Excavation & Earthworks", "Trench support to deep excavation using proprietary shoring", "m", 42, 0.28, 90, 0.9),
    # --- Ducting --------------------------------------------------------
    ItemTemplate("Ducting & Cable Protection", "Supply and lay {variant} HDPE duct in prepared trench including bedding", "m", 14, 0.2, 480, 0.9, 0.07,
                 variants=(("1no. 110mm", 1.0), ("2no. 110mm", 1.7), ("4no. 110mm", 2.9), ("6no. 110mm", 4.1))),
    ItemTemplate("Ducting & Cable Protection", "Supply and lay {variant} twinwall duct including draw rope", "m", 18, 0.2, 380, 0.9, 0.07,
                 variants=(("110mm diameter", 1.0), ("160mm diameter", 1.32), ("225mm diameter", 1.95))),
    ItemTemplate("Ducting & Cable Protection", "Supply and install draw rope to existing duct", "m", 1.2, 0.25, 900, 0.9, 0.1),
    ItemTemplate("Ducting & Cable Protection", "Supply and lay cable protection tiles and marker tape", "m", 3.4, 0.22, 640, 0.9, 0.09),
    ItemTemplate("Ducting & Cable Protection", "Concrete surround to ducts C20/25", "m3", 168, 0.2, 34, 0.9, 0.05),
    ItemTemplate("Ducting & Cable Protection", "Horizontal directional drill {variant} including entry and exit pits", "m", 165, 0.3, 60, 0.8, 0.05,
                 variants=(("125mm bore", 1.0), ("180mm bore", 1.42), ("250mm bore", 2.1))),
    # --- Chambers -------------------------------------------------------
    ItemTemplate("Chambers & Jointing Bays", "Construct {variant} jointing chamber including excavation, base and backfill", "nr", 1450, 0.22, 8, 0.7, 0.03,
                 variants=(("type JB4", 0.72), ("type JB6", 1.0), ("type JB9", 1.55), ("type JB12", 2.3))),
    ItemTemplate("Chambers & Jointing Bays", "Supply and install precast concrete draw pit 600x600 including cover", "nr", 640, 0.22, 14, 0.8, 0.04),
    ItemTemplate("Chambers & Jointing Bays", "Supply and fit {variant} cover and frame to chamber", "nr", 420, 0.2, 16, 0.8, 0.05,
                 variants=(("D400 ductile", 1.0), ("C250 ductile", 0.78), ("B125 composite", 0.62))),
    ItemTemplate("Chambers & Jointing Bays", "Raise or lower existing chamber to finished road level", "nr", 380, 0.28, 12, 0.8),
    # --- Cabling --------------------------------------------------------
    ItemTemplate("Cabling & Terminations", "Supply and pull in {variant} MV cable including all fixings", "m", 38, 0.2, 520, 0.9, 0.06,
                 variants=(("95mm2 3 core XLPE", 0.74), ("185mm2 3 core XLPE", 1.0), ("300mm2 3 core XLPE", 1.48))),
    ItemTemplate("Cabling & Terminations", "Pull in LV service cable {variant} to dwelling including duct entry", "m", 16, 0.22, 260, 0.9, 0.07,
                 variants=(("25mm2", 0.8), ("35mm2", 1.0), ("95mm2", 1.45))),
    ItemTemplate("Cabling & Terminations", "Straight joint to {variant} MV cable", "nr", 1150, 0.2, 6, 0.7, 0.03),
    ItemTemplate("Cabling & Terminations", "Terminate MV cable into switchgear including testing", "nr", 890, 0.22, 6, 0.7, 0.03),
    ItemTemplate("Cabling & Terminations", "Blow in fibre optic cable to existing subduct", "m", 3.5, 0.25, 1400, 0.9, 0.1),
    ItemTemplate("Cabling & Terminations", "Fusion splice fibre optic cable including tray and closure", "nr", 38, 0.24, 48, 0.9, 0.06),
    ItemTemplate("Cabling & Terminations", "Earthing installation including rods, tape and connections", "item", 1650, 0.28, 1, 0.3),
    # --- Concrete -------------------------------------------------------
    ItemTemplate("Concrete & Structures", "Supply and place {variant} concrete to foundations", "m3", 190, 0.16, 42, 0.9, 0.06,
                 variants=(("C25/30", 0.94), ("C30/37", 1.0), ("C35/45", 1.09))),
    ItemTemplate("Concrete & Structures", "Supply and fix {variant} mesh reinforcement", "m2", 13, 0.2, 220, 0.9, 0.08,
                 variants=(("A142", 0.78), ("A252", 0.9), ("A393", 1.0))),
    ItemTemplate("Concrete & Structures", "Formwork to edges and faces of concrete", "m2", 55, 0.22, 130, 0.9, 0.07),
    ItemTemplate("Concrete & Structures", "Construct reinforced concrete plinth to substation unit", "nr", 3800, 0.24, 3, 0.6, 0.03),
    ItemTemplate("Concrete & Structures", "Blockwork wall 215mm including fair face and capping", "m2", 118, 0.2, 65, 0.9, 0.06),
    # --- Drainage -------------------------------------------------------
    ItemTemplate("Drainage", "Supply and lay {variant} uPVC sewer pipe including bedding and surround", "m", 62, 0.2, 180, 0.9, 0.06,
                 variants=(("150mm diameter", 0.78), ("225mm diameter", 1.0), ("300mm diameter", 1.38), ("450mm diameter", 2.15))),
    ItemTemplate("Drainage", "Construct precast concrete manhole {variant} including cover and frame", "nr", 2200, 0.22, 6, 0.7, 0.03,
                 variants=(("1050mm dia. 1.5-2.0m deep", 1.0), ("1200mm dia. 2.0-3.0m deep", 1.55),
                           ("1500mm dia. 3.0-4.0m deep", 2.4))),
    ItemTemplate("Drainage", "Supply and install road gully including connection to sewer", "nr", 520, 0.2, 14, 0.8, 0.05),
    ItemTemplate("Drainage", "CCTV survey of completed drainage including report", "m", 3.8, 0.24, 320, 0.9, 0.09),
    # --- Watermains -----------------------------------------------------
    ItemTemplate("Watermains", "Supply and lay {variant} PE100 watermain including fittings", "m", 78, 0.2, 340, 0.9, 0.06,
                 variants=(("90mm", 0.55), ("125mm", 0.76), ("180mm", 1.0), ("250mm", 1.42))),
    ItemTemplate("Watermains", "Supply and install sluice valve {variant} including surround box", "nr", 1250, 0.22, 5, 0.7, 0.04,
                 variants=(("100mm", 0.78), ("150mm", 1.0), ("200mm", 1.35))),
    ItemTemplate("Watermains", "Supply and install fire hydrant including marker post", "nr", 950, 0.2, 6, 0.7, 0.04),
    ItemTemplate("Watermains", "New 25mm water service connection to boundary box", "nr", 420, 0.22, 22, 0.9, 0.06),
    # --- Reinstatement --------------------------------------------------
    ItemTemplate("Road Reinstatement & Surfacing", "Permanent reinstatement of {variant} to road opening licence standard", "m2", 68, 0.18, 420, 0.9, 0.07,
                 variants=(("carriageway", 1.0), ("footpath in bitmac", 0.78), ("footpath in concrete flags", 0.92))),
    ItemTemplate("Road Reinstatement & Surfacing", "Supply and lay {variant} surface course", "m2", 22, 0.18, 620, 0.9, 0.08,
                 variants=(("40mm SMA", 1.0), ("50mm HRA", 1.18), ("30mm AC10", 0.86))),
    ItemTemplate("Road Reinstatement & Surfacing", "Supply and lay precast concrete kerbing including haunching", "m", 48, 0.2, 180, 0.9, 0.07),
    ItemTemplate("Road Reinstatement & Surfacing", "Reinstate road markings to match existing", "m", 9, 0.25, 240, 0.9, 0.09),
    ItemTemplate("Road Reinstatement & Surfacing", "Planing of existing bituminous surfacing 40mm", "m2", 7.5, 0.22, 540, 0.9, 0.09),
    # --- Testing --------------------------------------------------------
    ItemTemplate("Testing & Commissioning", "Pressure testing, swabbing and disinfection of new watermain", "m", 4.5, 0.26, 340, 0.9, 0.1),
    ItemTemplate("Testing & Commissioning", "Testing and energisation of MV network including switching", "item", 2400, 0.28, 1, 0.3),
    ItemTemplate("Testing & Commissioning", "Insulation resistance and continuity testing of installed cable", "nr", 210, 0.25, 12, 0.8, 0.06),
    # --- Plant ----------------------------------------------------------
    ItemTemplate("Plant & Equipment Supply", "Supply and install {variant} ground mounted transformer", "nr", 14500, 0.18, 2, 0.5, 0.02,
                 variants=(("315kVA", 0.86), ("400kVA", 1.0), ("630kVA", 1.32))),
    ItemTemplate("Plant & Equipment Supply", "Supply and install feeder pillar including connections", "nr", 2200, 0.2, 4, 0.7, 0.04),
    ItemTemplate("Plant & Equipment Supply", "Supply and erect {variant} public lighting column with LED lantern", "nr", 1450, 0.18, 12, 0.8, 0.05,
                 variants=(("6m", 0.86), ("8m", 1.0), ("10m", 1.22))),
    # --- Surveys --------------------------------------------------------
    ItemTemplate("Professional Services & Surveys", "Utility detection survey and slit trenching prior to excavation", "nr", 380, 0.26, 16, 0.9, 0.06),
    ItemTemplate("Professional Services & Surveys", "Topographical survey and setting out of works", "day", 720, 0.22, 6, 0.7),
    ItemTemplate("Professional Services & Surveys", "Preparation of as-built drawings and safety file", "item", 1200, 0.28, 1, 0.25),
    # --- Landscaping ----------------------------------------------------
    ItemTemplate("Landscaping & Site Finishes", "Supply and place topsoil and seed to verges", "m2", 8.5, 0.24, 480, 0.9, 0.09),
    ItemTemplate("Landscaping & Site Finishes", "Supply and erect post and rail fencing to boundary", "m", 38, 0.22, 160, 0.9, 0.07),
    ItemTemplate("Landscaping & Site Finishes", "Site clearance including removal of vegetation and debris", "m2", 4.2, 0.28, 900, 0.9, 0.1),
)

PROJECT_TYPES: dict[str, dict[str, float]] = {
    "MV Cable Installation": {
        "Cabling & Terminations": 3.0, "Ducting & Cable Protection": 2.5,
        "Excavation & Earthworks": 2.5, "Chambers & Jointing Bays": 2.0,
        "Road Reinstatement & Surfacing": 2.0, "Traffic Management": 1.5,
        "Preliminaries & Site Setup": 1.2, "Testing & Commissioning": 1.0,
        "Professional Services & Surveys": 0.8, "Plant & Equipment Supply": 0.6,
    },
    "Fibre Duct Network": {
        "Ducting & Cable Protection": 3.5, "Excavation & Earthworks": 2.5,
        "Chambers & Jointing Bays": 2.0, "Cabling & Terminations": 2.0,
        "Road Reinstatement & Surfacing": 2.0, "Traffic Management": 1.5,
        "Preliminaries & Site Setup": 1.2, "Professional Services & Surveys": 0.8,
    },
    "Watermain Rehabilitation": {
        "Watermains": 3.5, "Excavation & Earthworks": 2.5,
        "Road Reinstatement & Surfacing": 2.2, "Testing & Commissioning": 1.5,
        "Traffic Management": 1.5, "Preliminaries & Site Setup": 1.2,
        "Chambers & Jointing Bays": 0.8, "Professional Services & Surveys": 0.8,
    },
    "Foul Drainage Upgrade": {
        "Drainage": 3.5, "Excavation & Earthworks": 2.5,
        "Road Reinstatement & Surfacing": 2.0, "Concrete & Structures": 1.2,
        "Traffic Management": 1.3, "Preliminaries & Site Setup": 1.2,
        "Testing & Commissioning": 1.0, "Professional Services & Surveys": 0.8,
    },
    "Substation Civils": {
        "Concrete & Structures": 3.0, "Excavation & Earthworks": 2.2,
        "Plant & Equipment Supply": 2.0, "Ducting & Cable Protection": 1.5,
        "Cabling & Terminations": 1.5, "Landscaping & Site Finishes": 1.2,
        "Preliminaries & Site Setup": 1.5, "Professional Services & Surveys": 1.0,
    },
    "LV Reinforcement": {
        "Cabling & Terminations": 3.0, "Excavation & Earthworks": 2.4,
        "Ducting & Cable Protection": 2.0, "Road Reinstatement & Surfacing": 2.2,
        "Plant & Equipment Supply": 1.2, "Traffic Management": 1.4,
        "Preliminaries & Site Setup": 1.2, "Testing & Commissioning": 0.8,
    },
}

REGIONS = ("Dublin", "Leinster", "Munster", "Connacht", "Ulster", "Midlands")

# Ways a real bill mangles the same words.
_SHORTHAND = (
    ("Supply and lay", ("S&L", "Supply & lay", "Supply and lay", "SUPPLY AND LAY")),
    ("Supply and install", ("S&I", "Supply & install", "Supply and install")),
    ("Supply and fix", ("S&F", "Supply & fix", "Supply and fix")),
    ("including", ("incl.", "inc.", "including", "c/w")),
    ("diameter", ("dia.", "dia", "diameter")),
    ("Excavate", ("Exc.", "Excavate", "Excav.")),
)


def _messy(text: str, rng: np.random.Generator) -> str:
    """Randomly substitute trade shorthand so descriptions vary like real ones."""
    for canonical, options in _SHORTHAND:
        if canonical in text and rng.random() < 0.55:
            text = text.replace(canonical, str(rng.choice(options)))
    if rng.random() < 0.12:
        text = text.upper()
    if rng.random() < 0.08:
        text = text + " (as drawing)"
    return text


def generate_history(
    n_projects: int = 45,
    *,
    seed: int = 7,
    indexation: IndexationPolicy | None = None,
    end_date: _dt.date | None = None,
    project_type: str | None = None,
    region: str | None = None,
) -> pd.DataFrame:
    """Generate a priced-bill history in the canonical training shape."""
    rng = np.random.default_rng(seed)
    policy = indexation or IndexationPolicy()
    end_date = end_date or _dt.date.today()
    if project_type is not None and project_type not in PROJECT_TYPES:
        raise ValueError(
            f"Unknown project type {project_type!r}; expected one of {sorted(PROJECT_TYPES)}"
        )

    by_category: dict[str, list[ItemTemplate]] = {}
    for template in TEMPLATES:
        by_category.setdefault(template.category, []).append(template)

    rows: list[dict] = []
    for project_number in range(n_projects):
        project_type_i = project_type or str(rng.choice(list(PROJECT_TYPES)))
        region_i = region or str(rng.choice(REGIONS, p=[0.28, 0.24, 0.18, 0.12, 0.09, 0.09]))
        days_back = int(rng.integers(30, 365 * 4))
        date = end_date - _dt.timedelta(days=days_back)
        project_id = f"P{project_number + 1:03d}-{project_type_i.split()[0].upper()}"

        # Each job has its own pricing character: ground conditions, the
        # commercial team's appetite, how busy the yard was that quarter.
        project_factor = float(np.exp(rng.normal(0, 0.075)))
        ground_factor = float(np.exp(rng.normal(0, 0.06)))
        scale = float(np.exp(rng.normal(0, 0.55)))  # overall job size multiplier

        weights = PROJECT_TYPES[project_type_i]
        categories = list(weights)
        probabilities = np.array([weights[c] for c in categories], dtype=float)
        probabilities /= probabilities.sum()

        n_items = int(rng.integers(26, 78))
        for _ in range(n_items):
            category = str(rng.choice(categories, p=probabilities))
            template = by_category[category][int(rng.integers(len(by_category[category])))]
            variant_text, variant_multiplier = template.variants[
                int(rng.integers(len(template.variants)))
            ]
            description = template.text.format(variant=variant_text).replace("  ", " ").strip()
            description = _messy(description, rng)

            quantity = float(
                np.exp(rng.normal(np.log(template.quantity_median), template.quantity_sigma))
                * (scale if template.unit != "item" else 1.0)
            )
            quantity = max(round(quantity, 2), 0.5 if template.unit != "nr" else 1.0)
            if template.unit in {"nr", "item", "week", "day"}:
                quantity = float(max(1, round(quantity)))

            reference_quantity = max(template.quantity_median, 1.0)
            scale_effect = (quantity / reference_quantity) ** (-template.elasticity)
            base_rate = (
                template.base_rate
                * variant_multiplier
                * scale_effect
                * project_factor
                * (ground_factor if category in {"Excavation & Earthworks", "Drainage"} else 1.0)
                * float(np.exp(rng.normal(0, template.rate_sigma)))
            )
            quoted_rate = policy.inflate(base_rate, region_i, date)

            rows.append(
                {
                    "project_id": project_id,
                    "project_type": project_type_i,
                    "region": region_i,
                    "date": date,
                    "section": category,
                    "ref": "",
                    "description": description,
                    "unit": template.unit,
                    "quantity": quantity,
                    "rate": round(quoted_rate, 2),
                    "category": category,
                }
            )

    frame = pd.DataFrame(rows)
    frame["amount"] = (frame["rate"] * frame["quantity"]).round(2)
    return frame


def generate_tender(
    *,
    seed: int = 99,
    project_type: str = "MV Cable Installation",
    region: str = "Dublin",
    date: _dt.date | None = None,
    n_items: int = 34,
    priced: bool = False,
    indexation: IndexationPolicy | None = None,
) -> pd.DataFrame:
    """Generate one *new* tender to price (rates stripped unless ``priced``).

    Uses a different random stream to the history, so items are similar in
    kind but never identical — which is the realistic test.
    """
    frame = generate_history(
        n_projects=1,
        seed=seed,
        indexation=indexation,
        end_date=date or _dt.date.today(),
        project_type=project_type,
        region=region,
    )
    if date is not None:
        frame["date"] = date
    frame["project_id"] = f"TENDER-{seed}"
    frame = frame.head(n_items).reset_index(drop=True)
    frame["ref"] = [f"{i // 10 + 1}.{i % 10 + 1:02d}" for i in range(len(frame))]
    if not priced:
        frame = frame.drop(columns=["rate", "amount"])
    return frame
