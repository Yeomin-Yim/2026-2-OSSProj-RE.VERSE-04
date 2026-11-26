import Link from "next/link";
import { Logo } from "@/components/ui/Icon";
import { signup } from "../login/actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <div className="login-wrap">
      <form action={signup} className="card login-card">
        <div className="logo">
          <span className="logo-row"><Logo />RE:Cord</span>
          <small>회원가입</small>
        </div>
        <div className="field">
          <label htmlFor="name">이름</label>
          <input id="name" name="name" required maxLength={30} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호 (8자 이상)</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="password2">비밀번호 확인</label>
          <input id="password2" name="password2" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        {error && <p className="login-error">{error}</p>}
        <button className="btn primary">가입하기</button>
        <p className="login-alt">이미 계정이 있나요? <Link href="/login">로그인</Link></p>
      </form>
    </div>
  );
}
