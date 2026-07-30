"use client";

import { useCallback, useRef, useMemo, useState, useEffect, type DragEvent } from "react";
import { CardTitle } from "./card-title";
import { EditableCell } from "./editable-cell";
import { useTimelineStore, type CardData, ROW_HEIGHT, TITLE_HEIGHT, CARD_ROW_GAP, getDailyRowsForDate } from "@/stores/timeline-store";
import {
  addDays,
  parseDate,
  formatDate,
  getCardColor,
  isSameDay,
  getTodayCST,
} from "@/lib/utils";

interface TimelineCardProps {
  card: CardData;
  top: number;
  viewportStart: Date;
  onUpdate: (id: string, updates: Partial<CardData>) => void;
  onDelete: (id: string) => void;
  onReorder: (cardId: string, newRowPosition: number) => void;
  onUpdateDailyRecord: (cardId: string, date: string, rowIndex: number, updates: { content?: string; completed?: boolean }) => void;
  onAddDailyRow: (cardId: string, date: string) => void;
  onDeleteDailyRecord: (cardId: string, date: string, rowIndex: number) => void;
  onUpdateTodoItem: (cardId: string, rowIndex: number, updates: { content?: string; completed?: boolean }) => void;
  onAddTodoRow: (cardId: string) => void;
  onDeleteTodoItem: (cardId: string, rowIndex: number) => void;
  onMoveTodoToDaily: (cardId: string, todoRowIndex: number, targetDate: string) => void;
}

