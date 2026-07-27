"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface DailyCellProps {
  content: string;
  completed: boolean;
  onUpdate: (updates: { content?: string; completed?: boolean }) => void;
}

export function DailyCell({ content, completed, onUpdate }: DailyCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  // 外部 content 更新时同步 draft
  useEffect(() => {
    if (!editing) {
      setDraft(content);
    }
  }, [content, editing]);

  const startEditing = useCallback(() => {
    setDraft(content);
    setEditing(true);
  }, [content]);

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed !== content) {
      onUpdate({ content: trimmed });
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      setDraft(content);
      setEditing(false);
    }
  }

  return (
    <div className="w-full h-full flex items-center gap-1 px-0.5 group/cell">
      {/* Checkbox - 始终可见 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onUpdate({ completed: !completed });
        }}
        className={`shrink-0 w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${
          completed
            ? "bg-[var(--today-color)] border-[var(--today-color)]"
            : "border-[#c8c8c8] hover:border-[var(--today-color)]"
        }`}
      >
        {completed && (
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white">
            <path
              d="M2.5 6l2.5 2.5 4.5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* 文本区域 */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 text-xs bg-white border border-[var(--today-color)] outline-none rounded px-1 h-5"
        />
      ) : (
        <span
          onClick={startEditing}
          className={`flex-1 min-w-0 text-xs truncate cursor-text rounded px-1 h-5 leading-5 ${
            completed ? "line-through text-[var(--text-subtle)]" : ""
          } hover:bg-black/[0.03] transition-colors`}
        >
          {content || <span className="text-[var(--text-subtle)] opacity-40">+</span>}
        </span>
      )}
    </div>
  );
}
