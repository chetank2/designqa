# Global Style Comparison Guide

The Chrome extension no longer requires `data-figma-node-id` attributes or 1:1 element mapping. Instead, it compares two *style systems*:

1. Design tokens fetched from a Figma file or frame (via the REST API)
2. Unique computed styles discovered on the active webpage

Both systems are normalized through `@myapp/compare-engine`, which returns a global mismatch report covering colors, typography, spacing, radius, and shadows.

---

## 1. Prerequisites

- **Figma Personal Access Token (PAT)**
  - Figma → Settings → Account → Personal Access Tokens → Generate token
  - Keep it private (the extension can store it locally if you choose)
- **Figma File / Frame URL**
  - Copy the URL from Figma (e.g., `https://www.figma.com/file/FILE_KEY/Name?node-id=123-456`)
  - The extension parses `file_key` and optional `node-id` automatically
- **Loaded Chrome Extension**
  - Build via `pnpm --filter @myapp/chrome-extension run build`
  - Load `apps/chrome-extension/dist` in `chrome://extensions` → “Load unpacked”

---

## 2. Workflow

1. Open the website you want to audit.
2. Click the DesignQA extension icon.
3. Paste your **Figma URL** and **PAT**.
4. (Optional) Enable “Remember token on this device.”
5. Click **“Compare Style Systems.”**
6. The extension:
   - Calls `https://api.figma.com/v1/files/{fileKey}` (scoped to `node-id` if present) to pull colors, text styles, spacing, radii, and shadows.
   - Messages the content script, which scans up to ~800 DOM nodes and logs every unique computed style value.
   - Normalizes both snapshots with `@myapp/compare-engine` and renders the global report.

No DOM attributes or layer-level IDs are required. Any webpage can be compared against any design file.

---

## 3. Data the Extension Captures

| Source | What we pull |
| --- | --- |
| **Figma API** | Solid fills / strokes, background colors, text styles (family, size, weight, line height), auto-layout padding & gaps, corner radii, drop/inner shadows |
| **Web page** | Computed colors (text/background/borders), font families, sizes, weights, line heights, padding/margins/gaps, border radii, box/text shadows |

Each value is converted into a normalized token (e.g., `color:brand-primary`, `token:font:Inter`, `token:spacing:spacing-16`). The engine then reports matches, mismatches, and missing values.

---

## 4. Reading the Report

- **Summary score** – percentage of tokens that match between design and web.
- **Colors** – tolerance-based comparison of RGBA values.
- **Typography** – available families, sizes, weights, and line heights.
- **Spacing / Radius / Shadows** – numeric/token comparisons showing extra or missing values on either side.

Because the report is global, a mismatch means “this value exists only in Figma” or “this value exists only on the web,” not a specific DOM node.

---

## 5. Troubleshooting

| Issue | Fix |
| --- | --- |
| `Figma URL and Personal Access Token are required` | Ensure both fields are filled in the popup. |
| `Figma API error (403/404/429)` | PAT lacks access, the file is private, or rate limits were hit. Verify file permissions and token scopes. |
| `No active tab available` | Make sure the tab you want to audit is focused before running the comparison. |
| Empty sections | The page may not contain that style category (e.g., no shadows). This is normal. |

For faster comparisons on very large files, append `?node-id=<frame-id>` to the Figma URL to restrict the API payload to a single frame.

---

## 6. Legacy Node JSON (Historical Reference Only)

Previous versions required manually curated “Figma Node JSON” payloads and `data-figma-node-id` attributes. That is **no longer necessary**. The extension now handles:

- Parsing file/frame info directly from the URL
- Downloading styles via the REST API
- Collecting DOM tokens without touching your markup

If you still need raw JSON for automation, refer to `packages/compare-engine/src/types.ts` for the canonical schema and build payloads programmatically.

---

## 7. Developer Notes

- Popup implementation: `apps/chrome-extension/src/popup.tsx`
- Background worker (Figma fetch + DOM messaging): `apps/chrome-extension/src/background.ts`
- Content script (style aggregation): `apps/chrome-extension/src/contentScript.ts`
- Shared snapshot types: `apps/chrome-extension/src/lib/styleTypes.ts`

Everything ultimately routes through `@myapp/compare-engine`, so differences reported in the extension match the SaaS backend’s calculations.
