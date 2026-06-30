#!/usr/bin/env python3
"""Build the AWDS Construction-Stage FTE / resourcing & cost model workbook."""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# ---- palette ----
NAVY = "0B2E63"; BLUE = "1F5FD6"; LIGHT = "EAF1FC"; SUB = "DCE7F8"
MINT = "E4F6F0"; ROSE = "FBE9F2"; GREY = "F2F5FA"; GOLD = "FFF3D6"

f_title = Font(name="Calibri", size=16, bold=True, color=NAVY)
f_sub   = Font(name="Calibri", size=10, italic=True, color="5B6B8C")
f_hdr   = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
f_bold  = Font(name="Calibri", size=10, bold=True, color=NAVY)
f_norm  = Font(name="Calibri", size=10, color="0F1B3D")
f_note  = Font(name="Calibri", size=9, italic=True, color="5B6B8C")
f_input = Font(name="Calibri", size=11, bold=True, color="1F5FD6")
f_white = Font(name="Calibri", size=11, bold=True, color="FFFFFF")

fill_hdr = PatternFill("solid", fgColor=NAVY)
fill_sub = PatternFill("solid", fgColor=SUB)
fill_light = PatternFill("solid", fgColor=LIGHT)
fill_grey = PatternFill("solid", fgColor=GREY)
fill_tot = PatternFill("solid", fgColor=BLUE)
fill_input = PatternFill("solid", fgColor=GOLD)

thin = Side(style="thin", color="C5D2EA")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal="center", vertical="center")
left = Alignment(horizontal="left", vertical="center", wrap_text=True)

EUR = '"€"#,##0'

# rate input cell references (the Rates tab)
HRS = "'Rates'!$C$5"; RM = "'Rates'!$C$6"; RS = "'Rates'!$C$7"; RD = "'Rates'!$C$8"

wb = openpyxl.Workbook()

def style_header_row(ws, row, ncols, start=1):
    for c in range(start, start + ncols):
        cell = ws.cell(row=row, column=c)
        cell.font = f_hdr; cell.fill = fill_hdr; cell.alignment = center; cell.border = border

# =====================================================================
# SHEET: Assumptions
# =====================================================================
wa = wb.active
wa.title = "Assumptions"
wa.sheet_view.showGridLines = False
wa["A1"] = "AWDS MetroLink — Construction Stage Resourcing, FTE & Cost Model"
wa["A1"].font = f_title
wa["A2"] = "Assumptions & basis of estimate.  Edit the gold cells on the 'Rates' tab — all sheets and the total cost update automatically."
wa["A2"].font = f_sub

