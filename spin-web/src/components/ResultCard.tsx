"use client";

import { useState } from "react";
import type { Category, Idea } from "@/lib/ideas";

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1.5 text-base text-fg/90">{value}</dd>
    </div>
  );
}

export default function ResultCard({
  category,
  idea,
  onReroll,
}: {
  category: Category;
  idea: Idea;
  onReroll: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const hfUrl = `https://huggingface.co/${idea.modelId}`;

  async function copyBrief() {
    const brief = [
      `${idea.title} (${category.label})`,
      "",
      idea.pitch,
      "",
      `Who pays: ${idea.buyer}`,
      `Model: ${idea.model}`,
      `On the T4: ${idea.fit}`,
      `Weights: ${hfUrl}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article key={idea.title} className="animate-rise">
      <div className="flex items-center gap-3">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: category.color }}
        />
        <span className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
          {category.label}
        </span>
      </div>

      <h2 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl">
        {idea.title}
      </h2>
      <p className="mt-4 max-w-lg text-lg leading-relaxed text-pretty text-muted">
        {idea.pitch}
      </p>

      <dl className="mt-9 grid max-w-lg gap-6 sm:grid-cols-2">
        <Line label="Who pays" value={idea.buyer} />
        <Line label="Model" value={idea.model} />
        <Line label="On the T4" value={idea.fit} />
      </dl>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <a
          href={hfUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-ink transition hover:bg-[#d4fa6a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open {idea.modelId.split("/")[1]}
        </a>
        <button
          onClick={copyBrief}
          className="inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-muted transition hover:text-fg"
        >
          {copied ? "Copied" : "Copy brief"}
        </button>
        <button
          onClick={onReroll}
          className="inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-muted transition hover:text-fg"
        >
          Another one
        </button>
      </div>
    </article>
  );
}
