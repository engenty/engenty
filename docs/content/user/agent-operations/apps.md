---
title: Apps
description: Small purpose-built tools an agent can write, release and run inside your workspace.
---

# Apps

An app is a small tool built for one job — a calculator, a form, a tracker —
that lives in your workspace. Agents can author them, and the release path is
deliberately explicit: a draft is built and **proposed**, someone approves it,
and only then is it live. A previous version can be redeployed at any time.

Each app has a **config** (settings, per user or per workspace) and a **working
store** (its data).

| Operation | | What it does |
| --- | --- | --- |
| `app_list` | Reads | List apps in this workspace |
| `app_get` | Reads | Get an app and its active version |
| `app_workflows_list` | Reads | What actions an app declares |
| `app_versions_list` | Reads | List versions, newest first |
| `app_call` | Reads | Invoke a low-risk action on an app |
| `app_config_get` | Reads | Read one config key |
| `app_config_list` | Reads | List an app's config keys |
| `app_data_get` | Reads | Read one key from the working store |
| `app_data_list` | Reads | List working-store keys |
| `app_create` | Writes | Create an app |
| `app_file_write` | Writes | Write files into the App's repository and commit |
| `app_release_propose` | Writes | Commit the work tree, build it and propose the release |
| `app_release_approve` | Writes | Activate a proposed version |
| `app_release_reject` | Writes | Reject a proposed version |
| `app_release_rollback` | Writes | Redeploy a previous version |
| `app_archive` | Writes | Archive an app — the per-app off switch |
| `app_call_privileged` | Writes | Invoke a high-risk action — approval required |
| `app_config_set` | Writes | Write a config key |
| `app_config_delete` | Writes | Delete a config key |
| `app_data_set` | Writes | Write a key into the working store |
| `app_data_delete` | Writes | Delete a key from the working store |
| `app_data_export` | Writes | Export the working store |

If an app ever misbehaves, `app_archive` is the single switch that takes it out
of service without deleting its history.
