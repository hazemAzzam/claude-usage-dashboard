# Design mockups

The `*.dc.html` files are the visual spec for the sidebar redesign. Each one is a single screen, 1440×1000:

| File | Screen |
|---|---|
| `Main.dc.html` | Overview |
| `Sessions.dc.html` | Sessions, including the date-range dropdown (open) |
| `Projects.dc.html` | Projects |
| `Daily.dc.html` | Daily |
| `Compare.dc.html` | Compare days |
| `Efficiency.dc.html` | Efficiency |
| `Patterns.dc.html` | Patterns |

They were exported from a design canvas, so they are **not** plain HTML pages. Each file has two parts:

- **Markup** inside `<x-dc>`, using `{{holes}}`, `<sc-for>` and `<sc-if>` template tags.
- **A `renderVals()` script** that generates **sample data**. The numbers in these mockups are made up. They show what each screen displays, not real usage.

Read them for layout, hierarchy and which insight each chart carries. Don't use them as a source of data or logic. The real derivations live in `hooks/*` and `lib/usage.ts` (see `CLAUDE.md`).

## Colours and sidebar in the implementation

The implementation's tokens **mirror the mockups' palette**: every hex in these files is a token in `app/globals.css` (oklch triplets, hex kept in comments), mapped in `tailwind.config.ts`. See "Theme" in `CLAUDE.md` for the token-to-hex table and roles. Components are shadcn's, with the `dashboard-01` sidebar structure (inset variant, NavMain / NavSecondary / footer row).
