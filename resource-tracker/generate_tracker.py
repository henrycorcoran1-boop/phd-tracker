"""
Generates Resource_Tracker.xlsx - an MS-Project-style Gantt/resource
calendar for a line manager with 5 direct reports. Each working day is a
single coloured cell showing which project that person is on, picked
from an editable 25-project dropdown. Week and 6-week bands sit above the
day grid so the same sheet reads at a weekly or 6-weekly resolution.

Run: python3 generate_tracker.py
Output: Resource_Tracker.xlsx (in the same folder)
"""
import colorsys
from datetime import date, timedelta

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.utils import get_column_letter

# ---------------------------------------------------------------- constants
STAFF_COUNT = 5
PROJECT_SLOTS = 25
NUM_WEEKS = 26                 # ~6 months of rolling timeline; extend by copying columns
BLOCK_WEEKS = 6                # the "6-weekly" band size
DAY_COL_START = 2              # column B is the first day column

NAVY = "1F3864"
BLUE = "2E5395"
LIGHT_BLUE = "D9E2F3"
GREY = "F2F2F2"
DARK_TEXT = "262626"

HEADER_FILL = PatternFill("solid", fgColor=NAVY)
HEADER_FONT = Font(color="FFFFFF", bold=True)
BAND_FILL_A = PatternFill("solid", fgColor=BLUE)
BAND_FILL_B = PatternFill("solid", fgColor="3D6BB3")
WEEK_FILL_A = PatternFill("solid", fgColor=LIGHT_BLUE)
WEEK_FILL_B = PatternFill("solid", fgColor="C3D3EE")

THIN = Side(style="thin", color="D9D9D9")
MED = Side(style="medium", color="808080")
THICK = Side(style="thick", color="404040")

wb = Workbook()


def set_widths(ws, widths):
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


# =====================================================================
# distinct pastel colour per project slot (also used as the Lists legend)
# =====================================================================
def project_palette(n):
    colors = []
    for i in range(n):
        hue = (i * 0.6180339887) % 1.0   # golden-angle spacing = maximally distinct
        r, g, b = colorsys.hls_to_rgb(hue, 0.82, 0.55)
        colors.append("{:02X}{:02X}{:02X}".format(int(r * 255), int(g * 255), int(b * 255)))
    return colors


PALETTE = project_palette(PROJECT_SLOTS)

# =====================================================================
# 1. INSTRUCTIONS
# =====================================================================
ws_instr = wb.active
ws_instr.title = "Instructions"
ws_instr.sheet_view.showGridLines = False
set_widths(ws_instr, {"A": 3, "B": 100})

title = ws_instr.cell(row=2, column=2, value="Resource Gantt Tracker – How to Use")
title.font = Font(size=18, bold=True, color=NAVY)

lines = [
    ("", ""),
    ("bold", "1. Set up your team and projects on the 'Lists' tab"),
    ("normal", "   Replace the 5 placeholder names with your team's real names, and rename any of "
               "the 25 project slots you need (leave the rest as-is for later - they'll just sit "
               "unused in the dropdown until you rename them). Each project slot has its own "
               "colour, shown as a swatch next to its name - that colour is what appears on the "
               "Gantt grid, so the swatch also acts as your legend."),
    ("", ""),
    ("bold", "2. Fill in the 'Gantt' tab"),
    ("normal", "   Row 6 holds the start date for the timeline (must be a Monday) - change it and "
               "every date across the sheet shifts automatically. Below that, each of the 5 staff "
               "rows has one cell per working day. Click a day cell and pick a project from the "
               "dropdown; the cell fills with that project's colour automatically, giving you an "
               "MS Project-style bar chart made of daily blocks."),
    ("normal", "   Leave a cell blank if that person isn't assigned yet - it just stays white."),
    ("normal", "   There's no hours tracking here - one colour = one person on one project for "
               "that whole day. If you need to track leave too, just use one of the 25 slots for "
               "'Annual Leave', 'Sick Leave', etc."),
    ("", ""),
    ("bold", "3. Reading it weekly or 6-weekly"),
    ("normal", "   Above the day cells, a 'Week Commencing' band groups every 5 days into a week, "
               "and a '6-Week Block' band above that groups 6 weeks together - so you can read the "
               "same grid at whichever resolution you need, without switching sheets."),
    ("", ""),
    ("bold", "4. Days-per-project counts"),
    ("normal", "   Below the grid, the 'Days per Project' table automatically counts how many days "
               "in the current timeline each person has been assigned to each project - a quick "
               "utilisation check with no manual maths."),
    ("", ""),
    ("bold", "5. Extending the timeline or team"),
    ("normal", "   The Gantt tab ships with 26 weeks (about 6 months). To add more weeks, select "
               "the last week's block of columns (including the band rows and the 5 staff rows) "
               "and copy it to the right - the dates, borders and dropdowns will carry across."),
    ("normal", "   To add a 6th team member, add their name to the Lists tab, then insert a row "
               "on the Gantt tab below the last staff row and copy an existing staff row's "
               "formatting/dropdown into it."),
]

