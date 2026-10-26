// The group-by-area view and the grouped numbering (FR-17). Items are grouped
// by a column's value (compared without surrounding white space). The groups
// follow the order of the value list, then the values that are not in the
// list in order of first appearance, then the items without a value. Groups
// are numbered from 1 in that order, counting only groups that hold items.

import type { RowData } from './dataset';

export interface AreaGroup {
  // The area value, or '' for the items without one.
  area: string;
  // The group's position among the groups that hold items, from 1.
  index: number;
  rows: RowData[];
}

export function areaGroups(rows: RowData[], areaKey: string, areaValues: string[]): AreaGroup[] {
  const byArea = new Map<string, RowData[]>();
  for (const row of rows) {
    const area = (row.values[areaKey] ?? '').trim();
    const list = byArea.get(area);
    if (list) list.push(row);
    else byArea.set(area, [row]);
  }
  const order: string[] = [];
  for (const value of areaValues) {
    const v = value.trim();
    if (v !== '' && byArea.has(v) && !order.includes(v)) order.push(v);
  }
  for (const area of byArea.keys()) if (area !== '' && !order.includes(area)) order.push(area);
  if (byArea.has('')) order.push('');
  return order.map((area, i) => ({ area, index: i + 1, rows: byArea.get(area)! }));
}

// Grouped numbering by program (FR-17 as amended in v1.1.0, FR-43). The
// programs follow the order of the program list, then program values not in
// the list in order of first appearance, counting only programs that hold
// items; an item in a program is numbered "program.item" (for example 2.3);
// the items without a program are numbered 1, 2, 3 and onward among
// themselves, so that every number is unique.
export interface ProgramGroup {
  program: string;
  index: number;
  rows: RowData[];
}

export function programGroups(rows: RowData[], programKey: string, programValues: string[]): ProgramGroup[] {
  return areaGroups(rows, programKey, programValues)
    .filter((group) => group.area !== '')
    .map((group, i) => ({ program: group.area, index: i + 1, rows: group.rows }));
}

export function programLabels(rows: RowData[], programKey: string, programValues: string[]): Map<RowData, string> {
  const labels = new Map<RowData, string>();
  for (const group of programGroups(rows, programKey, programValues)) {
    group.rows.forEach((row, i) => labels.set(row, `${group.index}.${i + 1}`));
  }
  let running = 0;
  for (const row of rows) if (!labels.has(row)) labels.set(row, String(++running));
  return labels;
}
