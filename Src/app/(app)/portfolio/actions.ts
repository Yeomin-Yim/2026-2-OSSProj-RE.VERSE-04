"use server";

import { requireUser } from "@/lib/server/auth";
import { savePortfolio as save, type PortfolioPatch } from "@/lib/server/student/portfolio";

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
