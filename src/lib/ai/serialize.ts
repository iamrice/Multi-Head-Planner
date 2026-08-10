/**
 * 日程序列化：把 cards 数组转为紧凑的 Markdown，供 AI 阅读。
 *
 * 格式示例：
 * # 当前日程（今天：8/10）
 *
 * ## [1] 写论文  7/27→8/10 (14天)
 * 每日:
 *   7/27 ✓ 确定选题
 *   7/28 ✓ 文献调研
 *   7/29 · 写引言初稿
 * ▶ 8/10 · （今天，尚无记录）
 * 待办:
 *   · 联系导师约时间 ✓
 *   · 借阅参考书
 */

import type { CardData } from "@/stores/timeline-store";
import { parseDate, addDays, formatShortDate, isSameDay } from "@/lib/utils";

function formatRange(startDate: string, durationDays: number): string {
  const start = parseDate(startDate);
  const end = addDays(start, durationDays - 1);
  return `${formatShortDate(start)}→${formatShortDate(end)}`;
}

/** 判断某日期是否在卡片范围内（含首尾） */
function dateInRange(dateStr: string, card: CardData): boolean {
  const start = parseDate(card.start_date);
  const end = addDays(start, card.duration_days - 1);
  const d = parseDate(dateStr);
  return d >= start && d <= end;
}

export function serializeSchedule(cards: CardData[], today: Date): string {
  const sorted = [...cards].sort((a, b) => a.row_position - b.row_position);
  const todayStr = `${today.getMonth() + 1}/${today.getDate()}`;

  if (sorted.length === 0) {
    return `# 当前日程（今天：${todayStr}）\n\n（暂无任何任务卡片）`;
  }

  const lines: string[] = [];
  lines.push(`# 当前日程（今天：${todayStr}）`);
  lines.push("");

  sorted.forEach((card, idx) => {
    const num = idx + 1;
    lines.push(`## [${num}] ${card.title}  ${formatRange(card.start_date, card.duration_days)} (${card.duration_days}天)`);

    // 每日记录
    lines.push("每日:");
    const start = parseDate(card.start_date);
    const dates = Array.from({ length: card.duration_days }, (_, i) => addDays(start, i));

    dates.forEach((d) => {
      const dStr = `${d.getMonth() + 1}/${d.getDate()}`;
      const isoDate = iso(d);
      const records = card.daily_records
        .filter((r) => r.date === isoDate)
        .sort((a, b) => a.row_index - b.row_index);

      const isToday = isSameDay(d, today);
      const prefix = isToday ? "▶ " : "  ";

      if (records.length === 0) {
        lines.push(`${prefix}${dStr} · （无记录）`);
      } else {
        records.forEach((r) => {
          const mark = r.completed ? "✓" : "·";
          lines.push(`${prefix}${dStr} ${mark} ${r.content}`);
        });
      }
    });

    // 待办清单
    lines.push("待办:");
    const todos = [...card.todo_items].sort((a, b) => a.row_index - b.row_index);
    if (todos.length === 0) {
      lines.push("  （无待办）");
    } else {
      todos.forEach((t) => {
        const mark = t.completed ? "✓" : "·";
        lines.push(`  ${mark} ${t.content}`);
      });
    }

    lines.push("");
  });

  return lines.join("\n").trim();
}

/** Date → YYYY-MM-DD（与数据库存储格式一致） */
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 日期范围内的所有 ISO 日期字符串 */
export function cardDateRange(card: CardData): string[] {
  const start = parseDate(card.start_date);
  return Array.from({ length: card.duration_days }, (_, i) => iso(addDays(start, i)));
}
