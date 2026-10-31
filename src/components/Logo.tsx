/** The HackMate mark: a tilted "H" sticker (the same drawing as the favicon in brand/logo.svg). */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`grid h-8 w-8 -rotate-6 place-items-center rounded-lg border-(length:--line) border-border bg-warn-soft text-base font-bold text-text shadow-hard-sm ${className}`}>
      H
    </span>
  );
}
