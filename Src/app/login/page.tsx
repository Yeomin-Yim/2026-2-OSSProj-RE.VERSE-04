import Link from "next/link";
import { Logo } from "@/components/ui/Icon";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;

  return (
    <div className="login-wrap">
      <form action={login} className="card login-card">
        <div className="logo">
          <span className="logo-row"><Logo height={54} /></span>
          <small>오늘의 경험을, 내일의 가능성으로</small>
        </div>
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" name="email" type="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input id="password" name="password" type="password" required />
        </div>
        {notice && <p className="login-notice">{notice}</p>}
        {error && <p className="login-error">{error}</p>}
        <button className="btn primary">로그인</button>
        <p className="login-links"><Link href="/find-id">아이디 찾기</Link><span aria-hidden="true">·</span><Link href="/forgot">비밀번호 찾기</Link></p>
        <p className="login-alt">처음이신가요? <Link href="/signup">회원가입</Link></p>
      </form>
    </div>
  );
}
