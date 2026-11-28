"use client"; // 오류 화면은 클라이언트 컴포넌트여야 한다 (Next 16 error.js 규약)

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * 로그인 뒤 화면에서 데이터를 불러오다 실패했을 때 (D008).
 * 무엇이 안 됐는지 알려 주고, 같은 화면을 다시 불러오는 [다시 시도]를 준다. 저장한 기록은 그대로라고 안심시킨다.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="page">
      <div className="card panel err-card" role="alert">
        <div className="build-err"><Icon name="info" /></div>
        <h1>화면을 불러오지 못했어요</h1>
        <p>
          {offline ? "인터넷 연결이 끊긴 것 같아요. 연결을 확인한 뒤 다시 시도해 주세요." : "잠깐 서버와 연결이 원활하지 않았어요. 다시 시도해 주세요."}
          <br />지금까지 저장한 기록은 그대로 남아 있어요.
        </p>
        <div className="modal-actions">
          <Link className="btn" href="/projects">프로젝트 관리로</Link>
          <button className="btn primary" onClick={() => retry()}><Icon name="refresh" />다시 시도</button>
        </div>
      </div>
    </div>
  );
}
