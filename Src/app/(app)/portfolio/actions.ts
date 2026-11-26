"use server";

import { requireUser } from "@/lib/server/auth";
import { savePortfolio as save, type PortfolioPatch } from "@/lib/server/student/portfolio";
import { draftProject as draft } from "@/lib/server/student/portfolio-ai";

/** 포트폴리오 저장 (portfolios 표). 처음 저장이면 새 줄을 만들고 id 를 돌려준다. */
export async function savePortfolio(id: string | null, patch: PortfolioPatch) {
  const { supabase } = await requireUser();
  try {
    const data = await save(supabase, id, patch);
    return { ok: true, message: "", data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장하지 못했어요." };
  }
}

/** 프로젝트 한 개의 AI 초안 (문제 · 내 역할과 과정 · 결과와 회고). 근거 없는 섹션은 비어서 온다 */
export async function draftProject(portfolioId: string, projectId: string) {
  const { supabase } = await requireUser();
  try {
    return { ok: true as const, data: await draft(supabase, portfolioId, projectId) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "초안을 만들지 못했어요." };
  }
}
