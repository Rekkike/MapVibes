// Grouped numbering and the group-by-area view (FR-17). Items are grouped by
// their area value (compared without surrounding white space). The groups
// follow the order of the area list, then the area values that are not in
// the list in order of first appearance, then the items without an area
// value. Groups are numbered from 1 in that order, counting only groups that
// hold items, and the items are numbered from 1 within each group in list
// order; the grouped number is shown as "group.item", for example 2.3.

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

// The grouped number of every row, as shown.
export function groupedLabels(rows: RowData[], areaKey: string, areaValues: string[]): Map<RowData, string> {
  const labels = new Map<RowData, string>();
  for (const group of areaGroups(rows, areaKey, areaValues)) {
    group.rows.forEach((row, i) => labels.set(row, `${group.index}.${i + 1}`));
  }
  return labels;
}
