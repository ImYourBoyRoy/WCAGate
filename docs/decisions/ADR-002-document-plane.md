# ADR-002: Document / PDF plane — withdrawn

## Status
Withdrawn (2026-08-16)

## Context

Phase 4 briefly added `document-evidence` wrapping veraPDF. veraPDF already is the PDF/UA checker. A second scorer or in-process PDF parser does not belong in this evidence gate.

## Decision

Remove PDF/UA collection from this package. Use veraPDF (or PAC) directly when a product ships tagged PDFs. This engine stays on rendered web, Svelte, Tauri, Bevy, Godot, command/native JSON, and manual evidence.

## Consequences

- No `document-evidence` adapter, no `init --preset document`, no veraPDF doctor checks.
- Historical 2.2.0 notes mentioned a document plane; 2.3.0 removes it before GitHub publish.
