# UniTrack Report

This directory contains the LaTeX source for the project PDF report. The reference PDF stays in `report/reference/` and should be used as a structure/style guide, not converted into LaTeX.

## Install Tools

On Ubuntu/WSL/Linux Mint:

```bash
sudo apt update
sudo apt install texlive-xetex texlive-latex-extra texlive-fonts-recommended latexmk fonts-texgyre
```

Optional editor support:

- VS Code extension: `LaTeX Workshop`
- PDF viewer with auto-refresh: Okular, Zathura, or Evince

## Build

```bash
make report
```

Output PDF:

```text
report/build/main.pdf
```

## Live Rebuild

```bash
make report-watch
```

Then open `report/build/main.pdf` in a PDF viewer. Most Linux PDF viewers refresh automatically when LaTeX rebuilds the file.

## Edit Points

- `report/report-info.tex`: title page names, supervisor, faculty, date.
- `report/frontmatter/`: acknowledgements, commitment, abstract, abbreviation tables.
- `report/chapters/`: main report content.
- `report/references.bib`: bibliography entries.
- `report/assets/screenshots/`: UI screenshots.
- `report/assets/diagrams/`: diagrams exported as PDF/PNG.

## Reference Shape

The current template follows the reference report structure:

1. Title page.
2. Acknowledgements.
3. Commitment statement.
4. Abstract.
5. Table of contents.
6. List of figures and tables.
7. Abbreviations and glossary.
8. Six main chapters.
9. References.
