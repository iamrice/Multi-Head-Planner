"use client";

import { useCallback, useRef, useMemo, useEffect, useState } from "react";
import { DateHeader } from "./date-header";
import { TimelineCard } from "./card";
import { TodayLine } from "./today-line";
import { useTimelineStore, type CardData, type DailyRecordData, type TodoItemData } from "@/stores/timeline-store";
import {
  addDays,
  parseDate,
  formatDate,
  getTodayCST,
} from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { signInFromClient, signUpFromClient } from "@/app/actions/auth";

const TOTAL_DAYS = 120;
const LOCAL_KEY = "planmate_local_cards";

function saveLocalCards(cards: CardData[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(cards)); } catch { /* */ }
}
function loadLocalCards(): CardData[] {
  try {
    const data = localStorage.getItem(LOCAL_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function TimelineView() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loginFormEmail, setLoginFormEmail] = useState("");
  const [loginFormPassword, setLoginFormPassword] = useState("");
  const [loginFormMode, setLoginFormMode] = useState<"login" | "signup">("signup");
  const [loginFormError, setLoginFormError] = useState("");
  const [loginFormPending, setLoginFormFormPending] = useState(false);

  const {
    cards,
    viewportStart,
    isLoggedIn,
    userEmail,
    authPrompt,
    cellWidth,
    setCards,
    addCard,
    updateCard,
    deleteCard,
    updateDailyRecord,
    addDailyRecordRow,
    updateTodoItem,
    addTodoItemRow,
    moveTodoToDaily,
    setLoggedIn,
    setAuthPrompt,
    setHasCreatedCard,
    setCellWidth,
  } = useTimelineStore();

  // 持久化本地卡片
  useEffect(() => {
    if (!isLoggedIn && loaded && cards.length > 0) {
      saveLocalCards(cards);
    }
  }, [cards, isLoggedIn, loaded]);

  // 初始化加载
  useEffect(() => {
    async function load() {
      let loggedIn = false;
      let email: string | null = null;
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { loggedIn = true; email = user.email ?? null; }
      } catch { /* */ }
      setLoggedIn(loggedIn, email);

      if (loggedIn) {
        try {
          const supabase = createClient();
          const { data: cardsData } = await supabase.from("cards").select("*").order("row_position");
          if (cardsData && cardsData.length > 0) {
            const cardIds = cardsData.map((c: { id: string }) => c.id);

            // daily_records 查询（独立容错）
            let recordsData: unknown[] | null = null;
            try {
              const r = await supabase.from("daily_records").select("*").in("card_id", cardIds);
              recordsData = r.data;
            } catch { /* 表可能不存在 */ }

            // todo_items 查询（独立容错）
            let todosData: unknown[] | null = null;
            try {
              const t = await supabase.from("todo_items").select("*").in("card_id", cardIds);
              todosData = t.data;
            } catch { /* 表可能不存在 */ }

            const recordsByCard: Record<string, unknown[]> = {};
            (recordsData || []).forEach((r) => {
              const rec = r as Record<string, unknown>;
              const cardId = rec.card_id as string;
              if (!recordsByCard[cardId]) recordsByCard[cardId] = [];
              recordsByCard[cardId]!.push(r);
            });
            const todosByCard: Record<string, unknown[]> = {};
            (todosData || []).forEach((t) => {
              const rec = t as Record<string, unknown>;
              const cardId = rec.card_id as string;
              if (!todosByCard[cardId]) todosByCard[cardId] = [];
              todosByCard[cardId]!.push(t);
            });

            setCards(
              cardsData.map((c: Record<string, unknown>) => ({
                id: c.id as string,
                title: c.title as string,
                start_date: c.start_date as string,
                duration_days: c.duration_days as number,
                row_position: c.row_position as number,
                color_index: c.color_index as number,
                daily_records: (recordsByCard[c.id as string] || []) as DailyRecordData[],
                todo_items: (todosByCard[c.id as string] || []) as TodoItemData[],
              })),
            );
          } else {
            setCards([]);
          }
        } catch { setCards([]); }
      } else {
        setCards(loadLocalCards());
      }
      setLoaded(true);
    }
    load();
  }, [setCards, setLoggedIn]);

  // 滚动到今天
  useEffect(() => {
    if (scrollRef.current && loaded) {
      const today = getTodayCST();
      const todayOffset = Math.round((today.getTime() - viewportStart.getTime()) / 86400000);
      scrollRef.current.scrollLeft = Math.max(0, todayOffset * cellWidth - 300);
    }
  }, [viewportStart, loaded, cellWidth]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollLeft(scrollRef.current.scrollLeft);
  }, []);

  // 双击创建 Card
  const handleDoubleClick = useCallback(
    async (e: React.MouseEvent) => {
      if (!scrollRef.current) return;
      if ((e.target as HTMLElement).closest("[data-card]")) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
      const y = e.clientY - rect.top;
      const dayOffset = Math.floor(x / cellWidth);
      const startDate = addDays(viewportStart, dayOffset);
      const rowPosition = Math.floor(y / 88);
      const colorIndex = cards.length;

      if (isLoggedIn) {
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const { data, error } = await supabase.from("cards").insert({
            user_id: user.id, title: "新任务", start_date: formatDate(startDate), duration_days: 7, row_position: rowPosition, color_index: colorIndex,
          }).select().single();
          if (!error && data) addCard({ ...data, daily_records: [], todo_items: [] });
        } catch { /* */ }
      } else {
        addCard({
          id: `local-${Date.now()}`, title: "新任务", start_date: formatDate(startDate), duration_days: 7, row_position: rowPosition, color_index: colorIndex, daily_records: [], todo_items: [],
        });
        setHasCreatedCard(true);
        if (!authPrompt.dismissed) setAuthPrompt({ show: true });
      }
    },
    [viewportStart, cards.length, addCard, isLoggedIn, authPrompt.dismissed, setAuthPrompt, setHasCreatedCard, cellWidth],
  );

  const handleUpdateCard = useCallback(
    async (id: string, updates: Partial<CardData>) => {
      updateCard(id, updates);
      if (isLoggedIn) { try { const supabase = createClient(); await supabase.from("cards").update(updates).eq("id", id); } catch { /* */ } }
    }, [updateCard, isLoggedIn],
  );

  const handleDeleteCard = useCallback(
    async (id: string) => {
      deleteCard(id);
      if (isLoggedIn) { try { const supabase = createClient(); await supabase.from("cards").delete().eq("id", id); } catch { /* */ } }
    }, [deleteCard, isLoggedIn],
  );

  const handleUpdateDailyRecord = useCallback(
    async (cardId: string, date: string, rowIndex: number, updates: { content?: string; completed?: boolean }) => {
      updateDailyRecord(cardId, date, rowIndex, updates);
      if (isLoggedIn) {
        try {
          const supabase = createClient();
          const { data: existing } = await supabase.from("daily_records").select("id").eq("card_id", cardId).eq("date", date).eq("row_index", rowIndex).maybeSingle();
          if (existing) { await supabase.from("daily_records").update(updates).eq("id", existing.id); }
          else { await supabase.from("daily_records").insert({ card_id: cardId, date, row_index: rowIndex, ...updates }); }
        } catch { /* */ }
      }
    }, [updateDailyRecord, isLoggedIn],
  );

  const handleAddDailyRow = useCallback(
    async (cardId: string, date: string) => {
      addDailyRecordRow(cardId, date);
      if (isLoggedIn) {
        try {
          const supabase = createClient();
          const { data: existing } = await supabase.from("daily_records").select("row_index").eq("card_id", cardId).eq("date", date);
          const maxRow = (existing || []).reduce((max: number, r: { row_index: number }) => Math.max(max, r.row_index), -1);
          await supabase.from("daily_records").insert({ card_id: cardId, date, row_index: maxRow + 1, content: "", completed: false });
        } catch { /* */ }
      }
    }, [addDailyRecordRow, isLoggedIn],
  );

  // Todo 操作
  const handleUpdateTodoItem = useCallback(
    async (cardId: string, rowIndex: number, updates: { content?: string; completed?: boolean }) => {
      updateTodoItem(cardId, rowIndex, updates);
      if (isLoggedIn) {
        try {
          const supabase = createClient();
          const { data: existing } = await supabase.from("todo_items").select("id").eq("card_id", cardId).eq("row_index", rowIndex).maybeSingle();
          if (existing) { await supabase.from("todo_items").update(updates).eq("id", existing.id); }
          else { await supabase.from("todo_items").insert({ card_id: cardId, row_index: rowIndex, ...updates }); }
        } catch { /* 表可能不存在 */ }
      }
    }, [updateTodoItem, isLoggedIn],
  );

  const handleAddTodoRow = useCallback(
    async (cardId: string) => {
      addTodoItemRow(cardId);
      if (isLoggedIn) {
        try {
          const supabase = createClient();
          const { data: existing } = await supabase.from("todo_items").select("row_index").eq("card_id", cardId);
          const maxRow = (existing || []).reduce((max: number, r: { row_index: number }) => Math.max(max, r.row_index), -1);
          await supabase.from("todo_items").insert({ card_id: cardId, row_index: maxRow + 1, content: "", completed: false });
        } catch { /* 表可能不存在 */ }
      }
    }, [addTodoItemRow, isLoggedIn],
  );

  // 将待办拖到每日
  const handleMoveTodoToDaily = useCallback(
    async (cardId: string, todoRowIndex: number, targetDate: string) => {
      // 找到原 todo 的内容（乐观更新前先保存）
      const card = useTimelineStore.getState().cards.find((c) => c.id === cardId);
      const todoItem = card?.todo_items.find((t) => t.row_index === todoRowIndex);
      if (!todoItem) return;

      moveTodoToDaily(cardId, todoRowIndex, targetDate);

      if (isLoggedIn) {
        try {
          const supabase = createClient();
          // 在目标日期创建 daily_record
          const { data: existing } = await supabase.from("daily_records").select("row_index").eq("card_id", cardId).eq("date", targetDate);
          const maxRow = (existing || []).reduce((max: number, r: { row_index: number }) => Math.max(max, r.row_index), -1);
          await supabase.from("daily_records").insert({
            card_id: cardId, date: targetDate, row_index: maxRow + 1,
            content: todoItem.content, completed: todoItem.completed,
          });
          // 删除原 todo_item
          if (todoItem.id && !todoItem.id.startsWith("temp-")) {
            await supabase.from("todo_items").delete().eq("id", todoItem.id);
          } else {
            // 临时 ID 的项，尝试用 card_id + row_index 匹配删除
            await supabase.from("todo_items").delete().eq("card_id", cardId).eq("row_index", todoRowIndex);
          }
        } catch { /* 表可能不存在 */ }
      }
    }, [moveTodoToDaily, isLoggedIn],
  );

  // 登录
  const handleLogin = useCallback(async () => {
    setLoginFormError("");
    if (!loginFormEmail || !loginFormPassword) { setLoginFormError("请填写邮箱与密码"); return; }
    setLoginFormFormPending(true);
    const result = loginFormMode === "login"
      ? await signInFromClient(loginFormEmail, loginFormPassword)
      : await signUpFromClient(loginFormEmail, loginFormPassword);
    setLoginFormFormPending(false);
    if (result.error) { setLoginFormError(result.error); }
    else { window.location.reload(); }
  }, [loginFormEmail, loginFormPassword, loginFormMode]);

  const today = getTodayCST();
  const todayOffset = Math.round((today.getTime() - viewportStart.getTime()) / 86400000);
  const contentHeight = useMemo(() => {
    if (cards.length === 0) return 600;
    const maxRow = cards.reduce((max) => Math.max(max, 88), 0);
    return (Math.max(...cards.map((c) => c.row_position)) + 1) * (maxRow + 8) + 200;
  }, [cards]);

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      {/* 顶部栏 */}
      <div className="h-10 border-b border-[var(--border)] flex items-center justify-between px-4 shrink-0 bg-[var(--bg)] z-30">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold tracking-tight">PlanMate</span>
          {/* 列宽滑动条 */}
          <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>列宽</span>
            <input
              type="range"
              min={40}
              max={200}
              step={10}
              value={cellWidth}
              onChange={(e) => setCellWidth(Number(e.target.value))}
              className="w-20 h-1 accent-[var(--today-color)]"
            />
            <span className="w-6">{cellWidth}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {userEmail && <span className="text-xs text-[var(--text-muted)]">{userEmail}</span>}
          {isLoggedIn ? (
            <button
              onClick={async () => { const { signOut } = await import("@/app/actions/auth"); signOut(); }}
              className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors"
            >
              退出
            </button>
          ) : !authPrompt.show ? (
            <button onClick={() => setAuthPrompt({ show: true })} className="text-xs text-[var(--today-color)] hover:underline">登录</button>
          ) : null}
        </div>
      </div>

      {/* 登录提示浮窗 */}
      {authPrompt.show && !isLoggedIn && (
        <div className="fixed top-12 right-4 z-40 w-72 bg-white rounded-xl shadow-lg border border-[var(--border)] p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-medium">登录后可多设备共享</h3>
            <button onClick={() => setAuthPrompt({ show: false, dismissed: true })} className="text-[var(--text-subtle)] hover:text-[var(--text)] text-sm leading-none">✕</button>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {loginFormMode === "signup" ? "注册账号后，你的日程会自动同步到云端" : "登录已有账号，继续管理你的日程"}
          </p>
          <div className="space-y-2">
            <input type="email" placeholder="邮箱" value={loginFormEmail} onChange={(e) => setLoginFormEmail(e.target.value)} className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--today-color)]" />
            <input type="password" placeholder={loginFormMode === "signup" ? "密码（至少6位）" : "密码"} value={loginFormPassword} onChange={(e) => setLoginFormPassword(e.target.value)} className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--today-color)]" />
            {loginFormError && <p className="text-xs text-red-500">{loginFormError}</p>}
            <button onClick={handleLogin} disabled={loginFormPending} className="w-full rounded bg-[var(--text)] text-white text-xs py-1.5 hover:bg-gray-800 disabled:opacity-50">
              {loginFormPending ? "处理中..." : loginFormMode === "signup" ? "注册" : "登录"}
            </button>
            <button onClick={() => setLoginFormMode(loginFormMode === "signup" ? "login" : "signup")} className="w-full text-xs text-[var(--today-color)] hover:underline">
              {loginFormMode === "signup" ? "已有账号？登录" : "没有账号？注册"}
            </button>
          </div>
          <button onClick={() => setAuthPrompt({ show: false, dismissed: true })} className="mt-2 w-full text-xs text-[var(--text-subtle)] hover:text-[var(--text)]">暂不登录，继续使用</button>
        </div>
      )}

      {/* 日期表头 */}
      <div className="shrink-0 overflow-hidden">
        <DateHeader viewportStart={viewportStart} totalDays={TOTAL_DAYS} scrollLeft={scrollLeft} />
      </div>

      {/* 时间轴内容区域 */}
      <div ref={scrollRef} onScroll={handleScroll} onDoubleClick={handleDoubleClick} className="flex-1 overflow-auto timeline-scroll relative">
        <div className="relative" style={{ width: TOTAL_DAYS * cellWidth, height: contentHeight, minWidth: "100%" }}>
          {/* 网格背景线 */}
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: TOTAL_DAYS }, (_, i) => (
              <div key={i} className="absolute top-0 bottom-0 border-r border-[var(--border-light)]" style={{ left: i * cellWidth }} />
            ))}
          </div>
          {/* 今日线 */}
          <TodayLine todayOffset={todayOffset * cellWidth} containerTop={0} containerHeight={contentHeight} />
          {/* Cards */}
          {cards.map((card) => (
            <div key={card.id} data-card>
              <TimelineCard
                card={card}
                viewportStart={viewportStart}
                onUpdate={handleUpdateCard}
                onDelete={handleDeleteCard}
                onUpdateDailyRecord={handleUpdateDailyRecord}
                onAddDailyRow={handleAddDailyRow}
                onUpdateTodoItem={handleUpdateTodoItem}
                onAddTodoRow={handleAddTodoRow}
                onMoveTodoToDaily={handleMoveTodoToDaily}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
