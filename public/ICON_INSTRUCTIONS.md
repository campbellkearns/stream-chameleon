# Icon Files Instructions

## Generated Icons Needed

The PWA configuration expects these icon files in the `/public` directory:

### Required Files:
- `favicon.ico` (32x32 ICO format)
- `apple-touch-icon.png` (180x180 for iOS)
- `pwa-192x192.png` (PWA standard)
- `pwa-512x512.png` (PWA standard)
- `pwa-512x512-maskable.png` (Android adaptive)

### How to Generate:
1. Open the Icon Generator tool (icon-generator.html) in your browser
2. Click "Generate All Icons" to create all required sizes
3. Download each file and place in the `/public` directory
4. Rename files to match the required names above

### Current Status:
✅ SVG source files created (icon.svg, favicon.svg)
⏳ PNG files need to be generated using the tool
⏳ Update index.html with proper favicon references

### Design Details:
- **Symbol Color**: #6366F1 (indigo), solid
- **Background**: #0D0E12 (near-black), solid
- **Style**: Flat. No gradients, glows, tinted rings or opacity fades
- **Symbol**: Abstract radio waves + profile card representation
