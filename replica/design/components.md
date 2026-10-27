# HackMate components

Built from `replica/recon.md` (component list and screen IDs) and HackMate's existing `globals.css`.
`replica/screens/` had no screenshots when this was written, so the scale is measured from how the code
already uses it (146× `text-xs`, 136× `text-sm`, 47× `rounded-lg`…) and snapped to one system. It is not
measured from the reference apps. When screenshots are added, check density against Linear and GitHub.

Live sheet: **`/design`** (light / dark / system toggle). Code: `src/components/ui/`.

## Foundations

| | rule |
| --- | --- |
| Colour | Roles only (`bg-surface`, `text-muted`, `bg-danger-soft`…). No raw hex or Tailwind palette colours (`text-white`, `#16a34a`) in components. Status colour always comes from `ui/tone.ts`. |
| Themes | Light and dark from `tokens.json`. Follows the OS by default; `<html data-theme="light|dark">` overrides it. `color-scheme` is set, so native selects, date pickers and scrollbars follow the theme. |
| Type | Geist (SIL OFL). Body and controls are `text-sm`. Meta is `text-xs`. Page title is `text-2xl font-semibold tracking-tight`. Numbers use `tabular-nums`. `text-2xs` (11px) is the floor: no `text-[10px]`. |
| Radius | `rounded-md` badges, kbd, calendar chips · `rounded-lg` buttons, inputs, menus, rows · `rounded-xl` cards, panels, map · `rounded-2xl` dialogs, drawers · `rounded-full` chips, pills. No bare `rounded`. |
| Elevation | Cards are flat: a border, no shadow. Only layers that float over content (dialogs, toasts, menus, map popups and legend) use `shadow-pop`. |
| Focus | One global `:focus-visible` ring: 2px `--focus`, 2px offset, keyboard only. Inputs show focus as an accent border plus a 1px ring. Never `outline-none` without a replacement. |
| Motion | `duration-(--dur-fast)` (120ms) for colour changes, `--dur-base` (200ms) for overlays. `prefers-reduced-motion` cuts all of it. |
| Icons | Lucide (ISC licence), `size-4` inline, `size-3` in badges, `aria-hidden` unless the icon is the only content. **No emoji as icons**; see the migration list at the end. |
| Layering | Leaflet uses z 400–1000 inside its box. Sticky nav `--z-sticky` 1000, drawer 1100, dialog 1200, toast 1300. |
| Status needs more than colour | Every pass/warn/fail/overdue state also carries an icon or a word. |

## Primitives (built)