r = 4
for kind, text in lines:
    cell = ws_instr.cell(row=r, column=2, value=text)
    if kind == "bold":
        cell.font = Font(bold=True, size=12, color=BLUE)
    else:
        cell.font = Font(size=11)
    cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws_instr.row_dimensions[r].height = 30 if text else 8
    r += 1

# =====================================================================
# 2. LISTS SHEET (editable source data + colour legend)
# =====================================================================
ws_lists = wb.create_sheet("Lists")
ws_lists.sheet_view.showGridLines = False
set_widths(ws_lists, {"A": 22, "B": 4, "C": 30, "D": 3, "E": 60})

ws_lists.cell(row=1, column=1, value="Staff Name")
ws_lists.cell(row=1, column=3, value="Project (colour = Gantt colour)")
for col in (1, 3):
    c = ws_lists.cell(row=1, column=col)
    c.fill = HEADER_FILL
    c.font = HEADER_FONT
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

note = ws_lists.cell(
    row=1, column=5,
    value="Edit these freely. Staff/project names update everywhere automatically (StaffList / "
          "ProjectList named ranges). Each project's swatch colour is what shows on the Gantt grid.",
)
note.font = Font(italic=True, color="808080")
note.alignment = Alignment(wrap_text=True, vertical="top")
ws_lists.row_dimensions[1].height = 30

for i in range(STAFF_COUNT):
    ws_lists.cell(row=2 + i, column=1, value=f"Team Member {i + 1}").border = Border(
        left=THIN, right=THIN, top=THIN, bottom=THIN)

for i in range(PROJECT_SLOTS):
    row = 2 + i
    cell = ws_lists.cell(row=row, column=3, value=f"Project {i + 1}")
    cell.fill = PatternFill("solid", fgColor=PALETTE[i])
    cell.font = Font(color=DARK_TEXT)
    cell.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

# named, auto-expanding ranges used by the Gantt dropdowns
wb.defined_names["StaffList"] = DefinedName(
    "StaffList", attr_text="OFFSET(Lists!$A$2,0,0,COUNTA(Lists!$A$2:$A$1000),1)"
)
wb.defined_names["ProjectList"] = DefinedName(
    "ProjectList", attr_text="OFFSET(Lists!$C$2,0,0,COUNTA(Lists!$C$2:$C$1000),1)"
)

# =====================================================================
# 3. GANTT SHEET
# =====================================================================
ws_g = wb.create_sheet("Gantt")
ws_g.sheet_view.showGridLines = False

TOTAL_DAYS = NUM_WEEKS * 5
last_day_col = DAY_COL_START + TOTAL_DAYS - 1

# ---- start date control -------------------------------------------------
today = date.today()
next_monday = today + timedelta(days=(7 - today.weekday()) % 7)
ws_g.cell(row=1, column=1, value="Timeline Start Date (must be a Monday):").font = Font(bold=True)
ws_g.cell(row=1, column=1).alignment = Alignment(horizontal="right", vertical="center")
ws_g.merge_cells(start_row=1, start_column=1, end_row=1, end_column=4)

start_cell = ws_g.cell(row=1, column=5, value=next_monday)
start_cell.number_format = "dd/mm/yyyy"
start_cell.fill = PatternFill("solid", fgColor="FFF2CC")
start_cell.font = Font(bold=True)
start_cell.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

start_ref = "$E$1"

# ---- column widths / static rows ----------------------------------------
set_widths(ws_g, {"A": 20})
for c in range(DAY_COL_START, last_day_col + 1):
    ws_g.column_dimensions[get_column_letter(c)].width = 4.3

BAND_ROW = 3      # 6-week block band
WEEK_ROW = 4      # week commencing band
DATE_ROW = 5      # day-of-week + date
FIRST_STAFF_ROW = 6
LAST_STAFF_ROW = FIRST_STAFF_ROW + STAFF_COUNT - 1

ws_g.cell(row=BAND_ROW, column=1, value="6-Week Block").font = Font(bold=True, color="FFFFFF")
ws_g.cell(row=WEEK_ROW, column=1, value="Week Commencing").font = Font(bold=True)
ws_g.cell(row=DATE_ROW, column=1, value="Staff \\ Date").font = Font(bold=True, color="FFFFFF")
for row, fill in ((BAND_ROW, HEADER_FILL), (DATE_ROW, HEADER_FILL)):
    c = ws_g.cell(row=row, column=1)
    c.fill = fill
