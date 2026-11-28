import type { ReactNode } from "react";

export type NavGlyphName =
  | 'home' | 'search' | 'cloud' | 'book' | 'checklist' | 'user' | 'settings'
  | 'book-stack' | 'check-circle' | 'info' | 'calendar-clock'
  | 'menu' | 'close' | 'chevron-left' | 'chevron-right';

export function NavGlyph({ name }: { name: NavGlyphName }) {
  const glyphs: Record<GlyphName, ReactNode> = {
    home: <><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5v10h5.2v-5.8h2.6v5.8h5.2v-10" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.5 4.5" /></>,
    cloud: <path d="M6.2 18.5h11.4a4 4 0 0 0 .5-8 6.3 6.3 0 0 0-12.1-1.3 4.7 4.7 0 0 0 .2 9.3Z" />,
    book: <><path d="M3.5 5.5c3.8-1.3 7.1-.6 8.5 1.2 1.4-1.8 4.7-2.5 8.5-1.2v13c-3.8-1.3-7.1-.6-8.5 1.2-1.4-1.8-4.7-2.5-8.5-1.2v-13Z" /><path d="M12 6.7v13" /></>,
    checklist: <><rect x="4" y="3.5" width="16" height="17" rx="2.2" /><path d="m7.2 8 1.2 1.2 2-2.2M12.8 8h4M7.2 13l1.2 1.2 2-2.2M12.8 13h4M7.5 17h9" /></>,
    user: <><circle cx="12" cy="8" r="3.3" /><path d="M5 20c.5-3.6 2.9-5.5 7-5.5s6.5 1.9 7 5.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.1 1.8-1.8 3.1-2.1-.5a7.8 7.8 0 0 1-1.7 1l-.5 2.1h-3.6l-.5-2.1a7.8 7.8 0 0 1-1.7-1l-2.1.5-1.8-3.1 1.1-1.8a7.4 7.4 0 0 1 0-2l-1.1-1.8 1.8-3.1 2.1.5a7.8 7.8 0 0 1 1.7-1l.5-2.1h3.6l.5 2.1a7.8 7.8 0 0 1 1.7 1l2.1-.5 1.8 3.1-1.1 1.8a7.4 7.4 0 0 1 .1 1.9Z" transform="translate(-.7 -1.5) scale(1.06)" /></>,
    'book-stack': <><path d="M4 5.5h13.5a2.5 2.5 0 0 1 2.5 2.5v11H6.5A2.5 2.5 0 0 1 4 16.5v-11Z" /><path d="M4 8H2.8v10a2 2 0 0 0 2 2H18M8 9h8M8 12.5h6" /></>,
    'check-circle': <><circle cx="12" cy="12" r="8.5" /><path d="m8 12.1 2.6 2.6 5.5-5.5" /></>,
    info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10.8v5M12 7.4h.01" /></>,
    'calendar-clock': <><rect x="3" y="4.5" width="13" height="15.5" rx="2" /><path d="M7 2.8v3.4M12 2.8v3.4M3 9h13M7 12.5h2M7 16h3" /><circle cx="17.3" cy="16.8" r="4" /><path d="M17.3 14.5v2.5l1.5 1" /></>,
    menu: <><path d="M4 6.5h16M4 12h16M4 17.5h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    'chevron-left': <path d="m14.5 5-7 7 7 7" />,
    'chevron-right': <path d="m9.5 5 7 7-7 7" />,
  };

  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{glyphs[name]}</svg>;
}

