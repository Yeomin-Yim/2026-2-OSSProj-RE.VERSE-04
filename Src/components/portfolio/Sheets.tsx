// 포트폴리오 인쇄본 (프로토타입 pfSheet · altSheet)
//   PortfolioSheet : 사람인 이력서 템플릿 디자인 (가로 A4) — 1쪽 프로필, 프로젝트별 간단형 1쪽 / 상세형 2쪽, 마지막 쪽 자기소개서
//   AltSheet       : 동국대 2027 수시 학교생활기록부 대체 서식 (편집 / 인쇄)

import { TEMPLATES, period, type AltRow, type PortfolioSource, type ProfileDraft } from "@/lib/core/index.ts";
import type { AltForm } from "@/lib/server/student/portfolio";
import { kindLabel, ymd } from "@/components/projects/format";
import { altWarnings, DETAILED_SECTIONS, ORIGIN_LABEL, SIMPLE_SECTIONS, type ContentMap, type FileInfo, type Origin, type ProjectContent, type SecKey, type Variant } from "./compose";
import { CoverImage } from "./CoverImage";

/** 대체서식 한 행 + 활동내용 출처 (jsonb 라 서버 변경 없이 같이 저장된다) */
export type AltRowX = AltRow & { src?: Origin };

const PICO = {
  cap: <svg viewBox="0 0 24 24"><path d="M2 9l10-4 10 4-10 4z" /><path d="M6 11v4c0 1.5 3 3 6 3s6-1.5 6-3v-4" /><path d="M22 9v6" /></svg>,
  trophy: <svg viewBox="0 0 24 24"><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3M12 13v4M8 21h8M9 17h6" /></svg>,
  laptop: <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20M9 11l2 2 4-4" /></svg>,
  bulb: <svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.3 1 2.5h6c0-1.2.3-1.9 1-2.5A6 6 0 0 0 12 3z" /></svg>,
};
const pad = (n: number) => String(n).padStart(2, "0");
const firstSentence = (t: string) => {
  const s = (t || "").trim(), i = s.search(/[.!?。]\s/);
  return i > 0 ? s.slice(0, i + 1) : s;
};
const label = (k: SecKey) => [...SIMPLE_SECTIONS, ...DETAILED_SECTIONS].find((x) => x.key === k)!.label;

function Page({ left, children, grow }: { left: React.ReactNode; children: React.ReactNode; grow?: boolean }) {
  return (
    <section className={"pf-page" + (grow ? " grow" : "")}>
      <aside className="pf-left"><i className="pf-diag" />{left}</aside>
      <main className="pf-right">{children}</main>
      <span className="pf-brand">RE:Cord</span>
    </section>
  );
}
function Sec({ ico, children }: { ico: keyof typeof PICO; children: React.ReactNode }) {
  return <div className="pf-sec"><span className="pf-ico">{PICO[ico]}</span><div>{children}</div></div>;
}
function Entry({ t, d, body }: { t: string; d?: string; body?: string }) {
  return <div className="pf-entry"><b>{t}</b>{d && <span>{d}</span>}{body && <p>{body}</p>}</div>;
}
function Essay({ c, k }: { c: ProjectContent; k: SecKey }) {
  const v = (c[k] ?? "").trim();
  return <div className="pf-essay"><h4>{label(k)}</h4><p>{v || <i className="ph">(추가 확인 필요 · 기록에서 근거를 찾지 못했어요)</i>}</p></div>;
}
function Evidence({ c, files }: { c: ProjectContent; files: FileInfo[] }) {
  const chosen = (c.evidence ?? []).map((id) => files.find((f) => f.id === id)).filter((f): f is FileInfo => !!f);
  if (!chosen.length) return null;
  return (
    <div className="pf-recs"><b>EVIDENCE · 증빙자료</b>
      <ul>{chosen.map((f) => <li key={f.id}>{f.title} <small>({kindLabel(f.kind)} · {ymd(f.recorded_at)})</small></li>)}</ul>
    </div>
  );
}

