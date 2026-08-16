# ADR-001: This repository is the canonical WCAGate engine

## Status
Accepted

## Date
2026-08-16

## Context

The auditor was extracted from Portable Web Toolkit so websites and applications could share one evidence gate. After the extract, the toolkit copy continued to receive dashboard, source-locate, and frost/glass upgrades and became a full re-bundle. Agents then treated `Web_Toolkit/wcag_auditor` as canonical, including for Tauri apps that have no site profile.

Two full engines diverge. Site-profile helpers (`--site-profile`, ephemeral Astro configs, toolkit path discovery that forbids `AI/`) do not belong in a consumer-agnostic package.

## Decision

`AI/wcag-auditor` (`@imyourboyroy/wcagate`, product name **WCAGate**) owns adapters, gate policy, reporters, the optional HTML results page, presets, and local skills.

Portable Web Toolkit should keep a **thin site-profile bridge** that depends on this package. That bridge restoration is a follow-up in the toolkit repo, not a reason to re-vendor `src/toolkit/` here.

Until the bridge is thin again, document the contradiction: this package is the engine for apps and for sites that install it directly.

## Alternatives considered

- Keep the toolkit copy as the engine and leave this repo as a stale extract. Rejected: apps (pyenv-native, Tailscale GUI, DNA Tools) should not import site-profile code.
- Merge both trees into the toolkit. Rejected: this package is meant to be usable without Portable Web Toolkit.
- Duplicate dashboard/frost only in consumers. Rejected: that recreates the split.

## Consequences

- Version this package independently (2.3.0: renamed to WCAGate; PDF plane removed; CLI + MCP for coding models; optional `results.html`).
- Do not port `--site-profile` / `--from-profile` into this CLI.
- Consumer docs (`CONSUMERS.md`) tell operators to path-install this repo.
- Local skills in this repo never say "use the toolkit copy only."
