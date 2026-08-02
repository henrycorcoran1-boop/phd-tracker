"""Work-package taxonomy and the keyword rules that bootstrap it.

Most historic bills do not carry a consistent work-package column, so the
package ships a rule-based labeller. The rules are only a starting point: the
classifier in :mod:`.models` is trained on their output and then generalises
past the literal keywords. If you have your own coding structure (CESMM4, NRM2,
an internal cost-code library), pass a ``category`` column in the history and
the rules step out of the way.
"""

from __future__ import annotations

import re

#: Canonical work packages for utility / civil engineering tenders.
WORK_PACKAGES: tuple[str, ...] = (
    "Preliminaries & Site Setup",
    "Traffic Management",
    "Excavation & Earthworks",
    "Ducting & Cable Protection",
    "Chambers & Jointing Bays",
    "Cabling & Terminations",
    "Concrete & Structures",
    "Drainage",
    "Watermains",
    "Road Reinstatement & Surfacing",
    "Testing & Commissioning",
    "Landscaping & Site Finishes",
    "Plant & Equipment Supply",
    "Professional Services & Surveys",
    "Unclassified",
)

PRELIMINARY_PACKAGES = ("Preliminaries & Site Setup", "Traffic Management")

# Ordered most-specific first: the first rule that matches wins.
_RULES: tuple[tuple[str, str], ...] = (
    (
        "Traffic Management",
        r"traffic manage|stop\s*/?\s*go|road closure|signage|cone|diversion|"
        r"lane closure|chapter 8|pedestrian manage|traffic signal",
    ),
    (
        "Preliminaries & Site Setup",
        r"prelim|site set|setting up|welfare|compound|site office|mobilis|"
        r"demobilis|site agent|supervis|insurance|bond|health and safety|"
        r"safety file|site security|hoarding|temporary fenc|storage container",
    ),
    (
        "Professional Services & Surveys",
        r"survey|setting out|topograph|cctv inspection|design fee|"
        r"utility trace|slit trench|as.built|record drawing|permit|wayleave|"
        r"ecolog|archaeolog|geotechnical investigation|trial hole",
    ),
    (
        "Testing & Commissioning",
        r"test|commission|pressure test|disinfect|swab|chlorinat|energis|"
        r"insulation resistance|megger|proving|inspection and test",
    ),
    (
        "Chambers & Jointing Bays",
        r"chamber|jointing bay|manhole|man hole|inspection pit|draw pit|"
        r"cover and frame|cover & frame|d400|c250|b125|catchpit|valve box|"
        r"meter box|surround to chamber",
    ),
    (
        "Ducting & Cable Protection",
        r"duct|ductwork|twinwall|subduct|sub-duct|draw rope|draw cord|"
        r"cable protection|tile|marker tape|warning tape|conduit|sleeve|"
        r"bore\b|directional drill|hdd\b|mole",
    ),
    (
        "Cabling & Terminations",
        r"cable|conductor|xlpe|abc\b|termination|terminate|jointing of|"
        r"straight joint|tee joint|pull in|pulling in|earth(?:ing)? (?:rod|mat|tape)|"
        r"fibre|blown fibre|splice|lv main|mv main|service cable",
    ),
    (
        "Watermains",
        r"watermain|water main|potable|hydrant|sluice valve|air valve|"
        r"washout|pe100|mdpe|ductile iron pipe|service connection|"
        r"water service|stop tap|boundary box",
    ),
    (
        "Drainage",
        r"drain|sewer|foul|storm|gully|soakaway|attenuation|petrol intercept|"
        r"land drain|road gully|outfall|headwall|manhole to sewer|"
        r"vitrified clay|uPVC pipe",
    ),
    (
        "Road Reinstatement & Surfacing",
        r"reinstat|surfacing|surface course|binder course|base course|"
        r"macadam|asphalt|sma\b|hra\b|tarmac|kerb|footpath|footway|"
        r"paving|flags|planing|saw ?cut|road marking|line marking|"
        r"granular fill|clause 804|type 1|sub ?base",
    ),
    (
        "Concrete & Structures",
        r"concrete|c\d{2}/\d{2}|reinforc|mesh|a\d{3} mesh|formwork|shutter|"
        r"blockwork|masonry|plinth|foundation|screed|blinding|precast base|"
        r"steelwork|structural steel|bolt|grout",
    ),
    (
        "Excavation & Earthworks",
        r"excavat|trench|dig\b|backfill|disposal|cart away|muck away|"
        r"import(?:ed)? fill|topsoil strip|break ?out|rock breaking|"
        r"dewater|shoring|trench support|compact",
    ),
    (
        "Plant & Equipment Supply",
        r"transformer|substation unit|rmu\b|switchgear|kiosk|pillar|"
        r"pump\b|generator|feeder pillar|meter cabinet|street ?light|"
        r"lantern|column|control panel|supply only",
    ),
    (
        "Landscaping & Site Finishes",
        r"landscap|seeding|grass|hedge|tree|planting|topsoil to verge|"
        r"verge|fenc(?:e|ing)|gate\b|bollard|site clearance|"
        r"restoration of ground",
    ),
)

_COMPILED = tuple((label, re.compile(pattern, re.I)) for label, pattern in _RULES)


def rule_category(description: str) -> str:
    """Label an item description with a work package using keyword rules."""
    text = description or ""
    for label, pattern in _COMPILED:
        if pattern.search(text):
            return label
    return "Unclassified"


def fill_categories(descriptions, existing=None) -> list[str]:
    """Keep supplied labels, fill the gaps with rule labels."""
    descriptions = list(descriptions)
    if existing is None:
        return [rule_category(text) for text in descriptions]
    out: list[str] = []
    for text, label in zip(descriptions, existing):
        label_text = "" if label is None else str(label).strip()
        if label_text and label_text.lower() not in {"nan", "none", "unknown", ""}:
            out.append(label_text)
        else:
            out.append(rule_category(text))
    return out
