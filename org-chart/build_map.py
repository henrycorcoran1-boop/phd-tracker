#!/usr/bin/env python3
"""Generate the M100 Series Contract Packaging route-map slides (P04 & P05)."""

CH_TOP, CH_BOT = 1000, 19500
H = 690  # plot height px

def y(ch): return (ch - CH_TOP) / (CH_BOT - CH_TOP) * H

STATIONS = [  # (id, name, chainage, kind)
    ("M-11", "Estuary Station", 1200, "s"),
    ("M-12", "Seatown Station", 3000, "s"),
    ("M-15", "Swords Central Station", 4200, "s"),
    ("M-17", "Fosterstown Station", 5000, "s"),
    ("M-20", "Dublin Airport Station", 7000, "s"),
    ("M-21", "Dardistown Station", 8700, "s"),
    ("M-23", "Northwood Station", 10300, "s"),
    ("M-25", "Ballymun Station", 11200, "s"),
    ("M-27", "Collins Avenue Station", 12200, "s"),
    ("M-28", "Albert College Intervention Shaft", 12800, "shaft"),
    ("M-29", "Griffith Park Station", 13800, "s"),
    ("M-31", "Glasnevin Station", 14700, "s"),
    ("M-33", "Mater Station", 15700, "s"),
    ("M-35", "O'Connell Street Station", 16600, "s"),
    ("M-37", "Tara Station", 17500, "s"),
    ("M-39", "St. Stephen's Green Station", 18500, "s"),
    ("M-41", "Charlemont Station", 19200, "s"),
]

# zone colours
TEAL="#bfe6e0"; BLUE="#bcd4f0"; PINK="#f3c9e0"; YEL="#f5efb0"; TAN="#dcd6c8"; GRN="#cfe9c8"
G1="#ededed"; G2="#dcdcdc"; G3="#d0d0d0"

P04_LEFT = [("M141",1000,3500,TEAL),("M142",3500,6000,BLUE),("M146",6000,10500,PINK),
            ("M140",10500,16000,YEL),("M147",16000,17000,TAN),("M145",17000,19500,GRN)]
P05_LEFT = [("M141.FC.0002",1000,3500,TEAL),("M141.FC.0003",3500,6000,BLUE),("M144.FC.0002",6000,10500,PINK),
            ("M141.FC.0001",10500,16000,YEL),("M140.FC.0001",16000,17000,TAN),("M144.FC.0001",17000,19500,GRN)]
P04_ARCH = [("M130",1000,4500,G1),("M135",4500,11000,G2),("M138",11000,16000,G3)]
P05_ARCH = [("M130.QS.0001",1000,4500,G1),("M130.QS.0002",4500,11000,G2),("M130.QS.0003",11000,16000,G3)]

# legend colours
OR="#d98032"; ORi="#e39a52"; SB="#35619e"; SBi="#4a76b4"; MAR="#98393b"; MARi="#b5484a"; SL="#3a4a63"
def L(header, hcol, items, icol):
    return (header, hcol, items, icol)

P04_LEG = [
    L("M11 — Expedited Utilities & Enabling Contracts", OR, ["M111 Northwood Utilities","Newtown Demolition"], ORi),
    L("M13 — Archaeology Qualification", SB, ["M130 Archaeology","M130 Archaeology","M130 Archaeology"], ORi),
    L("M14 — Utilities & Enabling Works", MAR, ["M140 Ballymun M25 to Mater M33","M141 Estuary M11 to Seatown M13","M142 Seatown to Swords M14 to Airport M18","M145 Tara, SSG, Charlemont","M146 Airport to Northwood","M147 O'Connell Street Works"], MARi),
    L("M16 — Independent Monitoring & Surveying", SB, ["M160 Environmental Monitoring","M161 Settlement / Structural Monitoring"], SBi),
    L("M19 — Special Heritage", SL, ["M190 Special Heritage Contract"], ORi),
]
P05_LEG = [
    L("M11 — Expedited Utilities & Enabling Contracts", OR, ["M110.CN.0001 Northwood Utilities"], ORi),
    L("M13 — Archaeology Qualification", SB, ["M130.QS.0001 Archaeology","M130.QS.0002 Archaeology","M130.QS.0003 Archaeology"], SBi),
    L("M14 — Utilities & Enabling Works", MAR, ["M141.FC.0001 Ballymun M25 to Mater M33","M141.FC.0002 Estuary M11 to Seatown M13","M141.FC.0003 Seatown to Swords M14 to Airport M18","M144.FC.0001 Tara, SSG, Charlemont","M144.FC.0002 Airport to Northwood","M140.FC.0001 O'Connell Street Works"], MARi),
    L("M16 — Independent Monitoring & Surveying", SB, ["M160.CN.0001 Environmental Monitoring","M160.CN.0002 Settlement / Structural"], SBi),
    L("M19 — Special Heritage", SL, ["M190 Special Heritage Contract"], ORi),
]

