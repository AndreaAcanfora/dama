import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/** A modal panel built on <dialog>, so focus trapping and Escape come from the browser. */
export function Sheet({ title, closeLabel, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet-body">
        <h2>{title}</h2>
        {children}
        <button type="button" className="secondary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </dialog>
  );
}
