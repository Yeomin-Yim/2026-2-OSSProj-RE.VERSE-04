import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * 로그인 세션. 한 요청 안에서는 한 번만 확인한다(cache).
 * getClaims 는 토큰 서명을 서버에서 직접 검증하므로 요청마다 Supabase 를 다녀오지 않는다.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  return { supabase, userId: (claims?.sub as string) ?? null, email: (claims?.email as string) ?? null };
});

/** 로그인한 사용자와 DB 클라이언트. 로그인하지 않았으면 /login 으로 보낸다. */
export async function requireUser() {
  const session = await getSession();
  if (!session.userId) redirect("/login");
  return { supabase: session.supabase, userId: session.userId, email: session.email };
}

/** 화면에 보여 줄 이름. profiles.name 이 비어 있으면 이메일 앞부분. */
export const getDisplayName = cache(async () => {
  const { supabase, userId, email } = await requireUser();
  const { data } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
  return data?.name || email?.split("@")[0] || "사용자";
});
