"use client";

import { useEffect, useRef } from "react";

interface Props {
  title?: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** 프로토타입의 모달. 바깥을 누르거나 Esc 를 누르면 닫힌다. */
export function Modal({ title, wide, onClose, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const pressedOutside = useRef(false);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>("input,textarea,select")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => (pressedOutside.current = e.target === e.currentTarget)}
      onClick={(e) => e.target === e.currentTarget && pressedOutside.current && onClose()}
    >
      <div ref={box} className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true">
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}
