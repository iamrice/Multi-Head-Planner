"use client";

import { useCallback, useRef, useMemo, useEffect, useState } from "react";
import { DateHeader } from "./date-header";
import { TimelineCard } from "./card";
import { TodayLine } from "./today-line";
import { useTimelineStore, type CardData, type DailyRecordData, type TodoItemData, CARD_ROW_GAP, getCardHeight } from "@/stores/timeline-store";
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
    reorderCard,
    updateDailyRecord,
    addDailyRecordRow,
    deleteDailyRecord,
    updateTodoItem,
    addTodoItemRow,
    deleteTodoItem,
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

            let recordsData: unknown[] | null = null;
            try {
              const r = await supabase.from("daily_records").select("*").in("card_id", cardIds);
              recordsData = r.data;
            } catch { /* */ }

            let todosData: unknown[] | null = null;
            try {
              const t = await supabase.from("todo_items").select("*").in("card_id", cardIds);
              todosData = t.data;
            } catch { /* */ }

            const recordsByCard: Record<string, unknown[]> = {};
            (recordsData || []).forEach((r) => {
              const rec = r as Record<string, unknown>;
              const cid = rec.card_id as string;
              if (!recordsByCard[cid]) recordsByCard[cid] = [];
              recordsByCard[cid]!.push(r);
            });
            const todosByCard: Record<string, unknown[]> = {};
            (todosData || []).forEach((t) => {
              const rec = t as Record<string, unknown>;
              const cid = rec.card_id as string;
              if (!todosByCard[cid]) todosByCard[cid] = [];
              todosByCard[cid]!.push(t);
            });

            setCards(
              cardsData.map((c: Record<string, unknown>) => ({
                id: c.id as string,
                title: c.title as string,
                start_date: c.start_date as string,
                duration_days: c.duration_days as number,
                row_position: c.row_position as number,
                color_index: c.color_index as number,
                daily_records: ((recordsByCard[c.id as string] || []) as DailyRecordData[]).filter((r) => r.content !== ""),
                todo_items: ((todosByCard[c.id as string] || []) as TodoItemData[]).filter((t) => t.content !== ""),
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
      const dayOffset = Math.floor(x / cellWidth);
      const startDate = addDays(viewportStart, dayOffset);
      const rowPosition = cards.length;
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

  // #10: reorder
  const handleReorderCard = useCallback(
    async (cardId: string, newRowPosition: number) => {
      reorderCard(cardId, newRowPosition);
      if (isLoggedIn) {
        try {
          // 更新所有卡片的 row_position
          const supabase = createClient();
          const state = useTimelineStore.getState();
          for (const c of state.cards) {
            await supabase.from("cards").update({ row_position: c.row_position }).eq("id", c.id);
          }
        } catch { /* */ }
      }
    }, [reorderCard, isLoggedIn],
  );

  // #13: 修复 DB 更新逻辑 - 用记录 ID 来更新而非匹配 card_id+date+row_index
  const handleUpdateDailyRecord = useCallback(
    async (cardId: string, date: string, rowIndex: number, updates: { content?: string; completed?: boolean }) => {
      updateDailyRecord(cardId, date, rowIndex, updates);
      if (isLoggedIn) {
        try {
          const supabase = createClient();
          // 从 store 获取当前记录（可能已有真实 ID）
          const state = useTimelineStore.getState();
          const card = state.cards.find((c) => c.id === cardId);
          const record = card?.daily_records.find((r) => r.date === date && r.row_index === rowIndex);

          if (record && record.id && !record.id.startsWith("temp-")) {
            // 有真实 ID → 直接更新
            await supabase.from("daily_records").update(updates).eq("id", record.id);
          } else {
            // 无真实 ID → 尝试按 card_id+date+row_index 查找
            const { data: existing } = await supabase.from("daily_records").select("id").eq("card_id", cardId).eq("date", date).eq("row_index", rowIndex).maybeSingle();
            if (existing) {
              await supabase.from("daily_records").update(updates).eq("id", existing.id);
            } else if (updates.content) {
              // #11: 只在有内容时插入
              const { data: inserted } = await supabase.from("daily_records").insert({ card_id: cardId, date, row_index: rowIndex, ...updates }).select().single();
              // 将真实 ID 写回 store
              if (inserted) {
                useTimelineStore.getState().updateDailyRecord(cardId, date, rowIndex, { id: inserted.id } as Partial<DailyRecordData>);
              }
            }
          }
        } catch { /* */ }
      }
    }, [updateDailyRecord, isLoggedIn],
  );

  const handleAddDailyRow = useCallback(
    async (cardId: string, date: string) => {
      addDailyRecordRow(cardId, date);
      // #11: 不在 DB 中插入空行，用户输入内容时再插入
    }, [addDailyRecordRow],
  );

  // 删除每日记录
  const handleDeleteDailyRecord = useCallback(
    async (cardId: string, date: string, rowIndex: number) => {
      // 先从 store 找到要删除的记录 ID
      const state = useTimelineStore.getState();
      const card = state.cards.find((c) => c.id === cardId);
      const record = card?.daily_records.find((r) => r.date === date && r.row_index === rowIndex);

      deleteDailyRecord(cardId, date, rowIndex);

      if (isLoggedIn && record) {
        try {
          const supabase = createClient();
          if (record.id && !record.id.startsWith("temp-")) {
            await supabase.from("daily_records").delete().eq("id", record.id);
          } else {
            // 临时 ID → 按 card_id+date+row_index 删除
            await supabase.from("daily_records").delete().eq("card_id", cardId).eq("date", date).eq("row_index", rowIndex);
          }
        } catch { /* */ }
      }
    }, [deleteDailyRecord, isLoggedIn],
  );

  // #13: 同样修复 todo_items
  const handleUpdateTodoItem = useCallback(
    async (cardId: string, rowIndex: number, updates: { content?: string; completed?: boolean }) => {
      updateTodoItem(cardId, rowIndex, updates);
      if (isLoggedIn) {
        try {
          const supabase = createClient();
          const state = useTimelineStore.getState();
          const card = state.cards.find((c) => c.id === cardId);
          const item = card?.todo_items.find((t) => t.row_index === rowIndex);

          if (item && item.id && !item.id.startsWith("temp-")) {
            await supabase.from("todo_items").update(updates).eq("id", item.id);
          } else {
            const { data: existing } = await supabase.from("todo_items").select("id").eq("card_id", cardId).eq("row_index", rowIndex).maybeSingle();
            if (existing) {
              await supabase.from("todo_items").update(updates).eq("id", existing.id);
            } else if (updates.content) {
              // #11: 只在有内容时插入
              const { data: inserted } = await supabase.from("todo_items").insert({ card_id: cardId, row_index: rowIndex, ...updates }).select().single();
              if (inserted) {
                useTimelineStore.getState().updateTodoItem(cardId, rowIndex, { id: inserted.id } as Partial<TodoItemData>);
              }
            }
          }
        } catch { /* */ }
      }
    }, [updateTodoItem, isLoggedIn],
  );

  const handleAddTodoRow = useCallback(
    async (cardId: string) => {
      addTodoItemRow(cardId);
      // #11: 不在 DB 中插入空行
    }, [addTodoItemRow],
  );

  // 删除待办事项
  const handleDeleteTodoItem = useCallback(
    async (cardId: string, rowIndex: number) => {
      const state = useTimelineStore.getState();
      const card = state.cards.find((c) => c.id === cardId);
      const item = card?.todo_items.find((t) => t.row_index === rowIndex);

      deleteTodoItem(cardId, rowIndex);

      if (isLoggedIn && item) {
        try {
          const supabase = createClient();
          if (item.id && !item.id.startsWith("temp-")) {
            await supabase.from("todo_items").delete().eq("id", item.id);
          } else {
            await supabase.from("todo_items").delete().eq("card_id", cardId).eq("row_index", rowIndex);
          }
        } catch { /* */ }
      }
    }, [deleteTodoItem, isLoggedIn],
  );

  const handleMoveTodoToDaily = useCallback(
    async (cardId: string, todoRowIndex: number, targetDate: string) => {
      const state = useTimelineStore.getState();
      const card = state.cards.find((c) => c.id === cardId);
      const todoItem = card?.todo_items.find((t) => t.row_index === todoRowIndex);
      if (!todoItem || !todoItem.content) return;

      moveTodoToDaily(cardId, todoRowIndex, targetDate);

      if (isLoggedIn) {
        try {
          const supabase = createClient();
          const { data: existing } = await supabase.from("daily_records").select("row_index").eq("card_id", cardId).eq("date", targetDate);
          const maxRow = (existing || []).reduce((max: number, r: { row_index: number }) => Math.max(max, r.row_index), -1);
          await supabase.from("daily_records").insert({
            card_id: cardId, date: targetDate, row_index: maxRow + 1,
            content: todoItem.content, completed: todoItem.completed,
          });
          if (todoItem.id && !todoItem.id.startsWith("temp-")) {
            await supabase.from("todo_items").delete().eq("id", todoItem.id);
          } else {
            await supabase.from("todo_items").delete().eq("card_id", cardId).eq("row_index", todoRowIndex);
          }
        } catch { /* */ }
      }
    }, [moveTodoToDaily, isLoggedIn],
  );

  // #7: 修复退出登录
  const handleSignOut = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch { /* */ }
    // 清除本地状态
    setLoggedIn(false, null);
    window.location.href = "/";
  }, [setLoggedIn]);

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

  // #10: 计算每张 Card 的 top（自动排布）
  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => a.row_position - b.row_position);
  }, [cards]);

  const cardPositions = useMemo(() => {
    const positions: Record<string, number> = {};
    let currentTop = 4;
    for (const card of sortedCards) {
      positions[card.id] = currentTop;
      currentTop += getCardHeight(card) + CARD_ROW_GAP;
    }
    return positions;
  }, [sortedCards]);

  const today = getTodayCST();
  const todayOffset = Math.round((today.getTime() - viewportStart.getTime()) / 86400000);
  const contentHeight = useMemo(() => {
    if (sortedCards.length === 0) return 600;
    const lastCard = sortedCards[sortedCards.length - 1];
    return (cardPositions[lastCard.id] || 0) + getCardHeight(lastCard) + 200;
  }, [sortedCards, cardPositions]);

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      {/* 顶部栏 */}
      <div className="h-10 border-b border-[var(--border)] flex items-center justify-between px-4 shrink-0 bg-[var(--bg)] z-30">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold tracking-tight">PlanMate</span>
          {/* #9: 列宽滑动条 - 所有设备可见 */}
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="hidden sm:inline">列宽</span>
            <input
              type="range"
              min={40}
              max={200}
              step={10}
              value={cellWidth}
              onChange={(e) => setCellWidth(Number(e.target.value))}
              className="w-16 sm:w-20 h-1 accent-[var(--today-color)]"
            />
            <span className="w-6 text-[var(--text-muted)]">{cellWidth}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {userEmail && <span className="text-xs text-[var(--text-muted)]">{userEmail}</span>}
          {isLoggedIn ? (
            <button
              onClick={handleSignOut}
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
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: TOTAL_DAYS }, (_, i) => (
              <div key={i} className="absolute top-0 bottom-0 border-r border-[var(--border-light)]" style={{ left: i * cellWidth }} />
            ))}
          </div>
          <TodayLine todayOffset={todayOffset * cellWidth} containerTop={0} containerHeight={contentHeight} />
          {sortedCards.map((card) => (
            <div key={card.id} data-card>
              <TimelineCard
                card={card}
                top={cardPositions[card.id] || 0}
                viewportStart={viewportStart}
                onUpdate={handleUpdateCard}
                onDelete={handleDeleteCard}
                onReorder={handleReorderCard}
                onUpdateDailyRecord={handleUpdateDailyRecord}
                onAddDailyRow={handleAddDailyRow}
                onDeleteDailyRecord={handleDeleteDailyRecord}
                onUpdateTodoItem={handleUpdateTodoItem}
                onAddTodoRow={handleAddTodoRow}
                onDeleteTodoItem={handleDeleteTodoItem}
                onMoveTodoToDaily={handleMoveTodoToDaily}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
