# AI_RULES

Project guidance for `chat-demo`: a static, backendless chat UI that talks directly to a
DeepSeek-compatible API from the browser. Keep it building as a single static bundle that also
works when `index.html` is opened from `file://`.

## Tech Stack

- **Language:** TypeScript in `strict` mode with `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitReturns`, `noImplicitOverride`, and `useUnknownInCatchVariables`; TSX via
  `react-jsx`, `module`/`moduleResolution` set to `NodeNext`.
- **Runtime/UI:** React 18 + `react-dom/client` (`src/main.tsx` renders `<App />`). No React
  Router — the app is one view, and "navigation" is store state (`activeId`, dialogs, panels).
- **Build:** rspack 2 + `builtin:swc-loader` (`rspack.config.ts`); CSS through
  `builtin:lightningcss-loader`; `HtmlRspackPlugin` with `scriptLoading: 'defer'`;
  `publicPath: 'auto'` so async chunks load relatively.
- **Styling:** plain CSS + CSS Modules (`*.module.css`) with design tokens in
  `src/app/theme.css` and globals in `src/app/global.css`. No Tailwind, no CSS-in-JS, no UI kit.
- **State:** `zustand` `create` stores plus module-level action functions
  (`services/chat/store.ts`, `services/settings.ts`, `services/attachments.ts`).
- **Storage:** `idb` (IndexedDB) for conversations and attachment blobs
  (`services/chat/db.ts`); plain `localStorage` for settings and the API key
  (`services/settings.ts`).
- **Network:** native `fetch` with a hand-written SSE reader (`services/api/sse.ts`,
  `parseEvent.ts`) against Anthropic-compatible Messages / Files / speech endpoints.
- **Content rendering:** mdast + micromark pipeline for Markdown, `prismjs` for code,
  `katex` for math, `mermaid` for diagrams; `fflate` for ZIP history import/export.
- **Tooling:** `pnpm` scripts — `dev` (port 8090), `build`, `type` (tsc), `lint` (oxlint),
  `format` (oxfmt). Node 22.12+.
- **Config surface:** `__API_ORIGIN__` is injected by `DefinePlugin` and declared in
  `src/env.d.ts`; `createConfig({ apiOrigin, devServer })` customizes it.

## Rules: what to use for what

### Styling and layout

- Style components with a co-located `Component.module.css` and
  `import styles from './Component.module.css'` (CSS Modules use default exports; do not enable
  named exports). Never add global selectors for a single component; use `global.css` only for
  app-wide rules and `theme.css` for tokens.
- Combine conditional classes with `clsx` (see `src/components/base/Button.tsx`). Do not add
  `classnames`, `tailwind-merge`, or `styled-components`.
- Reuse the tokens/variables and theme mechanism already in `src/app/theme.ts` +
  `theme.css` (light/dark/system). Do not hard-code colors that exist as tokens.
- Use `rem`/`em` and the existing responsive patterns (`src/app/viewport.ts`,
  `useIsMobile`); mobile-specific UI is driven by these hooks, not media-query-only hacks.

### Components

- Prefer the existing primitives in `src/components/base/` (`Button`, `IconButton`, `Menu`,
  `Modal`, `Select`, `Toast`, `Tooltip`) and extend them with new props/variants instead of
  introducing a component library or a second button/dialog implementation.
- Icons are inline SVG in `src/components/base/icons.tsx`; add new icons there. Do not add
  `lucide-react`, `react-icons`, or an icon font.
- Group feature components by domain (`chatInput/`, `messages/`, `settings/`, `sider/`,
  `search/`, `markdown/`, `files/`, `session/`). Keep components presentational; put logic,
  fetching, and persistence in `src/services/**` or in a `use*.ts` hook beside the component.
- Overlay/panel open-state that must be reachable from far-apart components lives in a small
  module store (`searchPanelState.ts`, `settingsDialogState.ts`, `mobileSiderState.ts`,
  `toastState.ts`), not React Context.

### State, storage, and data

- Global state is zustand. Subscribe with selectors (`useStore((s) => s.value)`) and mutate
  through exported actions in the store module; never mutate store state from components.
