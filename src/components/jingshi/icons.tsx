/* icons.tsx — minimal line icons, 24x24, stroke=currentColor (from design handoff) */
import type { SVGProps, ReactElement } from "react";

type IconFn = (p: SVGProps<SVGSVGElement>) => ReactElement;

export const Ic: Record<string, IconFn> = {
  send: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M5 12h13M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  plus: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
  ),
  chev: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  close: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  refresh: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M20 12a8 8 0 11-2.3-5.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M20 4v4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  sun: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" /><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
  ),
  moon: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 1010.5 10.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
  ),
  lang: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3C9.5 5.5 9.5 18.5 12 21" stroke="currentColor" strokeWidth="1.5" /></svg>
  ),
  shield: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
  ),
  insight: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3a6 6 0 00-3 11.2V17h6v-2.8A6 6 0 0012 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M9.5 20h5M10 17v3M14 17v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  ),
  wind: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M3 8h10a3 3 0 10-3-3M3 12h15a3 3 0 11-3 3M3 16h8a2.5 2.5 0 11-2.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  leaf: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M5 19c0-8 6-13 14-14 0 8-5 14-14 14z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M5 19c3-5 6-7 10-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  ),
  clipboard: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><rect x="5" y="4" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M9 4a3 3 0 016 0M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  ),
  phone: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M6 3h3l1.5 5L8 9.5a12 12 0 006.5 6.5L16 14l5 1.5V19a2 2 0 01-2 2C10.7 21 3 13.3 3 5a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
  ),
  heart: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 20s-7-4.4-7-9.5A4 4 0 0112 7a4 4 0 017 3.5C19 15.6 12 20 12 20z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
  ),
  alert: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3l9.5 16.5H2.5L12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M12 9.5v4M12 16.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
  ),
  user: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" /><path d="M4.5 20a7.5 7.5 0 0115 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  ),
  lock: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><rect x="4.5" y="10" width="15" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.7" /></svg>
  ),
  hand: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1V4.5a1.5 1.5 0 013 0V11m0-.5a1.5 1.5 0 013 0V14c0 3.5-2.5 6-6 6s-5-2-6.5-4.5L6 13a1.5 1.5 0 012.5-1.6L9 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  image: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><circle cx="9" cy="9.5" r="1.6" fill="currentColor" /><path d="M4.5 17l4.5-4 3.5 3 3-2.5 4.5 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  video: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><rect x="3" y="6" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M16 10l5-3v10l-5-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
  ),
  thumbUp: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  thumbDown: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7L2.34 12.7a2 2 0 002 2.3H10z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M17 2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  trash: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}><path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-8 0v13a2 2 0 002 2h6a2 2 0 002-2V7M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  )
};
