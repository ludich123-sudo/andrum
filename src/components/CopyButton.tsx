'use client';

import { useState } from 'react';

export default function CopyButton({ text, label = 'Kopiera' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* markera texten manuellt */
        }
      }}
    >
      {done ? '✓ Kopierat' : label}
    </button>
  );
}
