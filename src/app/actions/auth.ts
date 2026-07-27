"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  error?: string;
  ok?: boolean;
};

/**
 * 内部逻辑：返回结果，不自动重定向
 * 调用方（如 form action / 客户端弹窗）自行决定是否跳转
 */
async function doSignIn(email: string, password: string): Promise<AuthState> {
  if (!email || !password) {
    return { error: "请填写邮箱与密码" };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn("[auth] signIn error:", error.message);
      return { error: "邮箱或密码错误" };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[auth] signIn exception:", err);
    return { error: "登录失败，请重试" };
  }
}

async function doSignUp(email: string, password: string): Promise<AuthState> {
  if (!email || !password) {
    return { error: "请填写邮箱与密码" };
  }
  if (password.length < 6) {
    return { error: "密码至少 6 位" };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      console.warn("[auth] signUp error:", error.message);
      return { error: error.message };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[auth] signUp exception:", err);
    return { error: "注册失败，请重试" };
  }
}

/**
 * 给 useActionState 使用 - 成功时 redirect（/login 页面专用）
 */
export async function signInWithEmail(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const result = await doSignIn(email, password);
  if (result.error) return result;
  const { redirect } = await import("next/navigation");
  redirect("/");
  // unreachable
  return result;
}

export async function signUpWithEmail(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const result = await doSignUp(email, password);
  if (result.error) return result;
  const { redirect } = await import("next/navigation");
  redirect("/");
  // unreachable
  return result;
}

/**
 * 给客户端弹窗使用 - 不 redirect，返回结果
 * 调用方根据 result.ok 决定是否刷新页面
 */
export async function signInFromClient(email: string, password: string): Promise<AuthState> {
  return doSignIn(email, password);
}

export async function signUpFromClient(email: string, password: string): Promise<AuthState> {
  return doSignUp(email, password);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  const { redirect } = await import("next/navigation");
  redirect("/");
}