rows = [
    ("", ""),
    ("KEY ASSUMPTIONS", ""),
    ("Construction-stage durations", ""),
    ("   • Management team", "36 months"),
    ("   • Contract Managers (and their delivery team)", "18 months"),
    ("   • Support staff", "18 months"),
    ("   • Designers (reachback)", "18 months"),
    ("Number of contract packages / Contract Managers", "16  (one per package — see note 1)"),
    ("Rates & hours", "See the 'Rates' tab (editable)."),
    ("", ""),
    ("DEFINITIONS", ""),
    ("FTE", "1.0 FTE = one full-time-equivalent person at 100% utilisation."),
    ("Utilisation %", "Share of a person's time spent on AWDS construction-stage work."),
    ("FTE (modelled)", "= Headcount × Utilisation %"),
    ("Effort (person-months)", "= FTE × Duration (months)"),
    ("Effort (person-years)", "= Person-months ÷ 12"),
    ("Cost (€)", "= Person-months × Hours-per-month × Rate (from 'Rates' tab)"),
    ("", ""),
    ("FTE vs NON-FTE TREATMENT", ""),
    ("Management team & Contract Managers", "Dedicated FTE — charged at the Management rate."),
    ("Support staff", "Shared / part-time — charged at the Support rate."),
    ("Designers", "Reachback / part-time — charged at the Designer rate."),
    ("", ""),
    ("SCOPE CONTEXT (drives the team make-up)", ""),
    ("At construction stage the Contract Managers and their teams are NOT site supervision. Their remit is:", ""),
    ("   • Raising / tracking / closing RFIs", ""),
    ("   • Reviewing contractor design proposals", ""),
    ("   • Progress, design and coordination meetings; occasional site visits", ""),
    ("   • Meetings with utility asset owners", ""),
    ("   • Updating and managing the as-built drawings / CDE", ""),
    ("   • NEC contract administration, change and reporting", ""),
    ("", ""),
    ("NOTES", ""),
    ("1.  Contract Manager headcount is taken from the management org chart (16). In practice some packages are", ""),
    ("     combined under a single Contract Manager (e.g. M140 & M146), so the dedicated CM count may be lower —", ""),
    ("     edit the headcount on sheet 1 to suit.", ""),
    ("2.  Cost is labour only — excludes expenses, fee/overhead uplift and inflation.", ""),
    ("3.  Management team excludes the Procurement Lead (procurement complete by construction stage).", ""),
]
r = 4
for label, val in rows:
    wa.cell(row=r, column=1, value=label)
    wa.cell(row=r, column=3, value=val)
    if label in ("KEY ASSUMPTIONS","DEFINITIONS","FTE vs NON-FTE TREATMENT","SCOPE CONTEXT (drives the team make-up)","NOTES"):
        wa.cell(row=r, column=1).font = f_bold
        for c in range(1,7): wa.cell(row=r, column=c).fill = fill_sub
    else:
        wa.cell(row=r, column=1).font = f_norm
        wa.cell(row=r, column=3).font = f_norm
    r += 1
wa.column_dimensions["A"].width = 52
wa.column_dimensions["B"].width = 2
wa.column_dimensions["C"].width = 64
for rr in range(1, r):
    wa.cell(row=rr, column=3).alignment = left

# =====================================================================
# SHEET: Rates (editable inputs)
# =====================================================================
wr = wb.create_sheet("Rates")
wr.sheet_view.showGridLines = False
wr["A1"] = "Rates & Cost Inputs"; wr["A1"].font = f_title
wr["A2"] = "Edit the gold cells below. Every sheet and the total cost recalculate automatically."; wr["A2"].font = f_sub
inputs = [
    (5, "Hours per person-month", 160, "0", "Working hours used to convert person-months to chargeable hours"),
    (6, "Management rate (€/hr)", 110, EUR, "Applies to the Management Team and Contract Managers (FTE)"),
    (7, "Support staff rate (€/hr)", 50, EUR, "Applies to all Support Staff (interface, back-office & contract delivery support)"),
    (8, "Designer rate (€/hr)", 95, EUR, "Applies to the Designers (reachback) team"),
]
for row, label, val, fmt, note in inputs:
    wr.cell(row=row, column=1, value=label).font = f_bold
    c = wr.cell(row=row, column=3, value=val)
    c.font = f_input; c.fill = fill_input; c.alignment = center; c.number_format = fmt; c.border = border
    wr.cell(row=row, column=4, value=note).font = f_note
    wr.cell(row=row, column=4).alignment = left
# live total readout (links to Summary total cost H10)
wr["A11"] = "Indicative total construction-stage cost (€)"; wr["A11"].font = f_bold
tc = wr.cell(row=11, column=3, value="='Summary'!$H$10")
tc.font = f_white; tc.fill = fill_tot; tc.alignment = center; tc.number_format = EUR; tc.border = border
wr["A12"] = "(labour only — see Assumptions)"; wr["A12"].font = f_note
wr.column_dimensions["A"].width = 34
wr.column_dimensions["B"].width = 2
wr.column_dimensions["C"].width = 16
wr.column_dimensions["D"].width = 62

