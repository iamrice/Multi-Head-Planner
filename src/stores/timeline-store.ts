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
  type: "move" | "resize-left" | "resize-right" | null;
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
  dragState: DragState;
  scrollOffset: number;
  viewportStart: Date;
  isLoggedIn: boolean | null;
  userEmail: string | null;
  authPrompt: AuthPromptState;
  hasCreatedCard: boolean;
  cellWidth: number;

  setCards: (cards: CardData[]) => void;
  addCard: (card: CardData) => void;
  updateCard: (id: string, updates: Partial<CardData>) => void;
  deleteCard: (id: string) => void;
  updateDailyRecord: (cardId: string, date: string, rowIndex: number, updates: Partial<DailyRecordData>) => void;
  addDailyRecordRow: (cardId: string, date: string) => void;
  updateTodoItem: (cardId: string, rowIndex: number, updates: Partial<TodoItemData>) => void;
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
}

const ROW_HEIGHT = 24;
const TITLE_HEIGHT = 28;
const CARD_ROW_GAP = 8;

export { ROW_HEIGHT, TITLE_HEIGHT, CARD_ROW_GAP };

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
  viewportStart: (() => {
    const today = getTodayCST();
    return addDays(today, -14);
  })(),
  isLoggedIn: null,
  userEmail: null,
  authPrompt: { show: false, dismissed: false },
  hasCreatedCard: false,
  cellWidth: 80,

  setCards: (cards) => set({ cards }),
  addCard: (card) => set((state) => ({ cards: [...state.cards, card] })),
  updateCard: (id, updates) =>
    set((state) => ({
      cards: state.cards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  deleteCard: (id) =>
    set((state) => ({ cards: state.cards.filter((c) => c.id !== id) })),

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
        const existingMaxRow = card.daily_records
          .filter((r) => r.date === date)
          .reduce((max, r) => Math.max(max, r.row_index), -1);
        const newRecord: DailyRecordData = {
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          card_id: cardId,
          date,
          row_index: existingMaxRow + 1,
          content: "",
          completed: false,
        };
        return { ...card, daily_records: [...card.daily_records, newRecord] };
      }),
    })),

  // Todo Item 操作
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
        const maxIdx = card.todo_items.reduce((max, t) => Math.max(max, t.row_index), -1);
        const newItem: TodoItemData = {
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          card_id: cardId,
          row_index: maxIdx + 1,
          content: "",
          completed: false,
        };
        return { ...card, todo_items: [...card.todo_items, newItem] };
      }),
    })),

  // 将待办条目移到每日记录：删除原 todo，在目标日期创建 daily_record
  moveTodoToDaily: (cardId, todoRowIndex, targetDate) =>
    set((state) => ({
      cards: state.cards.map((card) => {
        if (card.id !== cardId) return card;
        const todoItem = card.todo_items.find((t) => t.row_index === todoRowIndex);
        if (!todoItem) return card;

        // 从 todo_items 中删除该项，并重新编号后续项
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

    // 固定行高估算
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
  setLoggedIn: (v, email) => set({ isLoggedIn: v, userEmail: email ?? null }),
  setAuthPrompt: (s) => set((state) => ({ authPrompt: { ...state.authPrompt, ...s } })),
  setHasCreatedCard: (v) => set({ hasCreatedCard: v }),
  setCellWidth: (w) => set({ cellWidth: w }),
}));