export function PortfolioSheet({ name, profile, order, sources, files, content, variant }: {
  name: string; profile: ProfileDraft; order: string[]; sources: Record<string, PortfolioSource>;
  files: Record<string, FileInfo[]>; content: ContentMap; variant: Variant;
}) {
  const r = profile;
  const ps = order.map((id) => sources[id]).filter(Boolean);
  const tagCount = new Map<string, number>();
  for (const p of ps) for (const t of p.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const skills = r.skills.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6);
  const maxc = Math.max(1, ...skills.map((k) => tagCount.get(k) ?? 1));
  const summary = (c: ProjectContent | undefined, p: PortfolioSource) =>
    (variant === "simple" ? c?.intro : "") || firstSentence((variant === "simple" ? c?.result : c?.d_result) ?? "") || p.topic || "";
  return (
    <div className="pf-doc">
      <Page left={<>
        <div className="pf-label">Portfolio</div>
        <div className="pf-avatar"><span>{name.charAt(0)}</span></div>
        <div className="pf-hello">안녕하세요<br />{r.slogan || "프로젝트로 배우는 학생"}<br /><em>{name}</em>입니다</div>
        <div className="pf-contact">
          <b>{name}</b>
          {r.education ? <span>{r.education}</span> : <span className="ph">학교 · 학과 (직접 입력)</span>}
          <span className="ph">연락처 · 이메일 (제출 시 직접)</span>
          <span>{r.link || <i className="ph">포트폴리오 or SNS 링크</i>}</span>
        </div>
      </>}>
        <div className="pf-cols">
          <div>
            <Sec ico="cap"><Entry t={r.education || "학교명 · 학과 (직접 입력)"} d={r.education ? "재학 중" : ""} /></Sec>
            <Sec ico="trophy">{r.awards ? r.awards.split(/\n/).filter(Boolean).map((a) => <Entry key={a} t={a} />) : <div className="pf-entry ph"><b>수상 · 자격증</b><span>기록에 없어 비워 두었어요</span></div>}</Sec>
            <Sec ico="laptop">
              {skills.length ? skills.map((k) => (
                <div key={k} className="pf-skill"><span>{k}</span><i><b style={{ width: 45 + Math.round((55 * (tagCount.get(k) ?? 1)) / maxc) + "%" }} /></i></div>
              )) : <div className="pf-entry ph"><b>스킬 · 관심 키워드</b></div>}
            </Sec>
          </div>
          <div>
            <Sec ico="bulb">
              {ps.map((p) => <Entry key={p.id} t={"주요 프로젝트 · " + p.title} d={period(p)} body={summary(content[p.id], p)} />)}
            </Sec>
          </div>
        </div>
      </Page>
      {ps.flatMap((p, i) => {
        const c = content[p.id] ?? {};
        const f = files[p.id] ?? [];
        const head = (
          <div className="pf-slogan">{pad(i + 1)}<br />{p.title}<small>{period(p)}</small></div>
        );
        if (variant === "simple") {
          return [
            <Page key={p.id} grow left={<>
              {head}
              {c.cover && <CoverImage recordId={c.cover} alt={`${p.title} 대표 이미지`} className="pf-cover" />}
              {(c.intro ?? "").trim() && <div className="pf-intro">{c.intro}</div>}
              <Evidence c={c} files={f} />
            </>}>
              {(["problem", "role", "process", "result"] as const).map((k) => <Essay key={k} c={c} k={k} />)}
            </Page>,
          ];
        }
        return [
          <Page key={p.id + "-1"} grow left={<>
            {head}
            {c.cover && <CoverImage recordId={c.cover} alt={`${p.title} 대표 이미지`} className="pf-cover" />}
            {p.topic && <div className="pf-intro">{p.topic}</div>}
            <div className="pf-meta"><b>PAGE</b><span>1 / 2 · 배경 · 역할 · 과정 · 시행착오</span></div>
          </>}>
            {(["d_problem", "d_role", "d_process", "d_trial"] as const).map((k) => <Essay key={k} c={c} k={k} />)}
          </Page>,
          <Page key={p.id + "-2"} grow left={<>
            <div className="pf-slogan">{pad(i + 1)}<br />{p.title}<small>2 / 2 · 피드백 · 결과 · 증빙 · 배움</small></div>
            <Evidence c={c} files={f} />
            {!(c.evidence ?? []).length && <div className="pf-recs"><b>EVIDENCE · 증빙자료</b><span className="ph" style={{ color: "#b5b8c2" }}>선택한 증빙자료가 없어요</span></div>}
          </>}>
            {(["d_feedback", "d_result", "d_learning", "d_next"] as const).map((k) => <Essay key={k} c={c} k={k} />)}
          </Page>,
        ];
      })}
      <Page left={<div className="pf-slogan">{firstSentence(r.aspiration) || r.slogan || "기록으로 배우고, 배운 것을 다음 프로젝트로 잇겠습니다"}</div>}>
        <div className="pf-essay"><h4>지원동기</h4><p>{r.motivation || <i className="ph">자기소개서를 입력하세요.</i>}</p></div>
        <div className="pf-essay"><h4>앞으로의 포부</h4><p>{r.aspiration || <i className="ph">자기소개서를 입력하세요.</i>}</p></div>
      </Page>
    </div>
  );
}