# =====================================================================
# Generic builder for a resourcing + cost table
# =====================================================================
HEAD = ["Role", "Headcount", "Utilisation %", "FTE", "Duration (months)",
        "Effort (person-months)", "Effort (person-years)", "Cost (€)", "Basis / notes"]

def build_sheet(title, intro, sections, rate_ref):
    ws = wb.create_sheet(title)
    ws.sheet_view.showGridLines = False
    ws["A1"] = intro[0]; ws["A1"].font = f_title
    ws["A2"] = intro[1]; ws["A2"].font = f_sub
    hr = 4
    for c, h in enumerate(HEAD, start=1):
        ws.cell(row=hr, column=c, value=h)
    style_header_row(ws, hr, len(HEAD))
    row = hr + 1
    sub_rows = []
    for sec_name, sec_fill, items in sections:
        ws.cell(row=row, column=1, value=sec_name).font = f_bold
        for c in range(1, len(HEAD)+1):
            ws.cell(row=row, column=c).fill = fill_sub
            ws.cell(row=row, column=c).border = border
        row += 1
        first = row
        for name, hc, util, dur, basis in items:
            ws.cell(row=row, column=1, value=name).font = f_norm
            ws.cell(row=row, column=1).alignment = left
            ws.cell(row=row, column=2, value=hc).alignment = center
            ws.cell(row=row, column=3, value=util).number_format = "0%"; ws.cell(row=row, column=3).alignment = center
            ws.cell(row=row, column=4, value=f"=B{row}*C{row}").number_format = "0.00"; ws.cell(row=row, column=4).alignment = center
            ws.cell(row=row, column=5, value=dur).alignment = center
            ws.cell(row=row, column=6, value=f"=D{row}*E{row}").number_format = "0.0"; ws.cell(row=row, column=6).alignment = center
            ws.cell(row=row, column=7, value=f"=F{row}/12").number_format = "0.0"; ws.cell(row=row, column=7).alignment = center
            ws.cell(row=row, column=8, value=f"=F{row}*{HRS}*{rate_ref}").number_format = EUR; ws.cell(row=row, column=8).alignment = center
            ws.cell(row=row, column=9, value=basis).font = f_note; ws.cell(row=row, column=9).alignment = left
            for c in range(1, len(HEAD)+1):
                ws.cell(row=row, column=c).border = border
                if sec_fill: ws.cell(row=row, column=c).fill = PatternFill("solid", fgColor=sec_fill)
            row += 1
        last = row - 1
        ws.cell(row=row, column=1, value=f"   Subtotal — {sec_name}").font = f_bold
        ws.cell(row=row, column=2, value=f"=SUM(B{first}:B{last})").alignment = center
        ws.cell(row=row, column=4, value=f"=SUM(D{first}:D{last})").number_format = "0.00"; ws.cell(row=row, column=4).alignment = center
        ws.cell(row=row, column=6, value=f"=SUM(F{first}:F{last})").number_format = "0.0"; ws.cell(row=row, column=6).alignment = center
        ws.cell(row=row, column=7, value=f"=SUM(G{first}:G{last})").number_format = "0.0"; ws.cell(row=row, column=7).alignment = center
        ws.cell(row=row, column=8, value=f"=SUM(H{first}:H{last})").number_format = EUR; ws.cell(row=row, column=8).alignment = center
        for c in range(1, len(HEAD)+1):
            ws.cell(row=row, column=c).fill = fill_light
            ws.cell(row=row, column=c).border = border
            if c != 1: ws.cell(row=row, column=c).font = f_bold
        sub_rows.append(row)
        row += 2
    ws.cell(row=row, column=1, value="TOTAL").font = f_white
    ws.cell(row=row, column=2, value="=" + "+".join(f"B{x}" for x in sub_rows)).alignment = center
    ws.cell(row=row, column=4, value="=" + "+".join(f"D{x}" for x in sub_rows)).number_format = "0.00"
    ws.cell(row=row, column=6, value="=" + "+".join(f"F{x}" for x in sub_rows)).number_format = "0.0"
    ws.cell(row=row, column=7, value="=" + "+".join(f"G{x}" for x in sub_rows)).number_format = "0.0"
    ws.cell(row=row, column=8, value="=" + "+".join(f"H{x}" for x in sub_rows)).number_format = EUR
    for c in range(1, len(HEAD)+1):
        ws.cell(row=row, column=c).fill = fill_tot; ws.cell(row=row, column=c).border = border
        if c != 1: ws.cell(row=row, column=c).font = f_white; ws.cell(row=row, column=c).alignment = center
    widths = [42, 11, 13, 8, 16, 19, 18, 14, 50]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A5"
    return ws

