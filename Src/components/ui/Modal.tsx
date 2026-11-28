"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  title?: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * 프로토타입의 모달. 바깥을 누르거나 Esc 를 누르면 닫힌다.
 * body 바로 아래에 그린다(포털): 부모에 transform·애니메이션이 있으면 position:fixed 가 화면이 아니라 그 부모 기준이 되어
 * 팝업이 지금 보고 있는 화면 가운데가 아닌 위·아래에 뜨기 때문.
 */
export function Modal({ title, wide, onClose, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const pressedOutside = useRef(false);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // onClose 가 렌더링마다 새로 만들어져도 리스너를 다시 달지 않도록 최신 값을 ref 로 들고 있는다
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  // 처음 열릴 때만 첫 입력칸에 포커스 (입력 중에 포커스가 튀지 않도록)
  useEffect(() => {
    if (!mounted) return;
    const first = box.current?.querySelector<HTMLElement>("input:not([type=file]):not([type=checkbox]):not([type=radio]),textarea,select");
    (first ?? box.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      // 모달이 겹쳐 있으면 가장 위의 것만 닫는다
      if (e.key !== "Escape") return;
      const overlays = document.querySelectorAll(".overlay");
      if (overlays[overlays.length - 1] === box.current?.parentElement) close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div
      className="overlay"
      onMouseDown={(e) => (pressedOutside.current = e.target === e.currentTarget)}
      onClick={(e) => e.target === e.currentTarget && pressedOutside.current && onClose()}
    >
      <div
        ref={box}
        className={"modal" + (wide ? " wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title && (
          <div className="modal-head">
            <h3 id={titleId}>{title}</h3>
            <button type="button" className="modal-x" aria-label="닫기" onClick={onClose}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
