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
  const origin = (await headers()).get("origin") ?? "";
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
