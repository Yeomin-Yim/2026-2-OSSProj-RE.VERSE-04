import Link from "next/link";
import { Logo } from "@/components/ui/Icon";
import { requestPasswordReset } from "../login/actions";

/** 비밀번호 찾기: 이메일로 재설정 링크를 보낸다 */
export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error, sent } = await searchParams;
  return (
    <div className="login-wrap">
      <form action={requestPasswordReset} className="card login-card">
        <div className="logo">
          <span className="logo-row"><Logo height={44} /></span>
          <small>비밀번호 찾기</small>
        </div>
        {sent ? (
          <p className="login-notice">가입한 이메일이라면 재설정 메일이 곧 도착해요. 메일의 링크를 누르면 새 비밀번호를 정할 수 있어요. (스팸함도 확인해 주세요)</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="email">가입한 이메일</label>
              <input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            {error && <p className="login-error">{error}</p>}
            <button className="btn primary">재설정 메일 받기</button>
          </>
        )}
        <p className="login-links"><Link href="/find-id">이메일이 기억나지 않아요</Link></p>
        <p className="login-alt"><Link href="/login">로그인으로 돌아가기</Link></p>
      </form>
    </div>
  );
}
