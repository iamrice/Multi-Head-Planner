"use client";

import { useState, useRef, useEffect } from "react";

interface CardTitleProps {
  title: string;
  onTitleChange: (title: string) => void;
  color: { bg: string; border: string; text: string };
}

export function CardTitle({ title, onTitleChange, color }: CardTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(title);
    setEditing(true);
  }

  function handleBlur() {
    if (draft.trim() && draft !== title) {
      onTitleChange(draft.trim());
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "Escape") {
      setDraft(title);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full text-sm font-semibold bg-transparent border-b border-[var(--today-color)] outline-none px-0"
        style={{ color: color.text }}
      />
    );
  }

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className="text-sm font-semibold cursor-text truncate select-none"
      style={{ color: color.text }}
    >
      {title}
    </div>
  );
}
