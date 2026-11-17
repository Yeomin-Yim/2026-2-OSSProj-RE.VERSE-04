"use client";

// 프로젝트 관리 화면 (프로토타입 #/projects 와 같은 3단 구성)
//   왼쪽: 프로젝트 목록 · 가운데: 선택한 프로젝트의 탭 · 오른쪽: 보완 제안과 기록 확인

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { AddNoteModal } from "./AddNoteModal";
import { NoteList } from "./NoteList";
import { OverviewTab } from "./OverviewTab";
import { ProjectModal } from "./ProjectModal";
import { RightPanel } from "./RightPanel";
import { STATUS_LABEL, ym } from "./format";
import type { Checks, Guide, Overview, ProjectRow, RecordView, TabKey, TagInfo } from "./types";

interface Props {
  projects: ProjectRow[];
  project: ProjectRow;
  records: RecordView[];
  overview: Overview;
  checks: Checks;
  guides: Guide[];
  projectTags: { code: string; count: number }[];
  tagInfo: TagInfo;
  userName: string;
}

const TABS: [TabKey, string][] = [["files", "자료"], ["overview", "개요"], ["log", "진행 기록"], ["result", "결과"]];

export function ProjectsView(props: Props) {
  const { projects, project, records, overview } = props;
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("files");
  const [modal, setModal] = useState<"new" | "edit" | "note" | null>(null);

  const oldestFirst = [...records].reverse();
  const noteList = (list: RecordView[], empty: string) => (
    <NoteList records={list} empty={empty} userName={props.userName} tagInfo={props.tagInfo} />
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">프로젝트 관리</h1>
          <p className="subtitle">프로젝트를 고르고 기록을 모아요.</p>
        </div>
      </div>

      <div className="proj-grid">
        {/* 왼쪽: 프로젝트 목록 */}
        <div className="card panel">
          <div className="proj-list-head">
            <h2>프로젝트 목록</h2>
            <span className="count">{projects.length}</span>
          </div>
          <button className="btn primary block" onClick={() => setModal("new")}>
            <Icon name="plus" /> 새 프로젝트
          </button>
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className={"proj-item" + (p.id === project.id ? " sel" : "")}>
              <span>
                <b>{p.title}</b>
                <small>{STATUS_LABEL[p.status]} · 자료 {p.record_count}</small>
              </span>
              <Icon name="chevR" />
            </Link>
          ))}
        </div>

        {/* 가운데: 프로젝트 상세 */}
        <div className="card panel">
          <div className="detail-head">
            <div>
              <h2>{project.title}</h2>
              <div className="period">
                {ym(project.start_date)}{project.end_date ? "–" + ym(project.end_date) : ""}
              </div>
            </div>
            <button className="btn ghost" onClick={() => setModal("edit")}>수정</button>
          </div>

          <div className="tabs">
            {TABS.map(([key, label]) => (
              <button key={key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          {tab === "files" && (
            <>
              <div className="sec-head">
                <h3>기록 자료</h3>
                <button className="btn ghost" onClick={() => setModal("note")}>링크 · 메모</button>
              </div>
              {noteList(records, "아직 자료가 없어요.")}
            </>
          )}
          {tab === "overview" && <OverviewTab projectId={project.id} overview={overview} />}
          {tab === "log" && noteList(oldestFirst.filter((r) => !r.is_result), "진행 기록이 없어요.")}
          {tab === "result" && (
            <>
              {overview.result && (
                <div className="note-body" style={{ marginBottom: 10 }}>
                  <b style={{ color: "var(--primary)" }}>정리된 결과</b><br />{overview.result}
                </div>
              )}
              {noteList(
                oldestFirst.filter((r) => r.is_result),
                '결과물로 표시된 자료가 없어요. 자료 옆 ⋮ 메뉴에서 "결과물로 표시"할 수 있어요.',
              )}
            </>
          )}
        </div>

        {/* 오른쪽: 보완 제안 · 기록 확인 */}
        <div className="col-right">
          <RightPanel
            project={project}
            records={records}
            checks={props.checks}
            guides={props.guides}
            projectTags={props.projectTags}
            tagInfo={props.tagInfo}
            onEditProject={() => setModal("edit")}
            onAddNote={() => setModal("note")}
            onShowFiles={() => { setTab("files"); toast("사진·파일·링크 자료가 있으면 증빙으로 확인돼요"); }}
          />
        </div>
      </div>

      {modal === "new" && <ProjectModal onClose={() => setModal(null)} />}
      {modal === "edit" && <ProjectModal project={project} onClose={() => setModal(null)} />}
      {modal === "note" && <AddNoteModal projectId={project.id} onClose={() => setModal(null)} />}
    </div>
  );
}