const CIRC = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];

export function AltSheet({ alt, name, edit, onHead, onRow, onDel, onAdd, onOath, onFill, canFill }: {
  alt: AltForm; name: string; edit: boolean;
  onFill?: (i: number) => void;
  canFill?: (row: AltRowX) => boolean;
  onHead?: (k: "track" | "unit", v: string) => void;
  onRow?: (i: number, k: keyof AltRow, v: string) => void;
  onDel?: (i: number) => void;
  onAdd?: () => void;
  onOath?: (v: boolean) => void;
}) {
  const t = TEMPLATES["altform-dongguk-2027"];
  const lim = t.contentLimit ?? 100;
  const cols = t.columns!;
  const oath = alt.oath ? "☑" : "☐";
  const band = (s: string) => <div className="af-band">{s}</div>;
  const head = (k: "track" | "unit", ph: string) =>
    edit ? <input className="af-in" value={alt.head[k]} placeholder={ph} onChange={(e) => onHead?.(k, e.target.value)} /> : alt.head[k] || " ";
  return (
    <div className="af-sheet">
      <div className="af-top"><span>2027학년도 동국대학교 수시모집 학교생활기록부 대체 서식</span><span className="af-logo">동국대학교<small>dongguk university</small></span></div>
      <h1 className="af-title">학교생활기록부 대체 서식(선택)</h1>
      <table className="af-head"><tbody>
        <tr><th>전 형 명</th><td>{head("track", "예: 학생부종합(Do Dream)")}</td><th>모집단위</th><td>{head("unit", "예: 산업디자인학과")}</td></tr>
        <tr><th>성 &nbsp; 명</th><td><i className="af-blind">{name} ( 평가 시 해당정보 블라인드 )</i></td><th>수험번호</th><td><i className="af-blind">( 평가 시 해당정보 블라인드 )</i></td></tr>
      </tbody></table>
      {band("학력정보")}
      <table className="af-edu"><tbody>
        <tr><td colSpan={4} className="chk">☐ 외국소재 고등학교 졸업(예정)자 및 국내 학력인정 외국교육기관 졸업(예정)자</td></tr>
        <tr><th>고교 입학일</th><td>년 &nbsp;&nbsp; 월 &nbsp;&nbsp; 일</td><th>고교 졸업일</th><td>년 &nbsp;&nbsp; 월 &nbsp;&nbsp; 일</td></tr>
        <tr><td colSpan={4} className="chk">☐ 검정고시 합격자</td></tr>
        <tr><th>합격일</th><td colSpan={3}>년 &nbsp;&nbsp; 월 &nbsp;&nbsp; 일</td></tr>
        <tr><td colSpan={4} className="chk">☐ 국내 고등학교 졸업(예정)자 중 국외 고교 재학 경험이 있는 자 (1학기 이상)</td></tr>
        <tr><th>고교 입학일</th><td>년 &nbsp;&nbsp; 월 &nbsp;&nbsp; 일</td><th>고교 졸업일</th><td>년 &nbsp;&nbsp; 월 &nbsp;&nbsp; 일</td></tr>
      </tbody></table>
      {band("작성 유의사항")}
      <div className="af-box">{(t.rules ?? []).map((r, i) => <p key={i}>{CIRC[i]} {r}</p>)}</div>
      {band("목록표 및 증빙자료 작성방법")}
      <div className="af-box small">
        <p>[증빙자료 목록표] 증빙자료 목록이 5건 이상일 경우, 연번을 추가하여 작성가능</p>
        <p>① 활동명 : 교과/비교과 활동의 명칭을 기재하고, 유사한 성격의 활동은 1개의 활동명으로 기재</p>
        <p>② 활동기간 : 고등학교 기간 동안의 교과/비교과 활동을 기재</p>
        <p>③ 활동내용 : 활동(발행)기관명 기재 금지 / 객관적 사실만 서술 가능 (100자 이내)</p>
        <p>④ 활동(발행)기관 : 활동기관(증빙자료 발행처) 기재</p>
        <p>⑤ 해당 페이지 : 활동명에 해당하는 증빙자료 페이지 번호 기재</p>
        <p>[증빙자료] A4용지 단면 기준 10페이지 이내 제출 가능(축소/양면 복사 금지) · 목록표의 활동(연번) 순서와 증빙자료의 순서가 일치</p>
      </div>
      {band("증빙자료 목록표")}
      <table className="af-list">
        <thead><tr><th className="no">연번</th><th>① 활동명</th><th>② 활동기간<br /><small>( 년 월 일 ~ 년 월 일)</small></th><th>③ 활동내용<br /><small>(100자 이내)</small></th><th>④ 활동(발행)기관</th><th className="pg">⑤<br />해당 페이지</th></tr></thead>
        <tbody>
          {(alt.rows as AltRowX[]).map((row, i) => (
            <tr key={i}>
              <td className="no">{i + 1}{edit && <button className="af-del" onClick={() => onDel?.(i)} aria-label="행 삭제" title="행 삭제">×</button>}</td>
              {cols.map((c) => (
                <td key={c.key} className={c.key === "content" ? "ct" : undefined}>
                  {!edit ? row[c.key] : c.area ? (
                    <>
                      <textarea className="af-in" rows={3} value={row[c.key]} placeholder={c.ph} onChange={(e) => onRow?.(i, c.key, e.target.value)} />
                      <div className={"cnt" + (row.content.length > lim ? " over" : "")}>{row.content.length} / {lim}</div>
                      <div className="af-meta no-print">
                        {row.content.trim() && row.src && row.src !== "edited" && <span className={"origin-badge " + row.src}>{ORIGIN_LABEL[row.src]}</span>}
                        {altWarnings(row.content, lim).map((w) => <span key={w} className="af-warn">{w}</span>)}
                        {!row.content.trim() && canFill?.(row) && <button type="button" className="btn ghost" onClick={() => onFill?.(i)}>기록에서 채우기</button>}
                      </div>
                    </>
                  ) : <input className="af-in" value={row[c.key]} placeholder={c.ph} onChange={(e) => onRow?.(i, c.key, e.target.value)} />}
                </td>
              ))}
            </tr>
          ))}
          {!edit && <tr className="dots"><td className="no">..</td>{cols.map((c) => <td key={c.key} />)}</tr>}
        </tbody>
      </table>
      {edit && (
        <div className="af-rowbtns no-print">
          <button className="btn ghost" onClick={onAdd} disabled={alt.rows.length >= (t.maxRows ?? 10)}>+ 행(연번) 추가</button>
          <span className="hint">기본 {t.minRows}행 · 최대 {t.maxRows}행 · 활동내용 {lim}자 이내</span>
        </div>
      )}
      <p className="af-attach">※ 첨부 : 증빙자료 총 ( &nbsp;&nbsp;&nbsp;&nbsp; )페이지(단면 기준 10매 이내)</p>
      <div className="af-foot">■ 유의사항<br />※ <mark>본 서식은 참고용이며, 원서접수 시 온라인 입력 후 출력 제출하여야 합니다.</mark><br />※ 증빙자료 목록표 뒷장에 증빙자료(A4 단면 10매 이내)를 첨부하여 제출</div>
      {band("지원자 확인 서약")}
      <div className="af-oath">
        <p>
          본인은 학교생활기록부 대체 서식 작성에 관한 유의사항을 숙지했으며, 유의사항 위반에 따른 조치에 대해서는 이의를 제기하지 않겠습니다. 또한 학교생활기록부 대체 서식에 작성된 내용에 거짓이 없음을 확인하고 추후 허위 사실 기재나 기타 부적절한 사실이 발견될 경우 불합격, 합격취소 등의 불이익에 대해서는 지원자 본인에게 책임이 있음을 확인합니다.{" "}
          {edit ? <label className="af-agree"><input type="checkbox" checked={alt.oath} onChange={(e) => onOath?.(e.target.checked)} /> 동의</label> : `(동의 ${oath})`}
        </p>
        <p className="af-date">{new Date().getFullYear()}년 OO월 OO일 &nbsp;&nbsp;&nbsp; 지원자 확인 완료 {oath}</p>
        <p className="af-to">동 국 대 학 교 총 장 귀하</p>
      </div>
    </div>
  );
}
