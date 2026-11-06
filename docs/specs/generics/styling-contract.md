# Styling contract

**Status:** Derived engineering guideline, 2026-11-06. Documentation only; no UI implementation or passing acceptance tests asserted.

**Authority:** [UI specification](../ui-specs.md) §§1–4, 6, 13–15; [product specification](../specifications.md); [SRS](../srs.md); [system design](../system-sds.md); root [AGENTS.md](../../../AGENTS.md). Frozen behavior takes precedence. Numeric visual defaults below remain adjustable implementation defaults, not a new freeze.

## 1. Approval System scope and authority

This contract supports the single-organization Workflow and Approval System: requester forms and tracking, assigned/delegated review, and administrator configuration and minimal escalation routing. Apply the product → API → UI authority order from `specifications.md` §2.2, including the owner's Lucide and interaction-motion clarifications in `ui-specs.md` §§2.5–3.

| Approval surface                 | Required presentation boundary                                                                                                                          | Project authority               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Request creation / returned edit | Five-step wizard as applicable; incomplete Save Draft remains available after type selection; returned edits retain the original pinned form definition | UI §8.2; DEC-07, DEC-09, DEC-13 |
| Approval progress / decisions    | One or two ordered stages, parallel ALL slots; partial approval stays PENDING; Approve/Reject/Return confirmation, required Reject/Return reason        | UI §§9–10; DEC-02, DEC-10       |
| Request and review collections   | Same server-authorized records/actions in desktop tables and compact mobile cards                                                                       | UI §§4, 6, 8, 10; UI-AC-17      |
| Administration / escalation      | Configuration and routing-only task summaries; no private request-title/body/detail access merely from Admin role                                       | API §§4, 6.5.1; UI §11.6        |
| Amounts / due dates              | Exact server totals and policy ceilings, no remaining-budget balance; Bangkok business-hour deadlines                                                   | DEC-03, DEC-06, DEC-12          |

Shared layout recipes must preserve these flows. A generic card/table/form pattern cannot replace the wizard, decision confirmation, pinned revision display or role-specific projection. Only approved capabilities belong in the shell; maintenance assets, repairs, inventory, work orders and chart dashboards are outside this project's scope.

Requirements inherited from the project specs and explicit owner decisions are binding. Class recipes, spacing, sizes and individual icon glyphs are implementation defaults; this document does not promote them into additional product requirements. Reference source notes are retained in §7 for provenance only.

## 2. Styling ownership

- Tailwind CSS is the application styling system. Keep necessary imports, semantic CSS variables, theme mappings and minimal shared base setup in `apps/web/app/app.css`.
- Use semantic utilities such as `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, `text-destructive` and `focus-visible:ring-ring`. Add missing status/sidebar tokens centrally when implementation is authorized.
- Reuse existing shadcn primitives and `cn`/component variants. Put shared recipes in reusable wrappers; put feature behavior under `app/modules/`. Keep route modules thin.
- Do not customize raw/generated shadcn components with feature logic. No extra component CSS selectors, CSS Modules, Sass, CSS-in-JS, second styling framework or scattered hex literals. Avoid appearance `style` props; generated animation transforms/opacity are the UI-spec exception.
- Use **Lucide** through `lucide-react` for all application UI icons, as explicitly selected by the owner on 2026-11-06 and recorded in UI §2.5. Adapt reference icons to Lucide equivalents; do not substitute another icon library or emojis. Keep sizing, stroke weight and alignment consistent. Icon-only actions need translated accessible names; decorative icons accompanying text are hidden from assistive technology.

The current stylesheet already supplies neutral light/dark shadcn tokens. This document does not claim that the complete shell, theme preference handling, typography or status palette is implemented.

## 3. Palette and hierarchy

These values reproduce UI §2.2 defaults; centrally defined OKLCH equivalents are acceptable. Do not paste them into feature components.

| Role              | Light                     | Dark                      | Intended use                    |
| ----------------- | ------------------------- | ------------------------- | ------------------------------- |
| Background        | `#FFFFFF`                 | `#09090B`                 | Page canvas                     |
| Subtle background | `#FAFAFA`                 | `#0F0F11`                 | Secondary regions               |
| Surface           | `#FFFFFF`                 | `#18181B`                 | Cards, dialogs, panels          |
| Foreground        | `#09090B`                 | `#FAFAFA`                 | Titles and primary content      |
| Muted foreground  | `#71717A`                 | `#A1A1AA`                 | Hints, secondary labels         |
| Border            | `#E4E4E7`                 | `#27272A`                 | Dividers and control boundaries |
| Primary action    | Almost black / white text | Almost white / black text | Main action                     |

