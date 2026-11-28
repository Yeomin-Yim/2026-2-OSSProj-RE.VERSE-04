import Link from "next/link";
import { Logo } from "@/components/ui/Icon";
import { findLoginId } from "../login/actions";

/** 아이디(이메일) 찾기: 가입할 때 적은 이름으로, 가려진 이메일을 보여 준다 */
export default async function FindIdPage({ searchParams }: { searchParams: Promise<{ error?: string; name?: string; found?: string }> }) {
  const { error, name, found } = await searchParams;
  const emails = found && found !== "-" ? found.split(",") : [];
  return (
    <div className="login-wrap">
      <form action={findLoginId} className="card login-card">
        <div className="logo">
          <span className="logo-row"><Logo height={44} /></span>
          <small>아이디(이메일) 찾기</small>
        </div>
        <div className="field">
          <label htmlFor="name">가입할 때 적은 이름</label>
          <input id="name" name="name" required minLength={2} maxLength={30} defaultValue={name ?? ""} autoComplete="name" />
        </div>
        {error && <p className="login-error">{error}</p>}
        {found && (emails.length ? (
          <div className="login-found">
            <small>이 이름으로 가입한 이메일</small>
            {emails.map((e) => <b key={e}>{e}</b>)}
          </div>
        ) : (
          <p className="login-error">이 이름으로 가입한 계정을 찾지 못했어요. 이름을 다시 확인해 주세요.</p>
        ))}
        <button className="btn primary">찾기</button>
        <p className="login-links"><Link href="/login">로그인</Link><span aria-hidden="true">·</span><Link href="/forgot">비밀번호 찾기</Link></p>
      </form>
    </div>
  );
}
