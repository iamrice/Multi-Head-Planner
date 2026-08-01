"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface EditableCellProps {
  content: string;
  completed: boolean;
  isLastRow: boolean;
  onUpdate: (updates: { content?: string; completed?: boolean }) => void;
  onExpandRow?: () => void;
  onDelete?: () => void;
}

/**
 * 可编辑单元格
 * - 单击即可编辑
 * - 编辑时 checkbox 始终可见
 * - 支持 IME 拼音输入
 * - hover 时显示完整文字 tooltip
 * - 空内容禁止打勾
 * - 空内容不上传数据库
 * - hover 时显示删除按钮
 * - 文字超出列宽时自动换行
 */
export function EditableCell({ content, completed, isLastRow, onUpdate, onExpandRow, onDelete }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [composing, setComposing] = useState(false);
  const [hovering, setHovering] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 防止 IME 刚结束后紧接着的 Enter 被误判为"完成输入"
  const justComposedRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      // 自动调整高度
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = inputRef.current.scrollHeight + "px";
    }
  }, [editing, draft]);

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

    // 空内容不上传
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
    if (e.key === "Enter" && !composing && !e.nativeEvent.isComposing && !justComposedRef.current) {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      setDraft(content);
      setEditing(false);
    }
  }

  const canToggle = !!content;

  function handleDelete() {
    if (!onDelete) return;
    if (confirm(`删除"${content}"？`)) {
      onDelete();
    }
  }

  return (
    <div
      className="w-full h-full flex items-start gap-1 px-0.5 py-0.5 group"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (canToggle) {
            onUpdate({ completed: !completed });
          }
        }}
        className={`shrink-0 w-3.5 h-3.5 mt-0.5 rounded-sm border flex items-center justify-center transition-colors ${
          completed
            ? "bg-[var(--today-color)] border-[var(--today-color)]"
            : canToggle
              ? "border-[#c8c8c8] hover:border-[var(--today-color)]"
              : "border-[#e0e0e0] opacity-40 cursor-not-allowed"
        }`}
      >
        {completed && (
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white">
            <path d="M2.5 6l2.5 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* 文本 */}
      {editing ? (
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => {
            setComposing(false);
            // 标记刚结束组合输入，防止紧接着的 Enter 误提交
            justComposedRef.current = true;
            requestAnimationFrame(() => {
              justComposedRef.current = false;
            });
          }}
          rows={1}
          className="flex-1 min-w-0 text-xs bg-white border border-[var(--today-color)] outline-none rounded px-1 py-0 resize-none overflow-hidden leading-[18px]"
        />
      ) : (
        <span
          onClick={startEditing}
          title={content || undefined}
          className={`flex-1 min-w-0 text-xs cursor-text rounded px-1 leading-[18px] break-words whitespace-pre-wrap ${
            completed ? "line-through text-[var(--text-subtle)]" : ""
          } hover:bg-black/[0.03] transition-colors`}
        >
          {content || <span className="text-[var(--text-subtle)] opacity-40">+</span>}
        </span>
      )}

      {/* 删除按钮 */}
      {content && !editing && onDelete && hovering && (
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          className="shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center text-[var(--text-subtle)] hover:text-red-500 transition-colors rounded"
          title="删除"
        >
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">
            <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
