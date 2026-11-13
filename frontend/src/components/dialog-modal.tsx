'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import {
  isDialogCloseButton,
  isDialogEscapeKey,
  shouldCloseFromOverlay,
} from '@/lib/dialog-modal';

type DialogModalProps = {
  id: string;
  title: string;
  isOpen: boolean;
  isDirty?: boolean;
  onClose: () => void;
  children: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DialogModal({
  id,
  title,
  isOpen,
  isDirty = false,
  onClose,
  children,
}: DialogModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const downTarget = useRef<EventTarget | null>(null);
  const closeRef = useRef(onClose);
  const dirtyRef = useRef(isDirty);

  useEffect(() => {
    closeRef.current = onClose;
    dirtyRef.current = isDirty;
  }, [isDirty, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    document.body.style.overflow = 'hidden';
    const first =
      dialog?.querySelector<HTMLElement>(
        '[data-dialog-autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      ) ?? dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();

    function requestClose() {
      if (
        dirtyRef.current &&
        !window.confirm('¿Descartar los cambios sin guardar?')
      )
        return;
      closeRef.current();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isDialogEscapeKey(event.key)) {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const activeItem = items.includes(document.activeElement as HTMLElement);
      if (
        event.shiftKey &&
        (!activeItem || document.activeElement === firstItem)
      ) {
        event.preventDefault();
        lastItem.focus();
      } else if (
        !event.shiftKey &&
        (!activeItem || document.activeElement === lastItem)
      ) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function requestClose() {
    if (isDirty && !window.confirm('¿Descartar los cambios sin guardar?'))
      return;
    onClose();
  }

  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6"
      onMouseDown={(event) => {
        downTarget.current = event.target;
      }}
      onMouseUp={(event) => {
        if (
          shouldCloseFromOverlay(
            downTarget.current,
            event.target,
            event.currentTarget,
          )
        )
          requestClose();
        downTarget.current = null;
      }}
    >
      <div
        ref={dialogRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className="w-full max-w-3xl rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl sm:p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={`${id}-title`} className="text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            data-dialog-close
            aria-label="Cerrar ventana"
            onClick={(event) => {
              if (isDialogCloseButton(event.currentTarget)) requestClose();
            }}
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-line text-xl"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
