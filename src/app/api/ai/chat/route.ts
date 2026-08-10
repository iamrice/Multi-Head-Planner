/**
 * AI 日程助手 API
 *
 * 流程：
 * 1. 从 Supabase session 获取当前用户
 * 2. 读取用户完整日程 → 序列化为 Markdown
 * 3. 连同用户指令发给 DeepSeek（带 tools）
 * 4. 循环执行 tool_calls，操作数据库
 * 5. 返回 AI 最终回复
 *
 * 前端通过 Supabase Realtime 自动接收数据库变更并刷新界面。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serializeSchedule } from "@/lib/ai/serialize";
import { toolDefinitions, executeTool, type ToolContext } from "@/lib/ai/tools";
import { getTodayCST } from "@/lib/utils";
import type { CardData, DailyRecordData, TodoItemData } from "@/stores/timeline-store";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";
const MAX_TOOL_ROUNDS = 8; // 防止无限循环

const SYSTEM_PROMPT = `你是 PlanMate 日程助手，帮助用户管理科研时间轴。

你的工作方式：
1. 用户会用自然语言描述计划变更（如"把明天的任务推迟两天"、"论文引言写完了，标完成"）
2. 你通过调用工具来精确修改日程，不要直接描述要改什么而不调用工具
3. 可以一次调用多个工具
4. 操作完成后，用一两句简短的中文总结你做了什么

注意事项：
- 日期格式：用户可能说"明天""下周三""8/10"等，你需要换算成具体日期（YYYY-MM-DD 或 M/D）
- card_ref 可以用快照里的编号（如 "1"）或卡片标题
- content_match 用任务内容的片段即可定位
- 如果用户的指令模糊，用最合理的解释执行，并在回复中说明你的理解`;

/** 读取用户完整日程（含每日记录和待办） */
async function loadUserSchedule(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never): Promise<CardData[]> {
  const { data: cardsData } = await supabase.from("cards").select("*").order("row_position");
  if (!cardsData || cardsData.length === 0) return [];

  const cardIds = cardsData.map((c: { id: string }) => c.id);
  const [{ data: recordsData }, { data: todosData }] = await Promise.all([
    supabase.from("daily_records").select("*").in("card_id", cardIds),
    supabase.from("todo_items").select("*").in("card_id", cardIds),
  ]);

  const recordsByCard: Record<string, DailyRecordData[]> = {};
  (recordsData || []).forEach((r) => {
    const cid = (r as Record<string, unknown>).card_id as string;
    if (!recordsByCard[cid]) recordsByCard[cid] = [];
    recordsByCard[cid]!.push(r as unknown as DailyRecordData);
  });
  const todosByCard: Record<string, TodoItemData[]> = {};
  (todosData || []).forEach((t) => {
    const cid = (t as Record<string, unknown>).card_id as string;
    if (!todosByCard[cid]) todosByCard[cid] = [];
    todosByCard[cid]!.push(t as unknown as TodoItemData);
  });

  return cardsData.map((c: Record<string, unknown>) => ({
    id: c.id as string,
    title: c.title as string,
    start_date: c.start_date as string,
    duration_days: c.duration_days as number,
    row_position: c.row_position as number,
    color_index: c.color_index as number,
    daily_records: (recordsByCard[c.id as string] || []).filter((r) => r.content !== ""),
    todo_items: (todosByCard[c.id as string] || []).filter((t) => t.content !== ""),
  }));
}

export async function POST(request: NextRequest) {
  // 1. 鉴权
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI 服务未配置（缺少 DEEPSEEK_API_KEY）" }, { status: 500 });
  }

  // 2. 解析请求
  const body = await request.json();
  const userMessage = body.message as string;
  if (!userMessage?.trim()) {
    return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
  }

  // 3. 读取当前日程 → 序列化
  let cards: CardData[];
  try {
    cards = await loadUserSchedule(supabase);
  } catch (err) {
    console.error("[ai/chat] loadUserSchedule error:", err);
    return NextResponse.json({ error: "读取日程失败" }, { status: 500 });
  }

  const today = getTodayCST();
  const scheduleSnapshot = serializeSchedule(cards, today);

  // 4. 组装消息，调用 DeepSeek
  type Message = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
  };

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: `当前日程快照：\n\n${scheduleSnapshot}` },
    { role: "user", content: userMessage },
  ];

  const toolCtx: ToolContext = { supabase, userId: user.id, cards };
  const actions: string[] = []; // 记录执行了哪些操作

  // 5. 工具调用循环
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: toolDefinitions,
        tool_choice: "auto",
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[ai/chat] DeepSeek error:", response.status, errText);
      return NextResponse.json({ error: `AI 服务异常（${response.status}）` }, { status: 502 });
    }

    const data = await response.json();
    const assistantMessage: Message = data.choices?.[0]?.message;
    if (!assistantMessage) {
      return NextResponse.json({ error: "AI 返回为空" }, { status: 502 });
    }

    messages.push(assistantMessage);

    // 没有 tool_calls → 最终回复
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return NextResponse.json({
        reply: assistantMessage.content || "已完成。",
        actions,
      });
    }

    // 执行每个工具调用
    for (const toolCall of assistantMessage.tool_calls) {
      const { name, arguments: argsStr } = toolCall.function;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsStr);
      } catch {
        args = {};
      }

      const result = await executeTool(name, args, toolCtx);
      actions.push(result.message);

      messages.push({
        role: "tool",
        content: JSON.stringify({ success: result.success, message: result.message }),
        tool_call_id: toolCall.id,
      });

      // 操作成功后刷新本地 cards 快照（后续工具能用到最新状态）
      if (result.success) {
        try {
          toolCtx.cards = await loadUserSchedule(supabase);
        } catch { /* 忽略刷新错误，用旧快照继续 */ }
      }
    }
  }

  // 超过最大轮次
  return NextResponse.json({
    reply: "操作较多，已部分完成。请查看当前日程，如需继续请再说。",
    actions,
  });
}
