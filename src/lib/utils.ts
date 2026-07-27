/** 日期工具函数 */

/** 获取东八区（UTC+8）的今日日期（去掉时区影响） */
export function getTodayCST(): Date {
  const now = new Date();
  // 转换为 UTC+8 的日期部分
  const utc8 = new Date(now.getTime() + 8 * 3600000);
  return new Date(utc8.getUTCFullYear(), utc8.getUTCMonth(), utc8.getUTCDate());
}

/** 格式化日期为 YYYY-MM-DD（使用本地时区，避免 ISO 偏移） */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 获取两个日期之间的天数 */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/** 日期加 N 天 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** 解析 YYYY-MM-DD 为 Date */
export function parseDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 获取日期范围内的所有日期 */
export function getDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  let current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current = addDays(current, 1);
  }
  return dates;
}

/** 判断是否为周末 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** 格式化短日期（M/D） */
export function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 格式化星期 */
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
export function formatWeekday(date: Date): string {
  return WEEKDAYS[date.getDay()];
}

/** 判断两个日期是否同一天 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Card 颜色调色板 */
const CARD_COLORS = [
  { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" }, // 蓝
  { bg: "#f0fdf4", border: "#86efac", text: "#166534" }, // 绿
  { bg: "#fefce8", border: "#fde047", text: "#854d0e" }, // 黄
  { bg: "#fdf2f8", border: "#f9a8d4", text: "#9d174d" }, // 粉
  { bg: "#f5f3ff", border: "#c4b5fd", text: "#5b21b6" }, // 紫
  { bg: "#fff7ed", border: "#fdba74", text: "#9a3412" }, // 橙
  { bg: "#ecfeff", border: "#67e8f9", text: "#155e75" }, // 青
  { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" }, // 红
];

export function getCardColor(index: number) {
  return CARD_COLORS[index % CARD_COLORS.length];
}
