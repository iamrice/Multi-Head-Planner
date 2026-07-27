"use client";

import { useCallback, useRef, useMemo, useEffect, useState } from "react";
import { DateHeader } from "./date-header";
import { TimelineCard } from "./card";
import { TodayLine } from "./today-line";
import { useTimelineStore, type CardData, type DailyRecordData } from "@/stores/timeline-store";
import {
  addDays,
  parseDate,
  formatDate,
  getTodayCST,
} from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { signInWithEmail, signUpWithEmail } from "@/app/actions/auth";

const CELL_WIDTH = 80;
const TOTAL_DAYS = 120;
const TITLE_HEIGHT = 28;
const ROW_HEIGHT = 24;
const CARD_ROW_GAP = 8;
const LOCAL_KEY = "planmate_local_cards";

// 本地存储辅助函数
function saveLocalCards(cards: CardData[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(cards));
  } catch { /* 静默 */ }
}

function loadLocalCards(): CardData[] {
  try {
    const data = localStorage.getItem(LOCAL_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
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
    hasCreatedCard,
    setCards,
    addCard,
    updateCard,
    deleteCard,
    updateDailyRecord,
    addDailyRecordRow,
    setLoggedIn,
    setAuthPrompt,
    setHasCreatedCard,
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
        if (user) {
          loggedIn = true;
          email = user.email ?? null;
        }
      } catch {
        // Supabase 未配置
      }

      setLoggedIn(loggedIn, email);

      if (loggedIn) {
        // 已登录：从 Supabase 加载
        try {
          const supabase = createClient();
          const { data: cardsData } = await supabase
            .from("cards")
            .select("*")
            .order("row_position");

          if (cardsData && cardsData.length > 0) {
            const cardIds = cardsData.map((c: { id: string }) => c.id);
            const { data: recordsData } = await supabase
              .from("daily_records")
              .select("*")
              .in("card_id", cardIds);

            const recordsByCard: Record<string, unknown[]> = {};
            (recordsData || []).forEach((r: { card_id: string }) => {
              if (!recordsByCard[r.card_id]) recordsByCard[r.card_id] = [];
              recordsByCard[r.card_id]!.push(r);
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
              })),
            );
          } else {
            setCards([]);
          }
        } catch {
          setCards([]);
        }
      } else {
        // 未登录：从本地存储加载
        const localCards = loadLocalCards();
        setCards(localCards);
      }

      setLoaded(true);
    }
    load();
  }, [setCards, setLoggedIn]);

  // 滚动到今天
  useEffect(() => {
    if (scrollRef.current && loaded) {
      const today = getTodayCST();
      const todayOffset = Math.round(
        (today.getTime() - viewportStart.getTime()) / 86400000,
      );
      scrollRef.current.scrollLeft = Math.max(0, todayOffset * CELL_WIDTH - 300);
    }
  }, [viewportStart, loaded]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollLeft(scrollRef.current.scrollLeft);
    }
  }, []);

  // 双击创建 Card
  const handleDoubleClick = useCallback(
    async (e: React.MouseEvent) => {
      if (!scrollRef.current) return;
      if ((e.target as HTMLElement).closest("[data-card]")) return;

      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
      const y = e.clientY - rect.top;

      const dayOffset = Math.floor(x / CELL_WIDTH);
      const startDate = addDays(viewportStart, dayOffset);

      // 计算行位置（考虑卡片实际高度）
      const rowPosition = Math.floor(y / 80);

      const colorIndex = cards.length;

      if (isLoggedIn) {
        // 已登录：存入 Supabase
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data, error } = await supabase
            .from("cards")
            .insert({
              user_id: user.id,
              title: "新任务",
              start_date: formatDate(startDate),
              duration_days: 7,
              row_position: rowPosition,
              color_index: colorIndex,
            })
            .select()
            .single();

          if (!error && data) {
            addCard({ ...data, daily_records: [] });
          }
        } catch { /* 静默 */ }
      } else {
        // 未登录：存入本地
        const newCard: CardData = {
          id: `local-${Date.now()}`,
          title: "新任务",
          start_date: formatDate(startDate),
          duration_days: 7,
          row_position: rowPosition,
          color_index: colorIndex,
          daily_records: [],
        };
        addCard(newCard);
        setHasCreatedCard(true);
        // 首次创建 Card 后弹出登录提示
        if (!authPrompt.dismissed) {
          setAuthPrompt({ show: true });
        }
      }
    },
    [viewportStart, cards.length, addCard, isLoggedIn, authPrompt.dismissed, setAuthPrompt, setHasCreatedCard],
  );

  // 乐观更新 Card
  const handleUpdateCard = useCallback(
    async (id: string, updates: Partial<CardData>) => {
      updateCard(id, updates);
      if (isLoggedIn) {
        try {
          const supabase = createClient();
          await supabase.from("cards").update(updates).eq("id", id);
        } catch { /* 静默 */ }
      }
    },
    [updateCard, isLoggedIn],
  );

  const handleDeleteCard = useCallback(
    async (id: string) => {
      deleteCard(id);
      if (isLoggedIn) {
        try {
          const supabase = createClient();
          await supabase.from("cards").delete().eq("id", id);
        } catch { /* 静默 */ }
      }
    },
    [deleteCard, isLoggedIn],
  );

  // 乐观更新 DailyRecord
  const handleUpdateDailyRecord = useCallback(
    async (
      cardId: string,
      date: string,
      rowIndex: number,
      updates: { content?: string; completed?: boolean },
    ) => {
      updateDailyRecord(cardId, date, rowIndex, updates);
      if (isLoggedIn) {
        try {
          const supabase = createClient();
          const { data: existing } = await supabase
            .from("daily_records")
            .select("id")
            .eq("card_id", cardId)
            .eq("date", date)
            .eq("row_index", rowIndex)
            .maybeSingle();

          if (existing) {
            await supabase.from("daily_records").update(updates).eq("id", existing.id);
          } else {
            await supabase.from("daily_records").insert({
              card_id: cardId,
              date,
              row_index: rowIndex,
              ...updates,
            });
          }
        } catch { /* 静默 */ }
      }
    },
    [updateDailyRecord, isLoggedIn],
  );

  // 添加新行
  const handleAddRow = useCallback(
    async (cardId: string, date: string) => {
      addDailyRecordRow(cardId, date);
      if (isLoggedIn) {
        try {
          const supabase = createClient();
          // 获取当前最大 row_index
          const { data: existing } = await supabase
            .from("daily_records")
            .select("row_index")
            .eq("card_id", cardId)
            .eq("date", date);
          const maxRow = (existing || []).reduce((max: number, r: { row_index: number }) => Math.max(max, r.row_index), -1);
          await supabase.from("daily_records").insert({
            card_id: cardId,
            date,
            row_index: maxRow + 1,
            content: "",
            completed: false,
          });
        } catch { /* 静默 */ }
      }
    },
    [addDailyRecordRow, isLoggedIn],
  );

  // 登录表单提交
  const handleLogin = useCallback(async () => {
    setLoginFormError("");
    setLoginFormFormPending(true);
    try {
      const formData = new FormData();
      formData.append("email", loginFormEmail);
      formData.append("password", loginFormPassword);
      const result = loginFormMode === "login"
        ? await signInWithEmail({}, formData)
        : await signUpWithEmail({}, formData);
      if (result?.error) {
        setLoginFormError(result.error);
      }
      // 登录成功后会被 middleware 重定向，页面会刷新
    } catch (err) {
      setLoginFormError("操作失败，请重试");
    }
    setLoginFormFormPending(false);
  }, [loginFormEmail, loginFormPassword, loginFormMode]);

  // 今日线位置
  const today = getTodayCST();
  const todayOffset = Math.round(
    (today.getTime() - viewportStart.getTime()) / 86400000,
  );

  // 计算内容区域高度（考虑每张 Card 实际高度）
  const contentHeight = useMemo(() => {
    if (cards.length === 0) return 600;
    const maxRow = cards.reduce((max, c) => {
      const maxRows = Math.max(1, ...Object.values(
        c.daily_records.reduce((acc: Record<string, number>, r) => {
          acc[r.date] = Math.max(acc[r.date] || 0, r.row_index + 1);
          return acc;
        }, {})
      ));
      const cardHeight = TITLE_HEIGHT + maxRows * ROW_HEIGHT + CARD_ROW_GAP + 4;
      return Math.max(max, (c.row_position + 1) * (cardHeight + 4));
    }, 0);
    return maxRow + 200;
  }, [cards]);

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      {/* 顶部栏 */}
      <div className="h-10 border-b border-[var(--border)] flex items-center justify-between px-4 shrink-0 bg-[var(--bg)] z-30">
        <span className="text-sm font-semibold tracking-tight">PlanMate</span>
        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="text-xs text-[var(--text-muted)]">{userEmail}</span>
          )}
          {isLoggedIn ? (
            <form action={async () => { }}>
              <button
                type="button"
                onClick={async () => {
                  const { signOut } = await import("@/app/actions/auth");
                  signOut();
                }}
                className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors"
              >
                退出
              </button>
            </form>
          ) : !authPrompt.show ? (
            <button
              onClick={() => setAuthPrompt({ show: true })}
              className="text-xs text-[var(--today-color)] hover:underline"
            >
              登录
            </button>
          ) : null}
        </div>
      </div>

      {/* 登录提示浮窗 - 右上角 */}
      {authPrompt.show && !isLoggedIn && (
        <div className="fixed top-12 right-4 z-40 w-72 bg-white rounded-xl shadow-lg border border-[var(--border)] p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-medium">登录后可多设备共享</h3>
            <button
              onClick={() => setAuthPrompt({ show: false, dismissed: true })}
              className="text-[var(--text-subtle)] hover:text-[var(--text)] text-sm leading-none"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {loginFormMode === "signup"
              ? "注册账号后，你的日程会自动同步到云端"
              : "登录已有账号，继续管理你的日程"
            }
          </p>

          {/* 内联登录表单 */}
          <div className="space-y-2">
            <input
              type="email"
              placeholder="邮箱"
              value={loginFormEmail}
              onChange={(e) => setLoginFormEmail(e.target.value)}
              className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--today-color)]"
            />
            <input
              type="password"
              placeholder={loginFormMode === "signup" ? "密码（至少6位）" : "密码"}
              value={loginFormPassword}
              onChange={(e) => setLoginFormPassword(e.target.value)}
              className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--today-color)]"
            />
            {loginFormError && (
              <p className="text-xs text-red-500">{loginFormError}</p>
            )}
            <button
              onClick={handleLogin}
              disabled={loginFormPending}
              className="w-full rounded bg-[var(--text)] text-white text-xs py-1.5 hover:bg-gray-800 disabled:opacity-50"
            >
              {loginFormPending ? "处理中..." : loginFormMode === "signup" ? "注册" : "登录"}
            </button>
            <button
              onClick={() => setLoginFormMode(loginFormMode === "signup" ? "login" : "signup")}
              className="w-full text-xs text-[var(--today-color)] hover:underline"
            >
              {loginFormMode === "signup" ? "已有账号？登录" : "没有账号？注册"}
            </button>
          </div>

          <button
            onClick={() => setAuthPrompt({ show: false, dismissed: true })}
            className="mt-2 w-full text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
          >
            暂不登录，继续使用
          </button>
        </div>
      )}

      {/* 日期表头 */}
      <div className="shrink-0 overflow-hidden">
        <DateHeader
          viewportStart={viewportStart}
          totalDays={TOTAL_DAYS}
          scrollLeft={scrollLeft}
        />
      </div>

      {/* 时间轴内容区域 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onDoubleClick={handleDoubleClick}
        className="flex-1 overflow-auto timeline-scroll relative"
      >
        <div
          className="relative"
          style={{
            width: TOTAL_DAYS * CELL_WIDTH,
            height: contentHeight,
            minWidth: "100%",
          }}
        >
          {/* 网格背景线 */}
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: TOTAL_DAYS }, (_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-r border-[var(--border-light)]"
                style={{ left: i * CELL_WIDTH }}
              />
            ))}
          </div>

          {/* 今日线 */}
          <TodayLine
            todayOffset={todayOffset * CELL_WIDTH}
            containerTop={0}
            containerHeight={contentHeight}
          />

          {/* Cards */}
          {cards.map((card) => (
            <div key={card.id} data-card>
              <TimelineCard
                card={card}
                viewportStart={viewportStart}
                onUpdate={handleUpdateCard}
                onDelete={handleDeleteCard}
                onUpdateDailyRecord={handleUpdateDailyRecord}
                onAddRow={handleAddRow}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
