# E-Pro Trip Manager — Progress Log

## 2026-04-27

### Light-theme redesign — both apps
Full visual overhaul of both Trip Manager (`client/`) and Call Logger (`call-logger/`) into a cohesive light theme with shared brand language. No component JSX touched — only stylesheets and `index.html` font links.

**Final palette (Metallic Chic — replaced an interim "Workshop Blueprint" warm-paper palette):**
- `#EDE8F5` — canvas (pale lavender-silver) → `--paper`
- `#F7F4FB` — raised surface (cards, sidebar) → `--paper-raised`
- `#E0DAED` — recessed (inputs, wells) → `--paper-recessed`
- `#3D52A0` — primary brand / actions → `--voltage`
- `#7091E6` — bright metallic accent (was copper) → `--copper`
- `#8697C4` — tertiary text → `--ink-muted`
- `#ADBBDA` — borders / faint text → `--rule` / `--ink-faint`
- `#1A1F36` — body text (derived deep cool near-black, not in original swatches)
- Semantic preserved: `--live` `#197A3D`, `--caution` `#C48A1E`, `--fault` `#B42318`

**Typography (Google Fonts, both apps):**
- Display: **Fraunces** (variable opsz axis, used 36–144 for KPI values, page titles, day-group headings)
- Body: **Geist**
- Mono: **JetBrains Mono** (ref numbers, timestamps, distances, uppercase labels)
- Inter removed from both `index.html` files

**Files changed:**
- `client/src/styles/index.css` — full rewrite (~1900 lines, was ~3239)
- `call-logger/src/styles/index.css` — full rewrite (~1300 lines, was 1263)
- `client/index.html` — replaced Inter with Fraunces+Geist+JetBrains Mono
- `call-logger/index.html` — same font swap

**Token system (shared across both apps):**
- Paper/ink neutrals + voltage/copper brand pair + live/caution/fault semantics
- Legacy aliases kept (`--bg`, `--surface`, `--accent`, `--text`, `--gray-*`, `--primary*`, etc.) so all existing class rules continue working
- Subtle radial-dot grain texture on body background, fixed-attachment
- 2px voltage bar accents under section headers (schematic motif)
- Two-tone (voltage + copper) gradient stripe on login card / modals
- Buttons: inset top-ridge + outer drop shadow for tactile feel
- Status dots use ring-on-dot pattern (filled colour + 22% halo)

**Everything preserved:** every existing class name, animation keyframe, and CSS variable name still works. Reverting to dark theme requires only `git checkout HEAD -- <files>`.

## 2026-03-19

### Call Logger: Inline customer details on JobCard & JobDetail
- **JobCard** (`call-logger/src/components/JobCard.jsx`): Customer address now displays inline next to customer name and phone, separated by dots (·)
- **JobDetail** (`call-logger/src/components/JobDetail.jsx`): Phone and address shown inline with customer name (dot-separated); email remains on its own line below
- **CSS** (`call-logger/src/styles/index.css`): Added `.job-customer-address` and `.detail-customer-separator` / `.detail-customer-email` styles

### Prior sessions (summary)
- 2026-03-16: Month Calendar component, manual trip creation with Leaflet map, PDF email reports
- 2026-03-11: Merge bug fixes (withExtras, end_geofence_name patching)
- Earlier: Full feature set — auth, multi-vehicle, drag-to-merge, call logger, n8n integration, reports, trip claiming, custom locations
