import type { ReactNode } from 'react';

/** Full-row disclosure target, with help kept as a separate sibling button. */
export function DockSectionHeader({ title, open, onToggle, controls, accessory }: {
  title: string; open: boolean; onToggle: () => void; controls: string; accessory?: ReactNode;
}) {
  return (
    <div className={`-mx-2.5 -mt-2.5 flex items-center pr-2.5 ${open ? 'mb-2.5 border-b border-white/10' : '-mb-2.5'}`}>
      <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle}
        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded px-2.5 text-left text-plate text-white/65 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-signal">
        <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-white/40">
          <path d={open ? 'M3 4.5 6 7.5 9 4.5' : 'M4.5 3 7.5 6 4.5 9'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{title}</span>
      </button>
      {accessory}
    </div>
  );
}
