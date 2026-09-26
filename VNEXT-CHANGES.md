# Restaurant OS vNext changes

This source package is based on the uploaded live-server snapshot, not the old MVP archive.

Implemented/extended areas:
- Games V2: server-side sessions/reward validation and Kitchen Rush second game.
- Inventory feature flag and inventory domain (items, locations, movements, recipes/BOM, suppliers, purchase orders/receipts).
- Customer membership plans/subscriptions/benefits/payments and checkout/loyalty integration.
- Notification realtime fan-out fix, web push plumbing and waiter-call escalation.
- PWA manifest/service worker/install assets and safe static caching.
- POS terminal feature flag, terminal entities/intents and POS cashier flow integration.
- Universal Terminal Bridge with HTTP JSON, TCP JSON, TCP text/ECR, command/SDK and mock drivers.
- Database migration for vNext models/settings.

## Important deployment note
Physical terminals use PSP/vendor-specific ECR protocols. The Universal Terminal Bridge keeps Restaurant OS stable and lets each PSP/model be added via a profile or driver. USB/Serial/COM models normally use the vendor's certified SDK/EXE through the `command` driver.

## R5 — operational notifications, membership UI, tenant panel theme

- Push notifications are no longer a tenant-level optional toggle. Browser/OS permission remains mandatory by platform rules, but FoodOS now registers/re-registers an allowed device automatically after sign-in.
- Removed the manual Push activation card/switch from Settings; PWA install remains available separately.
- Realtime staff notifications now trigger an in-app toast and audible chime for operational events. Waiter-call sound remains owned by the waiter escalation bar to avoid duplicate ringing.
- Service Worker push notifications explicitly request normal OS alerting (`silent: false`) plus supported vibration/interaction hints.
- Membership plan and grant/sale forms were redesigned with real labels above every field, no placeholder-as-label UI, units, cleaner surfaces and one-row XL desktop layout.
- Restaurant menu theme now propagates to authenticated Admin/POS/KDS surfaces. Explicit staff light/dark preference preserves brand colours while converting the neutral palette.
- Theme read access was widened to operational staff roles so POS/KDS users can receive the tenant theme without gaining theme-management permission.

## R6 — games architecture and gameplay repair

- Replaced the old single-active-model game setting with an ARCADE config stored in the existing JSON column; Wheel of Fortune and Kitchen Rush can now be enabled independently and shown together without a database migration.
- Existing `KITCHEN_RUSH` tenants are migrated in-memory to keep their Rush settings while restoring the wheel with safe defaults. Existing `SPIN` tenants keep their wheel and receive the new Rush defaults.
- Wheel cooldown and Kitchen Rush cooldown are independent. Playing one no longer locks the other.
- Wheel reward selection uses Node crypto randomness and remains server-authoritative.
- Rebuilt Kitchen Rush as a 60–180 second memory/service game with 2→4 item orders, preview/recall phases, progressively shorter timers, lives, combo multipliers, Fever x2, server-owned sessions and reward validation.
- Fixed stale React timer closures, timeout handling, rapid double-click edge cases and the backend score ceiling that previously rejected legitimate Fever/Combo scores.
- Upgraded the separate “شرط ببند” bill game to three rounds per player with false-start penalties, average/best reaction stats, turn rotation and final ranking.
- Rebuilt the admin game screen around two independent game cards and fixed the recent-play feed to label Wheel vs Kitchen Rush.
