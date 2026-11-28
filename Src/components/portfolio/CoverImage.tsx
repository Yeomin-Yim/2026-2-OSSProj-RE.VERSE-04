"use client";

import { useEffect, useState } from "react";
import { openFile } from "@/app/(app)/projects/actions";

/**
 * 대표 이미지: 사진 기록의 원본을 기존 openFile(1분짜리 서명 주소)로 받아 보여 준다.
 * 한 번 받은 주소는 같은 화면 안에서 다시 쓴다 (편집 화면 → 미리보기에서 다시 부르지 않게).
 */
const cache = new Map<string, string>();

export function CoverImage({ recordId, alt, className }: { recordId: string; alt: string; className?: string }) {
  const [state, setState] = useState<{ id: string; url?: string; error?: string }>(() => ({ id: recordId, url: cache.get(recordId) }));
  const cur = state.id === recordId ? state : { id: recordId, url: cache.get(recordId) };

  useEffect(() => {
    if (cache.has(recordId)) return;
    let alive = true;
    openFile(recordId)
      .then((r) => {
        if (!alive) return;
        if (r.ok) { cache.set(recordId, r.url); setState({ id: recordId, url: r.url }); }
        else setState({ id: recordId, error: r.message });
      })
      .catch(() => alive && setState({ id: recordId, error: "사진을 불러오지 못했어요." }));
    return () => { alive = false; };
  }, [recordId]);

  if (cur.url) {
    // eslint-disable-next-line @next/next/no-img-element -- 1분짜리 서명 주소라 next/image 최적화를 쓰지 않는다
    return <img className={className} src={cur.url} alt={alt} />;
  }
  return (
    <div className={(className ?? "") + " cover-ph"} role="status">
      {cur.error ? cur.error : <><span className="spinner" aria-hidden="true" />사진을 불러오는 중</>}
    </div>
  );
}
