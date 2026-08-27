/**
 * The four button shapes the design uses, named once.
 *
 * The layout is otherwise deliberately un-abstracted — it is a different
 * composition on every screen — but these repeat on nearly all of them, and a
 * hover colour that drifts between screens is exactly the kind of thing that
 * makes an editorial layout look assembled rather than drawn.
 */

/** Filled, full width. The one thing to do on the screen. */
export const PRIMARY_WIDE =
  "w-full cursor-pointer rounded-[2px] border-none bg-accent px-0 py-[26px] font-mono text-[13px] tracking-[0.18em] uppercase text-white transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-accent-deep";

/** Filled, inline. */
export const PRIMARY =
  "cursor-pointer rounded-[2px] border-none bg-accent px-[30px] py-[18px] font-mono text-[12px] tracking-[0.14em] uppercase text-white transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-accent-deep";

/** Filled dark. Used only for Stop, which is not the accent action. */
export const PRIMARY_DARK =
  "flex-1 cursor-pointer rounded-[2px] border-none bg-ink px-0 py-[26px] font-mono text-[13px] tracking-[0.18em] uppercase text-white";

/** An underlined word. Everything secondary. */
export const GHOST =
  "cursor-pointer border-none border-b border-b-[rgb(17_24_21/0.22)] bg-transparent p-0 text-[15px] text-mute transition-colors duration-[180ms] hover:text-ink";

/** An underlined word in mono small caps, for corners and captions. */
export const GHOST_LABEL =
  "cursor-pointer border-none border-b border-b-[rgb(17_24_21/0.22)] bg-transparent p-0 font-mono text-[12px] tracking-[0.1em] uppercase text-mute transition-colors duration-[180ms] hover:text-ink";

/** A 40px square transport control. */
export const TRANSPORT =
  "size-10 flex-none cursor-pointer rounded-[2px] border text-[13px] transition-colors duration-[180ms]";
