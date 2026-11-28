"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 인쇄(PDF 저장) 전용 사본 (D010).
 * 앱 화면(.app)은 인쇄 때 숨겨지므로, 출력할 문서를 body 바로 아래 #rc-print 에 따로 그린다.
 * 화면에서는 보이지 않고(@media screen), body.rc-printing 일 때 이것만 인쇄된다 (globals.css).
 * page: landscape = 포트폴리오(A4 가로, 쪽 안에 여백·쪽 번호) / altform = 대체서식(A4 세로)
 */
export function PrintPortal({ page, children }: { page: "portfolio" | "altform" | "landscape"; children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const div = document.createElement("div");
    div.id = "rc-print";
    document.body.appendChild(div);
    setEl(div);
    return () => { div.remove(); };
  }, []);
  if (!el) return null;
  return createPortal(
    <>
      <style>{page === "landscape" ? LANDSCAPE_PAGE : page === "portfolio" ? PORTFOLIO_PAGE : ALT_PAGE}</style>
      {children}
    </>,
    el,
  );
}

const PORTFOLIO_PAGE = `@page{size:A4 portrait;margin:16mm 15mm 18mm;@bottom-center{content:counter(page);font-family:Pretendard,'Pretendard Local',sans-serif;font-size:8.5pt;color:#93A1BA}}
@page cover{margin:0;@bottom-center{content:none}}`;
const ALT_PAGE = `@page{size:A4 portrait;margin:10mm}`;
/** 포트폴리오: A4 가로, 여백은 쪽(.lp-page) 안에서 직접 준다 (D015) */
const LANDSCAPE_PAGE = `@page{size:A4 landscape;margin:0}`;

/** 인쇄 직전: 글꼴과 #rc-print 안 이미지가 다 불러와질 때까지 기다린다 (최대 ms) */
export async function waitForPrintAssets(ms = 5000) {
  const root = document.getElementById("rc-print");
  const imgs = root ? [...root.querySelectorAll("img")] : [];
  const loaded = Promise.all([
    document.fonts?.ready,
    ...imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = img.onerror = () => r(); }))),
  ]);
  await Promise.race([loaded, new Promise((r) => setTimeout(r, ms))]);
}