# =====================================================================
# SHEET 1 : Management & Contract Managers (FTE)  -> Management rate
# =====================================================================
mgmt = [
    ("AWDS Project Director", 1, 0.25, 36, "Part-time senior oversight & governance"),
    ("AWDS Project Management Lead", 1, 1.00, 36, "Full-time; leads delivery across all packages"),
    ("AWDS Deputy Project Manager", 1, 1.00, 36, "Full-time; daily operations & coordination"),
    ("AWDS Design Management Lead", 1, 1.00, 36, "Full-time; design integration & reachback mgmt"),
    ("AWDS PMO Lead", 1, 1.00, 36, "Full-time; controls, reporting, information mgmt"),
    ("AWDS Technical Delivery Lead", 1, 1.00, 36, "Full-time; technical assurance & verification"),
    ("AWDS Commercial Lead", 1, 1.00, 36, "Full-time; NEC commercial & change"),
    ("AWDS Cost Management Lead", 1, 1.00, 36, "Full-time; cost control & forecasting"),
]
cm = [
    ("AWDS Contract Manager (one per package)", 16, 1.00, 18,
     "Package PM: RFIs, contractor & utility-owner meetings, design-proposal review, as-builts, NEC admin"),
]
build_sheet("1 · Mgmt & Contract Mgrs",
    ("1 · Management Team & Contract Managers — FTE",
     "Dedicated full-time-equivalent resource. Charged at the Management rate (Rates tab)."),
    [("MANAGEMENT TEAM  (36 months)", None, mgmt),
     ("CONTRACT MANAGERS  (18 months)", None, cm)], RM)

# =====================================================================
# SHEET 2 : Support staff (non-FTE)  -> Support rate
# =====================================================================
contract_support = [
    ("Contracts / Technical Engineer", 8, 0.75, 18, "Reviews contractor design proposals, raises/closes RFIs, technical correspondence (~1 per 2 packages)"),
    ("Document Controller / As-Built Coordinator", 4, 0.60, 18, "Manages & updates as-built drawings and CDE (~1 per 4 packages)"),
    ("Quantity Surveyor / Commercial Support", 4, 0.60, 18, "NEC change, valuations and payment support (~1 per 4 packages)"),
    ("Utilities Liaison Coordinator", 2, 0.50, 18, "Meetings & coordination with utility asset owners"),
    ("CEMP / Environmental Coordinator", 2, 0.40, 18, "Environmental compliance and CEMP across packages"),
    ("Planner / Scheduler (package)", 2, 0.50, 18, "Programme tracking at package level"),
]
project_support = [
    ("BIM Manager", 1, 0.50, 18, "Shared across programme"),
    ("Deputy BIM Manager", 1, 0.50, 18, ""),
    ("Information Manager", 1, 0.50, 18, ""),
    ("Deputy Information Manager", 1, 0.40, 18, ""),
    ("Senior GIS Consultant", 1, 0.30, 18, "On-demand"),
    ("Senior GIS Analyst", 1, 0.40, 18, ""),
    ("Surveys Coordinator", 1, 0.30, 18, "Ad-hoc survey requests"),
    ("CDE Document Controller (project)", 1, 0.70, 18, "Project-wide CDE"),
    ("BusConnects Interface", 1, 0.20, 18, "Interface management"),
    ("DAA Interface", 1, 0.20, 18, "Interface management"),
    ("UAO Engagement Team", 2, 0.30, 18, "Utility/asset-owner engagement"),
    ("Administrator", 2, 0.80, 18, "Team & document admin"),
    ("Health & Safety Advisor", 1, 0.50, 18, "CDM / safety in design support"),
    ("QA / QC Manager", 1, 0.50, 18, "Quality assurance"),
    ("Risk Manager", 1, 0.30, 18, ""),
    ("Project Controls Analyst", 1, 0.60, 18, "Reporting & dashboards"),
    ("HR & People Coordinator", 1, 0.25, 18, ""),
    ("IT / Systems Support", 1, 0.25, 18, ""),
    ("Communications & Stakeholder Liaison", 1, 0.30, 18, ""),
    ("Training & Competency Coordinator", 1, 0.20, 18, ""),
    ("Office Manager", 1, 0.60, 18, ""),
]
build_sheet("2 · Support Staff",
    ("2 · Support Staff — utilisation-based (non-FTE)",
     "Shared / part-time resources. Charged at the Support rate (Rates tab)."),
    [("CONTRACT DELIVERY SUPPORT  (team around the Contract Managers, 18 months)", ROSE, contract_support),
     ("PROJECT SUPPORT — Interface & Back-Office  (18 months)", MINT, project_support)], RS)

