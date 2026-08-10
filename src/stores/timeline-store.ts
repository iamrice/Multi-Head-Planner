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
  todo_items: TodoItemData[];
}

export interface DailyRecordData {
  id: string;
  card_id: string;
  date: string;
  row_index: number;
  content: string;
  completed: boolean;
}

export interface TodoItemData {
  id: string;
  card_id: string;
  row_index: number;
  content: string;
  completed: boolean;
}

interface DragState {
  isDragging: boolean;
  cardId: string | null;
  type: "reorder" | "resize-left" | "resize-right" | null;
  startX: number;
  startY: number;
  originalStartDate: string | null;
  originalDuration: number;
  originalRowPosition: number;
}

interface AuthPromptState {
  show: boolean;
  dismissed: boolean;
}

interface TimelineState {
  cards: CardData[];
  measuredHeights: Record<string, number>; // cardId → 实测像素高度
  dragState: DragState;
  scrollOffset: number;
  viewportStart: Date;
  isLoggedIn: boolean | null;
  userEmail: string | null;
  authPrompt: AuthPromptState;
  hasCreatedCard: boolean;
  cellWidth: number;
  uiVersion: "v1" | "v2";

  setCards: (cards: CardData[]) => void;
  addCard: (card: CardData) => void;
  updateCard: (id: string, updates: Partial<CardData>) => void;
  deleteCard: (id: string) => void;
  reorderCard: (cardId: string, newRowPosition: number) => void;
  updateDailyRecord: (cardId: string, date: string, rowIndex: number, updates: Partial<DailyRecordData>) => void;
  deleteDailyRecord: (cardId: string, date: string, rowIndex: number) => void;
  addDailyRecordRow: (cardId: string, date: string) => void;
  updateTodoItem: (cardId: string, rowIndex: number, updates: Partial<TodoItemData>) => void;
  deleteTodoItem: (cardId: string, rowIndex: number) => void;
  addTodoItemRow: (cardId: string) => void;
  moveTodoToDaily: (cardId: string, todoRowIndex: number, targetDate: string) => void;
  startDrag: (drag: Omit<DragState, "isDragging">) => void;
  updateDrag: (dx: number, dy: number) => Partial<CardData> | null;
  endDrag: () => void;
  setScrollOffset: (offset: number) => void;
  setViewportStart: (date: Date) => void;
  setLoggedIn: (v: boolean, email?: string | null) => void;
  setAuthPrompt: (s: Partial<AuthPromptState>) => void;
  setHasCreatedCard: (v: boolean) => void;
  setCellWidth: (w: number) => void;
  setUiVersion: (v: "v1" | "v2") => void;
  setMeasuredHeight: (cardId: string, height: number) => void;
}

const ROW_HEIGHT = 24;
const TITLE_HEIGHT = 28;
const CARD_ROW_GAP = 12;
const TODO_HEADER_HEIGHT = 20;

export { ROW_HEIGHT, TITLE_HEIGHT, CARD_ROW_GAP, TODO_HEADER_HEIGHT };

/** 某日期的可见行数（含底部空输入行） */
export function getDailyRowsForDate(card: CardData, date: string): number {
  const maxRow = card.daily_records
    .filter((r) => r.date === date)
    .reduce((max, r) => Math.max(max, r.row_index + 1), 0);
  return maxRow + 1;
}

/**
 * 粗略估算 Card 高度，仅用于初始布局和滚动区域估算。
 * 实际定位使用 ResizeObserver 测量的真实高度。
 */
