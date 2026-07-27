"use client";

import { useCallback, useRef, useMemo, useState } from "react";
import { CardTitle } from "./card-title";
import { DailyCell } from "./daily-cell";
import { useTimelineStore, type CardData } from "@/stores/timeline-store";
import {
  addDays,
  parseDate,
  formatDate,
  getCardColor,
  isSameDay,
  getTodayCST,
} from "@/lib/utils";

const CELL_WIDTH = 80;
const TITLE_HEIGHT = 28;
const ROW_HEIGHT = 24;
const CARD_ROW_GAP = 8; // Card 行间距

interface TimelineCardProps {
  card: CardData;
  viewportStart: Date;
  onUpdate: (id: string, updates: Partial<CardData>) => void;
  onDelete: (id: string) => void;
  onUpdateDailyRecord: (
    cardId: string,
    date: string,
    rowIndex: number,
    updates: { content?: string; completed?: boolean },
  ) => void;
  onAddRow: (cardId: string, date: string) => void;
}

export function TimelineCard({
  card,
  viewportStart,
  onUpdate,
  onDelete,
  onUpdateDailyRecord,
  onAddRow,
}: TimelineCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { dragState, startDrag } = useTimelineStore();
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const color = getCardColor(card.color_index);
  const today = getTodayCST();

  // 计算 Card 内每天最多几行记录
  const maxRecordRows = useMemo(() => {
    const rowsByDate: Record<string, number> = {};
    card.daily_records.forEach((r) => {
      rowsByDate[r.date] = Math.max(rowsByDate[r.date] || 0, r.row_index + 1);
    });
    const max = Math.max(1, ...Object.values(rowsByDate));
    return max;
  }, [card.daily_records]);

  // Card 在时间轴中的像素位置
  const startOffset = Math.round(
    (parseDate(card.start_date).getTime() - viewportStart.getTime()) / 86400000,
  );
  const left = startOffset * CELL_WIDTH;
  const width = card.duration_days * CELL_WIDTH;
  const totalHeight = TITLE_HEIGHT + maxRecordRows * ROW_HEIGHT + 4;

  // 行位置 - 加入间距
  const top = card.row_position * (totalHeight + CARD_ROW_GAP + 4);

  // Card 覆盖的日期
  const cardDates = useMemo(() => {
    const start = parseDate(card.start_date);
    return Array.from({ length: card.duration_days }, (_, i) => addDays(start, i));
  }, [card.start_date, card.duration_days]);

  // 拖拽 - 使用 pointer events（同时支持鼠标和触摸）
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, type: "move" | "resize-left" | "resize-right") => {
      // 不拦截来自输入框/按钮的事件
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "BUTTON") return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      startDrag({
        cardId: card.id,
        type,
        startX: e.clientX,
        startY: e.clientY,
        originalStartDate: card.start_date,
        originalDuration: card.duration_days,
        originalRowPosition: card.row_position,
      });

      const startX = e.clientX;
      const startY = e.clientY;

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const store = useTimelineStore.getState();
        const updates = store.updateDrag(dx, dy);
        if (updates && store.dragState.cardId === card.id) {
          useTimelineStore.getState().updateCard(card.id, updates);
        }
      }

      function onUp() {
        useTimelineStore.getState().endDrag();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [card.id, card.start_date, card.duration_days, card.row_position, startDrag],
  );

  const isDragging = dragState.isDragging && dragState.cardId === card.id;

  // 移动端操作
  const handleMobileMoveLeft = () => onUpdate(card.id, { start_date: formatDate(addDays(parseDate(card.start_date), -1)) });
  const handleMobileMoveRight = () => onUpdate(card.id, { start_date: formatDate(addDays(parseDate(card.start_date), 1)) });
  const handleMobileShrink = () => {
    if (card.duration_days > 1) onUpdate(card.id, { duration_days: card.duration_days - 1 });
  };
  const handleMobileExpand = () => onUpdate(card.id, { duration_days: card.duration_days + 1 });

  return (
    <div
      ref={cardRef}
      className="absolute rounded-lg border select-none"
      style={{
        left,
        top: top + 4,
        width,
        minHeight: totalHeight,
        background: color.bg,
        borderColor: color.border,
        opacity: isDragging ? 0.8 : 1,
        zIndex: isDragging ? 30 : 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        touchAction: "none", // 防止触摸时页面滚动
      }}
    >
      {/* 标题行 */}
      <div
        className="flex items-center justify-between px-2 cursor-grab active:cursor-grabbing"
        style={{ height: TITLE_HEIGHT }}
        onPointerDown={(e) => handlePointerDown(e, "move")}
      >
        <CardTitle
          title={card.title}
          onTitleChange={(t) => onUpdate(card.id, { title: t })}
          color={color}
        />
        <div className="flex items-center gap-1">
          {/* 移动端菜单按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMobileMenu(!showMobileMenu);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="md:hidden text-[var(--text-subtle)] hover:text-[var(--text)] text-xs p-1"
          >
            ⋯
          </button>
          {/* 删除按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("删除这个任务？")) onDelete(card.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
            style={{ opacity: 0 }}
            className="hidden md:block text-[var(--text-subtle)] hover:text-red-500 text-xs ml-1 transition-opacity"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 移动端操作面板 */}
      {showMobileMenu && (
        <div
          className="absolute top-full left-0 z-50 mt-1 bg-white rounded-lg shadow-lg border border-[var(--border)] p-2 flex gap-1 md:hidden"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button onClick={handleMobileMoveLeft} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">← 左移</button>
          <button onClick={handleMobileMoveRight} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">右移 →</button>
          <button onClick={handleMobileShrink} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">缩短</button>
          <button onClick={handleMobileExpand} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">延长</button>
          <button onClick={() => { if (confirm("删除？")) onDelete(card.id); }} className="px-2 py-1 text-xs border rounded text-red-500 hover:bg-red-50">删除</button>
          <button onClick={() => setShowMobileMenu(false)} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">关闭</button>
        </div>
      )}

      {/* 每日记录 - 从左往右，每列对应一天 */}
      <div className="flex" style={{ minHeight: maxRecordRows * ROW_HEIGHT }}>
        {cardDates.map((date) => {
          const dateStr = formatDate(date);
          const isToday = isSameDay(date, today);

          return (
            <div
              key={dateStr}
              className="flex-1 border-l border-[var(--border-light)] first:border-l-0"
              style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH, maxWidth: CELL_WIDTH }}
            >
              {/* 日期标签 */}
              <div
                className={`text-center text-[9px] leading-4 border-b border-[var(--border-light)] ${
                  isToday
                    ? "text-[var(--today-color)] font-semibold bg-[var(--today-color)]/5"
                    : "text-[var(--text-subtle)]"
                }`}
              >
                {date.getDate()}
              </div>

              {/* 记录行 - 自动扩展 */}
              {Array.from({ length: maxRecordRows }, (_, rowIdx) => {
                const record = card.daily_records.find(
                  (r) => r.date === dateStr && r.row_index === rowIdx,
                );

                return (
                  <div
                    key={rowIdx}
                    style={{ height: ROW_HEIGHT }}
                    className="border-b border-[var(--border-light)] last:border-b-0"
                  >
                    <DailyCell
                      content={record?.content || ""}
                      completed={record?.completed || false}
                      isLastRow={rowIdx === maxRecordRows - 1}
                      onUpdate={(updates) =>
                        onUpdateDailyRecord(card.id, dateStr, rowIdx, updates)
                      }
                      onExpandRow={() => onAddRow(card.id, dateStr)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 左边缘拖拽热区（桌面端） */}
      <div
        className="hidden md:block absolute top-0 left-0 w-1.5 h-full cursor-ew-resize z-10"
        onPointerDown={(e) => handlePointerDown(e, "resize-left")}
      />
      {/* 右边缘拖拽热区（桌面端） */}
      <div
        className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-ew-resize z-10"
        onPointerDown={(e) => handlePointerDown(e, "resize-right")}
      />
    </div>
  );
}
