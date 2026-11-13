import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dashboardBackHref,
  isDialogCloseButton,
  isDialogEscapeKey,
  shouldCloseFromOverlay,
} from '../src/lib/dialog-modal';

test('dialog closes from Escape but not unrelated keys', () => {
  assert.equal(isDialogEscapeKey('Escape'), true);
  assert.equal(isDialogEscapeKey('Enter'), false);
});

test('dialog close button is recognized', () => {
  assert.equal(
    isDialogCloseButton({ closest: () => ({}) } as unknown as EventTarget),
    true,
  );
  assert.equal(
    isDialogCloseButton({ closest: () => null } as unknown as EventTarget),
    false,
  );
});

test('dialog overlay closes only when pointer starts and ends on the overlay', () => {
  const overlay = {} as EventTarget;
  const dialog = {} as EventTarget;
  assert.equal(shouldCloseFromOverlay(overlay, overlay, overlay), true);
  assert.equal(shouldCloseFromOverlay(overlay, dialog, overlay), false);
  assert.equal(shouldCloseFromOverlay(dialog, overlay, overlay), false);
});

test('settings back navigation returns to dashboard', () => {
  assert.equal(dashboardBackHref(), '/dashboard');
});
