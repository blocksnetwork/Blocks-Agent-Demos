#!/usr/bin/env bash
# Screenshot permissively licensed page designs into an ingest folder, so
# the bank holds actual UI compositions to transfer from (photography is
# imagery, not a composition teacher). Runs headless Chrome at a desktop
# viewport; first-screen crops are what the decomposer needs.
#
#   bash tools/shoot-refs.sh [out-dir]   (default ./inspo-ui)
#
# Add or remove lines in REFS; keep the licence column honest — it lands
# in credits.json and travels with every board the reference appears on.
set -uo pipefail

OUT="${1:-./inspo-ui}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
mkdir -p "$OUT"

# name|url|credit html|source
REFS=(
  "shadcn-dashboard|https://ui.shadcn.com/examples/dashboard|<a href=\"https://ui.shadcn.com\">shadcn/ui dashboard example</a> (MIT)|shadcn"
  "shadcn-cards|https://ui.shadcn.com/examples/cards|<a href=\"https://ui.shadcn.com\">shadcn/ui cards example</a> (MIT)|shadcn"
  "shadcn-tasks|https://ui.shadcn.com/examples/tasks|<a href=\"https://ui.shadcn.com\">shadcn/ui tasks example</a> (MIT)|shadcn"
  "shadcn-dashboard-01|https://ui.shadcn.com/view/dashboard-01|<a href=\"https://ui.shadcn.com/blocks\">shadcn/ui dashboard-01 block</a> (MIT)|shadcn"
  "tabler-preview|https://preview.tabler.io/|<a href=\"https://tabler.io\">Tabler admin template</a> (MIT)|tabler"
  "astrowind|https://astrowind.vercel.app/|<a href=\"https://github.com/onwidget/astrowind\">AstroWind</a> (MIT)|astro"
  "astro-paper|https://astro-paper.pages.dev/|<a href=\"https://github.com/satnaing/astro-paper\">AstroPaper</a> (MIT)|astro"
  "landwind|https://demo.themesberg.com/landwind/|<a href=\"https://github.com/themesberg/landwind\">Landwind</a> (MIT)|themesberg"
  "html5up-editorial|https://html5up.net/uploads/demos/editorial/|<a href=\"https://html5up.net/editorial\">Editorial by HTML5 UP</a> (CCA 3.0)|html5up"
  "html5up-forty|https://html5up.net/uploads/demos/forty/|<a href=\"https://html5up.net/forty\">Forty by HTML5 UP</a> (CCA 3.0)|html5up"
  "html5up-story|https://html5up.net/uploads/demos/story/|<a href=\"https://html5up.net/story\">Story by HTML5 UP</a> (CCA 3.0)|html5up"
  "html5up-phantom|https://html5up.net/uploads/demos/phantom/|<a href=\"https://html5up.net/phantom\">Phantom by HTML5 UP</a> (CCA 3.0)|html5up"
  "html5up-hyperspace|https://html5up.net/uploads/demos/hyperspace/|<a href=\"https://html5up.net/hyperspace\">Hyperspace by HTML5 UP</a> (CCA 3.0)|html5up"
  "html5up-massively|https://html5up.net/uploads/demos/massively/|<a href=\"https://html5up.net/massively\">Massively by HTML5 UP</a> (CCA 3.0)|html5up"
  "material-dashboard|https://demos.creative-tim.com/material-tailwind-dashboard-react/|<a href=\"https://www.creative-tim.com/product/material-tailwind-dashboard-react\">Material Tailwind Dashboard React</a> (MIT)|creative-tim"
  "flowbite-hero|https://flowbite.com/blocks/marketing/hero/|<a href=\"https://flowbite.com/blocks/\">Flowbite hero blocks</a> (MIT)|flowbite"
)

CREDITS="$OUT/credits.json"
echo "{" > "$CREDITS"
first=1
for ref in "${REFS[@]}"; do
  IFS='|' read -r name url credit source <<< "$ref"
  file="$name.png"
  echo "shooting $name <- $url"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
    --window-size=1440,1000 --virtual-time-budget=10000 --timeout=30000 \
    --screenshot="$OUT/$file" "$url" >/dev/null 2>&1
  if [ -s "$OUT/$file" ]; then
    [ $first -eq 1 ] || echo "," >> "$CREDITS"
    first=0
    printf '  "%s": {"html": "%s", "source": "%s"}' "$file" "${credit//\"/\\\"}" "$source" >> "$CREDITS"
  else
    echo "  ! no screenshot for $name"
  fi
done
echo "" >> "$CREDITS"
echo "}" >> "$CREDITS"
echo "done: $(ls "$OUT"/*.png 2>/dev/null | wc -l) screenshots in $OUT"