for c_row in (BAND_ROW, WEEK_ROW, DATE_ROW):
    ws_g.cell(row=c_row, column=1).border = Border(left=THIN, right=MED, top=THIN, bottom=THIN)

ws_g.row_dimensions[BAND_ROW].height = 20
ws_g.row_dimensions[WEEK_ROW].height = 20
ws_g.row_dimensions[DATE_ROW].height = 30

# ---- day headers, week bands, 6-week bands -------------------------------
for i in range(TOTAL_DAYS):
    col = DAY_COL_START + i
    col_letter = get_column_letter(col)
    week_idx = i // 5
    day_in_week = i % 5
    offset_days = week_idx * 7 + day_in_week

    date_cell = ws_g.cell(row=DATE_ROW, column=col,
                           value=f"={start_ref}+{offset_days}")
    date_cell.number_format = "ddd\\ dd/mm"
    date_cell.font = Font(size=9, bold=True, color="FFFFFF")
    date_cell.alignment = Alignment(horizontal="center", vertical="center", textRotation=90)
    date_cell.fill = HEADER_FILL

    is_week_end = day_in_week == 4
    is_block_end = (week_idx % BLOCK_WEEKS == BLOCK_WEEKS - 1) and is_week_end
    right_border = THICK if is_block_end else (MED if is_week_end else THIN)
    date_cell.border = Border(left=THIN, right=right_border, top=THIN, bottom=THIN)

# week-commencing band: merge each block of 5 day columns, label = Monday's date
for week_idx in range(NUM_WEEKS):
    first_col = DAY_COL_START + week_idx * 5
    last_col = first_col + 4
    offset_days = week_idx * 7
    ws_g.merge_cells(start_row=WEEK_ROW, start_column=first_col, end_row=WEEK_ROW, end_column=last_col)
    cell = ws_g.cell(row=WEEK_ROW, column=first_col,
                      value=f'="w/c "&TEXT({start_ref}+{offset_days},"dd/mm")')
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.font = Font(size=9, bold=True)
    cell.fill = WEEK_FILL_A if week_idx % 2 == 0 else WEEK_FILL_B
    is_block_end = week_idx % BLOCK_WEEKS == BLOCK_WEEKS - 1
    right_border = THICK if is_block_end else MED
    cell.border = Border(left=THIN, right=right_border, top=THIN, bottom=THIN)
    for col in range(first_col, last_col + 1):
        ws_g.cell(row=WEEK_ROW, column=col).border = Border(
            left=THIN, right=(right_border if col == last_col else THIN), top=THIN, bottom=THIN)

