export type DialogCloseReason = 'close-button' | 'escape' | 'overlay';

export function isDialogEscapeKey(key: string): boolean {
  return key === 'Escape';
}

export function isDialogCloseButton(target: EventTarget | null): boolean {
  return (
    typeof target === 'object' &&
    target !== null &&
    'closest' in target &&
    typeof target.closest === 'function' &&
    target.closest('[data-dialog-close]') !== null
  );
}

export function shouldCloseFromOverlay(
  downTarget: EventTarget | null,
  upTarget: EventTarget | null,
  overlay: EventTarget,
): boolean {
  return downTarget === overlay && upTarget === overlay;
}

export function dashboardBackHref(): string {
  return '/dashboard';
}
