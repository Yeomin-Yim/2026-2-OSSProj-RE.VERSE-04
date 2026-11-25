"use client";

// 스크랩 (프로토타입 #/scraps) — scraps · todos 표에 저장된 것만 보여 준다.
// 채용공고 스크랩은 채용공고 데이터가 아직 없어 빈 상태로 둔다.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { noteDate } from "@/components/explore/NoteDock";
import { CHECKLIST } from "@/components/explore/info";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { ScrapButton, TodoList, useStudent } from "@/components/student/StudentData";
import type { Scrap, ScrapType } from "@/lib/server/student/scraps";

type Tab = "all" | "university" | "major" | "job" | "posting" | "node";
const TABS: [Tab, string][] = [["all", "전체"], ["university", "대학"], ["major", "학과"], ["job", "직무"], ["posting", "채용공고"], ["node", "노드 노트"]];
const KIND: Record<ScrapType, [string, IconName]> = {
  university: ["대학", "graph"], major: ["학과", "graph"], job: ["직무", "graph"], note: ["노드 노트", "pen"], project: ["프로젝트", "home"],
};
const tabOf = (s: Scrap): Tab => (s.type === "note" || s.type === "project" ? "node" : s.type);

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

function Card({ s }: { s: Scrap }) {
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
          <p className="subtitle">다시 보고 싶은 대학·학과·직무와 노드 노트를 모아 둬요.</p>
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
            ? <>채용공고 데이터는 아직 연결되지 않았어요.<br />공고 수집 기능이 생기면 공고 옆의 ★로 여기에 모을 수 있어요.</>
            : scraps.length ? "이 종류의 스크랩이 아직 없어요."
            : <>아직 스크랩이 없어요.<br />연결 그래프에서 학과·대학·직무, 프로젝트, 노트 옆의 ★을 누르면 여기에 모여요.</>}
          <br /><Link href="/graph" className="btn sm" style={{ marginTop: 14 }}>연결 그래프로 가기</Link>
        </div>
      )}
    </div>
  );
}
