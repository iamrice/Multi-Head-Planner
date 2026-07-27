"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  signInWithEmail,
  signUpWithEmail,
  type AuthState,
} from "@/app/actions/auth";

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const action = mode === "login" ? signInWithEmail : signUpWithEmail;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    {},
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">PlanMate</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {mode === "login" ? "登录你的账号" : "创建新账号"}
          </p>
        </div>

        {/* 表单 */}
        <form action={formAction} className="space-y-4">
          <div>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="邮箱"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--today-color)] focus:ring-1 focus:ring-[var(--today-color)]/20 transition"
            />
          </div>
          <div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={mode === "signup" ? 6 : undefined}
              placeholder={mode === "signup" ? "密码（至少 6 位）" : "密码"}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--today-color)] focus:ring-1 focus:ring-[var(--today-color)]/20 transition"
            />
          </div>

          {/* 错误提示 */}
          {state.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-[var(--text)] text-white text-sm font-medium py-2.5 hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {pending
              ? mode === "login"
                ? "登录中..."
                : "注册中..."
              : mode === "login"
                ? "登录"
                : "注册"}
          </button>
        </form>

        {/* 切换模式 */}
        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          {mode === "login" ? (
            <>
              没有账号？{" "}
              <button
                onClick={() => setMode("signup")}
                className="text-[var(--today-color)] hover:underline"
              >
                注册
              </button>
            </>
          ) : (
            <>
              已有账号？{" "}
              <button
                onClick={() => setMode("login")}
                className="text-[var(--today-color)] hover:underline"
              >
                登录
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
