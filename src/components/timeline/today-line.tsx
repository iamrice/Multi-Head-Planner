"use client";

interface TodayLineProps {
  todayOffset: number;
  containerTop: number;
  containerHeight: number;
}

export function TodayLine({ todayOffset, containerTop, containerHeight }: TodayLineProps) {
  if (todayOffset < 0) return null;

  return (
    <div
      className="absolute top-0 bottom-0 w-px z-10 pointer-events-none"
      style={{
        left: todayOffset,
        background: "var(--today-color)",
        opacity: 0.4,
      }}
    >
      {/* 顶部三角标记 */}
      <div
        className="absolute -top-0 left-1/2 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: "4px solid transparent",
          borderRight: "4px solid transparent",
          borderTop: "6px solid var(--today-color)",
          opacity: 0.7,
        }}
      />
    </div>
  );
}