Use borders before shadows. Avoid decorative gradients, glassmorphism, heavy elevation and ornamental illustrations. Use a quiet outline/ghost treatment for secondary actions and a destructive variant only for destructive intent.

Frozen semantic meanings from UI §2.3:

| API state   | Color family     | English label         |
| ----------- | ---------------- | --------------------- |
| `DRAFT`     | Neutral/slate    | Draft                 |
| `PENDING`   | Amber            | Pending approval      |
| `RETURNED`  | Blue             | Returned for revision |
| `APPROVED`  | Green            | Approved              |
| `REJECTED`  | Red              | Rejected              |
| `WITHDRAWN` | Neutral/dim gray | Withdrawn             |

Task `WAITING` and `ACTIONABLE` use distinct neutral/amber treatments. Overdue is an additional warning, never a replacement request state. Priority has its own label and meaning. Every status includes text; color alone cannot communicate state. Verify both themes and disabled/error/focus combinations.

## 4. Shared layout recipes

The recipes are implementation defaults and composition guidance, not mandatory literal class strings.

| Element            | Default recipe / behavior                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Typography         | Inter with system sans fallback and Thai-capable fallback; readable Thai line height; no uppercase treatment that harms localized labels |
| Page title         | `text-2xl font-semibold tracking-tight`, optionally larger on desktop; one primary heading                                               |
| Body / helper      | `text-sm` or `text-base`; helper `text-sm text-muted-foreground`; readable wrapping                                                      |
| Page content       | `min-w-0 space-y-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8`; maximum width around 1440px                                                       |
| Surface            | `rounded-lg border border-border bg-card text-card-foreground p-4 sm:p-6`; radius roughly 8–12px                                         |
| Header/actions     | Stack on small screens; `flex flex-wrap items-center justify-between gap-3` where space allows                                           |
| Form section       | `grid grid-cols-1 gap-5 md:grid-cols-2`; field labels, hints and errors grouped with `space-y-2`                                         |
| Form actions       | `flex flex-col-reverse gap-3 sm:flex-row sm:justify-end`; clear busy/disabled feedback                                                   |
| Tables             | Local `overflow-x-auto`, muted header, crisp row dividers; numeric values right aligned, `tabular-nums` when useful                      |
| Lookup             | Read-only display label plus Lookup/Clear actions; stack at narrow widths; follow [lookup guideline](./lookup-table-guideline.md)        |
| Collection toolbar | Search, filter action/count and page size; active removable filter chips; follow [filter guideline](./filter-search-guideline.md)        |

Desktop around `lg`/1024px uses an approximately 248px expanded sidebar with collapse to an icon rail. Tablet supports a compact sidebar/drawer. Below 768px, use a managed drawer and single-column forms/details. Main Requests and Review Queue collections render compact accessible cards from the same results, query state and action definitions as desktop tables. Admin tables may scroll inside their own container. Sticky controls must not obscure content or focus; prevent whole-page horizontal overflow.

The authenticated shell includes breadcrumb/title, account menu, notification bell, and theme/language controls. Show only relevant combined role sections; omit empty sections. Public pages support SSR. Authenticated routes remain client-data-driven with safe hydration/loading fallbacks: `ssr: true` does not disable SSR for a route or authorize embedding private data in HTML.

