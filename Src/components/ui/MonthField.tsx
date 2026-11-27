"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 월 고르기 (브라우저 기본 달력 대신, 판단기록 D29): 누르면 연도 넘기기 + 12개월 칸이 뜬다.
 * value/onChange 는 input[type=month] 와 같은 "YYYY-MM" (빈 문자열 = 없음).
 */
export function MonthField({ value, onChange, label, placeholder = "선택 안 함", defaultOpen = false }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const now = new Date();
  const [year, setYear] = useState(() => Number(value.slice(0, 4)) || now.getFullYear());
  const box = useRef<HTMLDivElement>(null);
  // 아래 공간(모달 안이면 모달 끝까지)이 모자라면 위로 연다: 모달 안에서 잘리거나 스크롤이 생기지 않게
  const [up, setUp] = useState(false);
  const toggle = () => {
    if (!open && box.current) {
      const r = box.current.getBoundingClientRect();
      const limit = box.current.closest(".modal")?.getBoundingClientRect().bottom ?? window.innerHeight;
      setUp(limit - r.bottom < 250 && r.top > 250);
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [open]);

  const pick = (m: number) => { onChange(`${year}-${String(m).padStart(2, "0")}`); setOpen(false); };
  const shown = value ? `${Number(value.slice(0, 4))}년 ${Number(value.slice(5, 7))}월` : placeholder;
  const isNow = (m: number) => year === now.getFullYear() && m === now.getMonth() + 1;

  return (
    <div className="mf" ref={box}>
      <button type="button" className={"mf-btn" + (value ? "" : " empty")} aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${shown}`} onClick={toggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>
        <span>{shown}</span>
      </button>
      {open && (
        <div className={"mf-pop" + (up ? " up" : "")} role="dialog" aria-label={`${label} 고르기`}>
          <div className="mf-year">
            <button type="button" aria-label="이전 해" onClick={() => setYear((y) => y - 1)}>‹</button>
            <b>{year}년</b>
            <button type="button" aria-label="다음 해" onClick={() => setYear((y) => y + 1)}>›</button>
          </div>
          <div className="mf-grid">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const sel = value === `${year}-${String(m).padStart(2, "0")}`;
              return (
                <button key={m} type="button" className={(sel ? "sel " : "") + (isNow(m) ? "now" : "")} aria-pressed={sel} onClick={() => pick(m)}>{m}월</button>
              );
            })}
          </div>
          {value && <button type="button" className="mf-clear" onClick={() => { onChange(""); setOpen(false); }}>날짜 지우기</button>}
        </div>
      )}
    </div>
  );
}
