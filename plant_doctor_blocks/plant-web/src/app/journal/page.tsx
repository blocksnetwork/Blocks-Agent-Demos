"use client";

import Link from "next/link";
import { useState } from "react";
import { MotionKit } from "./MotionKit";

/* Built to design-blueprint.md from design_blocks task 20c2f567:
   nav 64px · header-band ~280px · composer overlapping 32px · true
   timeline with rail + node dots · collection rail bleeding right ·
   minimal footer. Motion + stickers wired per the blueprint. */

const EVENT_KINDS = ["Watered", "Fed", "Repotted", "Diagnosis"] as const;
type EventKind = (typeof EVENT_KINDS)[number];

interface Entry {
  id: number;
  plant: string;
  date: string; // ISO day
  events: EventKind[];
  note: string;
}

const PLANTS = ["Monstera", "Fiddle-leaf fig", "Basil"];

const SEED: Entry[] = [
  {
    id: 4,
    plant: "Monstera",
    date: "2026-08-30",
    events: ["Watered"],
    note: "Soil was dry two knuckles down. New leaf almost fully unfurled.",
  },
  {
    id: 3,
    plant: "Fiddle-leaf fig",
    date: "2026-08-27",
    events: ["Diagnosis"],
    note: "Plant Doctor: likely overwatering — brown edges on the lower leaves. Holding off water for a week and moving it closer to the window.",
  },
  {
    id: 2,
    plant: "Basil",
    date: "2026-08-24",
    events: ["Watered", "Fed"],
    note: "Half-strength feed. Pinched the flower buds so it keeps producing leaves.",
  },
  {
    id: 1,
    plant: "Monstera",
    date: "2026-08-17",
    events: ["Repotted"],
    note: "Up one pot size, chunky aroid mix. Roots were circling the old pot.",
  },
];

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function Journal() {
  const [entries, setEntries] = useState<Entry[]>(SEED);
  const [plant, setPlant] = useState(PLANTS[0]);
  const [note, setNote] = useState("");
  const [events, setEvents] = useState<EventKind[]>([]);

  const toggleEvent = (kind: EventKind) =>
    setEvents((current) =>
      current.includes(kind)
        ? current.filter((entry) => entry !== kind)
        : [...current, kind],
    );

  const addEntry = () => {
    if (!note.trim() && events.length === 0) return;
    setEntries((current) => [
      {
        id: Date.now(),
        plant,
        date: new Date().toISOString().slice(0, 10),
        events,
        note: note.trim(),
      },
      ...current,
    ]);
    setNote("");
    setEvents([]);
  };

  return (
    <>
      {/* nav — slim, 64px; edge appears after 40px of scroll. */}
      <nav className="nav-scroll-edge sticky top-0 z-20 bg-[var(--design-bg)]">
        <div className="mx-auto flex h-16 max-w-[1060px] items-center justify-between px-6">
          <div className="font-[var(--design-font-display)] text-[20px] font-bold">
            Plant Journal
          </div>
          <div className="flex items-center gap-7">
            <a href="#timeline" className="nav-link hidden sm:block">
              <span className="underline-draw">Timeline</span>
            </a>
            <a href="#plants" className="nav-link hidden sm:block">
              <span className="underline-draw">Plants</span>
            </a>
            <Link href="/" className="nav-link hidden sm:block">
              <span className="underline-draw">Plant Doctor</span>
            </Link>
            <a href="#composer" className="btn btn-pill no-underline">
              New entry
            </a>
          </div>
        </div>
      </nav>

      {/* header-band — identity band ~280px, hero as background, name +
          purpose bottom-left on a scrim, stat chip floating right. */}
      <header className="relative h-[280px] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url(/journal-band.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(3,32,24,0.72)_0%,rgba(3,32,24,0.22)_55%,transparent_100%)]" />
        <div className="relative mx-auto flex h-full max-w-[1060px] items-end px-6 pb-14">
          <div className="on-scrim">
            <h1 className="!mb-1">Plant Journal</h1>
            <p className="!max-w-none text-[17px]">
              A field notebook for every plant you keep.
            </p>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/stickers/stat.svg"
          alt="This week: 12 entries"
          width={190}
          height={83}
          data-float
          data-float-rotate="2deg"
          className="absolute top-8 right-6 hidden md:block lg:right-14"
        />
      </header>

      <main className="mx-auto max-w-[1060px] px-6">
        {/* composer — the page's hero: elevated card overlapping the band
            above by 32px. */}
        <section
          id="composer"
          aria-label="New entry"
          className="relative z-10 -mt-8 scroll-mt-24"
        >
          <div className="relative rounded-[var(--design-radius)] bg-[var(--design-surface)] p-6 shadow-[0_18px_44px_rgba(15,15,20,0.10)] sm:p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/stickers/tag.svg"
              alt=""
              width={122}
              height={39}
              data-float
              data-float-rotate="-3deg"
              className="absolute -top-5 right-8 hidden sm:block"
            />
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  aria-label="Plant"
                  value={plant}
                  onChange={(event) => setPlant(event.target.value)}
                >
                  {PLANTS.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  {EVENT_KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className="chip"
                      aria-pressed={events.includes(kind)}
                      onClick={() => toggleEvent(kind)}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                aria-label="Note"
                rows={4}
                placeholder="What did you notice today? New growth, dry soil, a droopy leaf…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="flex items-center justify-between gap-4">
                <span
                  suppressHydrationWarning
                  className="text-[13px] text-[var(--design-muted)]"
                >
                  {formatDay(new Date().toISOString().slice(0, 10))} · logs to
                  the timeline below
                </span>
                <button type="button" onClick={addEntry}>
                  Add to journal
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* timeline — a true timeline: 2px rail, node dots, entries hanging
            off it; scrolling walks the history in. */}
        <section id="timeline" aria-label="Journal timeline" className="scroll-mt-24 pt-24 pb-12">
          <div className="relative mb-10">
            <h2 className="!mb-0" data-reveal>
              Timeline
            </h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/stickers/badge.svg"
              alt=""
              width={148}
              height={53}
              data-float
              data-float-rotate="3deg"
              className="absolute top-1 right-0 hidden sm:block"
            />
          </div>
          <ol
            data-reveal-group
            className="relative flex flex-col gap-6 border-l-2 border-[var(--design-border)] pl-8"
          >
            {entries.map((entry, index) => (
              <li key={entry.id} className="relative">
                <span className="absolute top-[22px] -left-[39px] size-3 rounded-full bg-[var(--design-primary)] ring-4 ring-[var(--design-bg)]" />
                <article
                  className={`entry-card hover-lift p-5 sm:p-6 ${index % 2 === 1 ? "tinted" : ""}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="entry-date">{formatDay(entry.date)}</span>
                    <span className="font-[var(--design-font-display)] text-[15px] font-semibold">
                      {entry.plant}
                    </span>
                    {entry.events.map((kind) => (
                      <span key={kind} className="tag">
                        {kind}
                      </span>
                    ))}
                  </div>
                  {entry.note && (
                    <p className="!max-w-none text-[16px] leading-relaxed">
                      {entry.note}
                    </p>
                  )}
                </article>
              </li>
            ))}
          </ol>
        </section>

        {/* collection-rail — horizontal scroll rail that bleeds off the
            right viewport edge to invite scrolling. */}
        <section id="plants" aria-label="Your plants" className="scroll-mt-24 pt-12 pb-24">
          <h2 data-reveal>Your plants</h2>
          <div className="-mr-6 overflow-hidden md:-mr-[max(24px,calc((100vw-1060px)/2+24px))]">
            <div className="rail pr-6" data-reveal-group>
              {PLANTS.map((name) => {
                const last = entries.find((entry) => entry.plant === name);
                const flagged = last?.events.includes("Diagnosis");
                return (
                  <div
                    key={name}
                    className="entry-card hover-lift w-[260px] p-5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-[var(--design-font-display)] text-[17px] font-semibold">
                        {name}
                      </span>
                      <span
                        className="size-2.5 flex-none rounded-full"
                        style={{
                          background: flagged
                            ? "#f5a036"
                            : "var(--design-primary)",
                        }}
                        title={
                          flagged ? "Recovering from a diagnosis" : "On track"
                        }
                      />
                    </div>
                    <div className="mt-2 text-[13px] text-[var(--design-muted)]">
                      {last
                        ? `${last.events.join(" · ") || "Note"} · ${formatDay(last.date)}`
                        : "No entries yet"}
                    </div>
                    <div className="mt-4 text-[13px]">
                      <Link href="/">
                        <span className="underline-draw">Check with Plant Doctor</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* footer — minimal: wordmark, 3 links, credit line. */}
      <footer className="border-t border-[var(--design-border)]">
        <div className="mx-auto flex max-w-[1060px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-[14px] text-[var(--design-muted)]">
          <span className="font-[var(--design-font-display)] font-semibold text-[var(--design-text)]">
            Plant Journal
          </span>
          <div className="flex gap-6">
            <a href="#timeline">Timeline</a>
            <a href="#plants">Plants</a>
            <Link href="/">Plant Doctor</Link>
          </div>
          <span>
            Design by design_blocks on the Blocks network · Header{" "}
            <a href="https://www.flickr.com/photos/97123293@N07/32374226635">
              photo by Swallowtail Garden Seeds
            </a>{" "}
            (CC BY 2.0) via{" "}
            <a href="https://openverse.org">Openverse</a>
          </span>
        </div>
      </footer>

      <MotionKit />
    </>
  );
}