## 5. Interaction, theme and language

- Use semantic HTML, labels associated with controls, `aria-invalid` and error descriptions, keyboard-visible focus, proper dialog focus trap/return and keyboard-operable menus/sorting. A clickable table header alone is insufficient.
- Show distinct initial loading, refreshing, empty dataset, filtered no matches, validation failure and recoverable request error states. Error messages must not reveal SQL/stack/private data. Do not render failed requests as successful empty lists.
- Theme choices are System / Light / Dark. First visit follows the system; explicit choice persists. System mode follows later system changes. Keep browser API access out of SSR render and avoid hydration mismatches/conspicuous flashes.
- Language choices are Thai / English. Use the first supported browser/request preference, otherwise English; explicit choice persists. Translate navigation, statuses, errors, dialogs, table controls and accessible labels. Configured labels use requested language with English fallback; API keys remain stable.
- Show instants in `Asia/Bangkok`; preserve calendar-only dates. Format exact decimal strings without floating-point loss; server totals remain authoritative.
- Include subtle interaction motion for hover/focus feedback, sidebar collapse/mobile drawer changes, and dialog/tab transitions, following the owner-approved clarification in UI §3. Tailwind transitions are the default. Optional justified Motion for React uses `motion/react`, never legacy `react-motion`. Around 120–220ms is a default, not a requirement. Disable nonessential motion for reduced-motion preferences; actions and server-confirmed results must never wait for animation, and focus must remain stable.
- Keep secrets and user-scoped records out of browser persistence/public SSR. Clear user data and caches on logout or identity/permission changes; non-secret theme/language preferences may persist.

## 6. Planned verification and traceability

Before accepting a future implementation, verify keyboard-only shell/forms/dialogs/table actions; visible focus; consistent Lucide icons and accessible names; light/dark/system changes and reload; Thai/English preference/fallback and long labels; subtle hover/focus, sidebar/drawer and dialog/tab motion with reduced-motion alternatives and no action delays; loading/error/no-match distinctions; mobile request/review card parity; and no private SSR/account-switch residue.

These checks refine existing [UI acceptance](../ui-specs.md) `UI-AC-07`, `10`–`12`, `17`–`20` and [test plan](../test.md) UI/accessibility/security suites. Preserve the [traceability matrix](../traceability.md); do not add product features or mark planned checks passed through this guideline.

## 7. Reference source notes

Use the Maintenance Tracking System frontend as the structural UI reference. Source reviewed at commit `03c7801ba265cf90ed3403d29679f2d597b42e55`:

| Observed source                                                                                                                                                | Pattern to adapt                                                               | Approval System boundary                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [LayoutMain](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/layouts/LayoutMain.tsx)                   | Sidebar provider/inset, sticky header, padded outlet, loading shell            | Combined role navigation, notification bell, theme/language controls; no pretend client role authority |
| [PageHeader](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/components/Maintain/PageHeader/index.tsx) | Shared title, description and action composition                               | Use request/approval language and authorized actions                                                   |
| [DataTable](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/components/Common/DataTable/index.tsx)     | Quiet toolbar, bordered table, filter chips, pagination                        | Server results; compact mobile request/review cards; keyboard-sort buttons                             |
| [Form styles](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/components/Common/Form/styles.ts)        | Shared Tailwind recipes for field groups, details, actions and lookup controls | Compose shadcn primitives; use semantic theme tokens                                                   |
| [Central stylesheet](https://github.com/oangsa/maintenance-tracking-system/blob/03c7801ba265cf90ed3403d29679f2d597b42e55/app/app.css)                          | Neutral palette, Inter, borders, restrained surfaces                           | Re-express legacy component selectors in Tailwind; retain visible focus                                |

The reference includes legacy `.btn`/`.card`/form/table selectors, inline appearance styles, and global rules suppressing button focus outlines. These are observations, not adopted practices. Its business statuses, chart dashboards and maintenance routes do not define this product.
