# spin-web

A one-page app for picking what to build next: twelve categories of product ideas,
each paired with an open-weights model that fits on a single GPU and a note on its
VRAM footprint.

```bash
npm install
npm run dev     # http://localhost:3000
```

Ideas and their model pairings live in [`src/lib/ideas.ts`](./src/lib/ideas.ts) —
add to the `ideas` array to extend the pool. Built with Next.js 16, React 19, and
Tailwind 4.

Part of [Blocks Agent Demos](../README.md).
