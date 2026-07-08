# UniTrack Report

This directory contains the LaTeX source for the project PDF report. The reference PDF stays in `report/reference/` and should be used as a structure/style guide, not converted into LaTeX.

## Install Tools

On Ubuntu/WSL/Linux Mint:

```bash
sudo apt update
sudo apt install texlive-xetex texlive-latex-extra texlive-fonts-recommended latexmk fonts-texgyre default-jre graphviz plantuml poppler-utils
```

Optional editor support:

- VS Code extension: `LaTeX Workshop`
- PDF viewer with auto-refresh: Okular, Zathura, or Evince

## Build

```bash
make report-diagrams
make report
```

Output PDF:

```text
report/build/main.pdf
```

## Visual Check

After changing diagrams, tables, screenshots, or layout-sensitive text, run:

```bash
make report-diagrams
make report-visual-check
```

This builds the PDF, renders each page into `report/build/visual-check/pages/`, and writes a contact sheet to:

```text
report/build/visual-check/index.html
```

Use that HTML page as the quick visual gate. A page is not acceptable if labels overlap, arrows cross through text, table cells are cramped, captions are detached from their content, or a figure leaves excessive blank space.

## Diagram Assets

Core report diagrams are authored as PlantUML source files in `report/diagrams/` and rendered into `report/assets/diagrams/` with:

```bash
make report-diagrams
```

`report/report-diagrams.tex` only maps figure commands to generated image assets. Keep diagram source in PlantUML instead of hand-positioning complex figures in TikZ.

Use the formal report style for new figures: short labels, white nodes, thin black/gray strokes, clear lanes, no crossed arrows through text, and enough spacing to remain legible when printed. Prefer PlantUML sequence, use-case, state, component/deployment, and class-style ERD diagrams for report assets.

Tables should prefer `tabularray` (`tblr`/`longtblr`) with light horizontal rules, no vertical grid borders, clear header rows, and explicit column ratios. Prefer short cells and split a table when content starts wrapping heavily across multiple lines.

## Screenshot Assets

Report screenshots are captured from the real React frontend with representative API mocks:

```bash
pnpm --filter @unitrack/web dev -- --host 127.0.0.1
cd apps/web && node capture-report-screenshots.mjs
```

The script writes PNGs into `report/assets/screenshots/`. It is intended for report evidence only; it does not replace backend/API integration tests.

## Live Rebuild

```bash
make report-watch
```

Then open `report/build/main.pdf` in a PDF viewer. Most Linux PDF viewers refresh automatically when LaTeX rebuilds the file.

## Edit Points

- `report/report-info.tex`: title page names, supervisor, faculty, date.
- `report/frontmatter/`: acknowledgements, commitment, abstract, abbreviation tables.
- `report/chapters/`: main report content.
- `report/diagrams/`: PlantUML source files for report diagrams.
- `report/report-diagrams.tex`: LaTeX figure command wrappers for generated diagrams.
- `report/references.bib`: bibliography entries.
- `report/assets/diagrams/`: generated diagram assets.
- `report/assets/screenshots/`: UI screenshots.

## Reference Shape

The current template follows the reference report structure:

1. Title page.
2. Acknowledgements.
3. Commitment statement.
4. Abstract.
5. Table of contents.
6. List of figures and tables.
7. Abbreviations, glossary, and algorithm list.
8. Six main chapters with use-case diagrams, workflow diagrams, architecture diagrams, ERD-style diagrams, UI figures, testing tables, deployment tables, and algorithm listings.
9. References.
