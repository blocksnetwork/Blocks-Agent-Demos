"use client";

import { useState } from "react";
import Picker from "./Picker";
import ResultCard from "./ResultCard";
import { categories, ideasForCategory, type Category, type Idea } from "@/lib/ideas";

type Result = { category: Category; idea: Idea };

function pickIdea(categoryId: string, avoid?: string): Idea {
  const pool = ideasForCategory(categoryId);
  const options = pool.length > 1 ? pool.filter((idea) => idea.title !== avoid) : pool;
  return options[Math.floor(Math.random() * options.length)];
}

export default function SpinStage() {
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);

  function record(next: Result) {
    setResult(next);
    setHistory((prev) => [next, ...prev].slice(0, 5));
  }

  function land(index: number) {
    const category = categories[index];
    setRolling(false);
    record({ category, idea: pickIdea(category.id) });
  }

  function reroll() {
    if (!result) return;
    record({
      category: result.category,
      idea: pickIdea(result.category.id, result.idea.title),
    });
  }

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[520px_minmax(0,1fr)] lg:gap-20">
      <div className="flex justify-center">
        <Picker
          busy={rolling}
          onSpinStart={() => {
            setRolling(true);
            setResult(null);
          }}
          onLand={land}
        />
      </div>

      <div>
        {result ? (
          <ResultCard category={result.category} idea={result.idea} onReroll={reroll} />
        ) : (
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
              {rolling ? "Rolling" : "Step one"}
            </p>
            <h2 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl">
              {rolling ? "Finding your build..." : "Spin for the product."}
            </h2>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-pretty text-muted">
              Every idea is a real problem somebody already pays to solve. Once it
              lands, go find an open model that can do the job.
            </p>
          </div>
        )}

        {history.length > 1 && (
          <div className="animate-fade mt-8">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
              Previous spins
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {history.slice(1).map((entry, index) => (
                <li
                  key={`${entry.idea.title}-${index}`}
                  className="inline-flex items-center gap-2 rounded-full bg-elevated px-3 py-1.5 text-xs text-muted"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: entry.category.color }}
                  />
                  {entry.idea.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
