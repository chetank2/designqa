# Figma Node JSON Guide

## What is Figma Node JSON?

**Figma Node JSON** is a structured data format that represents design tokens and styling information extracted from Figma designs. It contains:

- **Colors**: Background colors, text colors, border colors
- **Typography**: Font family, size, weight, line height
- **Spacing**: Padding, margins, gaps
- **Radius**: Border radius values
- **Shadows**: Box shadows and effects
- **Layout**: Width, height, positioning

This data is used to compare Figma designs against live web pages to ensure design consistency.

## Figma Node JSON Format

Here's the structure:

```json
[
  {
    "nodeId": "button-primary",
    "name": "Primary Button",
    "styles": {
      "colors": {
        "background": "#2563eb",
        "color": "#ffffff"
      },
      "typography": {
        "fontFamily": "Inter",
        "fontSize": 16,
        "fontWeight": 600,
        "lineHeight": 24
      },
      "spacing": {
        "paddingTop": 12,
        "paddingRight": 24,
        "paddingBottom": 12,
        "paddingLeft": 24
      },
      "radius": {
        "borderRadius": 8
      },
      "shadows": {},
      "layout": {
        "width": 200,
        "height": 48
      }
    }
  }
]
```

## How to Get Figma Node JSON from Your Figma Link

### Method 1: Using Chrome Extension with Backend (Recommended - No PAT Needed!)

**Best Option:** Use the Chrome extension with your backend running:

1. **Start the DesignQA backend** (if not already running):
   ```bash
   cd apps/saas-backend
   npm start  # or pnpm start
   ```

2. **Open Figma Desktop** and open your design file

3. **Use the Chrome Extension:**
   - Click the extension icon
   - Select "From URL" tab
   - Paste your Figma URL
   - Click "Fetch from Figma"

**How it works:**
- ✅ **First tries Figma MCP** (if Figma Desktop is running) - **No PAT needed!**
- ✅ **Falls back to Figma API** (if MCP unavailable) - Requires PAT only as fallback
- ✅ **Automatic** - No manual configuration needed

**Backend Endpoint:** `POST http://localhost:3847/api/figma-only/extract`

### Method 2: Using Figma API Directly (Requires PAT)

**Note:** Only needed if backend/MCP is unavailable.

1. **Get a Figma Personal Access Token:**
   - Go to Figma → Settings → Account → Personal Access Tokens
   - Create a new token

2. **Extract File ID from URL:**
   - Your Figma URL: `https://www.figma.com/design/ABC123XYZ/My-Design`
   - File ID: `ABC123XYZ`

3. **Extract Node ID (if needed):**
   - URL with node: `https://www.figma.com/design/ABC123XYZ/My-Design?node-id=123-456`
   - Node ID: `123:456` (convert hyphen to colon)

4. **Make API Request:**
   ```bash
   # Get entire file
   curl "https://api.figma.com/v1/files/ABC123XYZ" \
     -H "X-Figma-Token: YOUR_TOKEN"
   
   # Get specific node
   curl "https://api.figma.com/v1/files/ABC123XYZ/nodes?ids=123:456" \
     -H "X-Figma-Token: YOUR_TOKEN"
   ```

### Method 3: Manual Extraction

If you need to manually create the JSON:

1. **Identify Elements:**
   - Open your Figma design
   - Select elements you want to compare
   - Note their styling properties

2. **Create JSON Structure:**
   - Use `nodeId` to match with web elements (add `data-figma-node-id` attribute)
   - Extract colors, typography, spacing from Figma's properties panel
   - Convert to the JSON format shown above

## Using Node IDs to Match Elements

For the comparison to work, web elements need matching `nodeId`s:

**In Figma:**
```json
{
  "nodeId": "button-primary",
  "name": "Primary Button",
  ...
}
```

**In HTML:**
```html
<button data-figma-node-id="button-primary" class="btn-primary">
  Click Me
</button>
```

The extension will match elements by `nodeId` and compare their styles.

## Example: Complete Figma Node JSON

```json
[
  {
    "nodeId": "header",
    "name": "Page Header",
    "styles": {
      "colors": {
        "background": "#ffffff",
        "color": "#1f2937"
      },
      "typography": {
        "fontFamily": "Inter",
        "fontSize": 24,
        "fontWeight": 700,
        "lineHeight": 32
      },
      "spacing": {
        "paddingTop": 24,
        "paddingRight": 32,
        "paddingBottom": 24,
        "paddingLeft": 32
      },
      "radius": {},
      "shadows": {
        "boxShadow": "0 1px 3px rgba(0,0,0,0.1)"
      },
      "layout": {
        "width": 1200,
        "height": 80
      }
    }
  },
  {
    "nodeId": "button-primary",
    "name": "Primary Button",
    "styles": {
      "colors": {
        "background": "#2563eb",
        "color": "#ffffff"
      },
      "typography": {
        "fontFamily": "Inter",
        "fontSize": 16,
        "fontWeight": 600,
        "lineHeight": 24
      },
      "spacing": {
        "paddingTop": 12,
        "paddingRight": 24,
        "paddingBottom": 12,
        "paddingLeft": 24
      },
      "radius": {
        "borderRadius": 8
      },
      "shadows": {},
      "layout": {}
    }
  }
]
```

## Tips

1. **Node IDs**: Use descriptive, unique IDs that match between Figma and your HTML
2. **Colors**: Use hex format (`#ffffff`) or RGB objects
3. **Spacing**: Use pixels (numbers) or strings with units (`"16px"`)
4. **Typography**: Font sizes should match your design system
5. **Optional Fields**: You can omit empty objects (`{}`) or undefined values

## Troubleshooting

**Q: How do I find the node ID in Figma?**
- Select an element in Figma
- Look at the URL: `?node-id=123-456`
- Convert to API format: `123:456` (hyphen → colon)

**Q: Can I extract multiple nodes at once?**
- Yes! Use comma-separated node IDs: `?ids=123:456,789:012`

**Q: What if my Figma file is private?**
- **With MCP**: No token needed! Just open the file in Figma Desktop
- **Without MCP**: You need a Figma Personal Access Token with access to the file
- The token must have the file in its accessible files list

**Q: Do I need a Figma Personal Access Token?**
- **No, if using MCP!** Just ensure:
  - DesignQA backend is running (`http://localhost:3847`)
  - Figma Desktop is running with your file open
  - MCP will be used automatically
- **Yes, only as fallback** if MCP is unavailable (backend not running or Figma Desktop closed)

**Q: How do I match web elements?**
- Add `data-figma-node-id="your-node-id"` attribute to HTML elements
- The extension will automatically find and compare matching elements
