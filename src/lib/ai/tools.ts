/**
 * AI 工具定义与执行
 *
 * - toolDefinitions：传给 LLM 的 tools schema（OpenAI/DeepSeek 兼容格式）
 * - executeTool：执行单个工具调用，操作 Supabase
 *
 * 设计要点：
 * - card_ref 支持编号（"1"）或标题模糊匹配，降低 AI 出错率
 * - 日期支持多种格式（ISO、M/D、8月10日），容错解析
 * - 定位记录用 content 匹配，而非行号，更贴近自然语言
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardData } from "@/stores/timeline-store";

// ===== 类型 =====
export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  cards: CardData[];
}

export interface ToolResult {
  success: boolean;
  message: string;
}

// ===== 工具 schema（给 LLM） =====
export const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "create_card",
      description: "新建一个任务卡片。card_ref 是从快照里看到的编号（如 \"1\"）或卡片标题。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "卡片标题，如「写论文」" },
          start_date: { type: "string", description: "起始日期，如 2026-08-10 或 8/10" },
          duration_days: { type: "integer", description: "持续天数，如 7" },
        },
        required: ["title", "start_date", "duration_days"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_card",
      description: "修改卡片的标题、起始日期或时长。",
      parameters: {
        type: "object",
        properties: {
          card_ref: { type: "string", description: "卡片编号或标题" },
          title: { type: "string", description: "新标题（可选）" },
          start_date: { type: "string", description: "新起始日期（可选）" },
          duration_days: { type: "integer", description: "新持续天数（可选）" },
        },
        required: ["card_ref"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_card",
      description: "删除整个任务卡片及其所有记录。",
      parameters: {
        type: "object",
        properties: {
          card_ref: { type: "string", description: "卡片编号或标题" },
        },
        required: ["card_ref"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_daily_task",
      description: "在指定卡片的某一天添加一条每日任务。",
      parameters: {
        type: "object",
        properties: {
          card_ref: { type: "string", description: "卡片编号或标题" },
          date: { type: "string", description: "日期，如 8/10 或 2026-08-10" },
          content: { type: "string", description: "任务内容" },
        },
        required: ["card_ref", "date", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_daily_task",
      description: "修改某天的某条每日任务内容。用 content_match 定位要改的记录。",
      parameters: {
        type: "object",
        properties: {
          card_ref: { type: "string", description: "卡片编号或标题" },
          date: { type: "string", description: "日期" },
          content_match: { type: "string", description: "用于定位的现有内容（或其片段）" },
          new_content: { type: "string", description: "修改后的内容" },
        },
        required: ["card_ref", "date", "content_match", "new_content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "toggle_daily_task",
      description: "切换某条每日任务的完成状态（完成↔未完成）。用 content_match 定位。",
      parameters: {
        type: "object",
        properties: {
          card_ref: { type: "string", description: "卡片编号或标题" },
          date: { type: "string", description: "日期" },
          content_match: { type: "string", description: "用于定位的内容片段" },
          completed: { type: "boolean", description: "true=标完成，false=取消完成" },
        },
        required: ["card_ref", "date", "content_match", "completed"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_daily_task",
      description: "删除某天的某条每日任务。用 content_match 定位。",
      parameters: {
        type: "object",
        properties: {
          card_ref: { type: "string", description: "卡片编号或标题" },
          date: { type: "string", description: "日期" },
          content_match: { type: "string", description: "用于定位的内容片段" },
        },
        required: ["card_ref", "date", "content_match"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_todo",
      description: "在指定卡片的待办清单中添加一条待办事项。",
      parameters: {
        type: "object",
        properties: {
          card_ref: { type: "string", description: "卡片编号或标题" },
          content: { type: "string", description: "待办内容" },
        },
        required: ["card_ref", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_todo",
      description: "修改某条待办事项内容。用 content_match 定位。",
      parameters: {
        type: "object",
        properties: {
          card_ref: { type: "string", description: "卡片编号或标题" },
          content_match: { type: "string", description: "用于定位的现有内容片段" },
          new_content: { type: "string", description: "修改后的内容" },
        },
        required: ["card_ref", "content_match", "new_content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "toggle_todo",
      description: "切换某条待办事项的完成状态。用 content_match 定位。",
      parameters: {
        type: "object",
        properties: {
          card_ref: { type: "string", description: "卡片编号或标题" },
          content_match: { type: "string", description: "用于定位的内容片段" },
          completed: { type: "boolean", description: "true=标完成，false=取消完成" },
        },
        required: ["card_ref", "content_match", "completed"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_todo",
      description: "删除某条待办事项。用 content_match 定位。",
      parameters: {
        type: "object",
        properties: {
          card_ref: { type: "string", description: "卡片编号或标题" },
          content_match: { type: "string", description: "用于定位的内容片段" },
        },
        required: ["card_ref", "content_match"],
      },
    },
  },
];

// ===== 辅助函数 =====

/** 容错日期解析：支持 ISO、M/D、M-D、8月10日 等格式 */
export function parseFlexibleDate(input: string, referenceYear: number): string | null {
  const s = input.trim();

  // ISO: 2026-08-10
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return normalizeDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // M/D 或 M-D
  const slashMatch = s.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (slashMatch) {
    return normalizeDate(referenceYear, Number(slashMatch[1]), Number(slashMatch[2]));
  }

  // 8月10日 / 8月10
  const cnMatch = s.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (cnMatch) {
    return normalizeDate(referenceYear, Number(cnMatch[1]), Number(cnMatch[2]));
  }

  return null;
}

function normalizeDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 通过编号或标题模糊匹配找到卡片 */
function resolveCard(cardRef: string, cards: CardData[]): CardData | null {
  const sorted = [...cards].sort((a, b) => a.row_position - b.row_position);

  // 编号匹配
  const num = parseInt(cardRef, 10);
  if (!isNaN(num) && num >= 1 && num <= sorted.length) {
    return sorted[num - 1]!;
  }

  // 标题精确匹配
  const exact = sorted.find((c) => c.title === cardRef);
  if (exact) return exact;

  // 标题包含匹配
  const lower = cardRef.toLowerCase();
  const fuzzy = sorted.find(
    (c) => c.title.toLowerCase().includes(lower) || lower.includes(c.title.toLowerCase()),
  );
  return fuzzy ?? null;
}

/** 在指定日期的记录里用内容匹配定位 */
function findDailyRecord(card: CardData, isoDate: string, contentMatch: string) {
  const records = card.daily_records.filter((r) => r.date === isoDate);
  // 精确匹配
  let target = records.find((r) => r.content === contentMatch);
  if (target) return target;
  // 包含匹配
  const lower = contentMatch.toLowerCase();
  target = records.find(
    (r) => r.content.toLowerCase().includes(lower) || lower.includes(r.content.toLowerCase()),
  );
  return target ?? null;
}

/** 在待办里用内容匹配定位 */
function findTodo(card: CardData, contentMatch: string) {
  let target = card.todo_items.find((t) => t.content === contentMatch);
  if (target) return target;
  const lower = contentMatch.toLowerCase();
  target = card.todo_items.find(
    (t) => t.content.toLowerCase().includes(lower) || lower.includes(t.content.toLowerCase()),
  );
  return target ?? null;
}

