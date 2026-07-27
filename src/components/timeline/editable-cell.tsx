"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface EditableCellProps {
  content: string;
  completed: boolean;
  isLastRow: boolean;
  onUpdate: (updates: { content?: string; completed?: boolean }) => void;
  onExpandRow?: () => void;
}

/**
 * 可编辑单元格 - 用于每日记录和待办清单
 * - 单击即可编辑
 * - 编辑时 checkbox 始终可见
 * - 支持 IME 拼音输入（composing 状态下回车不触发提交）
 * - hover 时显示完整文字 tooltip
 * - 空内容禁止打勾
 * - 空内容不上传数据库
 */
export function EditableCell({ content, completed, isLastRow, onUpdate, onExpandRow }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [composing, setComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

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

    // #11: 空内容不上传，也不触发 expand
    if (!trimmed) {
      setEditing(false);
      return;
    }

    if (trimmed !== content) {
      onUpdate({ content: trimmed });
      if (isLastRow && trimmed && onExpandRow) {
        onExpandRow();
      }
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !composing) {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      setDraft(content);
      setEditing(false);
    }
  }

  // #12: 空内容禁止打勾
  const canToggle = !!content;

  return (
    <div className="w-full h-full flex items-center gap-1 px-0.5">
      {/* Checkbox - 空内容时禁用 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (canToggle) {
            onUpdate({ completed: !completed });
          }
        }}
        className={`shrink-0 w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${
          completed
            ? "bg-[var(--today-color)] border-[var(--today-color)]"
            : canToggle
              ? "border-[#c8c8c8] hover:border-[var(--today-color)]"
              : "border-[#e0e0e0] opacity-40 cursor-not-allowed"
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

      {/* 文本 */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          className="flex-1 min-w-0 text-xs bg-white border border-[var(--today-color)] outline-none rounded px-1 h-5"
        />
      ) : (
        <span
          onClick={startEditing}
          title={content || undefined}
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
