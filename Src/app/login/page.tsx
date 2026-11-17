import { Logo } from "@/components/ui/Icon";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <div className="login-wrap">
      <form action={login} className="card login-card">
        <div className="logo">
          <span className="logo-row"><Logo />RE:Cord</span>
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
        {error && <p className="login-error">{error}</p>}
        <button className="btn primary">로그인</button>
      </form>
    </div>
  );
}
