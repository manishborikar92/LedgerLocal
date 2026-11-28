import type { ReactNode } from 'react';

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;
const I = ({ children, size = 18 }: { children: ReactNode; size?: number }) => <svg {...base} width={size} height={size}>{children}</svg>;

export const Logo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
    <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--accent)" />
    <path d="M8 11h16M8 16h16M8 21h8" stroke="var(--accent-fg)" strokeWidth="1.6" strokeLinecap="round" opacity=".45" />
    <path d="M16 21.5l3.5 3.5 6.5-8.5" stroke="var(--accent-fg)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const Shield = () => <I><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></I>;
export const Sun = () => <I><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>;
export const Moon = () => <I><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" /></I>;
export const Monitor = () => <I><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></I>;
export const Upload = ({ size }: { size?: number }) => <I size={size}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></I>;
export const Undo = () => <I><path d="M9 14L4 9l5-5" /><path d="M4 9h9a6 6 0 010 12h-3" /></I>;
export const Redo = () => <I><path d="M15 14l5-5-5-5" /><path d="M20 9h-9a6 6 0 000 12h3" /></I>;
export const Download = () => <I><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></I>;
export const Plus = () => <I><path d="M12 5v14M5 12h14" /></I>;
export const Trash = () => <I><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></I>;
export const Split = () => <I><path d="M12 3v6M12 9l-6 6v6M12 9l6 6v6" /></I>;
export const Merge = () => <I><path d="M6 3v6l6 6v6M18 3v6l-6 6" /></I>;
export const Flip = () => <I><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" /></I>;
export const Columns = () => <I><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></I>;
export const Warn = () => <I><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></I>;
export const Lock = () => <I><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></I>;
export const Help = () => <I><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2M12 17h.01" /></I>;
export const Close = () => <I><path d="M6 6l12 12M18 6L6 18" /></I>;
export const Folder = () => <I><path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" /></I>;
export const File = () => <I><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5" /></I>;
export const Printer = () => <I><path d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2" /><rect x="7" y="14" width="10" height="7" /></I>;
export const Check = () => <I><path d="M5 12l5 5 9-11" /></I>;
export const ChevronLeft = () => <I><path d="M15 5l-7 7 7 7" /></I>;
export const ChevronRight = () => <I><path d="M9 5l7 7-7 7" /></I>;
export const Minus = () => <I><path d="M5 12h14" /></I>;
