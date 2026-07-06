"""
Generates Resource_Tracker.xlsx - a resource/time tracker for a line manager
with 4 direct reports, tracking project allocation and leave against a
7.5 hour standard working day.

Run: python3 generate_tracker.py
Output: Resource_Tracker.xlsx (in the same folder)
"""
import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, NamedStyle
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.chart import BarChart, PieChart, Reference
from openpyxl.utils import get_column_letter

# ---------------------------------------------------------------- constants
NUM_TIMESHEET_ROWS = 1000          # data rows available on the Timesheet
NUM_WEEKLY_ROWS = 60                # ~14 months of weekly summary rows
NUM_ALLOCATION_SUMMARY_ROWS = 20    # rows reserved for allocations in summary
STAFF_COUNT = 4
DAY_HOURS = 7.5

NAVY = "1F3864"
BLUE = "2E5395"
LIGHT_BLUE = "D9E2F3"
GREEN = "C6EFCE"
GREEN_FONT = "006100"
AMBER = "FFEB9C"
AMBER_FONT = "9C6500"
RED = "FFC7CE"
RED_FONT = "9C0006"
GREY = "F2F2F2"

HEADER_FILL = PatternFill("solid", fgColor=NAVY)
HEADER_FONT = Font(color="FFFFFF", bold=True)
SUBHEADER_FILL = PatternFill("solid", fgColor=LIGHT_BLUE)
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

wb = Workbook()


def style_header_row(ws, row, first_col, last_col, fill=HEADER_FILL, font=HEADER_FONT):
    for col in range(first_col, last_col + 1):
        c = ws.cell(row=row, column=col)
        c.fill = fill
        c.font = font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER


def set_widths(ws, widths):
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


# =====================================================================
# 1. INSTRUCTIONS SHEET
# =====================================================================
ws_instr = wb.active
ws_instr.title = "Instructions"
ws_instr.sheet_view.showGridLines = False
set_widths(ws_instr, {"A": 3, "B": 100})

title = ws_instr.cell(row=2, column=2, value="Resource Tracker – How to Use")
title.font = Font(size=18, bold=True, color=NAVY)