```
Button                                                    ui/Button.tsx · utilities btn, btn-*
  variants  default (outlined surface), primary, ghost, danger
  sizes     sm 28px (btn-sm), md 32px (btn); icon-only square (btn-icon)
  states    default, hover (surface-2 / accent-hover / danger-soft), focus-visible ring,
            disabled (50%, no pointer), loading (spinner replaces icon, aria-busy, label kept)
  tokens    radius lg, text sm/500, accent / accent-text / accent-hover
  a11y      real <button type="button">; IconButton requires `label` (aria-label + title)
  used on   all

Input / Select / Textarea                                 utility input
  states    default (border-strong, 3.0:1+), hover (muted), focus (accent border + ring),
            disabled, invalid (aria-invalid → danger border), placeholder (muted)
  a11y      always labelled through Field; errors linked with aria-describedby
  used on   S01, S05–S11, S19

Field                                                     ui/Form.tsx
  parts     label (utility label) · control (render prop gets id, aria-describedby, aria-invalid) · hint | error
  states    hint, error (replaces the hint, text-danger)

ChipToggle                                                ui/Form.tsx · utilities chip, chip-on
  states    off (muted, hover text), on (accent-soft + accent border), focus-visible
  a11y      <button aria-pressed>
  used on   S01 themes and sources, S11 result, S19 reminder lead times

Tabs                                                      ui/Tabs.tsx
  states    selected (accent underline, text, 500), unselected (muted, hover text), focus-visible
  extras    optional badge per tab (CountPill)
  a11y      role=tablist/tab, aria-selected, roving tabindex, ←/→/Home/End
  used on   S02 hackathon sections, S14–S18 profile sections

Segmented                                                 ui/Tabs.tsx
  a11y      role=radiogroup/radio, aria-checked, roving tabindex, arrow keys
  used on   S01 split / list / map, /design theme switch

Badge · CountPill · ScoreBadge                            ui/Feedback.tsx
  tones     neutral, accent, ok, warn, danger (SOFT map in tone.ts)
  score     8+ ok · 5+ warn · below 5 danger, same everywhere (ideas, pitch roast, Q&A)
  sizes     ScoreBadge sm (inline chip), lg (headline score)
  used on   S05, S07, S08, S12, S17, Nav

CheckRow · CheckSummary                                   ui/Feedback.tsx
  status    pass (CircleCheck, ok), warn (TriangleAlert), fail (CircleX, danger), info (Info, neutral)
  summary   "2 failing · 1 warning · 8 passing", worst first, tinted by the worst result
  a11y      status word in sr-only text; summary is role=status
  used on   S09 (live), S12 tracker badge (planned)

Banner                                                    ui/Feedback.tsx
  tones     neutral, ok, warn, danger, optional action button
  a11y      danger → role=alert, others → role=status
  used on   S01 feed failure, S02 AI not configured, S19 SMTP missing

Countdown                                                 ui/Countdown.tsx
  states    on the app's one urgency scale (lib/format `urgency()`): > 7 days neutral "9d 0h" ·
            ≤ 7 days warn "4d 11h" · < 48 h danger "11h 50m", counts seconds in the last hour ·
            past → "Overdue". Done deadlines show no countdown.
  a11y      <time dateTime>, full local date in title; renders "…" on the server (no hydration mismatch)
  used on   S01 card (registration closes), S12 card (next deadline), S13 upcoming list, DeadlineEditor

Skeleton · Spinner · EmptyState · Kbd                     ui/Feedback.tsx
  EmptyState  icon tile, title (xl), one line of help (muted), one action
  Skeleton    rounded-xl surface-2 pulse, aria-hidden
  used on   S01, S02, S12 empty, S15 empty

Dialog                                                    ui/Dialog.tsx
  parts     title bar with close · body · optional footer (actions right, primary last)
  states    open (scrim --scrim, shadow-pop, rounded-2xl), closed
  a11y      native <dialog> showModal: focus trap, Escape, focus returns to the opener;
            aria-labelledby the title; click on the scrim closes
  used on   ConfirmProvider, S20 command palette shell

Confirm (useConfirm)                                      ui/Confirm.tsx · mounted once in layout.tsx
  call      `if (await confirm({ title, body, confirmLabel })) remove()` — resolves true or false
  layout    Dialog with body text (muted), footer: ghost Cancel, danger confirm button
  states    open, cancelled (Escape, Cancel, scrim click or a newer confirm → false), confirmed (true)
  focus     starts on Cancel (the safe choice), returns to the button that opened it
  copy      title asks the question ("Delete this idea?"); body says what is lost; button names the action
  used on   S12 remove from tracker, S05 idea, S09 checklist item, S10 voice note, S16 certificate, S17 prize

Toast                                                     ui/Toast.tsx
  tones     info (4 s, 8 s with Undo), error (stays until dismissed, role=alert)
  a11y      aria-live=polite region, max 3 visible, dismiss button labelled
  used on   S12 optimistic moves with Undo, S17 status changes (planned)
```

## App components (existing, now on tokens)

| component | variants / states | tokens it must use | screens |
| --- | --- | --- | --- |
| Nav | active link (surface-2), count pill (accent tracked, danger clashes), error strip | `bg-bg/90` blur, `--z-sticky` | all |
| HackathonCard | default, selected (accent ring), tracked, clash warning, reg countdown | card, Badge for mode, Countdown | S01 |
| MapView | pin offline (accent), hybrid (warn), tracked (ok), selected (bigger); legend | tokens resolved with `cssVar()` because Leaflet writes SVG attributes | S01 |
| Calendar month grid | today, selected (accent-soft), clash day (danger-soft), event bars | `EVENT_COLORS` (8 AA-safe colours, `text-on-event`), `text-2xs` | S13 |
| TrackerCard | per-stage action, next deadline, clash badge, result badge | Badge, Countdown, CheckSummary (planned) | S12 |
| DeadlineEditor | auto (from feed), custom, done | input, btn-sm | S03, S13 |
| ClashList | empty, list | Banner-style rows, danger tone | S12, S13 |
| CalendarSync | public URL missing (warn) | Banner | S13 |
| PrizeList row | won (warn), claimed (accent), paid (ok), overdue text | `SOFT` from tone.ts | S11, S17 |
| CertificateList | pending, received | Badge | S11, S16 |
| ProjectCard / Tile / RankList / bars | empty, filled | card, `text-3xl tabular-nums` for tiles | S14, S15 |
| CopyButton | idle, copied | Button sm | S06, S09 |

