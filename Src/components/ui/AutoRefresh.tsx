"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 서버에서 뒤늦게 끝나는 일(키워드 정리 등)을 기다리는 동안 화면을 주기적으로 다시 불러온다.
 * 학생에게 "새로고침하세요"라고 시키지 않기 위해서. 최대 times 번까지만 (일이 멈춰도 끝없이 부르지 않게)
 */
export function AutoRefresh({ every = 20_000, times = 9 }: { every?: number; times?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      if (++n > times) return clearInterval(t);
      router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every, times]);
  return null;
}
