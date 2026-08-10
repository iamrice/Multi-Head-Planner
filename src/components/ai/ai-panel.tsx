"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
}

// Web Speech API 类型声明（浏览器原生，无 TS 类型）
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition ??
    null
  );
}

/**
 * AI 日程助手面板
 * - 文字 + 语音双输入
 * - 调用 /api/ai/chat 修改日程
 * - 显示 AI 执行的操作记录
 */
export function AiPanel({ onRefresh }: { onRefresh?: () => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 检测语音识别支持
  useEffect(() => {
    const SR = getSpeechRecognition();
    setSpeechSupported(!!SR);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // 发送消息
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ ${data.error || "请求失败"}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply, actions: data.actions },
        ]);
        // 数据已变更，触发刷新
        onRefresh?.();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ 网络错误：${err instanceof Error ? err.message : "未知错误"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, onRefresh]);

  // 语音输入
  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SR = getSpeechRecognition();
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalText = "";
    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setInput(finalText + interim);
    };
    recognition.onend = () => {
      setListening(false);
      // 识别结束后自动聚焦输入框，让用户可以编辑后发送
      inputRef.current?.focus();
    };
    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setInput("");
  }, [listening]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* 折叠时的浮动按钮 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-[var(--today-color)] to-indigo-500 text-white shadow-lg hover:scale-105 transition-transform flex items-center justify-center text-xl"
          title="AI 助手"
        >
          ✨
        </button>
      )}

      {/* 展开时的面板 */}
      {open && (
        <div className="fixed bottom-0 right-0 z-50 w-full sm:w-96 h-[60vh] sm:h-[70vh] sm:bottom-4 sm:right-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden">
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-light)] bg-gradient-to-r from-[var(--today-color)]/5 to-indigo-500/5">
            <div className="flex items-center gap-2">
              <span className="text-base">✨</span>
              <span className="text-sm font-medium">AI 日程助手</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[var(--text-subtle)] hover:text-[var(--text)] text-sm leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-black/5"
            >
              ✕
            </button>
          </div>

          {/* 消息列表 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-xs text-[var(--text-muted)] mt-8 space-y-2">
                <p>告诉我你的计划，我来帮你调整日程。</p>
                <div className="text-left bg-[var(--bg-subtle)] rounded-lg p-3 space-y-1.5 max-w-xs mx-auto">
                  <p className="font-medium text-[var(--text)]">试试说：</p>
                  <p>· "明天加一个任务：复习文献"</p>
                  <p>· "论文引言写完了，标完成"</p>
                  <p>· "新建一个卡片叫答辩准备，下周一开始持续5天"</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[var(--today-color)] text-white"
                      : "bg-[var(--bg-subtle)] text-[var(--text)]"
                  }`}
                >
                  <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-black/10 space-y-1">
                      {msg.actions.map((a, j) => (
                        <p key={j} className="text-[10px] opacity-70 flex items-start gap-1">
                          <span>✓</span>
                          <span>{a}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-[var(--bg-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-muted)]">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div className="border-t border-[var(--border-light)] p-2.5">
            <div className="flex items-end gap-1.5">
              {speechSupported && (
                <button
                  onClick={toggleListening}
                  disabled={loading}
                  className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    listening
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-[var(--bg-subtle)] text-[var(--text-subtle)] hover:text-[var(--text)]"
                  }`}
                  title={listening ? "停止录音" : "语音输入"}
                >
                  {listening ? "■" : "🎙"}
                </button>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={listening ? "正在聆听..." : "描述你的计划..."}
                disabled={loading}
                rows={1}
                className="flex-1 min-h-9 max-h-24 resize-none rounded-lg border border-[var(--border)] px-2.5 py-2 text-xs focus:outline-none focus:border-[var(--today-color)] disabled:opacity-50"
                style={{
                  height: "auto",
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 96) + "px";
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="shrink-0 w-9 h-9 rounded-lg bg-[var(--today-color)] text-white flex items-center justify-center hover:opacity-90 disabled:opacity-30 transition-opacity"
                title="发送"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
