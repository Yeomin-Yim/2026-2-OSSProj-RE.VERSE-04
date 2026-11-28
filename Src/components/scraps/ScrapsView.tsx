"use client";

// 스크랩 (프로토타입 #/scraps) — scraps · todos 표에 저장된 것만 보여 준다.
// 채용공고 스크랩: 연결 그래프 → 취업 → 직무의 공고 패널·공고 목록 ★로 모인다 (D016: type "job" + ref_id "posting:<id>" 로 저장).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { noteDate } from "@/components/explore/NoteDock";
import { CHECKLIST } from "@/components/explore/info";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { ScrapButton, TodoList, useStudent } from "@/components/student/StudentData";
import type { Scrap, ScrapType } from "@/lib/server/student/scraps";
import { isClosed, isPostingScrap, postingMeta, postingTodoKey } from "./posting";

type Tab = "all" | "university" | "major" | "job" | "posting" | "node";
const TABS: [Tab, string][] = [["all", "전체"], ["university", "대학"], ["major", "학과"], ["job", "직무"], ["posting", "채용공고"], ["node", "노드 노트"]];
const KIND: Record<ScrapType, [string, IconName]> = {
  university: ["대학", "graph"], major: ["학과", "graph"], job: ["직무", "graph"], note: ["노드 노트", "pen"], project: ["프로젝트", "home"],
};
const tabOf = (s: Scrap): Tab => (isPostingScrap(s) ? "posting" : s.type === "note" || s.type === "project" ? "node" : s.type);

/** 원래 위치: 스크랩할 때의 그래프 탐색 위치 */
function placeHref(s: Scrap) {
  const loc = s.loc;
  const q = new URLSearchParams();
  if (loc?.mode) q.set("mode", loc.mode);
  if (loc?.path?.length) q.set("path", loc.path.join(","));
  if (loc?.sel) q.set("sel", loc.sel);
  if (s.type === "note") q.set("note", s.ref_id);
  if (s.type === "project") q.set("project", s.ref_id);
  if (!loc?.mode && s.type !== "note" && s.type !== "project") q.set("mode", s.type === "job" ? "career" : "college");
  return "/graph" + (q.size ? "?" + q.toString() : "");
}

function Memo({ scrap }: { scrap: Scrap }) {
  const { saveMemo } = useStudent();
  const [value, setValue] = useState(scrap.memo);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function change(v: string) {
    setValue(v);
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => setState((await saveMemo(scrap.id, v)) ? "saved" : "error"), 500);
  }
  return (
    <>
      <textarea value={value} onChange={(e) => change(e.target.value)} placeholder="메모를 남겨 두세요 (자동 저장)" aria-label="메모" maxLength={2000} />
      {state !== "idle" && (
        <div className="hint" role="status">{state === "saving" ? "저장 중…" : state === "saved" ? "✓ 메모를 저장했어요" : "메모를 저장하지 못했어요"}</div>
      )}
    </>
  );
}

/** 채용공고 스크랩 카드: 회사·제목·지역·마감(지났으면 표시)·원문 링크·지원 체크리스트(그래프와 같은 목록) */
function PostingCard({ s }: { s: Scrap }) {
  const { removeScrap } = useStudent();
  const m = postingMeta(s);
  const closed = isClosed(m.deadline);
  return (
    <div className={"card sc-card posting-scrap" + (closed ? " closed" : "")}>
      <div className="kind"><Icon name="file" />채용공고{m.source === "public" ? " · 공공기관" : m.source === "saramin" ? " · 사람인" : ""}<ScrapButton input={{ type: s.type, ref_id: s.ref_id, title: s.title, meta: s.meta, loc: s.loc }} /></div>
      <div className="ps-co">{m.company}</div>
      <h3>{s.title}</h3>
      <div className="meta">
        {[m.location, m.jobLabel ? `직무 · ${m.jobLabel}` : "", `스크랩 ${noteDate(s.created_at)}`].filter(Boolean).join(" · ")}
      </div>
      {m.deadline && <div className={"ps-deadline" + (closed ? " closed" : "")}>{closed ? "마감됨 · " : "마감 "}{m.deadline}</div>}
      <Notice type="job" />
      <Memo scrap={s} />
      <div className="acts">
        {m.url && <a className="btn sm primary" href={m.url} target="_blank" rel="noopener noreferrer"><Icon name="link" /> 공고 원문 보기</a>}
        <Link className="btn sm" href={placeHref(s)}><Icon name="graph" /> 그래프에서 보기</Link>
        <button className="btn sm" onClick={() => removeScrap(s.id)}>스크랩 해제</button>
      </div>
      <TodoList todoKey={postingTodoKey(s)} defaults={CHECKLIST.posting} title="지원 체크리스트" />
    </div>
  );
}

