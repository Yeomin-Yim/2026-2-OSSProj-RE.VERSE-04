"use server";

// 프로젝트 화면에서 부르는 서버 액션.
// 모두 { ok, message } 를 돌려주고, 화면은 그 message 를 알림으로 보여 준다.

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { CHECK_LABEL, type CheckKey } from "@/lib/core/index.ts";
import { requireUser, type Db } from "@/lib/server/auth";
import { recomputeGraph } from "@/lib/server/graph";
import * as projects from "@/lib/server/projects";
import * as records from "@/lib/server/projects/records";
import * as files from "@/lib/server/projects/files";
import type { ActionResult } from "@/components/ui/Toast";

/** 공통 처리: 로그인 확인 → 실행 → 화면 갱신. 실패하면 이유를 message 로 돌려준다. */
async function run(
  work: (db: Db) => Promise<Omit<ActionResult, "ok">>,
  options: { regraph?: boolean } = {},
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    const result = await work(supabase);
    revalidatePath("/projects", "layout");
    // 연결선 재계산은 응답을 보낸 뒤에 한다 (저장이 기다리지 않도록)
    if (options.regraph) {
      after(() => recomputeGraph(supabase).catch((e) => console.error("연결선 재계산 실패:", e)));
    }
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장하지 못했어요." };
  }
}

// ───────── 프로젝트 ─────────

export async function createProject(input: projects.ProjectInput) {
  return run(async (db) => ({ id: await projects.createProject(db, input), message: "새 프로젝트를 만들었어요" }));
}

export async function updateProject(id: string, input: projects.ProjectInput) {
  return run(async (db) => {
    await projects.updateProject(db, id, input);
    return { message: "프로젝트를 수정했어요" };
  });
}

export async function deleteProject(id: string) {
  return run(
    async (db) => {
      await projects.deleteProject(db, id);
      return { message: "프로젝트를 삭제했어요" };
    },
    { regraph: true },
  );
}

export async function saveOverview(projectId: string, overview: projects.Overview) {
  return run(async (db) => {
    await projects.saveOverview(db, projectId, overview);
    return { message: "개요를 저장했어요" };
  });
}

// ───────── 기록 ─────────

/** 링크 · 메모 추가 */
export async function addNote(input: { project_id: string; kind: "link" | "memo"; title: string; url: string; text: string }) {
  return run(
    async (db) => {
      await records.createRecord(db, input);
      return { message: "자료가 추가되었어요 · 기록 확인을 다시 했어요" };
    },
    { regraph: true },
  );
}

/** 보완 제안 · 기록 확인에서 짧게 적은 답. 같은 항목의 답이 이미 있으면 그 기록을 고친다. */
export async function saveAnswer(projectId: string, key: CheckKey, text: string, existingId: string | null) {
  return run(
    async (db) => {
      if (existingId) await records.updateRecordText(db, existingId, text);
      else {
        await records.createRecord(db, {
          project_id: projectId,
          kind: "memo",
          title: "답변 · " + CHECK_LABEL[key],
          text,
          answer_key: key,
          is_result: key === "result",
        });
      }
      return { message: CHECK_LABEL[key] + " 내용을 저장했어요 · 기록 확인을 다시 해요" };
    },
    { regraph: true },
  );
}

/** 기록 본문 수정. 내용이 바뀌었을 때만 새 버전이 생긴다. */
export async function editRecord(recordId: string, text: string) {
  return run(
    async (db) => {
      const version = await records.updateRecordText(db, recordId, text);
      return { message: version ? `버전 ${version}으로 저장했어요` : "바뀐 내용이 없어요" };
    },
    { regraph: true },
  );
}

export async function setResult(recordId: string, isResult: boolean) {
  return run(async (db) => {
    await records.setResult(db, recordId, isResult);
    return { message: isResult ? "결과물로 표시했어요" : "결과물 표시를 해제했어요" };
  });
}

export async function deleteRecord(recordId: string) {
  return run(
    async (db) => {
      await records.deleteRecord(db, recordId);
      return { message: "자료를 삭제했어요" };
    },
    { regraph: true },
  );
}

/** 기록을 다른 프로젝트로 옮긴다 (거캠 가져오기 뒤 잘못 묶인 노트 등) */
export async function moveRecord(recordId: string, projectId: string) {
  return run(
    async (db) => {
      await records.moveRecord(db, recordId, projectId);
      return { message: "다른 프로젝트로 옮겼어요" };
    },
    { regraph: true },
  );
}

// ───────── 파일 (파일 1개 = 노트 1개). 쓰는 순서는 lib/server/projects/README.md ─────────

/** ① 업로드 주소 받기. 화면은 uploadUrl 로 파일을 PUT 한 뒤 addFile 을 부른다 */
export async function prepareFile(fileName: string) {
  const { supabase, userId } = await requireUser();
  try {
    return { ok: true as const, ...(await files.prepareFile(supabase, userId, fileName)) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "업로드를 준비하지 못했어요." };
  }
}

/** ② 올린 파일로 노트 만들기. 글자 PDF·DOCX 는 글을 추출하고, 사진은 파일만 저장 */
export async function addFile(input: { recordId: string; project_id: string; title: string; fileName: string }) {
  const { userId } = await requireUser();
  return run(
    async (db) => {
      const { note } = await files.addFile(db, userId, input);
      return { message: note ?? "파일이 추가되었어요 · 기록 확인을 다시 했어요" };
    },
    { regraph: true },
  );
}

/** 원본 파일 열기 (1분 동안 유효한 주소) */
export async function openFile(recordId: string) {
  const { supabase } = await requireUser();
  try {
    return { ok: true as const, url: await files.fileUrl(supabase, recordId) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "파일을 열지 못했어요." };
  }
}
