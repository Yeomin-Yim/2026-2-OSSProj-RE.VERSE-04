"use client";

import { useState } from "react";
import { ImportModal } from "@/components/gcam-import/ImportModal";
import { Icon } from "@/components/ui/Icon";
import { ProjectModal } from "./ProjectModal";

/** 프로젝트가 하나도 없을 때의 화면 */
export function EmptyProjects() {
  const [open, setOpen] = useState<"new" | "import" | null>(null);

  return (
    <div className="page">
      <h1 className="title">프로젝트 관리</h1>
      <div className="card panel" style={{ marginTop: 16 }}>
        <div className="empty-note">프로젝트가 없어요. 새 프로젝트를 만들거나, 거꾸로캠퍼스 회고록을 가져와 보세요.</div>
        <div className="empty-actions">
          <button className="btn primary" onClick={() => setOpen("new")}><Icon name="plus" /> 새 프로젝트</button>
          <button className="btn" onClick={() => setOpen("import")}><Icon name="upload" /> 거캠 회고록 가져오기</button>
        </div>
      </div>
      {open === "new" && <ProjectModal onClose={() => setOpen(null)} />}
      {open === "import" && <ImportModal myProjects={[]} onClose={() => setOpen(null)} />}
    </div>
  );
}