# 6-week block band: merge each block of 30 day columns
num_blocks = -(-NUM_WEEKS // BLOCK_WEEKS)
for block_idx in range(num_blocks):
    first_week = block_idx * BLOCK_WEEKS
    last_week = min(first_week + BLOCK_WEEKS, NUM_WEEKS) - 1
    first_col = DAY_COL_START + first_week * 5
    last_col = DAY_COL_START + (last_week + 1) * 5 - 1
    start_offset = first_week * 7
    end_offset = last_week * 7 + 4
    ws_g.merge_cells(start_row=BAND_ROW, start_column=first_col, end_row=BAND_ROW, end_column=last_col)
    cell = ws_g.cell(
        row=BAND_ROW, column=first_col,
        value=f'="Block "&{block_idx + 1}&": "&TEXT({start_ref}+{start_offset},"dd/mm")&'
              f'" - "&TEXT({start_ref}+{end_offset},"dd/mm")',
    )
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.font = Font(bold=True, color="FFFFFF")
    cell.fill = BAND_FILL_A if block_idx % 2 == 0 else BAND_FILL_B
    for col in range(first_col, last_col + 1):
        ws_g.cell(row=BAND_ROW, column=col).border = Border(
            left=THIN, right=(THICK if col == last_col else THIN), top=THIN, bottom=THIN)

ws_g.freeze_panes = ws_g.cell(row=FIRST_STAFF_ROW, column=DAY_COL_START)

# ---- staff rows -----------------------------------------------------------
project_dv = DataValidation(type="list", formula1="=ProjectList", allow_blank=True,
                             showDropDown=False)
project_dv.error = "Pick a project from the list (add new ones on the Lists tab)."
project_dv.errorTitle = "Invalid project"
ws_g.add_data_validation(project_dv)

for i in range(STAFF_COUNT):
    row = FIRST_STAFF_ROW + i
    name_cell = ws_g.cell(row=row, column=1, value=f"=Lists!$A${2 + i}")
    name_cell.font = Font(bold=True)
    name_cell.fill = PatternFill("solid", fgColor=GREY)
    name_cell.border = Border(left=THIN, right=MED, top=THIN, bottom=THIN)
    ws_g.row_dimensions[row].height = 18

    for d in range(TOTAL_DAYS):
        col = DAY_COL_START + d
        week_idx = d // 5
        day_in_week = d % 5
        is_week_end = day_in_week == 4
        is_block_end = (week_idx % BLOCK_WEEKS == BLOCK_WEEKS - 1) and is_week_end
        right_border = THICK if is_block_end else (MED if is_week_end else THIN)
        bottom_border = THICK if i == STAFF_COUNT - 1 else THIN
        cell = ws_g.cell(row=row, column=col)
        cell.border = Border(left=THIN, right=right_border, top=THIN, bottom=bottom_border)
        cell.alignment = Alignment(horizontal="center", vertical="center")

grid_range = (f"{get_column_letter(DAY_COL_START)}{FIRST_STAFF_ROW}:"
              f"{get_column_letter(last_day_col)}{LAST_STAFF_ROW}")
project_dv.add(grid_range)

top_left = ws_g.cell(row=FIRST_STAFF_ROW, column=DAY_COL_START).coordinate
for i in range(PROJECT_SLOTS):
    lists_ref = f"Lists!$C${2 + i}"
    fill = PatternFill("solid", fgColor=PALETTE[i])
    ws_g.conditional_formatting.add(
        grid_range,
        FormulaRule(formula=[f'AND({top_left}<>"",{top_left}={lists_ref})'], fill=fill),
    )

# =====================================================================
# 4. DAYS-PER-PROJECT SUMMARY (below the grid)
# =====================================================================
SUMMARY_TITLE_ROW = LAST_STAFF_ROW + 3
SUMMARY_HEADER_ROW = SUMMARY_TITLE_ROW + 1
SUMMARY_FIRST_ROW = SUMMARY_HEADER_ROW + 1
SUMMARY_LAST_ROW = SUMMARY_FIRST_ROW + PROJECT_SLOTS - 1

ws_g.cell(row=SUMMARY_TITLE_ROW, column=1, value="Days per Project (current timeline)").font = Font(
    size=13, bold=True, color=NAVY)

ws_g.cell(row=SUMMARY_HEADER_ROW, column=1, value="Project")
for i in range(STAFF_COUNT):
    col = 2 + i
    ws_g.cell(row=SUMMARY_HEADER_ROW, column=col, value=f"=Lists!$A${2 + i}")
total_col = 2 + STAFF_COUNT
ws_g.cell(row=SUMMARY_HEADER_ROW, column=total_col, value="Total Days")
for col in range(1, total_col + 1):
    c = ws_g.cell(row=SUMMARY_HEADER_ROW, column=col)
    c.fill = HEADER_FILL
    c.font = HEADER_FONT
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    c.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

grid_col_first = get_column_letter(DAY_COL_START)
grid_col_last = get_column_letter(last_day_col)

for i in range(PROJECT_SLOTS):
    row = SUMMARY_FIRST_ROW + i
    proj_cell = ws_g.cell(row=row, column=1, value=f"=Lists!$C${2 + i}")
    proj_cell.fill = PatternFill("solid", fgColor=PALETTE[i])
    proj_cell.font = Font(color=DARK_TEXT)
    for j in range(STAFF_COUNT):
        col = 2 + j
        staff_row = FIRST_STAFF_ROW + j
        col_letter = get_column_letter(col)
        ws_g.cell(
            row=row, column=col,
            value=(f"=COUNTIF({grid_col_first}{staff_row}:{grid_col_last}{staff_row},"
                   f"$A{row})"),
        )
    first_staff_letter = get_column_letter(2)
    last_staff_letter = get_column_letter(1 + STAFF_COUNT)
    ws_g.cell(row=row, column=total_col,
              value=f"=SUM({first_staff_letter}{row}:{last_staff_letter}{row})")
    for col in range(1, total_col + 1):
        ws_g.cell(row=row, column=col).border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

grand_row = SUMMARY_LAST_ROW + 1
ws_g.cell(row=grand_row, column=1, value="Grand Total").font = Font(bold=True)
for col in range(2, total_col + 1):
    col_letter = get_column_letter(col)
    ws_g.cell(row=grand_row, column=col,
              value=f"=SUM({col_letter}{SUMMARY_FIRST_ROW}:{col_letter}{SUMMARY_LAST_ROW})").font = Font(bold=True)

# =====================================================================
wb.active = wb.sheetnames.index("Instructions")
out_path = "Resource_Tracker.xlsx"
wb.save(out_path)
print(f"Saved {out_path}")
