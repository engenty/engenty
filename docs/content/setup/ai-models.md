---
title: AI models
description: Choose which models your installation offers, what each plan includes, and how effort levels map to models.
---

# AI models

Engenty separates two decisions that are usually tangled together:

- **What models exist and may be used** — an operator decision.
- **How much thinking a piece of work deserves** — the everyday choice, made
  by whoever is doing the work.

People choose effort. Operators choose what fills it. That keeps model names
out of daily use, and means a new model release doesn't require touching
anyone's settings.

## The model catalog

Every model Engenty can reach lives in one catalog, synced from a gateway.
Superadmins manage it at **Manage → AI models**.

| Action | What it does |
| --- | --- |
| **Sync now** | Re-fetches the model list and prices from the gateway. |
| **Activate / deactivate** | Controls whether a model is offered anywhere in the installation. |
| **Filters and search** | Narrow by provider, gateway, price tier, capability, or release age. |
| **Pricing history** | Shows what each model has cost over time. |

Deactivating a model removes it from every picker immediately. Activating one
makes it selectable — it does not automatically start being used.

A scheduled sync keeps the catalog current. Enable it with
`AI_GATEWAY_MODEL_SYNC_ENABLED=true`; it runs daily by default.

### Gateways

Models are grouped by the **gateway** that serves them, which is separate from
the **provider** that made them — Anthropic is a provider, and the gateway is
whoever you reach it through. The catalog stores both, so the same model served
by two gateways is two rows with their own pricing and availability.

Vercel AI Gateway ships as the default. Additional gateways are added by
registering an adapter; see the developer guide.

## What each plan includes

Plans grant **effort levels** rather than lists of specific models. A plan that
includes low and medium covers every model an operator later binds to those
levels, including models that don't exist yet.

Set this per plan at **Manage → Packages**, and per tenant at
**Manage → Tenants → Entitlements**.

If someone requests a level above their plan, Engenty uses the highest level
they're entitled to and answers the request. A plan boundary changes the
quality of the answer, not whether they get one.

### Restricting to specific models

For self-hosted installations and unusual contractual requirements, a plan or
tenant can also be limited to named models or named providers:

- **Allowed models** — exact model ids.
- **Allowed providers** — every model from a vendor, including future releases.

The two combine as grants, not filters: a model is permitted if it matches
either list. Leave both empty for no restriction. Prefer provider grants to
model lists — a list of ids needs revisiting every time a vendor ships
something.

After changing a plan, use **Re-apply to tenants** on the package to roll the
change out to tenants already assigned to it. New assignments pick it up
automatically.

## Which model each effort level uses

Effort levels and specialist jobs (routing, safeguards, research, planning) are
each bound to a model. Bindings are created automatically on first start from
the installation's defaults, and are not reset afterwards.

Bindings are currently configured at the database level; there is no admin
screen for them yet. Everything else on this page is managed through the
Manage app.

## Tenant settings

Workspace admins see **Settings → AI**, which covers:

- Which effort levels the workspace offers.
- Budgets, spending limits, and enforcement mode.
- Per-agent effort.
- Usage reporting.

When a workspace is on a managed plan, its AI policy is set centrally and shown
read-only here; change it from the Manage app instead.

## Trying models during development

Set `ENGENTY_AI_DEV_MODELS=true` to make the whole catalog selectable
regardless of plan restrictions. Spending limits still apply, so this is for
trying models out — not a way around a plan.

Leave it unset in production.
