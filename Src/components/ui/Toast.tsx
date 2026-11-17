"use client";

import { createContext, useCallback, useContext, useState, useTransition } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});

/** 화면 아래에 잠깐 뜨는 알림 (2.6초) */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);

  const show = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div id="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** 서버 액션이 돌려주는 값 */
export type ActionResult = { ok: boolean; message: string; id?: string };

/**
 * 서버 액션을 부르고 결과를 알림으로 보여 준다.
 *   const { pending, run } = useAction();
 *   run(() => saveSomething(...), (result) => 닫기);
 */
export function useAction() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>, onSuccess?: (result: ActionResult) => void) =>
    startTransition(async () => {
      try {
        const result = await action();
        toast(result.message);
        if (result.ok) onSuccess?.(result);
      } catch {
        toast("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });

  return { pending, run };
}