def zones_html(zones):
    out=[]
    for label,s,e,col in zones:
        top=y(s); h=y(e)-y(s)
        out.append(f'<div class="zone" style="top:{top:.0f}px;height:{h:.0f}px;background:{col};"><span>{label}</span></div>')
    return "\n".join(out)

def ticks_html():
    out=[]
    ch=CH_TOP
    while ch<=CH_BOT:
        top=y(ch)
        major = (ch%1000==0)
        out.append(f'<div class="tick {"maj" if major else "min"}" style="top:{top:.1f}px;"></div>')
        if major:
            out.append(f'<div class="tlab" style="top:{top-7:.1f}px;">{ch}</div>')
        ch+=500
    return "\n".join(out)

def stations_html(include_shaft):
    out=[]
    for sid,name,ch,kind in STATIONS:
        if kind=="shaft" and not include_shaft: continue
        top=y(ch)
        cls = "dot shaft" if kind=="shaft" else "dot"
        out.append(f'<div class="{cls}" style="top:{top-6:.1f}px;"></div>')
        out.append(f'<div class="slab" style="top:{top-9:.1f}px;"><b>{sid}</b> {name}</div>')
    return "\n".join(out)

def legend_html(groups, include_key):
    out=[]
    for header,hcol,items,icol in groups:
        rows="".join(f'<div class="litem" style="background:{icol};">{it}</div>' for it in items)
        out.append(f'<div class="lgroup"><div class="lhead" style="background:{hcol};">{header}</div>{rows}</div>')
    if include_key:
        out.append('''<div class="keybox"><div class="kt">Legend</div>
          <div class="kr"><span class="kd station"></span> MetroLink Stations</div>
          <div class="kr"><span class="kd tri"></span> M110 Northwood Utilities</div>
          <div class="kr"><span class="kd shaftk"></span> Intervention Shaft</div></div>''')
    return "\n".join(out)

def slide(title, rev, date, left, arch, legend, include_shaft, include_key, pg):
    return f'''
<section class="slide">
  <div class="s-head">
    <div class="left"><img class="ml" src="logos/metrolink.svg" alt="MetroLink">
      <div class="s-title">M100 Series — Contract Packaging<small>MetroLink alignment · contract package zones &amp; stations</small></div></div>
    <div class="revtag">Revision {rev} · {date}</div>
  </div>
  <div class="s-body">
    <div class="diagram">
      <div class="axis-label ework">Enabling Works</div>
      <div class="col zones" style="width:200px;">{zones_html(left)}</div>
      <div class="col route" style="width:340px;">
        <div class="rline"></div>
        {ticks_html()}
        {stations_html(include_shaft)}
      </div>
      <div class="col zones arch" style="width:172px;">{zones_html(arch)}</div>
      <div class="axis-label arch-lab">Archaeology</div>
      <div class="legend">{legend_html(legend, include_key)}</div>
    </div>
  </div>
  <div class="s-foot"><div class="logos"><img class="ar" src="logos/atkinsrealis.svg"><img class="tt" src="logos/tetratech.svg"></div>
    <div class="pg">MetroLink AWDS — M100 Series Contract Packaging · {pg}</div></div>
</section>'''