# =====================================================================
# SHEET 3 : Designers (non-FTE, reachback)  -> Designer rate
# =====================================================================
designers = [
    ("Design Management / Coordination", 1, 0.30, 18, "Coordinates reachback requests"),
    ("Utilities South", 3, 0.25, 18, "Reachback — design queries & proposal review"),
    ("Sustainability", 2, 0.15, 18, "On-demand"),
    ("Land Access", 2, 0.20, 18, "On-demand"),
    ("Structures", 2, 0.25, 18, "Design review & RFI support"),
    ("Heritage", 1, 0.10, 18, "On-demand"),
    ("Cellars & Playing Pitches", 1, 0.10, 18, "On-demand"),
    ("Archaeology", 1, 0.15, 18, "On-demand"),
    ("Biodiversity", 1, 0.10, 18, "On-demand"),
    ("Env. Monitoring", 2, 0.20, 18, "Periodic monitoring"),
]
build_sheet("3 · Designers",
    ("3 · Designers — reachback, utilisation-based (non-FTE)",
     "Design discipline reachback team. Charged at the Designer rate (Rates tab)."),
    [("DESIGN REACHBACK TEAM  (18 months)", MINT, designers)], RD)

# =====================================================================
# SHEET : Summary
# =====================================================================
ws = wb.create_sheet("Summary")
ws.sheet_view.showGridLines = False
ws["A1"] = "Construction Stage — Resource & Cost Summary"; ws["A1"].font = f_title
ws["A2"] = "Roll-up of all categories. Cost is driven by the editable 'Rates' tab."; ws["A2"].font = f_sub
heads = ["Category", "Type", "Headcount", "FTE (modelled)", "Duration (months)",
         "Effort (person-months)", "Effort (person-years)", "Cost (€)"]
hr = 4
for c, h in enumerate(heads, start=1):
    ws.cell(row=hr, column=c, value=h)