- All IndexedDB access goes through `services/chat/db.ts` (and the history modules). All
  `localStorage` access goes through `services/settings.ts`. Components and views must not
  touch storage APIs directly.
- Conversations, messages, and branches follow the model in `services/chat/types.ts` and
  `branches.ts` (append-only versions, `selectedChildId` for switching). Do not flatten the
  branch structure or delete old branches on regenerate/edit.
- Generate IDs with `createId()` from `src/utils/id.ts`; format dates/numbers with the helpers
  in `src/utils/format.ts`. Do not add `uuid`, `nanoid`, or `date-fns`/`dayjs`.
- Reuse `src/utils/*` for cross-cutting helpers (`clipboard.ts`, `abort.ts`, `url.ts`,
  `resizeUploadImage.ts`) before writing a new one.

### Network and API

- Add endpoints in `src/services/api/` (`client.ts` for requests, `sse.ts` for streaming,
  `types.ts` for protocol types, `errors.ts` for error mapping, `speech.ts` for ASR/TTS).
  Use `fetch` + `AbortController`; do not add `axios`, `openai`, an SDK, or `react-query`/`swr`.
- Always respect the request signal and surface failures as `ApiError` so the UI can render
  localized errors. Keep secrets (API key) in `useSettings` and never hard-code them or log them.
- Build URLs from `__API_ORIGIN__`; never assume same-origin endpoints, and never add
  server-side code (the app has no backend).

### Markdown, math, diagrams, archives

- Markdown renders through `Markdown.tsx` / `MarkdownAstRenderer.tsx` using the existing mdast
  pipeline (`mdast-util-from-markdown`, `mdast-util-gfm`, `mdast-util-math`,
  `micromark-extension-gfm`, `micromark-extension-llm-math`, `mdast-util-find-and-replace`).
  Extend `services/markdown/parse.ts` for syntax changes; do not add `react-markdown`,
  `remark`/`rehype` plugins, or `markdown-it`.
- Code highlighting uses `prismjs` via `services/markdown/highlight.ts`; math uses `katex` via
  `services/markdown/katex.ts`; diagrams use `mermaid` via `services/markdown/mermaid.ts`. Load
  these lazily the way those modules already do — do not add `highlight.js` or `mathjax`.
- ZIP import/export uses `fflate` only (`services/chat/history/zipReader.ts` / `zipWriter.ts`).
  Keep the archive schema in `history/schema.ts` and update `history/README.md` when the format
  changes.

### i18n and copy

- Every user-facing string goes through `src/i18n`: add the key to BOTH `zh.ts` (the source of
  truth for `TranslationKey`) and `en.ts`. Use `useTranslate()` in components and `translate()`
  in non-React code; never inline English/Chinese literals in JSX.
- Support `{placeholder}` params the way `src/i18n/index.ts` does; do not add `i18next` or
  `react-intl`.

### TypeScript and code style

- Write relative imports with a `.js` extension (`./store.js`); `resolve.extensionAlias` maps
  them to the `.ts`/`.tsx` source. Use `import type` / `export type` for type-only imports.
- Respect the strict compiler flags: no unused locals/params, handle `unknown` in `catch`,
  return explicitly where required, and avoid `any` — prefer precise unions (see
  `services/chat/types.ts`).
- Match the surrounding formatting (2 spaces, single quotes, no semicolons) and prefer named
  exports; keep comments short and in the file's existing language (Chinese in most source files).
- Avoid new dependencies unless the current stack genuinely cannot do the job; if you must add
  one, prefer a small, tree-shakeable package and verify `pnpm build` still produces a working
  `dist/` (including `file://` usage).
- Verify changes with `pnpm type`, `pnpm lint`, and `pnpm format`; run `pnpm build` for changes
  touching build config, dependencies, or the static-output assumptions above.

## Project layout

```text
src/
  app/          App shell, theme, viewport, global styles
  components/   Feature-grouped UI + base primitives
  i18n/         en.ts / zh.ts dictionaries and translation helpers
  services/     api, chat (store/db/history), markdown, speech, settings, attachments
  utils/        Pure shared helpers
```
