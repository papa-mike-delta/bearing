# Changelog

All notable changes to Bearing will be documented in this file.

## [Unreleased] — V1 release preparation

- Seven canonical Item kinds, Me, optional Projects, classified Areas/Tags and typed Links.
- Quick Capture, Daily Journal, offline text outbox, connected People/Places,
  independent Habit Routine occurrences, Focus Activity and grounded conversational Coach.
- Truthful landing page/SEO/PWA metadata and an actual V1 Journal screenshot.
- Invitation-only login guidance and explicit per-account demo progress/readiness/errors;
  shared legacy demo seed is disabled while V1 is enabled.
- Settings export/clear/restore with typed confirmation and pending-outbox protection.
- Task recurrence setup and occurrence-history links in the V1 editor.
- Current help, setup, architecture, backup and preview/rollback runbooks.
- Consolidated isolated browser release suite and CI, plus concurrent/failed demo tests.

Hosted preview, live-provider smoke checks and production approval remain separate
release gates. Earlier entries below describe the **historical legacy app**, not
current V1 promises.

## [1.0.0] — 2026-06-19

### Added
- Digital Brain with bi-directional linking (17 item types)
- Master Calendar with layer filtering
- Quick Capture (⌘K) with inbox processing
- Focus timer with custom durations, sound, and habit auto-logging
- Rich WYSIWYG journal editor with MDXEditor
- Reviews & reflections (daily + weekly) with mood/energy tracking
- Insights dashboard with mood trends, habit heatmaps, and finance charts
- Brain Graph (force-directed network visualization with zoom/pan/search)
- Sanctuary (breathing exercises, affirmations, vision board)
- Weekly Agenda view
- Command palette (⌘P) with Vim-style navigation
- Keyboard shortcuts overlay (?)
- Authentication with email/password + optional TOTP 2FA
- QR code login (sign in on another device from Settings)
- PWA support (installable, manifest)
- Browser notifications for overdue tasks
- Onboarding flow for new users
- Data backup/restore (JSON export/import)
- CSV export (finances, reviews, all items)
- Recurring task automation (scheduler runs on page load)
- AI Smart Inbox Processing (configurable provider: Z.AI SDK, OpenAI-compatible, custom)
- Settings page with AI toggle, provider config, theme, notifications, database info
- Public landing page at /
- Domain-specific widgets for all 8 life domains
- Animated view transitions
- Dark mode with system detection
- Docker support (Dockerfile + docker-compose)