style_header_row(ws, hr, len(heads))
S1 = "'1 · Mgmt & Contract Mgrs'"; S2 = "'2 · Support Staff'"; S3 = "'3 · Designers'"
data = [
    ("Management Team", "FTE (dedicated)", f"{S1}!B14", f"{S1}!D14", 36, f"{S1}!F14", f"{S1}!G14", f"{S1}!H14"),
    ("Contract Managers", "FTE (dedicated)", f"{S1}!B18", f"{S1}!D18", 18, f"{S1}!F18", f"{S1}!G18", f"{S1}!H18"),
    ("Contract Delivery Support", "Utilisation", f"{S2}!B12", f"{S2}!D12", 18, f"{S2}!F12", f"{S2}!G12", f"{S2}!H12"),
    ("Project Support (Interface & Back-Office)", "Utilisation", f"{S2}!B36", f"{S2}!D36", 18, f"{S2}!F36", f"{S2}!G36", f"{S2}!H36"),
    ("Designers (reachback)", "Utilisation", f"{S3}!B16", f"{S3}!D16", 18, f"{S3}!F16", f"{S3}!G16", f"{S3}!H16"),
]
row = hr + 1
first = row
for cat, typ, hc, fte, dur, pm, py, cost in data:
    ws.cell(row=row, column=1, value=cat).font = f_norm
    ws.cell(row=row, column=2, value=typ).font = f_norm
    ws.cell(row=row, column=3, value="=" + hc).alignment = center
    ws.cell(row=row, column=4, value="=" + fte).number_format = "0.00"; ws.cell(row=row, column=4).alignment = center
    ws.cell(row=row, column=5, value=dur).alignment = center
    ws.cell(row=row, column=6, value="=" + pm).number_format = "0.0"; ws.cell(row=row, column=6).alignment = center
    ws.cell(row=row, column=7, value="=" + py).number_format = "0.0"; ws.cell(row=row, column=7).alignment = center
    ws.cell(row=row, column=8, value="=" + cost).number_format = EUR; ws.cell(row=row, column=8).alignment = center
    for c in range(1, len(heads)+1):
        ws.cell(row=row, column=c).border = border
        if row % 2 == 0: ws.cell(row=row, column=c).fill = fill_grey
    row += 1
last = row - 1
ws.cell(row=row, column=1, value="TOTAL — Construction Stage").font = f_white
ws.cell(row=row, column=3, value=f"=SUM(C{first}:C{last})").alignment = center
ws.cell(row=row, column=4, value=f"=SUM(D{first}:D{last})").number_format = "0.00"; ws.cell(row=row, column=4).alignment = center
ws.cell(row=row, column=6, value=f"=SUM(F{first}:F{last})").number_format = "0.0"; ws.cell(row=row, column=6).alignment = center
ws.cell(row=row, column=7, value=f"=SUM(G{first}:G{last})").number_format = "0.0"; ws.cell(row=row, column=7).alignment = center
ws.cell(row=row, column=8, value=f"=SUM(H{first}:H{last})").number_format = EUR; ws.cell(row=row, column=8).alignment = center
for c in range(1, len(heads)+1):
    ws.cell(row=row, column=c).fill = fill_tot; ws.cell(row=row, column=c).border = border
    if c != 1: ws.cell(row=row, column=c).font = f_white
total_row = row  # = 10
# headline FTE rows
row += 2
ws.cell(row=row, column=1, value="FTE (Management + Contract Managers)").font = f_bold
ws.cell(row=row, column=4, value=f"=D{first}+D{first+1}").number_format = "0.00"; ws.cell(row=row,column=4).alignment=center
ws.cell(row=row, column=4).fill = fill_sub
row += 1
ws.cell(row=row, column=1, value="FTE-equivalent (Support + Designers)").font = f_bold
ws.cell(row=row, column=4, value=f"=D{first+2}+D{first+3}+D{first+4}").number_format = "0.00"; ws.cell(row=row,column=4).alignment=center
ws.cell(row=row, column=4).fill = fill_sub
widths = [40, 18, 12, 16, 18, 22, 20, 16]
for i, w in enumerate(widths, start=1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.freeze_panes = "A5"

# order: Assumptions, Rates, Summary, 1, 2, 3
order = ["Assumptions", "Rates", "Summary", "1 · Mgmt & Contract Mgrs", "2 · Support Staff", "3 · Designers"]
wb._sheets.sort(key=lambda s: order.index(s.title))

out = "/home/user/phd-tracker/org-chart/AWDS_Construction_Stage_FTE_Model.xlsx"
wb.save(out)
print("saved", out)
print("sheets:", wb.sheetnames)