export function getCardHeight(card: CardData, _cellWidth = 80): number {
  const maxDailyRows = Math.max(1, ...Object.values(
    card.daily_records.reduce((acc: Record<string, number>, r) => {
      acc[r.date] = Math.max(acc[r.date] || 0, r.row_index + 1);
      return acc;
    }, {})
  ));
  const todoRows = Math.max(1, card.todo_items.reduce((max, t) => Math.max(max, t.row_index + 1), 0));
  // 额外 +1 行给每个日期的空输入行
  return TITLE_HEIGHT + (maxDailyRows + 1) * ROW_HEIGHT + 2 + TODO_HEADER_HEIGHT + (todoRows + 1) * ROW_HEIGHT + 4;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  cards: [],
  measuredHeights: {},
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
  viewportStart: (() => {
    const today = getTodayCST();
    return addDays(today, -14);
  })(),
  isLoggedIn: null,
  userEmail: null,
  authPrompt: { show: false, dismissed: false },
  hasCreatedCard: false,
  cellWidth: (() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("planmate_cell_width") : null;
      return saved ? Number(saved) : 80;
    } catch { return 80; }
  })(),
  uiVersion: (() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("planmate_ui_version") : null;
      return saved === "v1" ? "v1" : "v2";
    } catch { return "v2"; }
  })(),

  setCards: (cards) => set({ cards }),
  addCard: (card) => set((state) => ({ cards: [...state.cards, card] })),
  updateCard: (id, updates) =>
    set((state) => ({
      cards: state.cards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  deleteCard: (id) =>
    set((state) => ({ cards: state.cards.filter((c) => c.id !== id) })),

  // #10: 重排卡片顺序
  reorderCard: (cardId, newRowPosition) =>
    set((state) => {
      const sorted = [...state.cards].sort((a, b) => a.row_position - b.row_position);
      const idx = sorted.findIndex((c) => c.id === cardId);
      if (idx === -1) return state;
      const [card] = sorted.splice(idx, 1);
      sorted.splice(newRowPosition, 0, card);
      // 重新编号
      return {
        cards: sorted.map((c, i) => ({ ...c, row_position: i })),
      };
    }),

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
              r.date === date && r.row_index === rowIndex ? { ...r, ...updates } : r,
            ),
          };
        } else {
          // #11: 不创建空内容的记录
          if (updates.content === "" || updates.content === undefined) return card;
          const newRecord: DailyRecordData = {
            id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            card_id: cardId,
            date,
            row_index: rowIndex,
            content: updates.content || "",
            completed: updates.completed || false,
          };
          return { ...card, daily_records: [...card.daily_records, newRecord] };
        }
      }),
    })),

  addDailyRecordRow: (cardId, date) =>
    set((state) => ({
      cards: state.cards.map((card) => {
        if (card.id !== cardId) return card;
        // 不在 store 中创建空行 — 空行由渲染逻辑自动展示
        return card;
      }),
    })),

  deleteDailyRecord: (cardId, date, rowIndex) =>
    set((state) => ({
      cards: state.cards.map((card) => {
        if (card.id !== cardId) return card;
        // 删除该条记录，后续行 row_index 上移
        const remaining = card.daily_records
          .filter((r) => !(r.date === date && r.row_index === rowIndex))
          .map((r) => ({
            ...r,
            row_index: r.date === date && r.row_index > rowIndex ? r.row_index - 1 : r.row_index,
          }));
        return { ...card, daily_records: remaining };
      }),
    })),

  updateTodoItem: (cardId, rowIndex, updates) =>
    set((state) => ({
      cards: state.cards.map((card) => {
        if (card.id !== cardId) return card;
        const existing = card.todo_items.find((t) => t.row_index === rowIndex);
        if (existing) {
          return {
            ...card,
            todo_items: card.todo_items.map((t) =>
              t.row_index === rowIndex ? { ...t, ...updates } : t,
            ),
          };
        } else {
          // #11: 不创建空内容的记录
          if (updates.content === "" || updates.content === undefined) return card;
          const newItem: TodoItemData = {
            id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            card_id: cardId,
            row_index: rowIndex,
            content: updates.content || "",
            completed: updates.completed || false,
          };
          return { ...card, todo_items: [...card.todo_items, newItem] };
        }
      }),
    })),

  addTodoItemRow: (cardId) =>
    set((state) => ({
      cards: state.cards.map((card) => {
        if (card.id !== cardId) return card;
        // 不在 store 中创建空行 — 空行由渲染逻辑自动展示
        return card;
      }),
    })),

  deleteTodoItem: (cardId, rowIndex) =>
    set((state) => ({
      cards: state.cards.map((card) => {
        if (card.id !== cardId) return card;
        // 删除该项，后续项 row_index 上移
        const remaining = card.todo_items
          .filter((t) => t.row_index !== rowIndex)
          .map((t) => ({
            ...t,
            row_index: t.row_index > rowIndex ? t.row_index - 1 : t.row_index,
          }));
        return { ...card, todo_items: remaining };
      }),
    })),

  moveTodoToDaily: (cardId, todoRowIndex, targetDate) =>
    set((state) => ({
      cards: state.cards.map((card) => {
        if (card.id !== cardId) return card;
        const todoItem = card.todo_items.find((t) => t.row_index === todoRowIndex);
        if (!todoItem || !todoItem.content) return card;

        // 从 todo_items 中删除该项，重新编号
        const remainingTodos = card.todo_items
          .filter((t) => t.row_index !== todoRowIndex)
          .map((t) => ({
            ...t,
            row_index: t.row_index > todoRowIndex ? t.row_index - 1 : t.row_index,
          }));

        // 在目标日期增加一行 daily_record
        const maxRowForDate = card.daily_records
          .filter((r) => r.date === targetDate)
          .reduce((max, r) => Math.max(max, r.row_index), -1);
        const newRecord: DailyRecordData = {
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          card_id: cardId,
          date: targetDate,
          row_index: maxRowForDate + 1,
          content: todoItem.content,
          completed: todoItem.completed,
        };

        return {
          ...card,
          todo_items: remainingTodos,
          daily_records: [...card.daily_records, newRecord],
        };
      }),
    })),

  startDrag: (drag) => set({ dragState: { ...drag, isDragging: true } }),

  updateDrag: (dx, dy) => {
    const state = get();
    const { dragState } = state;
    if (!dragState.isDragging || !dragState.cardId) return null;

    const cellWidth = state.cellWidth;
    const dayOffset = Math.round(dx / cellWidth);

    if (dragState.type === "reorder" && dragState.originalStartDate) {
      // 只改水平位置（起始日期），垂直方向由 reorder 控制
      const newStart = addDays(parseDate(dragState.originalStartDate), dayOffset);
      return { start_date: formatDateUtil(newStart) };
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
  setLoggedIn: (v, email) => set({ isLoggedIn: v, userEmail: email ?? null }),
  setAuthPrompt: (s) => set((state) => ({ authPrompt: { ...state.authPrompt, ...s } })),
  setHasCreatedCard: (v) => set({ hasCreatedCard: v }),
  setCellWidth: (w) => {
    try { localStorage.setItem("planmate_cell_width", String(w)); } catch { /* */ }
    set({ cellWidth: w });
  },
  setUiVersion: (v) => {
    try { localStorage.setItem("planmate_ui_version", v); } catch { /* */ }
    set({ uiVersion: v });
  },
  setMeasuredHeight: (cardId, height) =>
    set((state) => ({
      measuredHeights: { ...state.measuredHeights, [cardId]: height },
    })),
}));
