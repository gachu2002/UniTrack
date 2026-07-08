#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPORT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PDF="$REPORT_DIR/build/main.pdf"
OUT_DIR="$REPORT_DIR/build/visual-check"
PAGES_DIR="$OUT_DIR/pages"
DPI="${REPORT_VISUAL_DPI:-90}"

command -v pdftoppm >/dev/null || {
  printf '%s\n' 'pdftoppm is required for report visual checking.' >&2
  exit 1
}

command -v pdfinfo >/dev/null || {
  printf '%s\n' 'pdfinfo is required for report visual checking.' >&2
  exit 1
}

if [ ! -f "$PDF" ]; then
  printf 'Missing PDF: %s\nRun make report first.\n' "$PDF" >&2
  exit 1
fi

mkdir -p "$PAGES_DIR"
rm -f "$PAGES_DIR"/*.png "$OUT_DIR/index.html"

pdftoppm -png -r "$DPI" "$PDF" "$PAGES_DIR/page"

TOTAL_PAGES=$(pdfinfo "$PDF" | awk '/^Pages:/ {print $2}')
GENERATED_AT=$(date '+%Y-%m-%d %H:%M:%S')

{
  printf '%s\n' '<!doctype html>'
  printf '%s\n' '<html lang="en">'
  printf '%s\n' '<head>'
  printf '%s\n' '<meta charset="utf-8">'
  printf '%s\n' '<meta name="viewport" content="width=device-width, initial-scale=1">'
  printf '%s\n' '<title>UniTrack Report Visual Check</title>'
  printf '%s\n' '<style>'
  printf '%s\n' 'body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:24px;background:#f8fafc;color:#111827}'
  printf '%s\n' 'h1{font-size:22px;margin:0 0 6px}'
  printf '%s\n' 'p{margin:0 0 18px;color:#475569}'
  printf '%s\n' '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}'
  printf '%s\n' '.page{background:white;border:1px solid #cbd5e1;border-radius:8px;padding:10px;box-shadow:0 1px 2px rgba(15,23,42,.08)}'
  printf '%s\n' '.page strong{display:block;font-size:13px;margin:0 0 8px;color:#334155}'
  printf '%s\n' '.page img{width:100%;height:auto;display:block;border:1px solid #e2e8f0;background:white}'
  printf '%s\n' '</style>'
  printf '%s\n' '</head>'
  printf '%s\n' '<body>'
  printf '%s\n' '<h1>UniTrack Report Visual Check</h1>'
  printf '<p>Generated %s from %s pages at %s DPI. Inspect diagram/table pages for overlap, cramped labels, bad page breaks, and excessive whitespace.</p>\n' "$GENERATED_AT" "$TOTAL_PAGES" "$DPI"
  printf '%s\n' '<div class="grid">'
  for image in $(ls "$PAGES_DIR"/page-*.png | sort -V); do
    base=$(basename "$image")
    page=${base#page-}
    page=${page%.png}
    printf '<div class="page"><strong>PDF page %s</strong><img src="pages/%s" alt="PDF page %s"></div>\n' "$page" "$base" "$page"
  done
  printf '%s\n' '</div>'
  printf '%s\n' '</body>'
  printf '%s\n' '</html>'
} > "$OUT_DIR/index.html"

printf 'Visual check written to %s\n' "$OUT_DIR/index.html"
