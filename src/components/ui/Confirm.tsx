"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
}

type Confirm = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);

/** `if (await confirm({ title, confirmLabel })) …` — the in-app replacement for window.confirm. */
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<Confirm>((o) => {
    resolver.current?.(false);
    setOpts(o);
    return new Promise((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  // Destructive by default, so start on the safe button. Runs after Dialog has called showModal.
  useEffect(() => {
    if (opts) cancelRef.current?.focus();
  }, [opts]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={opts != null}
        onClose={() => settle(false)}
        title={opts?.title ?? ""}
        footer={
          <>
            <Button ref={cancelRef} variant="ghost" onClick={() => settle(false)}>{opts?.cancelLabel ?? "Cancel"}</Button>
            <Button variant="danger" onClick={() => settle(true)}>{opts?.confirmLabel}</Button>
          </>
        }
      >
        {opts?.body && <p className="text-muted">{opts.body}</p>}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
