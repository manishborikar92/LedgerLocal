'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Close } from './icons';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Native <dialog>: built-in focus trap, Esc to close and inert background. */
export function Dialog({ open, onClose, title, children, footer, wide }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    // Backdrop click is a mouse-only convenience; keyboard users close with Esc or the Close button.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} className={wide ? 'max-w-[min(960px,96vw)]' : undefined}>
      {open && (
        <>
          <div className="dlg-h">
            <h2 id={titleId} className="text-xl">{title}</h2>
            <button className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Close dialog"><Close /></button>
          </div>
          <div className="dlg-b">{children}</div>
          {footer && <div className="dlg-f">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
