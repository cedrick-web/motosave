# Gopher font setup

MotoSave's web design uses the CSS family stack Gopher, Inter, system-ui, sans-serif. The mobile style system references Gopher as the preferred family, with a platform fallback.

**Gopher is a commercial typeface by Adam Ladd Design.** The repository does not redistribute font binaries. Obtain a suitable web and app license for the intended deployment and user volume before self-hosting font files.

## Web

Place licensed WOFF2 files in apps/web/public/fonts/, for example:
- Gopher-Regular.woff2
- Gopher-Medium.woff2
- Gopher-Bold.woff2

Then add matching @font-face declarations to apps/web/src/styles.css using those exact filenames.

## Mobile

Place licensed mobile-compatible TTF/OTF files in apps/mobile/assets/fonts/, then load them with Expo Font (useFonts) and assign the loaded family to the typography tokens. Do not add a reference to a missing file; Expo must be able to resolve each font asset at bundle time.

Official typeface information and licensing: https://ladd-design.com/family/gopher/
