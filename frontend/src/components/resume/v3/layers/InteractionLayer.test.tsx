// frontend/src/components/resume/v3/layers/InteractionLayer.test.tsx
//
// T29 — InteractionLayer tests.
//
// Coverage:
//   - drop indicator rendered at the position emitted by DragController
//   - no indicator when DragController has no active drag
//   - drag ghost rendered during active drag
//   - auto-scroll fires near top edge
//   - auto-scroll fires near bottom edge
//   - auto-scroll does NOT fire when cursor in middle
//   - unmounts cleanly on drag cancel (listeners removed)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as React from 'react';

import { InteractionLayer } from './InteractionLayer';
import type { DropIndicator } from '../interaction/DragController';
import type { RowId } from '../schema/types';

// ----- helpers -----

interface CanvasShape {
  top: number;
  left: number;
  width: number;
  height: number;
  scrollTop?: number;
}

function setRectFor(el: HTMLElement, rect: CanvasShape) {
  el.getBoundingClientRect = () =>
    ({
      top: rect.top,
      left: rect.left,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON() { return {}; },
    } as DOMRect);
}

function fireWindowPointerMove(clientX: number, clientY: number) {
  // jsdom-style — use MouseEvent but we only read clientX/Y
  const e = new MouseEvent('pointermove', { clientX, clientY, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  window.dispatchEvent(e);
}

function fireCanvasPointerMove(canvas: HTMLElement, clientX: number, clientY: number) {
  const e = new MouseEvent('pointermove', { clientX, clientY, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  canvas.dispatchEvent(e);
}

beforeEach(() => {
  // Stub rAF to run synchronously so auto-scroll effects are observable.
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: FrameRequestCallback) => {
      cb(performance.now());
      return 1;
    },
  );
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ----- tests -----

describe('InteractionLayer', () => {
  it('renders drop indicator at the position emitted by DragController', () => {
    const indicator: DropIndicator = { targetRowId: 'r1' as RowId, cursorY: 240 };
    const { container } = render(
      <InteractionLayer
        dropIndicator={indicator}
        draggedRowIds={[]}
        canvasRef={{ current: null }}
      />,
    );
    const indEl = container.querySelector('[data-v3-drop-indicator]') as HTMLElement | null;
    expect(indEl).not.toBeNull();
    expect(indEl!.style.top).toBe('240px');
  });

  it('does not render drop indicator when DragController has no active drag', () => {
    const { container } = render(
      <InteractionLayer
        dropIndicator={null}
        draggedRowIds={[]}
        canvasRef={{ current: null }}
      />,
    );
    expect(container.querySelector('[data-v3-drop-indicator]')).toBeNull();
  });

  it('renders drag ghost during active drag', () => {
    const indicator: DropIndicator = { targetRowId: 'r1' as RowId, cursorY: 100 };
    const { container } = render(
      <InteractionLayer
        dropIndicator={indicator}
        draggedRowIds={['r2' as RowId, 'r3' as RowId]}
        canvasRef={{ current: null }}
      />,
    );
    const ghost = container.querySelector('[data-v3-drag-ghost]');
    expect(ghost).not.toBeNull();
  });

  it('does not render drag ghost when no rows are being dragged', () => {
    const { container } = render(
      <InteractionLayer
        dropIndicator={null}
        draggedRowIds={[]}
        canvasRef={{ current: null }}
      />,
    );
    expect(container.querySelector('[data-v3-drag-ghost]')).toBeNull();
  });

  it('auto-scroll fires when cursor near top edge', () => {
    const canvas = document.createElement('div');
    document.body.appendChild(canvas);
    setRectFor(canvas, { top: 100, left: 0, width: 800, height: 600 });
    canvas.scrollTop = 200;
    const scrollSpy = vi.fn();
    canvas.scrollBy = scrollSpy as unknown as typeof canvas.scrollBy;

    const ref = { current: canvas };
    render(
      <InteractionLayer
        dropIndicator={{ targetRowId: 'r1' as RowId, cursorY: 110 }}
        draggedRowIds={['r2' as RowId]}
        canvasRef={ref}
      />,
    );

    // Cursor at clientY=110 → 10px from canvas top (within 50px threshold).
    act(() => {
      fireCanvasPointerMove(canvas, 400, 110);
    });

    expect(scrollSpy).toHaveBeenCalled();
    const arg = scrollSpy.mock.calls[0][0];
    // Scroll up = negative top.
    expect(arg.top).toBeLessThan(0);

    document.body.removeChild(canvas);
  });

  it('auto-scroll fires when cursor near bottom edge', () => {
    const canvas = document.createElement('div');
    document.body.appendChild(canvas);
    setRectFor(canvas, { top: 100, left: 0, width: 800, height: 600 });
    const scrollSpy = vi.fn();
    canvas.scrollBy = scrollSpy as unknown as typeof canvas.scrollBy;

    const ref = { current: canvas };
    render(
      <InteractionLayer
        dropIndicator={{ targetRowId: 'r1' as RowId, cursorY: 690 }}
        draggedRowIds={['r2' as RowId]}
        canvasRef={ref}
      />,
    );

    // bottom = top + height = 700. cursorY=690 → 10px from bottom.
    act(() => {
      fireCanvasPointerMove(canvas, 400, 690);
    });

    expect(scrollSpy).toHaveBeenCalled();
    const arg = scrollSpy.mock.calls[0][0];
    expect(arg.top).toBeGreaterThan(0);

    document.body.removeChild(canvas);
  });

  it('auto-scroll does NOT fire when cursor in middle', () => {
    const canvas = document.createElement('div');
    document.body.appendChild(canvas);
    setRectFor(canvas, { top: 100, left: 0, width: 800, height: 600 });
    const scrollSpy = vi.fn();
    canvas.scrollBy = scrollSpy as unknown as typeof canvas.scrollBy;

    const ref = { current: canvas };
    render(
      <InteractionLayer
        dropIndicator={{ targetRowId: 'r1' as RowId, cursorY: 400 }}
        draggedRowIds={['r2' as RowId]}
        canvasRef={ref}
      />,
    );

    act(() => {
      fireCanvasPointerMove(canvas, 400, 400);
    });

    expect(scrollSpy).not.toHaveBeenCalled();

    document.body.removeChild(canvas);
  });

  it('auto-scroll does NOT fire when no active drag (draggedRowIds empty)', () => {
    const canvas = document.createElement('div');
    document.body.appendChild(canvas);
    setRectFor(canvas, { top: 100, left: 0, width: 800, height: 600 });
    const scrollSpy = vi.fn();
    canvas.scrollBy = scrollSpy as unknown as typeof canvas.scrollBy;

    const ref = { current: canvas };
    render(
      <InteractionLayer
        dropIndicator={null}
        draggedRowIds={[]}
        canvasRef={ref}
      />,
    );

    act(() => {
      fireCanvasPointerMove(canvas, 400, 110); // near top
    });

    expect(scrollSpy).not.toHaveBeenCalled();

    document.body.removeChild(canvas);
  });

  it('unmounts cleanly on drag cancel — listeners removed', () => {
    const canvas = document.createElement('div');
    document.body.appendChild(canvas);
    setRectFor(canvas, { top: 100, left: 0, width: 800, height: 600 });
    const scrollSpy = vi.fn();
    canvas.scrollBy = scrollSpy as unknown as typeof canvas.scrollBy;

    const ref = { current: canvas };
    const { unmount } = render(
      <InteractionLayer
        dropIndicator={{ targetRowId: 'r1' as RowId, cursorY: 110 }}
        draggedRowIds={['r2' as RowId]}
        canvasRef={ref}
      />,
    );

    unmount();

    // After unmount the listener should be detached → scrollBy not called.
    fireCanvasPointerMove(canvas, 400, 110);
    expect(scrollSpy).not.toHaveBeenCalled();

    document.body.removeChild(canvas);
  });
});