export function TimelineCard({
  card,
  top,
  viewportStart,
  onUpdate,
  onDelete,
  onReorder,
  onUpdateDailyRecord,
  onAddDailyRow,
  onDeleteDailyRecord,
  onUpdateTodoItem,
  onAddTodoRow,
  onDeleteTodoItem,
  onMoveTodoToDaily,
}: TimelineCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { dragState, startDrag, cellWidth, cards, setMeasuredHeight } = useTimelineStore();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [dropHighlightDate, setDropHighlightDate] = useState<string | null>(null);
  // 边缘按钮按下状态
  const [pressedEdge, setPressedEdge] = useState<"left" | "right" | null>(null);

  const color = getCardColor(card.color_index);
  const today = getTodayCST();

  const startOffset = Math.round(
    (parseDate(card.start_date).getTime() - viewportStart.getTime()) / 86400000,
  );
  const left = startOffset * cellWidth;
  const width = card.duration_days * cellWidth;

  const cardDates = useMemo(() => {
    const start = parseDate(card.start_date);
    return Array.from({ length: card.duration_days }, (_, i) => addDays(start, i));
  }, [card.start_date, card.duration_days]);

  // 每个 date 的可见行数（独立计算，含空输入行）
  const dailyRowsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    cardDates.forEach((d) => {
      map[formatDate(d)] = getDailyRowsForDate(card, formatDate(d));
    });
    return map;
  }, [card.daily_records, cardDates]);

  // Card 每日区域的最大行数（决定最小高度）
  const maxDailyRows = useMemo(() => {
    return Math.max(1, ...Object.values(dailyRowsByDate));
  }, [dailyRowsByDate]);

  // 待办行数（含空输入行）
  const todoRowCount = useMemo(() => {
    const maxRow = card.todo_items.reduce((max, t) => Math.max(max, t.row_index + 1), 0);
    return maxRow + 1; // 至少 1 行空输入
  }, [card.todo_items]);

  // ===== ResizeObserver：测量卡片实际高度并上报 =====
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const h = entries[0].contentRect.height;
        setMeasuredHeight(card.id, h);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [card.id, setMeasuredHeight]);

  // ===== 标题栏拖动 — 仅桌面端（鼠标）生效 =====
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 触摸设备不触发拖动，让手指滑动正常滚动
      if (e.pointerType === "touch") return;
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "BUTTON") return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      startDrag({
        cardId: card.id,
        type: "reorder",
        startX: e.clientX,
        startY: e.clientY,
        originalStartDate: card.start_date,
        originalDuration: card.duration_days,
        originalRowPosition: card.row_position,
      });

      const startX = e.clientX;
      const startY = e.clientY;
      let lastRowOffset = 0;

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX;
        const store = useTimelineStore.getState();
        // 水平：改变起始日期
        const updates = store.updateDrag(dx, 0);
        if (updates && store.dragState.cardId === card.id) {
          store.updateCard(card.id, updates);
        }

        // 垂直：计算 reorder 目标
        const dy = ev.clientY - startY;
        const sortedCards = [...store.cards].sort((a, b) => a.row_position - b.row_position);
        const mHeights = store.measuredHeights;
        let cumulativeTop = 0;
        let targetRow = card.row_position;
        for (const c of sortedCards) {
          const cHeight = mHeights[c.id] || 100;
          if (c.id === card.id) {
            cumulativeTop += cHeight + CARD_ROW_GAP;
            continue;
          }
          cumulativeTop += cHeight + CARD_ROW_GAP;
          const newRow = Math.max(0, Math.min(sortedCards.length - 1, card.row_position + Math.round(dy / (cHeight + CARD_ROW_GAP))));
          targetRow = newRow;
        }
        lastRowOffset = Math.round(dy / 100);
      }

      function onUp() {
        const store = useTimelineStore.getState();
        // 持久化水平位移（起始日期变更）到数据库
        const finalCard = store.cards.find((c) => c.id === card.id);
        if (finalCard && finalCard.start_date !== card.start_date) {
          onUpdate(card.id, { start_date: finalCard.start_date });
        }
        // 持久化垂直位移（排序变更）到数据库
        if (lastRowOffset !== 0) {
          const newPos = Math.max(0, Math.min(store.cards.length - 1, card.row_position + lastRowOffset));
          if (newPos !== card.row_position) {
            onReorder(card.id, newPos);
          }
        }
        store.endDrag();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [card.id, card.start_date, card.row_position, startDrag, onReorder, onUpdate],
  );

  // ===== 边缘拖拽 — 调整起始/终止时间（鼠标 + 触摸均支持）=====
  const handleEdgePointerDown = useCallback(
    (e: React.PointerEvent, type: "resize-left" | "resize-right") => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      setPressedEdge(type === "resize-left" ? "left" : "right");

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

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX;
        const store = useTimelineStore.getState();
        const updates = store.updateDrag(dx, 0);
        if (updates && store.dragState.cardId === card.id) {
          store.updateCard(card.id, updates);
        }
      }

      function onUp() {
        setPressedEdge(null);
        const store = useTimelineStore.getState();
        // 持久化起始日期/时长变更到数据库
        const finalCard = store.cards.find((c) => c.id === card.id);
        if (finalCard) {
          const updates: Partial<CardData> = {};
          if (finalCard.start_date !== card.start_date) updates.start_date = finalCard.start_date;
          if (finalCard.duration_days !== card.duration_days) updates.duration_days = finalCard.duration_days;
          if (Object.keys(updates).length > 0) {
            onUpdate(card.id, updates);
          }
        }
        store.endDrag();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [card.id, card.start_date, card.duration_days, startDrag, onUpdate],
  );

  const isDragging = dragState.isDragging && dragState.cardId === card.id;

  // ===== 拖放：待办 → 每日 =====
  const handleTodoDragStart = (e: DragEvent, rowIndex: number) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({
      type: "todo-to-daily",
      cardId: card.id,
      todoRowIndex: rowIndex,
    }));
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.4";
    }
  };

  const handleTodoDragEnd = (e: DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDropHighlightDate(null);
  };

  const handleDailyCellDragOver = (e: DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropHighlightDate(dateStr);
  };

  const handleDailyCellDragLeave = () => {
    setDropHighlightDate(null);
  };

  const handleDailyCellDrop = (e: DragEvent, targetDate: string) => {
    e.preventDefault();
    setDropHighlightDate(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.type === "todo-to-daily" && data.cardId === card.id) {
        onMoveTodoToDaily(card.id, data.todoRowIndex, targetDate);
      }
    } catch { /* 忽略 */ }
  };

  return (
    <div
      ref={cardRef}
      className="absolute rounded-lg border select-none"
      style={{
        left,
        top,
        width,
        background: color.bg,
        borderColor: color.border,
        opacity: isDragging ? 0.8 : 1,
        zIndex: isDragging ? 30 : 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        // 不设 touchAction:none — 让手机端手指滑动正常滚动
      }}
    >
      {/* 标题行 - 仅桌面端可拖动 */}
      <div
        className="flex items-center justify-between px-2 cursor-grab active:cursor-grabbing"
        style={{ height: TITLE_HEIGHT }}
        onPointerDown={handlePointerDown}
      >
        <CardTitle
          title={card.title}
          onTitleChange={(t) => onUpdate(card.id, { title: t })}
          color={color}
        />
        <div className="flex items-center gap-1">
          {/* 上下移动按钮（所有设备） */}
          <div className="flex flex-col">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (card.row_position > 0) onReorder(card.id, card.row_position - 1);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-[var(--text-subtle)] hover:text-[var(--text)] text-[10px] leading-none p-0.5"
              disabled={card.row_position === 0}
            >
              ▲
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (card.row_position < cards.length - 1) onReorder(card.id, card.row_position + 1);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-[var(--text-subtle)] hover:text-[var(--text)] text-[10px] leading-none p-0.5"
              disabled={card.row_position >= cards.length - 1}
            >
              ▼
            </button>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMobileMenu(!showMobileMenu); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="md:hidden text-[var(--text-subtle)] hover:text-[var(--text)] text-xs p-1"
          >
            ⋯
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm("删除这个任务？")) onDelete(card.id); }}
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
          <button onClick={() => onUpdate(card.id, { start_date: formatDate(addDays(parseDate(card.start_date), -1)) })} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">← 左移</button>
          <button onClick={() => onUpdate(card.id, { start_date: formatDate(addDays(parseDate(card.start_date), 1)) })} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">右移 →</button>
          <button onClick={() => card.duration_days > 1 && onUpdate(card.id, { duration_days: card.duration_days - 1 })} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">缩短</button>
          <button onClick={() => onUpdate(card.id, { duration_days: card.duration_days + 1 })} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">延长</button>
          <button onClick={() => { if (confirm("删除？")) onDelete(card.id); }} className="px-2 py-1 text-xs border rounded text-red-500 hover:bg-red-50">删除</button>
          <button onClick={() => setShowMobileMenu(false)} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">关闭</button>
        </div>
      )}

      {/* ===== 上半部：每日记录 ===== */}
      <div className="flex" style={{ minHeight: maxDailyRows * ROW_HEIGHT }}>
        {cardDates.map((date) => {
          const dateStr = formatDate(date);
          const isToday = isSameDay(date, today);
          const isDropTarget = dropHighlightDate === dateStr;
          const rowsForThisDate = dailyRowsByDate[dateStr] || 1;

          return (
            <div
              key={dateStr}
              className={`flex-1 border-l border-[var(--border-light)] first:border-l-0 transition-colors ${
                isDropTarget ? "bg-[var(--today-color)]/10" : ""
              }`}
              style={{ width: cellWidth, minWidth: cellWidth, maxWidth: cellWidth }}
              onDragOver={(e) => handleDailyCellDragOver(e, dateStr)}
              onDragLeave={handleDailyCellDragLeave}
              onDrop={(e) => handleDailyCellDrop(e, dateStr)}
            >
              <div
                className={`text-center text-[9px] leading-4 border-b border-[var(--border-light)] ${
                  isToday ? "text-[var(--today-color)] font-semibold bg-[var(--today-color)]/5" : "text-[var(--text-subtle)]"
                }`}
              >
                {date.getDate()}
              </div>
              {Array.from({ length: rowsForThisDate }, (_, rowIdx) => {
                const record = card.daily_records.find(
                  (r) => r.date === dateStr && r.row_index === rowIdx,
                );
                return (
                  <div key={rowIdx} style={{ minHeight: ROW_HEIGHT }} className="border-b border-[var(--border-light)] last:border-b-0">
                    <EditableCell
                      content={record?.content || ""}
                      completed={record?.completed || false}
                      isLastRow={rowIdx === rowsForThisDate - 1}
                      onUpdate={(updates) => onUpdateDailyRecord(card.id, dateStr, rowIdx, updates)}
                      onExpandRow={() => onAddDailyRow(card.id, dateStr)}
                      onDelete={record?.content ? () => onDeleteDailyRecord(card.id, dateStr, rowIdx) : undefined}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 分隔线 */}
      <div className="border-t-2 border-dashed border-[var(--border)] mx-2 my-0.5" />

      {/* ===== 下半部：待办清单 ===== */}
      <div className="px-1">
        <div className="text-[10px] font-medium text-[var(--text-muted)] px-1 leading-5 select-none">
          待办清单
        </div>
        {Array.from({ length: todoRowCount }, (_, rowIdx) => {
          const item = card.todo_items.find((t) => t.row_index === rowIdx);
          const hasContent = !!(item && item.content);
          return (
            <div
              key={rowIdx}
              style={{ minHeight: ROW_HEIGHT }}
              className={`border-b border-[var(--border-light)] last:border-b-0 ${hasContent ? "cursor-grab" : ""}`}
              draggable={hasContent ? true : false}
              onDragStart={(e) => handleTodoDragStart(e, rowIdx)}
              onDragEnd={handleTodoDragEnd}
            >
              <EditableCell
                content={item?.content || ""}
                completed={item?.completed || false}
                isLastRow={rowIdx === todoRowCount - 1}
                onUpdate={(updates) => onUpdateTodoItem(card.id, rowIdx, updates)}
                onExpandRow={() => onAddTodoRow(card.id)}
                onDelete={hasContent ? () => onDeleteTodoItem(card.id, rowIdx) : undefined}
              />
            </div>
          );
        })}
      </div>

      {/* ===== 左右边缘按钮 — 拖拽调整起始/终止时间 ===== */}
      {/* 左边缘：调整起始时间 */}
      <button
        onPointerDown={(e) => handleEdgePointerDown(e, "resize-left")}
        className="absolute top-1/2 -translate-y-1/2 -left-3 z-20 flex items-center justify-center rounded-full shadow-sm border transition-all duration-150"
        style={{
          width: pressedEdge === "left" ? 24 : 18,
          height: pressedEdge === "left" ? 24 : 18,
          background: pressedEdge === "left" ? color.border : color.bg,
          borderColor: pressedEdge === "left" ? color.border : "var(--border)",
          touchAction: "none", // 按住此按钮时阻止页面滚动
        }}
        title="拖动调整起始时间"
      >
        <svg
          viewBox="0 0 10 10"
          style={{ width: pressedEdge === "left" ? 10 : 7, height: pressedEdge === "left" ? 10 : 7 }}
          fill={pressedEdge === "left" ? "#fff" : "var(--text-subtle)"}
        >
          <path d="M7 1L3 5L7 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* 右边缘：调整终止时间 */}
      <button
        onPointerDown={(e) => handleEdgePointerDown(e, "resize-right")}
        className="absolute top-1/2 -translate-y-1/2 -right-3 z-20 flex items-center justify-center rounded-full shadow-sm border transition-all duration-150"
        style={{
          width: pressedEdge === "right" ? 24 : 18,
          height: pressedEdge === "right" ? 24 : 18,
          background: pressedEdge === "right" ? color.border : color.bg,
          borderColor: pressedEdge === "right" ? color.border : "var(--border)",
          touchAction: "none",
        }}
        title="拖动调整终止时间"
      >
        <svg
          viewBox="0 0 10 10"
          style={{ width: pressedEdge === "right" ? 10 : 7, height: pressedEdge === "right" ? 10 : 7 }}
          fill={pressedEdge === "right" ? "#fff" : "var(--text-subtle)"}
        >
          <path d="M3 1L7 5L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