lines = [
    ("", ""),
    ("bold", "1. Set up your team and projects on the 'Lists' tab"),
    ("normal", "   Replace the 4 placeholder staff names with your team's real names. Add or "
               "remove projects and leave types in the 'Allocation' column. Every dropdown in "
               "this workbook reads from this tab automatically, so anything you add here shows "
               "up as a new dropdown option immediately - no formulas to touch."),
    ("", ""),
    ("bold", "2. Log time on the 'Timesheet' tab"),
    ("normal", "   One row = one person, one date, one allocation (project or leave), and the "
               "hours spent. If someone splits a day across two projects, just add two rows for "
               "that date - e.g. Jane / Project Alpha / 4.5 hours, then Jane / Project Beta / 3 "
               "hours. The standard day is 7.5 hours."),
    ("normal", "   The 'Type', 'Week Ending' and 'Daily Total' columns fill in automatically. "
               "'Daily Total' turns green at exactly 7.5 hours for that person/date, amber if "
               "under, and red if over - so gaps or double-booked time jump out immediately."),
    ("", ""),
    ("bold", "3. Check the automated summaries"),
    ("normal", "   'Weekly Summary' totals each person's hours per week against the 37.5 hour "
               "target and flags the variance."),
    ("normal", "   'Project & Leave Summary' breaks total hours down by project/leave type and "
               "by person, with charts, so you can see at a glance where the team's time is "
               "going."),
    ("normal", "   'Dashboard' gives a one-page snapshot of the current week."),
    ("", ""),
    ("bold", "4. Extending the tracker"),
    ("normal", "   The Timesheet has 1,000 pre-formatted rows ready to go. If you add a 5th team "
               "member, add their name to the Lists tab, then copy a staff column formula across "
               "on the Weekly Summary and Project & Leave Summary tabs (select an existing staff "
               "column and drag/copy it one column over)."),
    ("normal", "   All dropdowns are driven by named ranges (StaffList / AllocationList) that "
               "auto-expand as you add rows to the Lists tab - you never need to edit the "
               "dropdown itself."),
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
# 2. LISTS SHEET (editable source data for every dropdown)
# =====================================================================
ws_lists = wb.create_sheet("Lists")
ws_lists.sheet_view.showGridLines = False
set_widths(ws_lists, {"A": 24, "B": 3, "C": 28, "D": 14, "E": 3, "F": 60})

ws_lists.cell(row=1, column=1, value="Staff Name")
ws_lists.cell(row=1, column=3, value="Allocation (Project or Leave Type)")
ws_lists.cell(row=1, column=4, value="Type")
style_header_row(ws_lists, 1, 1, 1)
style_header_row(ws_lists, 1, 3, 4)

note = ws_lists.cell(
    row=1, column=6,
    value="Edit these lists freely. Add a row and it is picked up everywhere automatically "
          "(dropdowns, summaries, charts) via the StaffList / AllocationList named ranges.",
)
note.font = Font(italic=True, color="808080")
note.alignment = Alignment(wrap_text=True, vertical="top")
ws_lists.row_dimensions[1].height = 30

staff_placeholder = ["Line Report 1", "Line Report 2", "Line Report 3", "Line Report 4"]
for i, name in enumerate(staff_placeholder):
    ws_lists.cell(row=2 + i, column=1, value=name).border = BORDER

allocations = [
    ("Project A", "Project"),
    ("Project B", "Project"),
    ("Project C", "Project"),
    ("Project D", "Project"),
    ("Annual Leave", "Leave"),
    ("Sick Leave", "Leave"),
    ("Public Holiday", "Leave"),
    ("Training / Development", "Leave"),
    ("Other Absence", "Leave"),
]
for i, (name, typ) in enumerate(allocations):
    ws_lists.cell(row=2 + i, column=3, value=name).border = BORDER
    ws_lists.cell(row=2 + i, column=4, value=typ).border = BORDER

# keep the Type column self-consistent as rows are added
type_dv = DataValidation(type="list", formula1='"Project,Leave"', allow_blank=True)
ws_lists.add_data_validation(type_dv)
type_dv.add(f"D2:D{NUM_ALLOCATION_SUMMARY_ROWS + 10}")

# named, auto-expanding ranges used by every dropdown in the workbook
wb.defined_names["StaffList"] = DefinedName(
    "StaffList", attr_text="OFFSET(Lists!$A$2,0,0,COUNTA(Lists!$A$2:$A$1000),1)"
)
wb.defined_names["AllocationList"] = DefinedName(
    "AllocationList", attr_text="OFFSET(Lists!$C$2,0,0,COUNTA(Lists!$C$2:$C$1000),1)"
)

# =====================================================================
# 3. TIMESHEET SHEET
# =====================================================================
ws_ts = wb.create_sheet("Timesheet")
ws_ts.sheet_view.showGridLines = False
headers = ["Date", "Staff Name", "Allocation (Project / Leave)", "Type",
           "Hours", "Notes", "Week Ending", "Daily Total (person/date)"]
for i, h in enumerate(headers, start=1):
    ws_ts.cell(row=1, column=i, value=h)
style_header_row(ws_ts, 1, 1, len(headers))
ws_ts.freeze_panes = "A2"
set_widths(ws_ts, {"A": 12, "B": 18, "C": 26, "D": 10, "E": 9, "F": 30, "G": 13, "H": 22})

staff_dv = DataValidation(type="list", formula1="=StaffList", allow_blank=True,
                           showDropDown=False)
staff_dv.error = "Please pick a name from the list (add new names on the Lists tab)."
staff_dv.errorTitle = "Invalid staff name"
ws_ts.add_data_validation(staff_dv)

alloc_dv = DataValidation(type="list", formula1="=AllocationList", allow_blank=True,
                           showDropDown=False)
alloc_dv.error = "Please pick a project or leave type from the list (add new ones on the Lists tab)."
alloc_dv.errorTitle = "Invalid allocation"
ws_ts.add_data_validation(alloc_dv)

hours_dv = DataValidation(type="decimal", operator="between", formula1="0", formula2="7.5",
                           allow_blank=True)
hours_dv.error = "Enter hours between 0 and 7.5 for a single row."
hours_dv.errorTitle = "Invalid hours"
ws_ts.add_data_validation(hours_dv)

for row in range(2, NUM_TIMESHEET_ROWS + 2):
    ws_ts.cell(row=row, column=4,
               value=f'=IF(C{row}="","",IFERROR(VLOOKUP(C{row},Lists!$C:$D,2,FALSE),""))')
    ws_ts.cell(row=row, column=7,
               value=f'=IF(A{row}="","",A{row}+(7-WEEKDAY(A{row},2)))')
    ws_ts.cell(row=row, column=8,
               value=f'=IF(OR(A{row}="",B{row}=""),"",'
                     f'SUMIFS($E$2:$E${NUM_TIMESHEET_ROWS + 1},'
                     f'$A$2:$A${NUM_TIMESHEET_ROWS + 1},A{row},'
                     f'$B$2:$B${NUM_TIMESHEET_ROWS + 1},B{row}))')
    ws_ts.cell(row=row, column=1).number_format = "dd/mm/yyyy"
    ws_ts.cell(row=row, column=7).number_format = "dd/mm/yyyy"
    for col in range(1, 9):
        ws_ts.cell(row=row, column=col).border = BORDER

staff_dv.add(f"B2:B{NUM_TIMESHEET_ROWS + 1}")
alloc_dv.add(f"C2:C{NUM_TIMESHEET_ROWS + 1}")
hours_dv.add(f"E2:E{NUM_TIMESHEET_ROWS + 1}")

# conditional formatting: daily total vs 7.5 target
green_fill = PatternFill("solid", fgColor=GREEN)
amber_fill = PatternFill("solid", fgColor=AMBER)
red_fill = PatternFill("solid", fgColor=RED)
leave_fill = PatternFill("solid", fgColor=LIGHT_BLUE)

h_range = f"H2:H{NUM_TIMESHEET_ROWS + 1}"
ws_ts.conditional_formatting.add(
    h_range, FormulaRule(formula=[f'AND(H2<>"",H2=7.5)'], fill=green_fill,
                          font=Font(color=GREEN_FONT)))
ws_ts.conditional_formatting.add(
    h_range, FormulaRule(formula=[f'AND(H2<>"",H2>7.5)'], fill=red_fill,
                          font=Font(color=RED_FONT)))
ws_ts.conditional_formatting.add(
    h_range, FormulaRule(formula=[f'AND(H2<>"",H2>0,H2<7.5)'], fill=amber_fill,
                          font=Font(color=AMBER_FONT)))

row_range = f"A2:F{NUM_TIMESHEET_ROWS + 1}"
ws_ts.conditional_formatting.add(
    row_range, FormulaRule(formula=['$D2="Leave"'], fill=leave_fill))

# =====================================================================
# 4. WEEKLY SUMMARY SHEET
# =====================================================================
ws_wk = wb.create_sheet("Weekly Summary")
ws_wk.sheet_view.showGridLines = False
ws_wk.cell(row=1, column=1, value="Week Ending")
for i in range(STAFF_COUNT):
    col = 2 + i
    ws_wk.cell(row=1, column=col, value=f"=Lists!$A${2 + i}")
ws_wk.cell(row=1, column=2 + STAFF_COUNT, value="Total Hours")
ws_wk.cell(row=1, column=3 + STAFF_COUNT, value="Target Hours")
ws_wk.cell(row=1, column=4 + STAFF_COUNT, value="Variance")
last_col = 4 + STAFF_COUNT
style_header_row(ws_wk, 1, 1, last_col)
ws_wk.freeze_panes = "A2"
set_widths(ws_wk, {get_column_letter(c): 16 for c in range(1, last_col + 1)})
ws_wk.column_dimensions["A"].width = 14

ws_wk.cell(row=2, column=1, value="=TODAY()-WEEKDAY(TODAY(),3)+6").number_format = "dd/mm/yyyy"

for row in range(2, NUM_WEEKLY_ROWS + 2):
    if row > 2:
        ws_wk.cell(row=row, column=1, value=f"=A{row - 1}+7")
        ws_wk.cell(row=row, column=1).number_format = "dd/mm/yyyy"
    for i in range(STAFF_COUNT):
        col = 2 + i
        col_letter = get_column_letter(col)
        ws_wk.cell(
            row=row, column=col,
            value=f'=IF(${col_letter}$1="","",'
                  f'SUMIFS(Timesheet!$E:$E,Timesheet!$B:$B,{col_letter}$1,'
                  f'Timesheet!$G:$G,$A{row}))',
        )
    total_col = 2 + STAFF_COUNT
    target_col = 3 + STAFF_COUNT
    var_col = 4 + STAFF_COUNT
    first_staff_letter = get_column_letter(2)
    last_staff_letter = get_column_letter(1 + STAFF_COUNT)
    ws_wk.cell(row=row, column=total_col,
               value=f"=SUM({first_staff_letter}{row}:{last_staff_letter}{row})")
    ws_wk.cell(row=row, column=target_col, value=f"=COUNTA(StaffList)*{DAY_HOURS}*5")
    ws_wk.cell(row=row, column=var_col,
               value=f"={get_column_letter(total_col)}{row}-{get_column_letter(target_col)}{row}")
    for col in range(1, last_col + 1):
        ws_wk.cell(row=row, column=col).border = BORDER

var_range = f"{get_column_letter(4 + STAFF_COUNT)}2:{get_column_letter(4 + STAFF_COUNT)}{NUM_WEEKLY_ROWS + 1}"
ws_wk.conditional_formatting.add(
    var_range, FormulaRule(formula=[f'{get_column_letter(4+STAFF_COUNT)}2=0'], fill=green_fill, font=Font(color=GREEN_FONT)))
ws_wk.conditional_formatting.add(
    var_range, FormulaRule(formula=[f'{get_column_letter(4+STAFF_COUNT)}2<0'], fill=amber_fill, font=Font(color=AMBER_FONT)))
ws_wk.conditional_formatting.add(
    var_range, FormulaRule(formula=[f'{get_column_letter(4+STAFF_COUNT)}2>0'], fill=red_fill, font=Font(color=RED_FONT)))

note = ws_wk.cell(row=NUM_WEEKLY_ROWS + 3, column=1,
                   value="Row 2's 'Week Ending' defaults to the current week (Sunday). Overwrite it "
                         "with your first week if you want the tracker to start earlier - every row "
                         "below rolls forward automatically in 7 day steps.")
note.font = Font(italic=True, color="808080")
note.alignment = Alignment(wrap_text=True)
ws_wk.row_dimensions[NUM_WEEKLY_ROWS + 3].height = 30
ws_wk.merge_cells(start_row=NUM_WEEKLY_ROWS + 3, start_column=1,
                   end_row=NUM_WEEKLY_ROWS + 3, end_column=last_col)

# =====================================================================
# 5. PROJECT & LEAVE SUMMARY SHEET
# =====================================================================
ws_ps = wb.create_sheet("Project & Leave Summary")
ws_ps.sheet_view.showGridLines = False
ws_ps.cell(row=1, column=1, value="Allocation")
ws_ps.cell(row=1, column=2, value="Type")
for i in range(STAFF_COUNT):
    col = 3 + i
    ws_ps.cell(row=1, column=col, value=f"=Lists!$A${2 + i}")
total_col = 3 + STAFF_COUNT
ws_ps.cell(row=1, column=total_col, value="Total Hours")
last_col = total_col
style_header_row(ws_ps, 1, 1, last_col)
ws_ps.freeze_panes = "A2"
set_widths(ws_ps, {"A": 26, "B": 10}); set_widths(ws_ps, {get_column_letter(c): 16 for c in range(3, last_col + 1)})

first_data_row = 2
last_data_row = first_data_row + NUM_ALLOCATION_SUMMARY_ROWS - 1
for i in range(NUM_ALLOCATION_SUMMARY_ROWS):
    row = first_data_row + i
    ws_ps.cell(row=row, column=1,
               value=f'=IFERROR(INDEX(AllocationList,{i + 1}),"")')
    ws_ps.cell(row=row, column=2,
               value=f'=IF($A{row}="","",IFERROR(VLOOKUP($A{row},Lists!$C:$D,2,FALSE),""))')
    for j in range(STAFF_COUNT):
        col = 3 + j
        col_letter = get_column_letter(col)
        ws_ps.cell(
            row=row, column=col,
            value=f'=IF($A{row}="","",SUMIFS(Timesheet!$E:$E,Timesheet!$C:$C,$A{row},'
                  f'Timesheet!$B:$B,{col_letter}$1))',
        )
    first_staff_letter = get_column_letter(3)
    last_staff_letter = get_column_letter(2 + STAFF_COUNT)
    ws_ps.cell(row=row, column=total_col,
               value=f'=IF($A{row}="","",SUM({first_staff_letter}{row}:{last_staff_letter}{row}))')
    for col in range(1, last_col + 1):
        ws_ps.cell(row=row, column=col).border = BORDER

grand_row = last_data_row + 2
ws_ps.cell(row=grand_row, column=1, value="Grand Total").font = Font(bold=True)
for col in range(3, last_col + 1):
    col_letter = get_column_letter(col)
    ws_ps.cell(row=grand_row, column=col,
               value=f"=SUM({col_letter}{first_data_row}:{col_letter}{last_data_row})").font = Font(bold=True)

proj_total_row = grand_row + 2
leave_total_row = grand_row + 3
ws_ps.cell(row=proj_total_row, column=1, value="Total Project Hours")
ws_ps.cell(row=proj_total_row, column=total_col,
           value=f'=SUMIF($B${first_data_row}:$B${last_data_row},"Project",'
                 f'${get_column_letter(total_col)}${first_data_row}:${get_column_letter(total_col)}${last_data_row})')
ws_ps.cell(row=leave_total_row, column=1, value="Total Leave Hours")
ws_ps.cell(row=leave_total_row, column=total_col,
           value=f'=SUMIF($B${first_data_row}:$B${last_data_row},"Leave",'
                 f'${get_column_letter(total_col)}${first_data_row}:${get_column_letter(total_col)}${last_data_row})')

# charts
bar = BarChart()
bar.title = "Hours by Allocation"
bar.y_axis.title = "Hours"
bar.x_axis.title = "Project / Leave Type"
cats = Reference(ws_ps, min_col=1, min_row=first_data_row, max_row=last_data_row)
data = Reference(ws_ps, min_col=total_col, min_row=1, max_row=last_data_row)
bar.add_data(data, titles_from_data=True)
bar.set_categories(cats)
bar.width = 20
bar.height = 10
ws_ps.add_chart(bar, f"A{grand_row + 6}")

pie = PieChart()
pie.title = "Project vs Leave Time"
pie_cats = Reference(ws_ps, min_col=1, min_row=proj_total_row, max_row=leave_total_row)
pie_data = Reference(ws_ps, min_col=total_col, min_row=proj_total_row, max_row=leave_total_row)
pie.add_data(pie_data)
pie.set_categories(pie_cats)
pie.width = 12
pie.height = 10
ws_ps.add_chart(pie, f"F{grand_row + 6}")

note = ws_ps.cell(row=last_data_row + 1, column=1,
                   value=f"{NUM_ALLOCATION_SUMMARY_ROWS} rows are reserved above for allocations pulled "
                         f"from the Lists tab. If you add more than {NUM_ALLOCATION_SUMMARY_ROWS} "
                         f"projects/leave types, copy the last data row's formulas down further.")
note.font = Font(italic=True, color="808080")
note.alignment = Alignment(wrap_text=True)
ws_ps.merge_cells(start_row=last_data_row + 1, start_column=1, end_row=last_data_row + 1, end_column=last_col)

# =====================================================================
# 6. DASHBOARD SHEET
# =====================================================================
ws_db = wb.create_sheet("Dashboard")
ws_db.sheet_view.showGridLines = False
set_widths(ws_db, {"A": 20, "B": 16, "C": 14, "D": 14, "E": 16})

title = ws_db.cell(row=1, column=1, value="Team Snapshot")
title.font = Font(size=16, bold=True, color=NAVY)

ws_db.cell(row=3, column=1, value="Current Week Ending:")
ws_db.cell(row=3, column=1).font = Font(bold=True)
ws_db.cell(row=3, column=2, value="=TODAY()-WEEKDAY(TODAY(),3)+6")
ws_db.cell(row=3, column=2).number_format = "dd/mm/yyyy"

headers = ["Staff Name", "Hours This Week", "Target", "Variance", "Status"]
for i, h in enumerate(headers, start=1):
    ws_db.cell(row=5, column=i, value=h)
style_header_row(ws_db, 5, 1, 5)

for i in range(STAFF_COUNT):
    row = 6 + i
    ws_db.cell(row=row, column=1, value=f"=Lists!$A${2 + i}")
    ws_db.cell(row=row, column=2,
               value=f'=IF($A{row}="","",SUMIFS(Timesheet!$E:$E,Timesheet!$B:$B,$A{row},'
                     f'Timesheet!$G:$G,$B$3))')
    ws_db.cell(row=row, column=3, value=f"={DAY_HOURS}*5")
    ws_db.cell(row=row, column=4, value=f"=B{row}-C{row}")
    ws_db.cell(row=row, column=5,
               value=f'=IF(B{row}="","",IF(D{row}=0,"On Target",IF(D{row}>0,"Over","Under")))')
    for col in range(1, 6):
        ws_db.cell(row=row, column=col).border = BORDER

status_range = f"E6:E{5 + STAFF_COUNT}"
ws_db.conditional_formatting.add(status_range, FormulaRule(formula=['E6="On Target"'], fill=green_fill, font=Font(color=GREEN_FONT)))
ws_db.conditional_formatting.add(status_range, FormulaRule(formula=['E6="Under"'], fill=amber_fill, font=Font(color=AMBER_FONT)))
ws_db.conditional_formatting.add(status_range, FormulaRule(formula=['E6="Over"'], fill=red_fill, font=Font(color=RED_FONT)))

bar2 = BarChart()
bar2.title = "Hours by Allocation"
bar2.y_axis.title = "Hours"
cats2 = Reference(ws_ps, min_col=1, min_row=first_data_row, max_row=last_data_row)
data2 = Reference(ws_ps, min_col=total_col, min_row=1, max_row=last_data_row)
bar2.add_data(data2, titles_from_data=True)
bar2.set_categories(cats2)
bar2.width = 18
bar2.height = 9
ws_db.add_chart(bar2, "A12")

pie2 = PieChart()
pie2.title = "Project vs Leave Time"
pie_cats2 = Reference(ws_ps, min_col=1, min_row=proj_total_row, max_row=leave_total_row)
pie_data2 = Reference(ws_ps, min_col=total_col, min_row=proj_total_row, max_row=leave_total_row)
pie2.add_data(pie_data2)
pie2.set_categories(pie_cats2)
pie2.width = 12
pie2.height = 9
ws_db.add_chart(pie2, "F12")

# =====================================================================
wb.active = wb.sheetnames.index("Instructions")
out_path = "Resource_Tracker.xlsx"
wb.save(out_path)
print(f"Saved {out_path}")
