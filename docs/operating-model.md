# Opero Operating Model

## Current Phase: Internal Operations

Opero is currently operated as an internal system for our own company. Admins and Managers run the complete property lifecycle and encounter real defects before any external owner does.

The current priority is production stability and revenue:

`Create -> Photos -> Edit -> Pricing -> Availability -> Publish -> Public Catalog -> Booking -> Staff Operations -> Check-in -> Cleaning -> Maintenance -> Check-out -> Reporting`

A defect that blocks this path is P0/P1. The remediation loop is:

`Real flow -> root cause -> fix -> regression test -> local verification -> production rollout -> real recheck`

## Access Contract

- **Admin:** full internal operations, including properties, photos, pricing, calendar, publication, bookings, clients, tasks, and operations.
- **Manager:** the same internal property and operations workflow within their organization.
- **Employee:** only the permissions explicitly provided by the existing permission contract. Do not expand employee access implicitly.
- **Property Owner:** read-only access limited to the existing owner portal. No object creation or editing, photo management, publication controls, or staff permissions.
- **Client/Guest:** published catalog, search, dates, quotes, booking requests, own account bookings, support, and Opero AI.

Property Owner self-service is intentionally closed. Do not add owner upload/edit policies as a shortcut for internal defects.

## Internal Dogfooding Gate

Do not open Owner Self-Service until the internal team has used the complete operational flow without critical errors across property creation, photos, editing, pricing, availability, publication, booking, account, support, notifications, mobile, permissions, RLS, and audit behavior.

Test counts alone are not sufficient for this decision. The gate is based on sustained real internal usage and the absence of critical revenue blockers.

## Future Phases

- **Phase 2: Property Owner Self-Service.** A separate contract with moderation, review, Admin approval, and publication. Owners must not receive staff access.
- **Phase 3: Partner Companies / SaaS.** Partners use the already-proven Opero engine; Opero's own operations remain the priority.

## Revenue Blockers

Photo upload, object persistence, pricing, calendar, publication, catalog visibility, booking conversion, booking visibility, support availability, and staff operations are revenue-critical. Fix these before adding new marketplace or partner features.
