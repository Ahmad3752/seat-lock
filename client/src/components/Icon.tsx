import type { CSSProperties } from "react";

type IconName = "ticket" | "search" | "calendar" | "pin" | "arrow" | "external" | "grid" | "venue" | "shield" | "user" | "logout" | "check" | "clock";
const paths: Record<IconName, string> = {
  ticket: "M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V5Zm10 0v3m0 3v2m0 3v3",
  search: "m21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z",
  calendar: "M4 5h16v16H4V5Zm0 5h16M8 3v4m8-4v4M8 14h2m4 0h2m-8 3h2",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  venue: "M3 21h18M5 21V9l7-6 7 6v12M9 21v-6h6v6M9 10h.01M15 10h.01",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
  user: "M20 21v-2a8 8 0 0 0-16 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  logout: "M9 3H3v18h6m6-14 5 5-5 5m-7-5h12",
  check: "m5 12 4 4L19 6",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
};

/** Decorative icons inherit their accessible meaning from adjacent labels. */
export function Icon({ name, className = "", style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return <svg className={`icon ${className}`} style={style} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function BrandMark() { return <span className="brand-mark"><Icon name="ticket" /></span>; }
export function TicketArtwork() {
  return <div className="ticket-artwork" aria-hidden="true">
    <div className="artwork-orbit" /><div className="artwork-orbit artwork-orbit-two" />
    <div className="artwork-ticket artwork-ticket-back"><Icon name="ticket" /><span>MAKE IT<br />MEMORABLE.</span></div>
    <div className="artwork-ticket artwork-ticket-front">
      <div className="artwork-ticket-top"><Icon name="ticket" /><span>SeatLock</span><Icon name="arrow" /></div>
      <div className="artwork-ticket-title">Good times.<br />Great seats.</div>
      <div className="artwork-ticket-stub"><span>YOUR NEXT EXPERIENCE</span><div className="ticket-barcode" /><Icon name="arrow" /></div>
    </div>
  </div>;
}
