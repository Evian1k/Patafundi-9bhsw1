/**
 * Accessibility utilities (master prompt §61):
 *  - SkipToContent: first-focusable link on every layout, jumps past the nav.
 *  - useModalA11y: Escape-to-close + initial focus + aria wiring for the
 *    hand-rolled modals that don't use Radix dialog.
 */
import { useEffect, useRef } from "react";

export function SkipToContent({ targetId = "main-content" }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-3 focus:left-3 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
    >
      Skip to main content
    </a>
  );
}

/**
 * Wire a custom modal/overlay with the essentials:
 *  - role="dialog" + aria-modal are set by the caller on the element.
 *  - Escape closes.
 *  - Focus moves into the dialog on open and is restored on close.
 * Returns the ref to attach to the dialog element.
 */
export function useModalA11y(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const node = ref.current;
    // Focus the first focusable element inside the dialog (or the dialog itself).
    const focusables = node?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    (focusables && focusables.length > 0 ? focusables[0] : node)?.focus?.();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      // Minimal focus trap: keep Tab cycling inside the dialog.
      if (e.key === "Tab" && node) {
        const items = node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}