## Planned (spec only, from the recon)

```
CommandPalette (S20)   Dialog shell at the top · input · grouped results · ↑/↓ moves, Enter opens, Esc closes ·
                       role=combobox + listbox · Cmd+K / Ctrl+K anywhere · empty and no-match states
Draggable board (S12)  card grabbed (shadow-pop, slight scale) · drop target column (accent-soft) ·
                       keyboard: Space lifts, ←/→ change column, Space drops, Esc cancels · announces moves
                       via aria-live · every move gives a Toast with Undo
Removable filter chips (S01)  chip-on + X button labelled "Remove <filter>" · "Clear all" at the end
Citation chip (S04)    superscript [n] button (accent, rounded-md) · opens a popover with the quoted rule passage ·
                       sources panel lists all quotes · keyboard reachable
Peek drawer (S25)      right drawer, rounded-2xl left corners, --z-drawer, Esc closes, focus trapped
Activity heatmap (S14) 7 rows × 53 weeks · 5 steps from surface-2 to accent · each cell has a title and an
                       aria-label count · legend "Less … More"
Score ring / result screen (S22)  big ScoreBadge + per-question chips + streak · "Retry weak answers" primary
Version diff (S05)     inline: additions ok-soft, removals danger-soft + line-through; word-level
```

## Migration list (for /replica-build)

Done in this pass:
- Tokens moved into `tokens.json` → `src/app/tokens.css`. `globals.css` keeps only the utilities.
- Fixed the 4 AA failures in the old palette: light danger 4.23 → 5.02 on its soft background, ok 4.49 → 4.85,
  warn 4.36 → 5.11 on surface-2, input border 1.31 → 3.1+ (new `border-strong`).
- Calendar palette: 4 of 8 colours failed with white text. Now 8 AA-safe `--event-*` tokens.
- Map pins and legend read the theme tokens; the map is no longer stuck on light-mode greens in dark mode.
- One score scale (`scoreTone`) used by Ideas, Pitch and Q&A. Prize statuses use the same `SOFT` map.
- Submit checks use `CheckRow` with icons, plus the new `CheckSummary` count line.
- Hackathon and Profile tab bars use `Tabs` (keyboard support). Discover's view switch uses `Segmented`.
- `text-[10px]` → `text-2xs` (6×), bare `rounded` → `rounded-md` (15×), selected chips → `chip-on` (4×).
- Global focus ring, reduced-motion, `color-scheme`, themed Leaflet popups.
- Emoji icons → Lucide across 17 files: Pin, Check, Trophy, TriangleAlert, OctagonX, Info, Clock, Timer,
  ScrollText, Sparkles, Flame, Mic, Video, FileText, User, RefreshCw, Star, X. Icon-only controls got an
  sr-only label. Hover-only delete buttons now also show on keyboard focus. Rating stars got `aria-pressed`.
  The Tracker and solo-team empty states use `EmptyState`, which now takes `level={1}` for whole-page states.
  New `Stars` display for retro ratings.
- All 6 `window.confirm` calls → `useConfirm()` (Dialog), with copy that says what each delete removes.
- Hand-written badges → `Badge` (mode, result, invited, criteria weight, "from rules", required-done count,
  outbox status, idea version scores, clash marker), score pills → `ScoreBadge`, nav counts → `CountPill`
  with labels ("2 active", "3 clashes"). Mode and result colours are now `Tone` maps, not class strings.
- Upcoming deadline text → `Countdown` on Discover cards, Tracker cards, the calendar's upcoming list and
  DeadlineEditor. Past-time text ("updated 2h ago", "started 3 days ago") stays as `relative()`, and so do
  the Overview key dates, which mix past and future.
- Emoji kept on purpose: text that leaves the app (iCal event titles in `lib/ics.ts`, the Google Calendar link
  in CalendarView, the teammate post in `lib/team.ts`, the test email). Lucide can't render there.
  Arrows in link text (↗ → ←) stay as text.

Still to do (not done here):
- Long arbitrary grid templates (`grid-cols-[minmax(0,1fr)_380px]`, 5 variants) → one `--side-panel` width.
