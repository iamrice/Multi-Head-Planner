import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlanMate",
  description: "科研任务时间轴管理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[var(--bg)]">{children}</body>
    </html>
  );
}
