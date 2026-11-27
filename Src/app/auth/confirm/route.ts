import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * 가입 확인·비밀번호 재설정 메일의 링크가 돌아오는 곳. 세션을 만든 뒤 next(우리 사이트 안의 경로만) 또는 프로젝트 화면으로 보낸다.
 *   ?code=…                     Supabase 기본 메일 템플릿 (같은 브라우저에서 열어야 함)
 *   ?token_hash=…&type=email    메일 템플릿을 {{ .TokenHash }} 방식으로 바꾼 경우 (다른 브라우저에서도 됨)
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: (url.searchParams.get("type") ?? "email") as EmailOtpType })
      : { error: new Error("확인 정보가 없어요") };

  // next 는 "/reset" 처럼 우리 사이트 안의 경로만 받는다 (다른 사이트로 보내는 링크를 막는다)
  const next = url.searchParams.get("next") ?? "";
  const safeNext = /^\/[a-z-]+$/.test(next) ? next : "/projects";
  const to = url.clone();
  to.search = "";
  if (error) {
    to.pathname = "/login";
    to.searchParams.set("error", safeNext === "/reset"
      ? "재설정 링크가 만료되었거나 다른 브라우저에서 열렸어요. 비밀번호 찾기를 다시 해 주세요."
      : "확인 링크가 만료되었거나 다른 브라우저에서 열렸어요. 로그인해 보고, 안 되면 다시 가입해 주세요.");
  } else {
    to.pathname = safeNext;
  }
  return NextResponse.redirect(to);
}
