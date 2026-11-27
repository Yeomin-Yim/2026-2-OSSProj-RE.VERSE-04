"use client";

import { useState } from "react";
import { ImportModal } from "@/components/gcam-import/ImportModal";
import { Icon } from "@/components/ui/Icon";
import { ProjectModal } from "./ProjectModal";

/**
 * 프로젝트가 하나도 없을 때의 화면 (판단기록 D24).
 * 거캠 학생에게 가장 빠른 시작은 회고록 PDF 한 번 올리기라서 그것을 주 버튼으로 두고, 세 단계만 짧게 보여 준다.
 */
const GCAM_SITE = "https://gschool-reflection.netlify.app/";

export function EmptyProjects() {
  const [open, setOpen] = useState<"new" | "import" | null>(null);

  return (
    <div className="page">
      <h1 className="title">프로젝트 관리</h1>
      <div className="card panel onboard">
        <h2>거캠 회고록으로 1분 만에 시작해요</h2>
        <ol className="onboard-steps">
          <li>
            <span className="n">1</span>
            <b>회고록 PDF 받기</b>
            <small><a href={GCAM_SITE} target="_blank" rel="noreferrer">거캐머의 하루</a>에서 학기 PDF 내려받기</small>
          </li>
          <li>
            <span className="n">2</span>
            <b>여기에 올리기</b>
            <small>프로젝트·노트로 자동 정리</small>
          </li>
          <li>
            <span className="n">3</span>
            <b>진로 연결 보기</b>
            <small>연결 그래프에서 학과·직무 탐색</small>
          </li>
        </ol>
        <div className="empty-actions">
          <button className="btn primary" onClick={() => setOpen("import")}><Icon name="upload" /> 회고록 PDF 올리기</button>
          <button className="btn ghost" onClick={() => setOpen("new")}><Icon name="plus" /> 직접 만들기</button>
        </div>
      </div>
      {open === "new" && <ProjectModal onClose={() => setOpen(null)} />}
      {open === "import" && <ImportModal myProjects={[]} onClose={() => setOpen(null)} />}
    </div>
  );
}
