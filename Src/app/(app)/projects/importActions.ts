"use server";

// 거캠 회고록 가져오기 서버 액션. 쓰는 순서와 데이터 형식은 lib/server/gcam-import/README.md 참고.
// 묶기 단계가 40~50초 걸린다. Vercel 함수 제한이 300초(프로젝트 기본값)라 따로 설정하지 않는다.

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/server/auth";
import { afterRecordsChanged } from "@/lib/server/keywords/refresh";
import * as gcam from "@/lib/server/gcam-import/import";
import type { Draft } from "@/lib/server/gcam-import/draft";

type Result<T> = ({ ok: true } & T) | { ok: false; message: string };

async function attempt<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await work()) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "처리하지 못했어요." };
  }
}

/** ① 가져오기를 만들고 업로드 주소를 받는다. 화면은 이 주소로 PDF를 PUT 한다. */
export async function startImport(fileName: string) {
  const { supabase, userId } = await requireUser();
  return attempt(() => gcam.startImport(supabase, userId, fileName));
}

/** ② status 가 "ready" 가 될 때까지 반복해서 부른다. 실패해도 다시 부르면 이어서 한다. */
export async function stepImport(id: string) {
  const { supabase } = await requireUser();
  return attempt(async () => ({ import: await gcam.stepImport(supabase, id) }));
}

/** 진행 중이던 가져오기를 다시 열 때 (새로고침 등) */
export async function getImport(id: string) {
  const { supabase } = await requireUser();
  return attempt(async () => ({ import: await gcam.getImport(supabase, id) }));
}

/** ③ 학생이 고친 초안을 저장한다. 미분류로 남긴 노트는 '일반 활동'으로 간다. */
export async function confirmImport(id: string, draft: Draft) {
  const { supabase, userId } = await requireUser();
  const result = await attempt(async () => {
    const c = await gcam.confirmImport(supabase, id, draft);
    return { ...c, message: `노트 ${c.created}개를 만들고 ${c.updated}개를 갱신했어요` + (c.kept ? ` · 직접 고친 노트 ${c.kept}개는 그대로 두었어요` : "") };
  });
  if (result.ok) {
    revalidatePath("/projects", "layout");
    after(() => afterRecordsChanged(supabase, userId));
  }
  return result;
}
