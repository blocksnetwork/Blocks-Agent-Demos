# Design direction — Plant Doctor — drop a photo of a sick plant and an AI agent on the Blocks network diagnoses it: the page shows the photo, streams the agent's progress, then presents the diagnosis with confidence, visual evidence pinned to the leaf, and a numbered treatment plan. One-screen web app, not a marketing page. — botanical, clinical calm, editorial, warm daylight, trustworthy — Next.js + Tailwind 4

**Winner: Textured Botanical** (faithful) — structural fidelity 0.75, score 0.63.

Composition transferred from reference `18aa5bbbad4a` (A macro shot of a textured, cellular surface transitioning from matte green at the top to metallic silver at the bottom.); 2/5 principles verified in the render.

**The `blueprint` artifact is the page — build its composition, with its exact geometry. It outranks any layout habit.**

## The three comps

1. **Textured Botanical** (faithful, reference-transfer) — score 0.63 · structure 0.75 ★
2. **Warm Earthy** (bolder, reference-transfer) — score 0.52 · structure 0.64
3. **Flat Clinical** (unexpected, template-fallback) — score 0.29

Show the `comps` contact sheet to the user before building — a different pick means building that comp instead (each direction's spec provenance is in the kit).

## Apply, in order

1. Read `blueprint` (design-blueprint.md) end to end before writing markup.
2. Open `composition_html` (composition.html) — it is the winning composition as positioned HTML/CSS with the same geometry as the comp. Port it into your framework rather than re-inventing the layout.
3. Link `theme_css` after existing styles, then `motion_css`, then `motion_js` with `defer`.
4. Save `hero` as `public/hero.png` and `og` as `public/og.png` (wire the og:image meta tag).
5. Inline the `stickers` SVGs where the blueprint places floating elements — each gets `data-float`.
6. Install the fonts: `npm install @fontsource/fraunces @fontsource/inter` (or keep the Bunny `@import` in the theme).
7. Keep these credits where sourced photos appear: <a href="https://www.flickr.com/photos/80682954@N00/3572269673">Image by Nesster</a> (BY 2.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.flickr.com/photos/39351850@N00/1264763278">Image by Chiara Marra</a> (BY-ND 2.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.flickr.com/photos/37053660@N02/12104138256">Image by asdfjkl;!</a> (BY 2.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.flickr.com/photos/44461337@N06/4672217004">Image by gtall1</a> (BY 2.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.flickr.com/photos/97123293@N07/32374226635">Image by Swallowtail Garden Seeds</a> (BY 2.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.flickr.com/photos/136594255@N06/28731225733">Image by lisafree54</a> (CC0 1.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.flickr.com/photos/94852245@N00/8293544468">Image by seier+seier</a> (BY 2.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.flickr.com/photos/97425966@N05/9135832665">Image by maxmadesign.com</a> (BY 2.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.flickr.com/photos/9000052@N02/5331690612">Image by Rd. Vortex</a> (BY 2.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.flickr.com/photos/21649179@N00/2706704232">Image by fdecomite</a> (BY 2.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.rawpixel.com/image/6129307/frosted-glass-texture-background-green-design">Image by Ake</a> (CC0 1.0) via <a href="https://openverse.org">Openverse</a> · <a href="https://www.flickr.com/photos/28752865@N08/8625371588">Image by Karen Roe</a> (BY 2.0) via <a href="https://openverse.org">Openverse</a>

---
_Imagery: bank photograph `18aa5bbbad4a` gradient-mapped to the palette (<a href="https://www.flickr.com/photos/80682954@N00/3572269673">Image by Nesster</a> (BY 2.0) via <a href="https://openverse.org">Openverse</a>) · comps rendered with satori/resvg (MPL-2.0)_
