# Flow Builder brand

## Mark

Three rounded squares on a 4px geometric grid, joined by an orthogonal connector. The top bar and downward stem read as an abstract **F** and as a short flow (start → branch → next). It means building and flowing diagrams.

- View box: `32 × 32`
- Nodes: `10 × 10`, corner radius `2.5`
- Positions: `(3,3)`, `(19,3)`, `(3,19)`
- Connector: 2.5px square-cap path `M13 8h6M8 13v6`
- No gradients, filters, or noise

Files: `src/assets/brand/mark.svg`, `mark-mono.svg`, `LogoMark.tsx`

## Wordmark

Mark plus the words **Flow Builder** in Inter semibold (600), tracking `-0.02em`, colour Ink (`#000000` / `--color-text`). Gap between mark and type is 10px.

Files: `src/assets/brand/wordmark.svg`, `LogoWordmark.tsx`

## Colours

| Role | Hex | Token |
|---|---|---|
| Primary node / connector | `#0f766e` | `--color-accent` |
| Secondary node (bright) | `#0d9488` | `--color-accent-bright` |
| Favicon pad | `#f0fdfa` | `--color-accent-tint` |
| Mono | `currentColor` | inherits |

Do not use purple or other accent hues in the mark.

## Clear space

Keep empty space around the mark at least **1/4 of the mark width** (8px when the mark is 32px). Do not crop nodes or overlap the mark with other chrome.

## Minimum size

| Use | Size |
|---|---|
| Favicon / rail | **16px** mark (mono or colour both still read) |
| App nav / auth | **20–24px** mark |
| Marketing lockup | **32px+** mark with wordmark |

Below 16px, use `favicon-16.png` only; do not redraw a different mark.

## Usage

- Expanded sidebar / auth: `LogoWordmark`
- Collapsed sidebar rail: mark only (`LogoWordmark markOnly` or `LogoMark`)
- Loading and empty states: `LogoMark` at 40px when a brand placeholder is needed
- Favicons and PWA icons: generated with `npm run brand:icons` from `mark.svg`

Never substitute the Lucide `Workflow` icon for the brand mark in app chrome.
