/** Original trail-and-mountain mark, shared by the welcome page and conversation. */
export default function OutdoorMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden className={className}>
      <rect width="40" height="40" rx="13" fill="currentColor" />
      <path d="m8 27 9-15 6 9 3-5 7 11" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m15 27 3-4 3 4" stroke="var(--trail)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="28" cy="11" r="2.5" fill="var(--trail)" />
    </svg>
  );
}
