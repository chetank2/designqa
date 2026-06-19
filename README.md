# DesignQA

DesignQA helps you compare a Figma design with a real website and see what does not match.

It is made for designers, product managers, QA teams, founders, and developers who want a simple way to check whether a built page matches the design. You paste a Figma link, paste a website link, run a comparison, and get a readable report with mismatches like color, typography, spacing, size, layout, and missing elements.

## Download

Latest release: **v2.0.4**

- **Mac, Apple Silicon:** [Download DesignQA-2.0.4-arm64.dmg](https://github.com/chetank2/designqa/releases/download/v2.0.4/DesignQA-2.0.4-arm64.dmg)
- **Mac, Intel:** [Download DesignQA-2.0.4.dmg](https://github.com/chetank2/designqa/releases/download/v2.0.4/DesignQA-2.0.4.dmg)
- **Release page:** [DesignQA v2.0.4 on GitHub](https://github.com/chetank2/designqa/releases/tag/v2.0.4)

If your Mac has an M1, M2, M3, or M4 chip, use the **Apple Silicon** download. If it is an older Intel Mac, use the **Intel** download.

## What You Can Do

- Compare a Figma frame or component against a live web page.
- Find visual differences in colors, text styles, spacing, sizing, and layout.
- Generate an HTML report that can be shared with designers, developers, or QA.
- Run everything locally from the desktop app.
- Use Figma Desktop Dev Mode / MCP when available for better extraction.

## Who This Is For

You do not need to be technical to use DesignQA. It is useful when:

- A designer wants to check whether implementation matches the design.
- A product manager wants a clear QA report before release.
- A QA person wants visual mismatch evidence.
- A developer wants a punch list of UI differences.
- A founder or client wants to verify that a page was built correctly.

## Install on Mac

1. Download the correct DMG from the links above.
2. Open the DMG file.
3. Drag **DesignQA** into **Applications**.
4. Open DesignQA from Applications.
5. If macOS blocks it because it is not signed, right-click the app and choose **Open**.

Note: the current local builds are not code signed, so macOS may show a warning the first time you open the app.

## Basic Use

1. Open **DesignQA**.
2. Make sure the server badge in the app shows the local server is running.
3. Open your design in **Figma Desktop**.
4. In Figma, select the frame or component you want to compare.
5. Paste the Figma URL into DesignQA.
6. Paste the live website URL into DesignQA.
7. Click **Extract Design & Web Data**.
8. Review the results in the app.
9. Open or download the generated HTML report.

## Figma Setup

For best results, use Figma Desktop:

1. Install or open **Figma Desktop**.
2. Open the file you want to compare.
3. Select the exact frame or component.
4. Make sure Dev Mode / MCP is enabled in Figma if your setup uses it.
5. Run the comparison in DesignQA.

If Figma extraction fails, check that the file is open in Figma Desktop and the target frame/component is selected.

## Website Setup

DesignQA opens the website in an automated browser so it can inspect the page visually and structurally.

Use a URL that the app can access:

- Public website URLs work best.
- Localhost URLs can work if the site is running on your machine.
- Login-protected pages may require credentials or a saved browser session.
- Pages with bot protection, heavy animations, or restricted iframes may be harder to extract.

## Reports

After a comparison, DesignQA creates a report showing:

- What was analyzed.
- How many Figma components and web elements were found.
- Visual mismatches.
- Match and mismatch details.
- Design token differences such as colors and typography.

Reports are HTML files, so they can be opened in a browser and shared with others.

## Troubleshooting

### The app opens, but comparison fails

Check the server badge in the app. DesignQA uses an embedded local server to run extraction and comparison. If the server is not running, restart the app.

### Figma extraction fails

Open Figma Desktop, open the target file, select the frame/component, and try again.

### Web extraction fails

The app needs Chrome or a compatible browser to inspect web pages. Make sure Google Chrome is installed on your Mac.

### The report shows no mismatches

Run the comparison again with the latest v2.0.4 build. Older local reports may not include enough saved comparison data to regenerate mismatch rows.

### macOS says the app is from an unidentified developer

This build is not code signed. Right-click the app, choose **Open**, then confirm.

## Privacy

The desktop app is designed to run locally. Your Figma link, website link, extracted data, and generated reports are stored on your machine unless you choose to share them.

On macOS, local app data is stored under:

```text
~/Library/Application Support/@designqa/desktop-mac/
```

## For Developers

This repository contains the desktop app, frontend, backend, comparison engine, and shared packages.

### Requirements

- Node.js 18 or newer
- pnpm
- Google Chrome

### Install

```bash
pnpm install
```

### Build the Mac App

```bash
pnpm run build:desktop:mac
```

Built DMGs are written to:

```text
apps/desktop-mac/build/
```

### Project Structure

- `apps/desktop-mac` - macOS Electron desktop app
- `apps/desktop-win` - Windows desktop app
- `apps/saas-frontend` - React frontend
- `apps/saas-backend` - local/API backend
- `packages/compare-engine` - comparison logic
- `packages/mcp-client` - Figma MCP client
- `packages/shared-types` - shared TypeScript types

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and pull request guidance.

## Security

See [SECURITY.md](SECURITY.md) for reporting security issues.

## License

MIT
