# Flow Builder Design System

Reference style: **Brex, "White concrete, single ember"** from Refero Styles
(https://styles.refero.design/style/b58d92f6-68a8-4358-8fc9-6ea58e6d483b).
Browse more patterns at https://styles.refero.design/ when you need ideas for a component.

We use it as a reference only: tokens and patterns, not brand assets. No Brex logo, Flecha font, imagery or copy. No Taktile assets either.

Why this style: it is a calm, light, flat "financial workbench" look. Lots of white, hairline borders, one accent colour for the main action. That suits a decision-flow editor where the flow itself, not the chrome, should carry the colour.

## 1. Principles

1. The canvas is the hero. App chrome (top bar, panels, palette) stays neutral and quiet.
2. One accent (Ember) for the single primary action in each area: "New diagram", "Save", "Apply changes", "Send".
3. Flat surfaces. Elevation comes from Paper on Fog contrast and 1px borders, not shadows. Only floating things (menus, dialogs, toasts, the minimap) get one soft shadow.
4. Left-aligned text, plain short labels, generous spacing.
5. Node colour coding uses a separate muted data palette (section 3). This is our one planned change from the reference, which allows only one accent, because a flow editor needs colour groups.

## 2. Colour tokens (app chrome)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-accent` | `#ff5900` (Ember) | `#ff6a1a` | Primary button fill, active tab underline, focus ring, selected node outline |
| `--color-accent-soft` | `#fff1ea` | `#3a1e10` | Accent hover wash, selected row |
| `--color-text` | `#000000` (Ink) | `#f3f3f7` | Headings, main text |
| `--color-text-2` | `#60646c` (Graphite) | `#b9bbc6` | Body text, descriptions |
| `--color-text-3` | `#6f737b` (Pewter) | `#8b8d98` | Helper text, captions |
| `--color-icon` | `#8b8d98` (Steel) | `#8b8d98` | Muted icons, placeholders |
| `--color-border` | `#b9bbc6` (Mist) at 60% or `#e3e4ea` | `#2a2f36` | Hairlines, card and input borders |
| `--color-surface-2` | `#f3f3f7` (Fog) | `#15191e` (Carbon) | Canvas background, input fill, side panel background |
| `--color-surface` | `#ffffff` (Paper) | `#1c2128` | Cards, nodes, panels, dialogs |
| `--color-chrome-dark` | `#15191e` (Carbon) | `#000710` (Abyss) | Optional dark top bar, tooltips |
| `--color-danger` | `#d92d20` | `#f97066` | Delete, errors, "removed" in AI diff |
| `--color-success` | `#12b76a` | `#32d583` | "Added" in AI diff, saved state |
| `--color-warning` | `#f79009` | `#fdb022` | "Changed" in AI diff |

Canvas: `--color-surface-2` with a dot grid in `--color-border`, gap 16px.

## 3. Data palette (node and group colours)

Muted, readable on white. Each colour has a solid (icon, left stripe, edge) and a tint (group background, node header wash).

| Key | Solid | Tint | Default for |
|---|---|---|---|
| `slate` | `#64748b` | `#f1f5f9` | step |
| `blue` | `#2e6be6` | `#eef4ff` | integration / API call |
| `violet` | `#7a5af8` | `#f4f3ff` | data mapping |
| `amber` | `#dc8a06` | `#fef6e7` | decision |
| `teal` | `#0e9384` | `#effcf9` | rule or score |
| `green` | `#12b76a` | `#ecfdf3` | start |
| `red` | `#e5484d` | `#fff0f0` | end / reject |
| `pink` | `#dd2590` | `#fdf2fa` | custom |
| `yellow` | `#ca8a04` | `#fefce8` | note |
| `gray` | `#98a2b3` | `#f9fafb` | group default |

Users can also pick a custom hex. Dark mode uses the same solids and tints at 16% opacity over `--color-surface`.

## 4. Typography

- Font: **Inter** (Google Fonts or `@fontsource/inter`), fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Mono: `"JetBrains Mono", ui-monospace, monospace` for JSON views.
- Weights: 400 body, 500 UI chrome and labels, 600 for emphasis only.
- Tracking: -0.01em at 24px and below, -0.02em at 36px.
- `font-feature-settings: "calt" 0, "liga" 0;`

| Token | Size / line height | Use |
|---|---|---|
| `--text-caption` | 12px / 1.4 | Badges, metadata, minimap labels |
| `--text-sm` | 13px / 1.45 | Node description, panel helper text |
| `--text-body` | 14px / 1.5 | Default UI text, node labels |
| `--text-md` | 16px / 1.5 | Panel titles, dialog body |
| `--text-lg` | 20px / 1.4 | Page section titles |
| `--text-xl` | 24px / 1.33 | Page titles ("Your diagrams") |
| `--text-2xl` | 36px / 1.21 | Login hero only |

## 5. Spacing, radius, shadow

- Base unit 4px. Scale: 4, 8, 12, 16, 24, 32, 48, 80.
- Element gap 8 to 16px. Panel padding 16 to 24px. Card padding 24px. Page gutters 32px.
- Radius: `--radius-sm: 6px` (tags, chips, small icon buttons), `--radius-md: 12px` (buttons, inputs, cards, nodes, panels, dialogs). Groups use 12px too. Do not mix 8 or 10px in.
- Shadows: none on cards and nodes. Floating only:
  - `--shadow-float: 0 8px 24px rgba(16, 24, 40, 0.08), 0 2px 6px rgba(16, 24, 40, 0.06)` for menus, dialogs, toasts, minimap, the AI panel when it overlays.
  - Selected node: 2px `--color-accent` outline, no shadow.

## 6. Component patterns

**Buttons** (height 36px, radius 12px, 14px/500, padding 0 16px)
- Primary: Ember fill, white text. One per area.
- Secondary: Paper fill, 1px border, Ink text.
- Ghost: no border, Graphite text, Fog hover.
- Danger: red text ghost, red fill only in confirm dialogs.
- Icon button: 32px square, radius 6px.

**Inputs**: height 36px, radius 12px, Fog fill, 1px border, focus ring 2px accent at 30% plus accent border. Labels above in 13px/500.

**Top bar**: 52px, Paper, bottom hairline. Left: app name and diagram title (click to rename). Right: save state ("Saved" / "Saving..."), undo/redo, layout, import/export menu, theme toggle, AI button, avatar menu.

**Left palette**: 240px, Fog panel, list of node kinds with icon tile (28px, tint background, solid icon) plus name and one-line hint. Search at top. Drag or click to add.

**Right side panel** (node editor): 320px, Paper, left hairline. Sections separated by hairlines with small uppercase section labels (12px/500, tracking 0.04em, Pewter): General (label, description), Look (icon picker, colour swatches), Details (kind specific fields), Connections.

**Nodes**: Paper card, 1px border, radius 12px, min width 220px. Header row: 28px icon tile (tint + solid icon), label 14px/500, kind badge (caption, 6px radius). Optional 13px description in Graphite, 2 lines max. Left 3px colour stripe in the node's solid colour. Handles: 8px circles, border colour, accent on hover.
- Decision: one output handle per branch, branch labels as small chips along the bottom edge.
- Integration: shows service name and method chip (GET/POST).
- Rule: shows rule count and threshold.
- Note: tint background, no border, italic off, yellow by default.
- Start / End: pill-ish 12px radius, compact, green / red.

**Groups (segments)**: tint background, 1px dashed solid-colour border at 50%, radius 12px, label chip at top left in the solid colour. Collapsible.

**Edges**: 1.5px Steel, smooth step, arrow at end. Branch edges take the branch colour. Selected edge: accent. Labels as small Paper chips with border.

**Icon picker**: popover 320x360, search field, virtualised grid of 36px cells, recent icons row on top.

**Colour picker**: row of 10 swatches (data palette, 20px circles), plus "Custom" hex input.

**AI assistant panel**: 380px right drawer. Chat bubbles: user in Fog, assistant in Paper with border. Proposed change card: summary text, counts chips (green added, amber changed, red removed), buttons "Apply changes" (primary) and "Discard". Missing key card: short text "Add your Gemini API key to use the assistant", input, "Save key" primary, link "Get a key" and "Open settings".

**Dialogs**: Paper, radius 12px, shadow-float, max width 480px, title 16px/600.

**Toasts**: bottom center, Carbon fill, white text, radius 12px.

**Empty states**: centered in the panel, 40px Steel icon, one line title, one line hint, one primary button.

## 7. Motion

Short and useful only. 120ms for hover and press, 180ms ease-out for panels and popovers. No bouncing. Respect `prefers-reduced-motion`.

## 8. Accessibility

Text contrast at least 4.5:1. Every icon button has an `aria-label` and tooltip. Keyboard: Tab through panels, Delete removes selection, Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo, Cmd/Ctrl+K opens node search.

## 9. CSS starting point

```css
:root {
  --color-accent: #ff5900;
  --color-accent-soft: #fff1ea;
  --color-text: #000000;
  --color-text-2: #60646c;
  --color-text-3: #6f737b;
  --color-icon: #8b8d98;
  --color-border: #e3e4ea;
  --color-surface: #ffffff;
  --color-surface-2: #f3f3f7;
  --color-chrome-dark: #15191e;
  --radius-sm: 6px;
  --radius-md: 12px;
  --shadow-float: 0 8px 24px rgba(16, 24, 40, 0.08), 0 2px 6px rgba(16, 24, 40, 0.06);
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
[data-theme="dark"] {
  --color-accent: #ff6a1a;
  --color-accent-soft: #3a1e10;
  --color-text: #f3f3f7;
  --color-text-2: #b9bbc6;
  --color-text-3: #8b8d98;
  --color-border: #2a2f36;
  --color-surface: #1c2128;
  --color-surface-2: #15191e;
  --color-chrome-dark: #000710;
}
```
