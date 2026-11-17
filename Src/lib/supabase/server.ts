import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 로그인한 학생의 권한으로 DB에 접근하는 클라이언트.
 * 행 수준 보안(RLS)이 적용되어 자기 데이터만 읽고 쓴다.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) cookieStore.set(name, value, options);
          } catch {
            // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts 가 맡는다.
          }
        },
      },
    },
  );
}
