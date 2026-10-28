"""Target countries (42).

code   : project code used in event_id (Greece = EL, United Kingdom = UK)
iso    : ISO code for the nager.at holiday API (Greece = GR, United Kingdom = GB)
name   : English country name — must equal events.country
group  : EU / EFTA / CANDIDATE / POTENTIAL_CANDIDATE / OTHER
meteo  : meteoalarm feed name. None = not covered by the weather job (37 countries)

2026-10-26: Türkiye is stored as "Turkey" everywhere (app, events, raw_intake, config, routes).
"""
COUNTRIES = [
    ("BE", "BE", "Belgium", "EU", "belgium"),
    ("BG", "BG", "Bulgaria", "EU", "bulgaria"),
    ("CZ", "CZ", "Czechia", "EU", "czechia"),
    ("DK", "DK", "Denmark", "EU", "denmark"),
    ("DE", "DE", "Germany", "EU", "germany"),
    ("EE", "EE", "Estonia", "EU", "estonia"),
    ("IE", "IE", "Ireland", "EU", "ireland"),
    ("EL", "GR", "Greece", "EU", "greece"),
    ("ES", "ES", "Spain", "EU", "spain"),
    ("FR", "FR", "France", "EU", "france"),
    ("HR", "HR", "Croatia", "EU", "croatia"),
    ("IT", "IT", "Italy", "EU", "italy"),
    ("CY", "CY", "Cyprus", "EU", "cyprus"),
    ("LV", "LV", "Latvia", "EU", "latvia"),
    ("LT", "LT", "Lithuania", "EU", "lithuania"),
    ("LU", "LU", "Luxembourg", "EU", "luxembourg"),
    ("HU", "HU", "Hungary", "EU", "hungary"),
    ("MT", "MT", "Malta", "EU", "malta"),
    ("NL", "NL", "Netherlands", "EU", "netherlands"),
    ("AT", "AT", "Austria", "EU", "austria"),
    ("PL", "PL", "Poland", "EU", "poland"),
    ("PT", "PT", "Portugal", "EU", "portugal"),
    ("RO", "RO", "Romania", "EU", "romania"),
    ("SI", "SI", "Slovenia", "EU", "slovenia"),
    ("SK", "SK", "Slovakia", "EU", "slovakia"),
    ("FI", "FI", "Finland", "EU", "finland"),
    ("SE", "SE", "Sweden", "EU", "sweden"),
    ("IS", "IS", "Iceland", "EFTA", "iceland"),
    ("LI", "LI", "Liechtenstein", "EFTA", None),
    ("NO", "NO", "Norway", "EFTA", "norway"),
    ("CH", "CH", "Switzerland", "EFTA", "switzerland"),
    ("AL", "AL", "Albania", "CANDIDATE", None),
    ("BA", "BA", "Bosnia and Herzegovina", "CANDIDATE", "bosnia-herzegovina"),
    ("GE", "GE", "Georgia", "CANDIDATE", None),
    ("MD", "MD", "Moldova", "CANDIDATE", "moldova"),
    ("ME", "ME", "Montenegro", "CANDIDATE", "montenegro"),
    ("MK", "MK", "North Macedonia", "CANDIDATE", "republic-of-north-macedonia"),
    ("RS", "RS", "Serbia", "CANDIDATE", "serbia"),
    ("TR", "TR", "Turkey", "CANDIDATE", None),
    ("UA", "UA", "Ukraine", "CANDIDATE", "ukraine"),
    ("XK", "XK", "Kosovo", "POTENTIAL_CANDIDATE", None),
    ("UK", "GB", "United Kingdom", "OTHER", "united-kingdom"),
]

NAMES = {name for _c, _i, name, _g, _m in COUNTRIES}

# Country name → project code (first part of event_id).
CC = {name: code for code, _iso, name, _g, _m in COUNTRIES}
# Old spellings that may still appear in historic rows
CC["Türkiye"] = "TR"
CC["Turkiye"] = "TR"

# Other spellings seen in sources → stored name
ALIASES = {
    "czech republic": "Czechia", "macedonia": "North Macedonia", "bosnia & herzegovina": "Bosnia and Herzegovina",
    "türkiye": "Turkey", "turkiye": "Turkey", "uk": "United Kingdom", "great britain": "United Kingdom",
}


def norm_country(raw):
    """Return the stored country name, or None if it is not one of the 42 countries."""
    name = (raw or "").strip()
    if name in NAMES:
        return name
    alias = ALIASES.get(name.lower())
    return alias if alias in NAMES else None
