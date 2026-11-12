# Public landing page

**Owner request:** 2026-11-13 — replace the release placeholder at `/` with a landing page.

This presentation slice refines [UI §7.1](../../specs/ui-specs.md#71-public-landing-and-login) and the public route in UI §5. It adds no API, permissions, registration flow or workflow capability. The visual reference remains the [Maintenance Tracking System](https://github.com/oangsa/maintenance-tracking-system); existing semantic tokens, Tailwind and Lucide remain authoritative.

## Acceptance criteria and design

- **LAND-01:** Public SSR contains the product identity, a clear request/approval introduction, a sign-in link to `/auth/login`, and a useful three-step workflow overview. Remove the outdated Lab 5/Sprint 1 placeholder copy.
- **LAND-02:** A static, explicitly labelled illustrative request explains submission, review and decision. It contains no user-derived data, fake live metrics or interactive controls that do nothing. The landing page performs no business-data queries.
- **LAND-03:** Header navigation, skip link, overview anchor and sign-in actions work with keyboard input. Use one primary heading, semantic landmarks, visible focus, readable wrapping and nonessential transitions disabled under reduced motion. At 390px and 1440px, no page-level horizontal overflow or hydration errors.
- **LAND-04:** An identity already authenticated in the current client session visiting `/` navigates to `/dashboard`. A fresh public load remains SSR-safe and does not probe for a refresh cookie; existing protected-route session restoration is unchanged.
- **LAND-05:** Deployment smoke validates the product title and main content landmark instead of the outdated release slogan, while retaining exact release-SHA and health checks. These markers also support rollback to the earlier public page.

Implementation: thin home route; pure presentation in `app/modules/landing/LandingPage.tsx`; no stylesheet, dependencies, shared contracts or database changes. Neutral split hero pairs the introduction with a bordered workflow example, followed by an ordered process and compact source footer. English copy follows the current app baseline; global theme/language preference controls remain separate work, not claimed complete here.

## Verification mapping

| Criteria | Checks |
| --- | --- |
| LAND-01–02 | `apps/web/tests/components/home.test.tsx`; public SSR assertion in `e2e/smoke.spec.ts` |
| LAND-03 | Desktop/mobile hydration, anchor, keyboard and reduced-motion checks in `e2e/smoke.spec.ts`; screenshot inspection |
| LAND-04 | Authenticated home-route component regression |
| LAND-05 | `deploy/smoke.ts` marker aligned with public SSR; workspace typecheck and build |

Record actual execution in `verification.md`. Feature branch targets `sprint-1-staging`; teammate review and staged promotions remain required.
