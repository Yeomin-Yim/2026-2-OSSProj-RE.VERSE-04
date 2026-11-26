"use client";

// 프로젝트 관리 화면 (프로토타입 #/projects 와 같은 3단 구성)
//   왼쪽: 프로젝트 목록 · 가운데: 선택한 프로젝트의 탭 · 오른쪽: 보완 제안과 기록 확인

import { useState } from "react";
import { noteDate } from "@/components/explore/NoteDock";
import type { GraphNote } from "@/lib/server/student/notes";
import Link from "next/link";
import { ImportModal } from "@/components/gcam-import/ImportModal";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { AddNoteModal, type AddKind } from "./AddNoteModal";
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
  graphNotes: GraphNote[];
  initialTab?: TabKey;
}



export function ProjectsView(props: Props) {
  const { projects, project, records, overview } = props;
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>(props.initialTab ?? "files");
  // 연결 그래프에서 이 프로젝트에 연결한 노트 (graph_notes)
  const gnotesOf = (pid: string) => props.graphNotes.filter((n) => n.project_ids.includes(pid));
  const myNotes = [...gnotesOf(project.id)].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  const TABS: [TabKey, string][] = [["files", "자료"], ["gnotes", "연결 노트" + (myNotes.length ? " " + myNotes.length : "")], ["overview", "개요"], ["result", "결과"]];
  const [modal, setModal] = useState<"new" | "edit" | "note" | "import" | null>(null);
  const [addKind, setAddKind] = useState<AddKind>("file");
  const openAdd = (kind: AddKind) => { setAddKind(kind); setModal("note"); };

  const oldestFirst = [...records].reverse();
  const noteList = (list: RecordView[], empty: string) => (
    <NoteList records={list} empty={empty} userName={props.userName} tagInfo={props.tagInfo} projects={projects} />
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">프로젝트 관리</h1>
          <p className="subtitle">프로젝트를 고르고 기록을 모아요.</p>
        </div>
        <button className="btn" onClick={() => setModal("import")}>
          <Icon name="upload" /> 거캠 회고록 가져오기
        </button>
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
                <small>{STATUS_LABEL[p.status]} · 자료 {p.record_count}{gnotesOf(p.id).length ? " · 노트 " + gnotesOf(p.id).length : ""}</small>
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
                <div className="sec-actions">
                  <button className="btn ghost" onClick={() => openAdd("file")}><Icon name="upload" />파일 올리기</button>
                  <button className="btn ghost" onClick={() => openAdd("link")}>링크 · 메모</button>
                </div>
              </div>
              {noteList(records, "아직 자료가 없어요.")}
            </>
          )}
          {tab === "gnotes" && (
            <>
              <div className="sec-head">
                <h3>연결 노트</h3>
                <Link className="btn ghost" href={`/graph?project=${project.id}`}>그래프에서 보기</Link>
              </div>
              {myNotes.length ? myNotes.map((n) => (
                <div className="note" key={n.id}>
                  <div className="ico" style={{ background: "#E9F0FB", color: "#2456A8" }}><Icon name="pen" /></div>
                  <div className="nm">
                    <b>{n.title || "제목 없음"}</b>
                    <small>{noteDate(n.updated_at)}{n.body ? " · " + n.body.slice(0, 40) + (n.body.length > 40 ? "…" : "") : ""}</small>
                  </div>
                  <Link className="btn sm" href={`/graph?note=${n.id}`}>열기</Link>
                </div>
              )) : (
                <div className="empty-note">아직 연결된 노트가 없어요.<br />연결 그래프에서 <b>+ 노트 추가</b>를 눌러보세요.</div>
              )}
            </>
          )}
          {tab === "overview" && <OverviewTab projectId={project.id} overview={overview} />}
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
            onAddNote={() => openAdd("file")}
            onShowFiles={() => { setTab("files"); toast("사진·파일·링크 자료가 있으면 증빙으로 확인돼요"); }}
          />
        </div>
      </div>

      {modal === "new" && <ProjectModal onClose={() => setModal(null)} />}
      {modal === "edit" && <ProjectModal project={project} onClose={() => setModal(null)} />}
      {modal === "note" && <AddNoteModal projectId={project.id} initialKind={addKind} onClose={() => setModal(null)} />}
      {modal === "import" && (
        <ImportModal myProjects={projects.map(({ id, title }) => ({ id, title }))} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
