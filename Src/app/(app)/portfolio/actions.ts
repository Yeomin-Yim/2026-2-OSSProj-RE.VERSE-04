"use server";

import { requireUser } from "@/lib/server/auth";
import { savePortfolio as save, type PortfolioPatch } from "@/lib/server/student/portfolio";
import { draftProject as draft, refineText as refine } from "@/lib/server/student/portfolio-ai";
import type { RefineMode } from "@/lib/core/index.ts";

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

/** ✦ 문장 다듬기: 제안만 돌려준다 (저장 없음). 원문에 없는 숫자·영문이 생기면 실패로 돌려준다 */
export async function refineText(mode: RefineMode, text: string) {
  await requireUser();
  try {
    return { ok: true as const, data: await refine(mode, String(text).slice(0, 1000)) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "다듬지 못했어요." };
  }
}