function Card({ s }: { s: Scrap }) {
  if (isPostingScrap(s)) return <PostingCard s={s} />;
  const { removeScrap } = useStudent();
  const [label, icon] = KIND[s.type];
  const todoKey = s.type === "note" || s.type === "project" ? null : `${s.type}:${s.ref_id}`;
  return (
    <div className="card sc-card">
      <div className="kind"><Icon name={icon} />{label}<ScrapButton input={{ type: s.type, ref_id: s.ref_id, title: s.title, meta: s.meta, loc: s.loc }} /></div>
      <h3>{s.title}</h3>
      <div className="meta">{[s.meta?.sub, noteDate(s.created_at)].filter(Boolean).join(" · ")}</div>
      {(s.type === "university" || s.type === "major") && <Notice type="school" />}
      {(s.type === "major" || s.type === "job") && <Notice type="score" />}
      <Memo scrap={s} />
      {s.meta?.note && <div className="note"><b>함께 저장한 노트</b>{s.meta.note}</div>}
      <div className="acts">
        <Link className="btn sm primary" href={placeHref(s)}><Icon name="graph" /> 원래 위치로 이동</Link>
        <button className="btn sm" onClick={() => removeScrap(s.id)}>스크랩 해제</button>
      </div>
      {todoKey && <TodoList todoKey={todoKey} defaults={CHECKLIST[s.type as "university" | "major" | "job"]} />}
    </div>
  );
}

export function ScrapsView() {
  const { scraps } = useStudent();
  const [tab, setTab] = useState<Tab>("all");
  const list = scraps.filter((s) => tab === "all" || tabOf(s) === tab);
  const count = (t: Tab) => (t === "all" ? scraps.length : scraps.filter((s) => tabOf(s) === t).length);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">스크랩</h1>
          <p className="subtitle">다시 보고 싶은 대학·학과·직무·채용공고와 노드 노트를 모아 둬요.</p>
        </div>
        <span className="sample-badge">{scraps.length}개</span>
      </div>
      <div className="sc-tabs" role="tablist">
        {TABS.map(([t, name]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{name}{count(t) ? " " + count(t) : ""}</button>
        ))}
      </div>
      {list.length ? (
        <div className="sc-grid">{list.map((s) => <Card key={s.id} s={s} />)}</div>
      ) : (
        <div className="sc-empty">
          {tab === "posting"
            ? <>스크랩한 공고가 없어요.<br />연결 그래프 → 취업에서 직무를 고르고, 공고 옆의 ★을 누르면 여기에 모여요.</>
            : scraps.length ? "이 종류의 스크랩이 아직 없어요."
            : <>아직 스크랩이 없어요.<br />연결 그래프에서 학과·대학·직무, 프로젝트, 노트 옆의 ★을 누르면 여기에 모여요.</>}
          <br /><Link href="/graph" className="btn sm" style={{ marginTop: 14 }}>연결 그래프로 가기</Link>
        </div>
      )}
    </div>
  );
}
