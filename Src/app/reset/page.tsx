import Link from "next/link";
import { Logo } from "@/components/ui/Icon";
import { resetPassword } from "../login/actions";

/** 새 비밀번호 정하기: 재설정 메일 링크(/auth/confirm?next=/reset)로 로그인된 상태에서 연다 */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login-wrap">
      <form action={resetPassword} className="card login-card">
        <div className="logo">
          <span className="logo-row"><Logo height={44} /></span>
          <small>새 비밀번호 정하기</small>
        </div>
        <div className="field">
          <label htmlFor="password">새 비밀번호 (8자 이상)</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="password2">새 비밀번호 확인</label>
          <input id="password2" name="password2" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        {error && <p className="login-error">{error}</p>}
        <button className="btn primary">비밀번호 바꾸기</button>
        <p className="login-alt"><Link href="/forgot">링크가 만료됐나요? 다시 받기</Link></p>
      </form>
    </div>
  );
}
