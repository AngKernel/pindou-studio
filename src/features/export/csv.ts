import type { PatternStatistics } from '../../core/statistics';

function csvField(value: string | number): string {
  const raw = String(value);
  const text = typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rgbHex(rgb: { readonly r: number; readonly g: number; readonly b: number }): string {
  return `#${[rgb.r, rgb.g, rgb.b].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function buildInventoryCsv(statistics: PatternStatistics): string {
  const rows: (string | number)[][] = [
    ['品牌', '色号', '颜色名称', 'RGB', '数量', '占比'],
    ...statistics.colors.map((color) => [
      color.brand,
      color.code,
      color.name,
      rgbHex(color.rgb),
      color.count,
      `${color.percentage.toFixed(2)}%`,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}
