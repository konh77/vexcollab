/*
 * VEXCollab - close an overlay by clicking its backdrop, without eating drags.
 * Licensed under AGPL-3.0-only.
 */
'use client';

import { useRef, type MouseEvent } from 'react';

/**
 * A backdrop `onClick` fires whenever a press and its release land on
 * different elements and their common ancestor is the backdrop. Drag-select
 * text inside an input and let go over the dimmed area -- the most natural way
 * to select -- and the browser reports a click on the backdrop, closing the
 * sheet mid-selection.
 *
 * Closing only when the press *started* on the backdrop as well as ending there
 * keeps real backdrop clicks working and lets a drag that began inside the
 * sheet finish wherever the pointer ends up.
 */
export function useBackdropClose(onClose: () => void) {
  const pressedOnBackdrop = useRef(false);

  return {
    onMouseDown: (event: MouseEvent<HTMLElement>) => {
      pressedOnBackdrop.current = event.target === event.currentTarget;
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      const close = pressedOnBackdrop.current && event.target === event.currentTarget;
      pressedOnBackdrop.current = false;
      if (close) onClose();
    },
  };
}
