# Real-time Seat Updates Implementation Plan

**Goal:** Keep event seat maps fresh after inventory changes without manual reload.

**Architecture:** Socket.IO event rooms send privacy-safe invalidation messages after MongoDB transactions commit. The browser fetches the authoritative seat map after room subscription, reconnection, and each notification.

**Tech Stack:** Express, Socket.IO, React, TypeScript, MongoDB.

**Spec:** docs/superpowers/specs/2026-10-17-realtime-seat-updates-design.md

## Tasks

1. Test and implement the Socket.IO server, validating event IDs and isolating rooms; integrate server lifecycle and development proxy.
2. Test and publish invalidations only after committed hold, release and expiry changes. No duplicate or failed mutation publishes.
3. Test and implement browser subscription, resync on connect/reconnect, notification-driven refresh, disconnect warning and cleanup.
4. Run all server and client tests, type checks, lint and builds; document local operation and the single-server limitation.