CSS = '''
  :root{--navy:#0b2e63;--blue:#1f5fd6;--ink:#0f1b3d;--muted:#5b6b8c;--line:#9fb3d6;--card-bd:#dbe4f5;}
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:#5a6477;}
  body{font-family:"Segoe UI",Helvetica,Arial,sans-serif;color:var(--ink);}
  @page{ size:1600px 900px; margin:0; }
  .slide{position:relative;width:1600px;height:900px;background:#fff;padding:24px 40px 16px;
    display:flex;flex-direction:column;overflow:hidden;margin:0 auto;break-after:page;page-break-after:always;}
  .slide:last-child{break-after:auto;page-break-after:auto;}
  @media screen{.slide{margin:22px auto;box-shadow:0 8px 30px rgba(0,0,0,.35);}}
  .s-head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #eef2fa;padding-bottom:10px;margin-bottom:8px;}
  .s-head .left{display:flex;align-items:center;gap:14px;}
  .s-head img.ml{height:38px;}
  .s-title{font-size:23px;font-weight:800;color:var(--navy);}
  .s-title small{display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin-top:2px;}
  .revtag{font-size:12px;font-weight:800;color:#fff;background:#7a86a8;padding:6px 13px;border-radius:16px;}
  .s-body{flex:1 1 auto;min-height:0;}
  .s-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #e6ecf7;padding-top:6px;margin-top:6px;}
  .s-foot .logos{display:flex;align-items:center;gap:30px;}
  .s-foot img.ar{height:20px;} .s-foot img.tt{height:27px;}
  .s-foot .pg{font-size:12px;color:var(--muted);font-weight:600;}

  .diagram{position:relative;display:flex;align-items:flex-start;gap:0;height:710px;padding-top:6px;}
  .axis-label{writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;font-weight:800;
    color:#2f4a7a;font-size:15px;letter-spacing:1px;height:690px;display:flex;align-items:center;justify-content:center;width:24px;}
  .axis-label.arch-lab{color:#5b6b8c;}
  .col{position:relative;height:690px;}
  .zones .zone{position:absolute;left:4px;right:4px;border:1px solid rgba(0,0,0,.18);border-radius:3px;
    display:flex;align-items:center;justify-content:center;}
  .zones .zone span{font-weight:800;font-size:13px;color:#243b63;text-align:center;}
  .zones.arch .zone span{color:#3a3a3a;}

  .route .rline{position:absolute;left:58px;top:0;bottom:0;width:4px;background:#111;border-radius:2px;}
  .route .tick{position:absolute;left:44px;width:12px;height:1px;background:#9aa3b5;}
  .route .tick.maj{width:16px;left:40px;background:#6b7284;height:1.5px;}
  .route .tlab{position:absolute;left:2px;width:34px;text-align:right;font-size:9px;color:#8a90a0;}
  .route .dot{position:absolute;left:52px;width:15px;height:15px;border-radius:50%;background:#e2231a;border:2px solid #fff;box-shadow:0 0 0 1px #b01810;}
  .route .dot.shaft{background:#39b54a;box-shadow:0 0 0 1px #2b8f39;}
  .route .slab{position:absolute;left:76px;font-size:11.5px;color:#1a1a1a;white-space:nowrap;line-height:1.1;}
  .route .slab b{color:#c0201a;}

  .legend{width:470px;margin-left:14px;display:flex;flex-direction:column;gap:7px;}
  .lgroup{border:1px solid #d7d7d7;border-radius:4px;overflow:hidden;}
  .lhead{color:#fff;font-weight:800;font-size:11.5px;padding:5px 9px;}
  .litem{color:#fff;font-size:10.7px;font-weight:600;padding:3px 9px 3px 16px;border-top:1px solid rgba(255,255,255,.25);}
  .keybox{border:1px solid #cfd7e6;border-radius:6px;padding:8px 10px;margin-top:2px;background:#f7f9fc;}
  .keybox .kt{font-weight:800;font-size:11.5px;color:var(--navy);margin-bottom:5px;}
  .keybox .kr{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--ink);margin-bottom:3px;}
  .keybox .kd{width:13px;height:13px;display:inline-block;}
  .keybox .kd.station{border-radius:50%;background:#e2231a;border:2px solid #fff;box-shadow:0 0 0 1px #b01810;}
  .keybox .kd.shaftk{border-radius:50%;background:#39b54a;border:2px solid #fff;box-shadow:0 0 0 1px #2b8f39;}
  .keybox .kd.tri{width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid #2f5aa8;box-shadow:none;}
'''

html = f'''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>MetroLink AWDS — M100 Series Contract Packaging</title>
<style>{CSS}</style></head><body>
{slide("", "P04", "06 / 11 / 2025", P04_LEFT, P04_ARCH, P04_LEG, include_shaft=False, include_key=False, pg="Rev P04 · 1 / 2")}
{slide("", "P05", "12 / 02 / 2026", P05_LEFT, P05_ARCH, P05_LEG, include_shaft=True, include_key=True, pg="Rev P05 · 2 / 2")}
</body></html>'''

with open("/home/user/phd-tracker/org-chart/map-diagrams.html","w") as f:
    f.write(html)
print("wrote map-diagrams.html")
