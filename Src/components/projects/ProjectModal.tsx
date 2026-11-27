"use client";

import { MonthField } from "@/components/ui/MonthField";
import { Segmented } from "@/components/ui/Segmented";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject, deleteProject, updateProject } from "@/app/(app)/projects/actions";
import { Modal } from "@/components/ui/Modal";
import { useAction, useToast } from "@/components/ui/Toast";
import { monthToDate } from "./format";
import type { ProjectRow } from "./types";

/** 새 프로젝트 / 프로젝트 수정 · 삭제 */
export function ProjectModal({ project, onClose }: { project?: ProjectRow; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { pending, run } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    title: project?.title ?? "",
    start: project?.start_date?.slice(0, 7) ?? "",
    end: project?.end_date?.slice(0, 7) ?? "",
    topic: project?.topic ?? "",
    status: project?.status ?? ("active" as "active" | "done"),
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function save() {
    const title = form.title.trim();
    if (!title) return toast("프로젝트 이름을 입력해 주세요");
    if (form.start && form.end && form.end < form.start) return toast("종료가 시작보다 빠를 수 없어요");

    const input = {
      title,
      topic: form.topic.trim(),
      start_date: monthToDate(form.start, false),
      end_date: monthToDate(form.end, true),
      status: form.status,
    };
    if (project) run(() => updateProject(project.id, input), onClose);
    else run(() => createProject(input), (result) => { onClose(); router.push(`/projects/${result.id}`); });
  }

  if (project && confirmDelete) {
    return (
      <Modal onClose={() => setConfirmDelete(false)}>
        <p style={{ margin: "4px 0 18px", lineHeight: 1.6 }}>
          &quot;{project.title}&quot;와 모든 자료를 삭제할까요? 되돌릴 수 없어요.
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={() => setConfirmDelete(false)}>취소</button>
          <button
            className="btn danger"
            disabled={pending}
            onClick={() => run(() => deleteProject(project.id), () => { onClose(); router.push("/projects"); })}
          >
            삭제
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={project ? "프로젝트 수정" : "새 프로젝트"} onClose={onClose}>
      <div className="field">
        <label>프로젝트 이름</label>
        <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 우리 동네 지도 만들기" />
      </div>
      <div className="row2">
        <div className="field">
          <label>시작</label>
          <MonthField label="시작" value={form.start} onChange={(v) => set({ start: v })} />
        </div>
        <div className="field">
          <label>종료</label>
          <MonthField label="종료" value={form.end} onChange={(v) => set({ end: v })} placeholder="진행 중" />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>주제</label>
          <input value={form.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="예: 접근성 안내 지도" />
        </div>
        <div className="field">
          <label>상태</label>
          <Segmented label="상태" value={form.status} onChange={(v) => set({ status: v })} options={[{ value: "active", label: "진행 중" }, { value: "done", label: "완료" }]} />
        </div>
      </div>
      <div className="modal-actions">
        {project && <button className="btn danger left" onClick={() => setConfirmDelete(true)}>삭제</button>}
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" disabled={pending} onClick={save}>
          {pending ? "저장 중…" : project ? "저장" : "만들기"}
        </button>
      </div>
    </Modal>
  );
}
