"use client";

import { useMemo } from "react";
import { addDays, formatShortDate, formatWeekday, isWeekend, isSameDay, getTodayCST } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline-store";

interface DateHeaderProps {
  viewportStart: Date;
  totalDays: number;
  scrollLeft: number;
}

export function DateHeader({ viewportStart, totalDays, scrollLeft }: DateHeaderProps) {
  const cellWidth = useTimelineStore((s) => s.cellWidth);

  const dates = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => addDays(viewportStart, i));
  }, [viewportStart, totalDays]);

  const today = getTodayCST();

  return (
    <div
      className="flex border-b border-[var(--border)] bg-[var(--bg)] sticky top-0 z-20"
      style={{ transform: `translateX(-${scrollLeft}px)` }}
    >
      {dates.map((date, i) => {
        const isToday = isSameDay(date, today);
        const weekend = isWeekend(date);

        return (
          <div
            key={i}
            className="shrink-0 border-r border-[var(--border-light)] flex flex-col items-center justify-center py-1"
            style={{ width: cellWidth }}
          >
            <span
              className={`text-[10px] leading-tight ${
                weekend ? "text-[var(--text-subtle)]" : "text-[var(--text-muted)]"
              } ${isToday ? "text-[var(--today-color)] font-semibold" : ""}`}
            >
              {formatWeekday(date)}
            </span>
            <span
              className={`text-xs leading-tight ${
                isToday
                  ? "text-[var(--today-color)] font-semibold"
                  : weekend
                    ? "text-[var(--text-subtle)]"
                    : "text-[var(--text)]"
              }`}
            >
              {formatShortDate(date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