// ===== 执行函数 =====
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { supabase, userId, cards } = ctx;
  const now = new Date();
  const refYear = now.getFullYear();

  try {
    switch (name) {
      // ---------- 卡片 ----------
      case "create_card": {
        const title = args.title as string;
        const startDate = parseFlexibleDate(args.start_date as string, refYear);
        const duration = args.duration_days as number;
        if (!startDate) return { success: false, message: `无法解析日期：${args.start_date}` };

        const rowPosition = cards.length;
        const { data, error } = await supabase
          .from("cards")
          .insert({
            user_id: userId,
            title,
            start_date: startDate,
            duration_days: Math.max(1, duration),
            row_position: rowPosition,
            color_index: rowPosition,
          })
          .select()
          .single();
        if (error) return { success: false, message: `创建失败：${error.message}` };
        return { success: true, message: `已新建卡片"${title}"（${startDate}起，${duration}天）` };
      }

      case "update_card": {
        const card = resolveCard(args.card_ref as string, cards);
        if (!card) return { success: false, message: `找不到卡片：${args.card_ref}` };

        const updates: Record<string, unknown> = {};
        if (args.title) updates.title = args.title;
        if (args.start_date) {
          const d = parseFlexibleDate(args.start_date as string, refYear);
          if (!d) return { success: false, message: `无法解析日期：${args.start_date}` };
          updates.start_date = d;
        }
        if (args.duration_days) updates.duration_days = Math.max(1, args.duration_days as number);

        const { error } = await supabase.from("cards").update(updates).eq("id", card.id);
        if (error) return { success: false, message: `更新失败：${error.message}` };
        return { success: true, message: `已更新卡片"${card.title}"` };
      }

      case "delete_card": {
        const card = resolveCard(args.card_ref as string, cards);
        if (!card) return { success: false, message: `找不到卡片：${args.card_ref}` };

        const { error } = await supabase.from("cards").delete().eq("id", card.id);
        if (error) return { success: false, message: `删除失败：${error.message}` };
        return { success: true, message: `已删除卡片"${card.title}"` };
      }

      // ---------- 每日任务 ----------
      case "add_daily_task": {
        const card = resolveCard(args.card_ref as string, cards);
        if (!card) return { success: false, message: `找不到卡片：${args.card_ref}` };
        const isoDate = parseFlexibleDate(args.date as string, refYear);
        if (!isoDate) return { success: false, message: `无法解析日期：${args.date}` };

        const maxRow = card.daily_records
          .filter((r) => r.date === isoDate)
          .reduce((max, r) => Math.max(max, r.row_index + 1), 0);

        const { error } = await supabase.from("daily_records").insert({
          card_id: card.id,
          date: isoDate,
          row_index: maxRow,
          content: args.content as string,
          completed: false,
        });
        if (error) return { success: false, message: `添加失败：${error.message}` };
        return { success: true, message: `已在"${card.title}"的 ${args.date} 添加任务"${args.content}"` };
      }

      case "update_daily_task": {
        const card = resolveCard(args.card_ref as string, cards);
        if (!card) return { success: false, message: `找不到卡片：${args.card_ref}` };
        const isoDate = parseFlexibleDate(args.date as string, refYear);
        if (!isoDate) return { success: false, message: `无法解析日期：${args.date}` };

        const record = findDailyRecord(card, isoDate, args.content_match as string);
        if (!record) return { success: false, message: `在 ${args.date} 找不到内容含"${args.content_match}"的任务` };

        const { error } = await supabase
          .from("daily_records")
          .update({ content: args.new_content as string })
          .eq("id", record.id);
        if (error) return { success: false, message: `更新失败：${error.message}` };
        return { success: true, message: `已将"${record.content}"改为"${args.new_content}"` };
      }

      case "toggle_daily_task": {
        const card = resolveCard(args.card_ref as string, cards);
        if (!card) return { success: false, message: `找不到卡片：${args.card_ref}` };
        const isoDate = parseFlexibleDate(args.date as string, refYear);
        if (!isoDate) return { success: false, message: `无法解析日期：${args.date}` };

        const record = findDailyRecord(card, isoDate, args.content_match as string);
        if (!record) return { success: false, message: `在 ${args.date} 找不到内容含"${args.content_match}"的任务` };

        const { error } = await supabase
          .from("daily_records")
          .update({ completed: args.completed as boolean })
          .eq("id", record.id);
        if (error) return { success: false, message: `更新失败：${error.message}` };
        return {
          success: true,
          message: `已${args.completed ? "完成" : "取消完成"}"${record.content}"`,
        };
      }

      case "delete_daily_task": {
        const card = resolveCard(args.card_ref as string, cards);
        if (!card) return { success: false, message: `找不到卡片：${args.card_ref}` };
        const isoDate = parseFlexibleDate(args.date as string, refYear);
        if (!isoDate) return { success: false, message: `无法解析日期：${args.date}` };

        const record = findDailyRecord(card, isoDate, args.content_match as string);
        if (!record) return { success: false, message: `在 ${args.date} 找不到内容含"${args.content_match}"的任务` };

        const { error } = await supabase.from("daily_records").delete().eq("id", record.id);
        if (error) return { success: false, message: `删除失败：${error.message}` };
        return { success: true, message: `已删除任务"${record.content}"` };
      }

      // ---------- 待办 ----------
      case "add_todo": {
        const card = resolveCard(args.card_ref as string, cards);
        if (!card) return { success: false, message: `找不到卡片：${args.card_ref}` };

        const maxRow = card.todo_items.reduce((max, t) => Math.max(max, t.row_index + 1), 0);
        const { error } = await supabase.from("todo_items").insert({
          card_id: card.id,
          row_index: maxRow,
          content: args.content as string,
          completed: false,
        });
        if (error) return { success: false, message: `添加失败：${error.message}` };
        return { success: true, message: `已在"${card.title}"的待办清单添加"${args.content}"` };
      }

      case "update_todo": {
        const card = resolveCard(args.card_ref as string, cards);
        if (!card) return { success: false, message: `找不到卡片：${args.card_ref}` };

        const todo = findTodo(card, args.content_match as string);
        if (!todo) return { success: false, message: `找不到内容含"${args.content_match}"的待办` };

        const { error } = await supabase
          .from("todo_items")
          .update({ content: args.new_content as string })
          .eq("id", todo.id);
        if (error) return { success: false, message: `更新失败：${error.message}` };
        return { success: true, message: `已将待办"${todo.content}"改为"${args.new_content}"` };
      }

      case "toggle_todo": {
        const card = resolveCard(args.card_ref as string, cards);
        if (!card) return { success: false, message: `找不到卡片：${args.card_ref}` };

        const todo = findTodo(card, args.content_match as string);
        if (!todo) return { success: false, message: `找不到内容含"${args.content_match}"的待办` };

        const { error } = await supabase
          .from("todo_items")
          .update({ completed: args.completed as boolean })
          .eq("id", todo.id);
        if (error) return { success: false, message: `更新失败：${error.message}` };
        return { success: true, message: `已${args.completed ? "完成" : "取消完成"}待办"${todo.content}"` };
      }

      case "delete_todo": {
        const card = resolveCard(args.card_ref as string, cards);
        if (!card) return { success: false, message: `找不到卡片：${args.card_ref}` };

        const todo = findTodo(card, args.content_match as string);
        if (!todo) return { success: false, message: `找不到内容含"${args.content_match}"的待办` };

        const { error } = await supabase.from("todo_items").delete().eq("id", todo.id);
        if (error) return { success: false, message: `删除失败：${error.message}` };
        return { success: true, message: `已删除待办"${todo.content}"` };
      }

      default:
        return { success: false, message: `未知工具：${name}` };
    }
  } catch (err) {
    return { success: false, message: `执行异常：${err instanceof Error ? err.message : String(err)}` };
  }
}
