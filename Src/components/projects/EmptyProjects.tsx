"use client";

import { useState } from "react";
import { ProjectModal } from "./ProjectModal";

/** 프로젝트가 하나도 없을 때의 화면 */
export function EmptyProjects() {
  const [open, setOpen] = useState(false);

  return (
    <div className="page">
      <h1 className="title">프로젝트 관리</h1>
      <div className="card panel" style={{ marginTop: 16 }}>
        <div className="empty-note">프로젝트가 없어요. 새 프로젝트를 만들어보세요.</div>
        <div style={{ textAlign: "center" }}>
          <button className="btn primary" onClick={() => setOpen(true)}>+ 새 프로젝트</button>
        </div>
      </div>
      {open && <ProjectModal onClose={() => setOpen(false)} />}
    </div>
  );
}
