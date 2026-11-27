"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });

  if (error) redirect("/login?error=" + encodeURIComponent("이메일 또는 비밀번호가 맞지 않습니다."));
  redirect("/projects");
}

/** 회원가입. 이름은 가입 트리거(handle_new_user)가 profiles.name 에 넣는다 */
export async function signup(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const back = (msg: string) => redirect("/signup?error=" + encodeURIComponent(msg));

  if (!name || !email) back("이름과 이메일을 적어 주세요.");
  if (password.length < 8) back("비밀번호는 8자 이상으로 적어 주세요.");
  if (password !== String(formData.get("password2") ?? "")) back("비밀번호 확인이 같지 않아요.");

  const supabase = await createClient();
  const origin = await siteUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    console.error("회원가입 실패:", error.message);
    back(/registered|exists/i.test(error.message) ? "이미 가입한 이메일이에요." : "가입하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  // 이메일 확인을 켜 둔 경우: 세션 없이 확인 메일만 간다. 이미 가입한 메일이면 identities 가 비어 온다
  if (!data.session) {
    if (!data.user?.identities?.length) back("이미 가입한 이메일이에요.");
    redirect("/login?notice=" + encodeURIComponent("확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요."));
  }
  redirect("/projects");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** 비밀번호 찾기: 재설정 메일을 보낸다. 가입 여부는 알려 주지 않는다 (다른 사람이 가입 여부를 알아내지 못하게) */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/forgot?error=" + encodeURIComponent("이메일을 적어 주세요."));
  const supabase = await createClient();
  const origin = await siteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?next=/reset` });
  if (error) console.error("비밀번호 재설정 메일 실패:", error.message);
  // 너무 자주 보내면 Supabase 가 막는다: 그때만 알려 준다
  if (error && /rate|seconds/i.test(error.message)) redirect("/forgot?error=" + encodeURIComponent("잠시 후 다시 시도해 주세요."));
  redirect("/forgot?sent=1");
}

/** 메일 링크로 들어온 뒤 새 비밀번호를 정한다 (/auth/confirm 이 세션을 만들어 둔다) */
export async function resetPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const back = (msg: string) => redirect("/reset?error=" + encodeURIComponent(msg));
  if (password.length < 8) back("비밀번호는 8자 이상으로 적어 주세요.");
  if (password !== String(formData.get("password2") ?? "")) back("비밀번호 확인이 같지 않아요.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("비밀번호 변경 실패:", error.message);
    back(/session|auth/i.test(error.message) ? "링크가 만료됐어요. 비밀번호 찾기를 다시 해 주세요." : /same|different/i.test(error.message) ? "이전과 다른 비밀번호로 적어 주세요." : "바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  redirect("/projects");
}

/** 아이디(이메일) 찾기: 가입 이름으로 가려진 이메일을 찾는다 (supabase/migrations/0011_find_login.sql) */
export async function findLoginId(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) redirect("/find-id?error=" + encodeURIComponent("가입할 때 적은 이름을 2자 이상 적어 주세요."));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_login_emails", { p_name: name });
  if (error) {
    console.error("아이디 찾기 실패:", error.message);
    redirect("/find-id?error=" + encodeURIComponent("찾지 못했어요. 잠시 후 다시 시도해 주세요."));
  }
  const found = (data as { email: string }[]).map((r) => r.email);
  redirect("/find-id?" + new URLSearchParams({ name, found: found.join(",") || "-" }).toString());
}

/**
 * 메일 링크가 돌아올 우리 사이트 주소.
 *   NEXT_PUBLIC_SITE_URL(배포 환경 변수, 예: https://record-roan.vercel.app) → 요청의 origin → 프록시가 붙인 host 순서.
 * 이 주소가 Supabase Redirect URLs 에 없으면 Supabase 는 Site URL 로 보낸다 (그게 localhost 면 메일 링크가 localhost 가 된다).
 */
async function siteUrl(): Promise<string> {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
}
