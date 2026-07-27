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
  isSameDay,
} from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/actions/auth";

const CELL_WIDTH = 80;
const TOTAL_DAYS = 120;
const ROW_LABEL_WIDTH = 0; // 不再需要行标签

export function TimelineView() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const {
    cards,
    viewportStart,
    setCards,
    addCard,
    updateCard,
    deleteCard,
    updateDailyRecord,
  } = useTimelineStore();

  // 加载用户信息和 Cards
  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email ?? null);
        }

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
        // 环境变量未配置时静默
      }
      setLoaded(true);
    }
    load();
  }, [setCards]);

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

  // 滚动同步
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
      const rowPosition = Math.floor(y / 80);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const colorIndex = cards.length;

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
    },
    [viewportStart, cards.length, addCard],
  );

  // 乐观更新 Card + 后台同步 Supabase
  const handleUpdateCard = useCallback(
    async (id: string, updates: Partial<CardData>) => {
      // 立即更新本地状态
      updateCard(id, updates);
      try {
        const supabase = createClient();
        await supabase.from("cards").update(updates).eq("id", id);
      } catch {
        // 静默
      }
    },
    [updateCard],
  );

  const handleDeleteCard = useCallback(
    async (id: string) => {
      deleteCard(id);
      try {
        const supabase = createClient();
        await supabase.from("cards").delete().eq("id", id);
      } catch {
        // 静默
      }
    },
    [deleteCard],
  );

  // 乐观更新 DailyRecord
  const handleUpdateDailyRecord = useCallback(
    async (
      cardId: string,
      date: string,
      rowIndex: number,
      updates: { content?: string; completed?: boolean },
    ) => {
      // 立即更新本地状态（乐观更新）
      updateDailyRecord(cardId, date, rowIndex, updates);
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
          await supabase
            .from("daily_records")
            .update(updates)
            .eq("id", existing.id);
        } else {
          await supabase.from("daily_records").insert({
            card_id: cardId,
            date,
            row_index: rowIndex,
            ...updates,
          });
        }
      } catch {
        // 静默
      }
    },
    [updateDailyRecord],
  );

  // 今日线位置（使用东八区日期）
  const today = getTodayCST();
  const todayOffset = Math.round(
    (today.getTime() - viewportStart.getTime()) / 86400000,
  );

  // 计算内容区域高度
  const maxRow = cards.reduce(
    (max, c) => Math.max(max, c.row_position + 1),
    3,
  );
  const contentHeight = maxRow * 80 + 200;

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      {/* 顶部栏 */}
      <div className="h-10 border-b border-[var(--border)] flex items-center justify-between px-4 shrink-0 bg-[var(--bg)] z-30">
        <span className="text-sm font-semibold tracking-tight">PlanMate</span>
        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="text-xs text-[var(--text-muted)]">{userEmail}</span>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors"
            >
              退出
            </button>
          </form>
        </div>
      </div>

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
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
