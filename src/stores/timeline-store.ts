import { create } from "zustand";
import { getTodayCST, formatDate as formatDateUtil, parseDate, addDays } from "@/lib/utils";

export interface CardData {
  id: string;
  title: string;
  start_date: string;
  duration_days: number;
  row_position: number;
  color_index: number;
  daily_records: DailyRecordData[];
}

export interface DailyRecordData {
  id: string;
  card_id: string;
  date: string;
  row_index: number;
  content: string;
  completed: boolean;
}

interface DragState {
  isDragging: boolean;
  cardId: string | null;
  type: "move" | "resize-left" | "resize-right" | null;
  startX: number;
  startY: number;
  originalStartDate: string | null;
  originalDuration: number;
  originalRowPosition: number;
}

interface TimelineState {
  cards: CardData[];
  dragState: DragState;
  scrollOffset: number;
  viewportStart: Date;

  setCards: (cards: CardData[]) => void;
  addCard: (card: CardData) => void;
  updateCard: (id: string, updates: Partial<CardData>) => void;
  deleteCard: (id: string) => void;
  updateDailyRecord: (
    cardId: string,
    date: string,
    rowIndex: number,
    updates: Partial<DailyRecordData>,
  ) => void;
  startDrag: (drag: Omit<DragState, "isDragging">) => void;
  updateDrag: (dx: number, dy: number) => Partial<CardData> | null;
  endDrag: () => void;
  setScrollOffset: (offset: number) => void;
  setViewportStart: (date: Date) => void;
}

const CELL_WIDTH = 80;

export const useTimelineStore = create<TimelineState>((set, get) => ({
  cards: [],
  dragState: {
    isDragging: false,
    cardId: null,
    type: null,
    startX: 0,
    startY: 0,
    originalStartDate: null,
    originalDuration: 0,
    originalRowPosition: 0,
  },
  scrollOffset: 0,
  // 使用东八区日期，viewport 起始 = 今天往前 14 天
  viewportStart: (() => {
    const today = getTodayCST();
    return addDays(today, -14);
  })(),

  setCards: (cards) => set({ cards }),

  addCard: (card) => set((state) => ({ cards: [...state.cards, card] })),

  updateCard: (id, updates) =>
    set((state) => ({
      cards: state.cards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),

  deleteCard: (id) =>
    set((state) => ({ cards: state.cards.filter((c) => c.id !== id) })),

  // 乐观更新：如果记录存在就更新，不存在就创建
  updateDailyRecord: (cardId, date, rowIndex, updates) =>
    set((state) => ({
      cards: state.cards.map((card) => {
        if (card.id !== cardId) return card;
        const existing = card.daily_records.find(
          (r) => r.date === date && r.row_index === rowIndex,
        );
        if (existing) {
          return {
            ...card,
            daily_records: card.daily_records.map((r) =>
              r.date === date && r.row_index === rowIndex
                ? { ...r, ...updates }
                : r,
            ),
          };
        } else {
          // 记录不存在，乐观插入
          const newRecord: DailyRecordData = {
            id: `temp-${Date.now()}`,
            card_id: cardId,
            date,
            row_index: rowIndex,
            content: updates.content || "",
            completed: updates.completed || false,
          };
          return {
            ...card,
            daily_records: [...card.daily_records, newRecord],
          };
        }
      }),
    })),

  startDrag: (drag) => set({ dragState: { ...drag, isDragging: true } }),

  updateDrag: (dx, dy) => {
    const state = get();
    const { dragState } = state;
    if (!dragState.isDragging || !dragState.cardId) return null;

    const dayOffset = Math.round(dx / CELL_WIDTH);
    const rowOffset = Math.round(dy / 80);

    if (dragState.type === "move" && dragState.originalStartDate) {
      const newStart = addDays(parseDate(dragState.originalStartDate), dayOffset);
      return {
        start_date: formatDateUtil(newStart),
        row_position: dragState.originalRowPosition + rowOffset,
      };
    }

    if (dragState.type === "resize-left" && dragState.originalStartDate) {
      const newStart = addDays(parseDate(dragState.originalStartDate), dayOffset);
      const originalStart = parseDate(dragState.originalStartDate);
      const newDuration =
        dragState.originalDuration - Math.round((newStart.getTime() - originalStart.getTime()) / 86400000);
      if (newDuration >= 1) {
        return { start_date: formatDateUtil(newStart), duration_days: newDuration };
      }
    }

    if (dragState.type === "resize-right") {
      const newDuration = dragState.originalDuration + dayOffset;
      if (newDuration >= 1) {
        return { duration_days: newDuration };
      }
    }

    return null;
  },

  endDrag: () =>
    set({
      dragState: {
        isDragging: false,
        cardId: null,
        type: null,
        startX: 0,
        startY: 0,
        originalStartDate: null,
        originalDuration: 0,
        originalRowPosition: 0,
      },
    }),

  setScrollOffset: (offset) => set({ scrollOffset: offset }),
  setViewportStart: (date) => set({ viewportStart: date }),
}));
