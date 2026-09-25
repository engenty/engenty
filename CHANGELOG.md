# Changelog

All notable changes to Engenty. Generated from [Conventional Commits](https://www.conventionalcommits.org/)
by [git-cliff](https://git-cliff.org) via `pnpm release`. Pre-`1.0`: a **minor**
bump is a notable or breaking change, **patch** is fixes and small features.

## [0.2.20] - 2026-09-25
- ADDED **[ai]** /company read-only company drive and a public folder per Space
- DOCS **[engenty-remote]** Staff preset comment names /space and /company

## [0.2.19] - 2026-09-24
- ADDED **[ai]** Per-Space egress allowlist — a Space computer reaches the shared registries plus the hosts its Space allows
- ADDED **[ai]** The computer prompt says the Space computer is the current_space's, so a new $HOME after the conversation moves Spaces reads as expected
- ADDED **[ai]** The Copilot uses the computer and browser of the Space the person stands in, and runs commands without approval
- ADDED **[engenty-copilot]** The Copilot runs on the person's personal Space computer
- ADDED **[ai]** Engenty.cli runs on the Space computer of the run it is delegated from
- ADDED **[ai]** A purged Space's folder, computer and browser are removed; each Space folder is measured with du against a quota
- ADDED **[ai]** One host root and one folder per Space — ENGENTY_SPACES_DIR holds each Space drive; the space computer's /sandbox is no longer synced
- ADDED **[ai]** Engenty tools list|schema|call in every sandbox shell, relayed over docker exec stdio with a ticket per command
- ADDED **[ai]** Browser_sign_in — a CLI on the Space computer signs in through the person in the Space browser, its loopback callback forwarded into the computer
- ADDED **[ai]** Computer skills are any skills/<name>/SKILL.md in $HOME or /sandbox, links inside the tree followed
- ADDED **[ai]** Skills and MCP servers an installer leaves on the Space computer are offered to the Space
- ADDED **[ai]** Delta fetch for thread messages via after/after_id
- ADDED **[notifications]** Short titles, stored links, decide at the source
- ADDED **[ai-ui]** The copilot's full chat on the sidebar's light fill
- ADDED **[ai-ui]** Messenger layout for agent bubbles
- ADDED **[ai-ui]** Clips and date lines in the chat, step list for developers
- ADDED **[ui]** Agent messages as bubbles, chosen in appearance settings
- ADDED **[ui]** The copilot steps aside while a guide is on screen
- ADDED **[ai-ui]** Name the guide step a click answered
- ADDED **[ai-ui]** Show a guide click as the button pressed, not the raw line
- ADDED **[ai-ui]** Show an agent-to-agent thread as the pair, not as the host's desk
- ADDED **[ai-ui]** Developer tools in the copilot's menu
- ADDED **[copilot]** Approval mode under the composer, voice from the blob only
- ADDED **[ai-ui]** Attach the copilot window to the sidebar from its title bar
- ADDED **[plugin-sdk]** Bind the approval mode to the agent, auto for the copilot
- ADDED **[copilot]** Welcome a new person in a window beside the blob
- ADDED **[engenty-specialists]** Add a getting-started skill for the first setup
- ADDED **[global]** Space-owned connections and a browser per Space
- ADDED **[ai]** Run the copilot out of its person's personal Space
- ADDED **[notifications]** One attention rule behind a Wichtig tab, toasts and Space dashboard cards
- ADDED **[ai]** Approve sandbox commands per exact command and per agent
- ADDED **[ai-ui]** Open a connection's details from the agent's connection rows
- ADDED **[ai-ui]** Move agent settings one level down behind a gear in the pane
- ADDED **[ai-ui]** List agent connections as logo rows above skills, actions in the headings
- ADDED **[manage]** Lead wire rows with timings and add hover copy on run rows
- ADDED **[ai-ui]** Scroll long routine prompts and show summary and destinations on routine cards
- ADDED **[ai]** Let coordinators remove specialists behind an approval card
- ADDED **[ai]** Ask before a routine gains an external destination where the Space asks
- ADDED **[ai]** Let routine tools set delivery destinations
- ADDED **[manage]** Fold wire chunks into one row and show compact run timings
- ADDED **[ag-ui-bridge]** Stamp trajectory rows with start/end times from stored events
- ADDED **[ai-ui]** Use the full-screen copilot header in sidebar and window
- CHANGED **[ai-ui]** Remove the copilot's context picker
- DOCS **[internal]** Tenant box marked superseded by the Space computer
- DOCS **[global]** Docs match the code on mounts, coordinators, artifact scopes and memory; Copilot manifest drops removed tool ids
- DOCS **[global]** Tighten test-writing rules for agents
- DOCS **[engenty-specialists]** Route notify requests to routine destinations
- FIXED **[ai]** Thread message writes drop U+0000, so a tool output carrying one no longer aborts the run
- FIXED **[ai]** Chat runs are told what their computer is — which paths the shell reaches, where installs go and whether they stay
- FIXED **[ai]** A space computer no longer binds a staged /data every run shares
- FIXED **[ai]** A space computer no longer binds the first run's /home for every agent
- FIXED **[ai-ui]** Chats land at their bottom before the first paint and stay where the person left them
- FIXED **[ai-ui]** A colleague's message is a bubble on the right, its name above and its face in the margin
- FIXED **[shell]** Park the closed hover column past its own shadow
- FIXED **[ai-ui]** The more menu sits last in a tall bubble's action column
- FIXED **[ai-ui]** Message actions stack beside tall bubbles, the link moves to a menu; replies fold only past 70vh, never the newest
- FIXED **[ai-ui]** Clip lines get a little more air
- FIXED **[ai-ui]** The copilot's full chat on its card fill, its own face in the margin
- FIXED **[ai-ui]** Actions under a bubble take no room until it is tapped
- FIXED **[ai-ui]** A new speaker opens with the full gap, clips included
- FIXED **[ai-ui]** A turn of only silent tools takes no gap and parts no bubbles
- FIXED **[ai-ui]** Measure chat gaps edge to edge
- FIXED **[ai-ui]** One spacing rule for the chat, a narrow lane like a phone messenger
- FIXED **[ai-ui]** Part bubbles where clips are drawn, not where calls sit
- FIXED **[ai-ui]** The agent's name on its first bubble with words
- FIXED **[ai-ui]** No face on a row without words, name only when the speaker changes
- FIXED **[ai-ui]** Hover actions beside the agent's bubble
- FIXED **[ai-ui]** A face on every bubble a clip or date line stands apart
- FIXED **[ui]** Two chat styles to pick, bubbles visible on every canvas
- FIXED **[ai-ui]** Each agent's own face beside its bubbles
- FIXED **[ai-ui]** The copilot's own face beside its bubbles
- FIXED **[app-shell]** Render guide bodies as Markdown, translate the close button
- FIXED **[app-shell]** Solid fill for the guide card
- FIXED **[engenty-copilot]** A closed guide's next step is a new show_ui_guide
- FIXED **[app-shell]** Keep the guide card on screen beside a full-height target
- FIXED **[auth-ui]** The setup wizard's language becomes the tenant's
- FIXED **[cli]** Retry the AI service credential check after a db reset
- FIXED **[ui]** Mount the AG-UI inspector inside the workspace provider
- FIXED **[ai]** Translate the copilot's welcome into the person's language
- FIXED **[ai-ui]** Name the pair in the desk crumb, link hand-offs to their thread
- FIXED **[ai-ui]** Keep close on the outer edge of the docked copilot header
- FIXED **[connections]** Read the connect card's state from its own Space
- FIXED **[i18n]** Load namespaces for a regional browser language
- FIXED **[i18n]** Start in the browser's language until the person chooses one
- FIXED **[ai]** Let the scheduler wait quietly for the first tenant
- FIXED **[ai-ui]** Never dock an older question behind a newer suspended one
- FIXED **[ai]** Keep the copilot oriented across a Space switch and an unanswered chooser
- FIXED **[ai-ui]** Keep the composer flap closed for an interrupt with no card
- FIXED **[ai]** Run the copilot in the Space the person stands in
- FIXED **[ai-ui]** Show a delegated approval as a summary, not as a shell command
- FIXED **[ai]** Do not announce the resumed tool call again
- FIXED **[engenty-specialists]** Hire a Chief of Staff as the Space coordinator, no Routine
- FIXED **[core]** Give the AI service credential connections and agent provisioning caps
- FIXED **[core]** Give the AI service credential connections and agent provisioning caps
- FIXED **[ai-ui]** Label routine destinations Zustellung and show the promise on prompt routines
- FIXED **[cli]** Re-mint the local AI service credential after db reset
- FIXED **[connections]** Ask agents to request a connect card once per conversation
- FIXED **[connections]** Show live connect state on chat connect cards
- PERFORMANCE **[ui]** The last three chats of a space stay mounted between visits
- PERFORMANCE **[ai]** Cache a granted Space entry for 30 s per tenant, user and Space
- PERFORMANCE **[ai-ui]** A settled run re-reads only the newest stretch of a long transcript
- PERFORMANCE **[ai]** Slim transcript pages, full row on expand
- PERFORMANCE **[core]** Index ai.thread_message for transcript paging by (created_at, id)
- PERFORMANCE **[ai-ui]** Long transcripts open tail first and skip off-screen rows
- PERFORMANCE **[ai-ui]** Transcript rows share one resize observer
- PERFORMANCE **[ai-ui]** Markdown blocks render once with the shared plugin set
- PERFORMANCE **[ai-ui]** Composer keystrokes no longer redraw the transcript
- PERFORMANCE **[ai-ui]** A streaming token redraws only the transcript row it lands in
- PERFORMANCE **[ai-ui]** Unchanged transcript messages keep their objects across stream events
- PERFORMANCE **[ai-ui]** Chats open from cache and load before they are clicked

## [0.2.18] - 2026-09-23
- FIXED **[ai]** Boot after DB reset when role bindings are still empty

## [0.2.17] - 2026-09-23
- ADDED **[ai]** Stamp catalog sync runs and keep new models inactive
- ADDED **[manage]** Capabilities and price columns, media and voice rows on model bindings
- ADDED **[ai-core]** Image, embedding, video and realtime model roles
- ADDED **[manage]** Classifier and fast text rows on the model bindings page
- ADDED **[manage]** Model catalog privacy, region and gateway settings polish
- ADDED **[ui-core]** Optional icon on ListFilterChip options
- ADDED **[core]** Mask the probed gateway key and test Mistral and SpaceX keys
- ADDED **[ai-core]** Add Mistral and SpaceX AI as direct model gateways
- ADDED **[ai]** Store data-usage coverage and inference regions per catalog model
- ADDED **[manage]** Model defaults export/reset, gateway settings and catalog UI
- ADDED **[core]** Test the stored gateway key when the probe gets none
- ADDED **[ai]** Commit model defaults with bindings and apply them on fresh catalogs
- ADDED **[a2ui-catalog]** Chart components and a composed inbox dashboard
- ADDED **[ai-ui]** Restrict /admin/engenty to superadmins in developer mode
- ADDED **[routines]** Add extensible outcome destination providers
- ADDED **[app-shell]** Widen ⌘K with space tabs and open copilot on ⌘O
- CHANGED **[ai]** Make platform role bindings the sole model source of truth
- CHANGED **[time-tracking]** Group summaries on the fast_text model
- CHANGED **[ai-core]** Collapse model roles to graded, classifier and fast text
- FIXED **[ai-ui]** Drop remaining normal-flow links into /admin/engenty
- FIXED **[ai]** Don't nudge a turn the provider failed
- FIXED **[ai]** Map unconfigured model gateway to a clear client error
- FIXED **[ai-ui]** Make Mod+. toggle dictation only in chat inputs
- PERFORMANCE **[ui]** Keep space switches off React’s 5s transition expiration

## [0.2.16] - 2026-09-22
- ADDED **[copilot]** The desk's ⋮ menu steps aside to sidebar or window over the space
- ADDED **[browser]** A person's browser is one — per user, not per space
- CHANGED **[copilot]** The companion draws the desk's lane — the dead suggestions chain is gone
- FIXED **[connections]** Drop unreachable marketplace filter checks
- FIXED **[ui]** Replace retired border-border/70 in Extensions detail
- OTHER **[desk]** The chapter menu is History/Verlauf behind a list-clock icon

## [0.2.15] - 2026-09-22
- ADDED **[connections]** Open a token form when imported setup cannot start OAuth
- ADDED **[extensions]** Install catalog connections and browse skills the same way
- ADDED **[connections]** Show registry logos, descriptions, and sign-in steps
- ADDED **[connections]** Add an Extensions marketplace for spaces and agents
- ADDED **[connections]** Replace personal/org sharing with a space plugin marketplace
- ADDED **[desk]** One desk for the copilot and the specialists — chapters on both
- ADDED **[manage]** Add Shortcuts to the user menu
- ADDED **[app-shell]** Add a searchable keyboard shortcuts palette
- ADDED **[copilot]** The river — one private conversation per person, with chapters and an alter ego
- FIXED **[agent-desk]** Keep the engenty mark inside a narrow chat column

## [0.2.14] - 2026-09-20
- ADDED **[ai]** Check a proposed hire for real tool ids, like a live one
- ADDED **[workflows]** Wizards — a graph run walked one page at a time
- ADDED **[kb]** Verify search candidates with Jev
- ADDED **[inbox]** Classify message categories with Jev
- ADDED **[ai]** Auto effort sizes turns with Jev instead of a language model
- ADDED **[typesafe-client]** Resolve Jev in one place behind a pooled connection
- FIXED **[wizards]** The desk keeps the record's card, not the specialist's JSON
- FIXED **[wizards]** A pressed wizard stays in the desk's dock until it settles
- FIXED **[ci]** Give the smoke lane the VITE_ env its browser needs (#20)
- FIXED **[ci]** Stop the open snapshot eating package.json's trailing newline (#21)

## [0.2.13] - 2026-09-20
- FIXED **[ci]** Pre-pull the images production runs, and verify the release after it lands (#19)
- FIXED **[ci]** Publish the engenty CLI via npm Trusted Publishing (#17)

## [0.2.12] - 2026-09-20
- ADDED **[ai-core]** Retire the gpt-5-nano seed for the low tier
- ADDED **[ai]** Fast loop decides the element first and types from the goal's own words
- ADDED **[ai]** Fast loop picks the best joint step and asks for a page's values once
- ADDED **[ai]** Let the agent pass the browser seat to the person and back
- ADDED **[ai-ui]** Open the person's browser pane when the agent starts browser work
- ADDED **[ai]** Gate fast-loop steps on probability margin, not absolute confidence
- ADDED **[typesafe-client]** Reach Jev through the Vercel AI Gateway
- ADDED **[ai]** Browser_run_fast — classifier-driven browser steps behind a switch
- ADDED **[typesafe-client]** TypeSafe System One client, key manifest and probe
- FIXED **[ai]** Keep the fast loop from calling a fillable calendar blocked
- FIXED **[ai]** Let the fast loop wait for the page to come to rest
- FIXED **[ai]** Stop calling the in-app UI tools "browser tools" in the prompt

## [0.2.11] - 2026-09-20
- DOCS **[readme]** Name agentOS and integrations.sh under "What it is built on"
- FIXED **[ci]** Green the verify lane and the nightly db-checks lane (#16)
- FIXED **[types]** Clear the five typecheck errors CI hits on main

## [0.2.10] - 2026-09-19
- ADDED **[specialists]** Scaffold engenty-specialists, a builtin module for hired engenties
- CHANGED **[specialists]** The floor entry, the hire policy and the standing appendix move into the module
- CHANGED **[specialists]** The Space playbooks ship with engenty-specialists, seeded by name
- DOCS **[readme]** List the apps/* workspace like the modules table
- DOCS **[specialists]** Dev notes — floor and lanes, routine approval, the hire dialog, the module plan
- FIXED **[ai]** Say what a routine is without the retired phrasing
- FIXED **[notifications]** Size the inbox popover by the dynamic viewport

## [0.2.9] - 2026-09-19
- ADDED **[cli]** Engenty setup keeps the local AI service credential alive
- ADDED **[ai]** An engenty sees its own routines in the runtime block
- ADDED **[ai]** Routines on the specialist floor, lane-gated; the report knows its coordinator
- ADDED **[skills]** A shared routines playbook; durable-work keeps the Tasks
- ADDED **[routines]** Let a hired engenty create and edit its own routines
- CHANGED **[skills]** Move the Space playbooks off the copilot module into @engenty/ai-skills
- FIXED **[ai]** Agent_look takes one object schema, not a top-level union

## [0.2.8] - 2026-09-19
- ADDED **[app-bar]** Integrate theme selection into app bar context menu
- ADDED **[shell]** Make the extended app bar usable again
- DOCS **[readme]** Add an Apps section before Modules
- FIXED **[shell]** Round avatar tile, user menu clear of the bar, centred brand mark
- FIXED **[shell]** Keep the bottom app bar in top order, space the copilot blob

## [0.2.7] - 2026-09-19
- ADDED **[chat]** Who-glyph chip, tidy sidebar, phone actions in the menu
- ADDED **[chat]** State who reads a chat in a header band and sidebar markers
- ADDED **[copilot]** Cut Talk, Work, and Window over to one conversation chrome
- ADDED **[copilot]** Dock the Engenty in the personal app-bar cluster
- ADDED **[desktop]** Tint the native title bar to match the AppBar
- ADDED **[shell]** Dock the app bar on any screen edge
- FIXED **[notifications]** Show app-release approvals in the space inbox
- FIXED **[notifications]** File gated hire proposals in the inbox
- FIXED **[shell]** Inset the top and bottom app bar from the window edge
- FIXED **[notifications]** Count open decisions per space, not the tenant mix

## [0.2.6] - 2026-09-18
- ADDED **[notifications]** Tabbed rail inbox with the bell above the avatar
- DOCS Shorter hero lede
- DOCS Nav search keycaps in the band's dark chip style
- DOCS Less headroom above and below the lobby
- DOCS Lobby camera at the right scale, plus a .debug outline helper
- DOCS Name tags above the cast's contact shadows
- DOCS The room's drop shadow no longer falls under the cast's name tags
- DOCS Contact shadows under the lobby cast, room 10% larger than them
- DOCS Remove the pixel guests from the lobby
- DOCS Guests in the Habbo three-quarter view, cast kept on the inner tiles
- DOCS Redraw the lobby guests as contoured Habbo-style sprites
- DOCS Lobby 10% larger, the band grows with it
- DOCS Lobby back to its original 720px column
- DOCS Paint the hero glow as a gradient instead of a clipped blur
- DOCS Size the lobby from the viewport, hanging over the band
- DOCS Live 3D pixel lobby with sprite guests
- DOCS Correct box faces on the lobby counter and crate
- DOCS Regenerate the pixel lobby room
- DOCS Lobby cast keeps apart and chats in turns
- DOCS The lobby cast drifts slowly around their spots
- DOCS Jelly-coated cast in the lobby, named like agents
- DOCS Floor at half intensity
- DOCS Fainter sidebar tint, 13% transparent
- DOCS Lighter sidebar tint
- DOCS Sidebar fill is the section tint token
- DOCS Lighter section tint on the sidebar
- DOCS Sidebar fill tinted with the section tone
- DOCS Prev/next description in the content face
- DOCS Align the on-this-page bar with the sidebar top
- DOCS Floating bevel on-this-page bar for small desktop
- DOCS Even padding on the brand link
- DOCS Solid nav band on every route, bevel menu tabs, pixel theme switch
- DOCS Changelog title and version headings in the pixel faces
- DOCS Larger search label and key caps in the chrome face
- DOCS Chrome face for the section chooser and its popover titles
- DOCS Bevel button pair for the collapsed sidebar toggle
- DOCS Floating framed sidebar window
- DOCS Jersey pixel family for titles and chrome, Geist section headings
- DOCS Readable bevel buttons in dark mode
- DOCS Lighter floor nodes, two-grey window shadows, bevel area chooser
- DOCS Translucent white sidebar with grey edge shadow
- DOCS Floor nodes as mini diamonds on the grid angle, lighter
- DOCS Translucent tone highlight for the active sidebar row
- DOCS Lighter floor nodes
- DOCS Floor nodes and centre dots for depth
- DOCS Geist 800 headlines, smaller; no anchor underline; lighter floor
- DOCS Isometric tiled floor under page and sidebar
- DOCS Window shadows follow the frame's chamfered corners
- DOCS Fix the dot lattice to the viewport
- DOCS Axonometric dot lattice background
- DOCS 2x2 pixel dot grid, ink pixel drop shadows on windows
- DOCS Subtle pixel dot grid, define --card token
- DOCS Habbo-style theme for the docs site
- FIXED **[manage]** Map destructive-foreground so red badges keep white type
- FIXED **[core]** Skip closed-module tests on the public snapshot
- FIXED **[deps]** Put the Supabase CLI back on the one pin
- OTHER Calm the space Work sidebar until a heading is hovered

## [0.2.5] - 2026-09-17
- ADDED **[projects]** Phase and project edits land immediately too
- ADDED **[projects]** Project task edits land immediately
- ADDED **[desk]** Hold `report: ask` routines for review, rebuild the desk identity
- ADDED **[ai]** Run guards, adaptive history budget, real window occupancy
- ADDED **[mcp]** Space and risk grants with shared auth enforcement
- ADDED **[core]** Add a first-party MCP resource server
- CHANGED **[core]** One execution path for module operations
- DOCS Fix internal links that 404 on the site
- DOCS **[apps]** The internal Apps page and the user-guide stub
- DOCS **[apps]** Document where Apps run, with the architecture figures
- FIXED **[scripts]** A new file under patches/ is an open path
- FIXED **[ai]** Name silent finishes on the headless lane too
- FIXED **[ui]** Land unknown routes on last space, not Copilot
- FIXED **[ci]** Make engenty npm publish fail on bad auth, not a 404

## [0.2.4] - 2026-09-15
- ADDED **[manage]** Activate AI models in filtered cohorts
- ADDED **[ui]** Let ListFilterChip keep several values selected
- ADDED **[ai]** Hire-floor desks, overlay context, and per-Engenty routing
- ADDED **[spaces]** Files on home, columns that follow the pane
- ADDED **[commercial-settings]** Give agents tools, skills, and a settings Engenty
- ADDED **[commercial-settings]** Map expense categories to regional charts of accounts
- ADDED **[spaces]** Let Modules and Extensions fold from the heading
- ADDED **[spaces]** Enhance SpaceHomeAudience with section heading and improved accessibility text
- ADDED **[shell]** Put the Engenty mark and column toggle on the app bar
- ADDED **[spaces]** Show who belongs in the home header
- ADDED **[spaces]** Greet a new hire so the desk is not silent
- ADDED **[cli]** Run engenty on this machine with `engenty start`
- CHANGED **[db]** Consolidate every owner's migrations into one baseline
- DOCS **[remote]** Document handle routing and per-Engenty channel turns
- DOCS Say which containers a run gets, and drop the old Code Mode plan
- FIXED **[ai-ui]** Live one-line working status and visible run failures
- FIXED **[ai]** Open delegated artifacts from the person's thread
- FIXED **[core]** Restore supabase_realtime publication membership
- FIXED **[ai]** Look up Space uploads at /data/Files
- FIXED **[www]** A missing comma after the hero sub blanked the landing
- FIXED **[shell]** Keep Close on the column’s right seam when pinned
- FIXED **[spaces]** Shorten the home team line
- FIXED **[spaces]** Drop the home tile and paint action links primary
- FIXED **[spaces]** Put Copilot back on every space, including Company
- FIXED **[setup]** Start Company with Files and Connections only
- FIXED **[dev]** Point core at AI over loopback under Portless
- FIXED **[cli]** Pass --domain through preflight port checks
- FIXED **[core]** Stop the setup checks passing on a database that is missing tables
- FIXED **[ai]** Create the Mastra tables on installs without a checkout
- FIXED **[cli]** Make `engenty start` reach a serving app
- FIXED **[db]** Make the consolidated baseline able to build a fresh database
- FIXED **[cli]** Print CLI failures as a readable line instead of JSON

## [0.2.3] - 2026-09-13
- ADDED **[www]** Landing built from colour bands, app groups and standing engenties
- ADDED **[engenty]** Jelly coat for the large engenties, decal extras on both coats, styleguide row
- ADDED **[ai]** Opper, OpenAI and Anthropic as model gateways
- ADDED **[cli]** Move the command implementations to packages/cli and publish them as the `engenty` npm package
- ADDED **[setup]** First-run wizard with a readiness gate, AI provider, personal space and Ready screen
- DOCS **[readme]** Emoji before the module name, not in a column
- DOCS **[readme]** Group modules, add emoji, hide experimental ones; Portless section names worktrees
- FIXED **[www]** Phone layout — Apps in the nav, smaller crew, 16px gutters
- FIXED **[core]** Routine-event bridge takes its service client from the auth-stores adapter
- FIXED **[setup]** Write SUPABASE_JWT_SECRET from supabase status; gate row for the tenant lane
- FIXED **[setup]** First space always gets a name; env examples carry the new gateway keys
- FIXED **[manage]** Parse the opper/openai/anthropic gateway heads in the local model-ref copy
- FIXED **[publish]** Prune pnpm-lock.yaml to the open tree in the snapshot
- FIXED **[cli]** Mastra init sees the env file setup just wrote; browser-settable keys never fail setup; rebuild after pull
- FIXED **[setup]** Gate names `pnpm dev:urls:localhost` for a Portless URL block, wraps the fix text
- FIXED **[setup]** Never install against another checkout's database; ask how the app is opened
- FIXED **[core]** Keep offline API tests off the database, catch the purge sweep's rejection
- FIXED **[core]** Resolve the agent approval mode through the injected client only

## [0.2.2] - 2026-09-13
- DOCS **[internal]** Add frontmatter to the Mastra CDP issue draft
- FIXED **[expenses]** Keep 20260616000800 as a no-op so db push accepts existing histories

## [0.2.1] - 2026-09-13
- ADDED **[cli]** Rename install to setup, add `engenty install <slug>` shorthand
- ADDED **[cli]** Install / generate / dev / doctor / reset / deploy replace setup --local
- ADDED **[scripts]** Materialize the open snapshot locally with OUT_DIR
- ADDED **[cli]** Ask which local Supabase stack a workspace owns
- ADDED **[readme]** Generate the module table from engenty.plugins
- DOCS State the real prerequisites, and lower the Node floor to what is tested
- DOCS Cut the README to the path a new reader takes
- DOCS Lead the README with what a space is for
- DOCS Document the public image pipeline
- DOCS Move Release & ship out of the README, and name all seven images
- DOCS **[deploy]** Correct the upgrade runbook against the real 0.2.0 deploy
- FIXED **[setup]** Name the tenant the wizard actually signs you in to
- FIXED **[db]** Let a database be built from scratch again
- FIXED **[docs]** Stop publishing pages for modules the open tree does not ship
- FIXED **[test]** Stop asserting pro's agent count in the starter catalogue
- FIXED **[publish]** Keep the allowlist's escaping when filtering it
- FIXED **[publish]** Drop allowlist entries the public tree cannot contain
- FIXED **[publish]** Render the mirror's env templates from the tree being published
- FIXED **[ui]** Give the typecheck enough heap, and drop a static 100vh

## [0.2.0] - 2026-09-11
- ADDED **[deploy]** A wizard for the database you already run, wherever it runs
- ADDED **[deploy]** Ask for what only the operator knows, derive the rest
- ADDED **[deploy]** Publish public images, and let one image serve any install
- ADDED **[deploy]** Check the two Supabase settings migrations cannot make
- ADDED **[ai]** Let an agent declare the tier its work runs at
- ADDED **[apps]** Put an App's source in git on the spaces tree
- ADDED **[apps]** Give each App a /data volume
- ADDED **[notifications]** First to answer wins — space audience, seen per viewer, desk interrupts
- ADDED **[rooms]** Agents open and grow group rooms, people join them, threads get a visibility
- ADDED **[ai]** Add reply style instructions for non-copilot agents and refactor test utility functions
- ADDED **[spaces]** Mark a space deleted, purge it later
- ADDED **[rooms]** A person's words go into the turn already answering
- ADDED **[spaces]** The roster as a tree — coordinators with their reports
- ADDED **[desk]** Open a room with other agents, see who is in it, lift a pause
- ADDED **[rooms]** A message delivered to a room wakes the agent it addresses
- ADDED **[threads]** A room has agent members, its agent_id is the host
- ADDED **[routines]** A Space table write can wake an event routine
- ADDED **[apps]** An App reads and writes the Space tables it declares
- ADDED **[spaces]** Top-level engenties set the space up and hire, capped at 20
- ADDED **[notifications]** Origin labels, decide-in-place, resolve-by-subject
- ADDED **[ai]** Agent-run tracing through Mastra observability sinks
- ADDED **[ai]** Workflow_self_revise — a specialist proposes a new version of a Workflow it owns
- ADDED **[ai-ui]** Instructions pad in the agent drawer, capped pad heights
- ADDED **[ai]** TASKS.md — a private task pad per engenty, next to MEMORY.md
- ADDED **[ai-ui]** Workflow detail header, sync button, canvas expand, persisted catalog filters
- ADDED **[spaces]** MountOperation for Inbox and Files
- ADDED **[spaces]** Say which mounted module is not ready after the wizard or dialog saves
- ADDED **[spaces]** Module mountOperation — a module's first-use setup runs on mount
- ADDED **[tasks]** The cross-space work overview is a plugin contribution
- ADDED **[kb]** Drop the Chat tab from the module sidebar
- ADDED **[kb]** One knowledge base per space, /s/<key>/kb URLs, settings by scope
- ADDED **[modules]** Module operations return a `link` into the record's space
- ADDED **[connections-external]** Integrations.sh v3, guarded fetch, official MCP client
- ADDED **[spaces]** Pin and sort Work-tab agents with two-line activity
- ADDED **[ui-core]** Let a row drive SidebarRowTitleMarquee with an `active` prop
- ADDED **[ai-ui]** Denser specialist settings with hover-edit fields and module pill
- ADDED **[app-shell]** Blended topbar is the default, band is the opt-in; rail zones by spacing
- ADDED **[app-shell]** Shell chrome without hairlines — rail on the canvas, blended topbar, one row grid
- ADDED **[spaces]** Make Tasks a chosen mount and take tenant switching off the rail
- ADDED **[ai-ui]** Runs get their own drawer, settings end with the last three
- ADDED **[ai-ui]** Desk toolbar opens settings and artefacts, menus read as glass
- ADDED **[ai-ui]** Desk header on the canvas, agent names instead of ids
- ADDED **[ai-ui]** Agent identity is name + module, breadcrumb switches engenties
- ADDED **[ai-ui]** Desk is one long conversation — new chat demoted, transcript paged
- ADDED **[ai-ui]** Space agent desk is chat plus a drawer
- ADDED **[spaces]** Desk composer mentions, agent pair rooms, memory break line
- ADDED **[notifications]** Move the bell into the app rail below Settings
- ADDED **[notifications]** Core notification package, bell, streams
- ADDED **[tasks]** Retire product Goals from the tasks module
- ADDED Retire the durable-records Memory module
- ADDED **[spaces]** Add a hire wizard for custom engenties
- ADDED **[spaces]** Add a blank purpose and apply apps when switching
- ADDED **[manage]** Retarget run-kind strings from action-graph to workflow
- ADDED **[ai]** Retire domain Action — the published runnable is a Workflow
- ADDED **[ai]** The workspace timezone rides into every sandbox as TZ
- ADDED **[spaces]** Name the composer approval level and let a space override tenant either way
- ADDED **[ai]** Enhance action and agent tools with improved descriptions and new caller thread functionality
- ADDED **[ui]** Move Mastra Studio to Setup and tighten settings section spacing
- ADDED **[ui]** Active/All tabs on Settings modules so admins can enable plugins without Setup
- ADDED **[ai]** Pin one tenant onto Mastra Studio for local Play
- ADDED **[ui]** Refactor routing and navigation structure for setup and settings
- ADDED **[ai-ui]** Integrate ActionEditor and enhance flow graph interactions
- ADDED **[ai]** Enhance graph action definitions and UI components
- ADDED **[ui]** Enhance contract editing and UI interactions
- ADDED **[ai]** Add retired workflows handling in reconcile module
- ADDED **[ai]** Enhance agent capabilities with self-revision and thread state tools
- ADDED **[ai]** Routine unification — the routine is the entity, triggers are rows
- ADDED **[spaces]** Per-space internet access for the space computer
- ADDED **[ai]** Mounted engentys — actions are workflows, triggers are bindings
- ADDED **[ai]** Web_search joins the hired-specialist floor
- ADDED **[ai]** Space engenty roster in the prompt + harmony leak scrub
- ADDED **[ai]** Space computer always on + shared-room thread ownership fix
- ADDED **[ai]** Space computer, one worker default, and the space switch
- ADDED **[ai]** Let a registered specialist declare its network tier
- ADDED **[ai]** Give registered specialists a computer, not just files
- ADDED **[ai]** Give headless runs a real computer, and bound the host
- ADDED **[manage]** Show a thread's turns as a session stack and waterfall
- ADDED **[ai]** Observe a chat as stacked turns instead of isolated runs
- ADDED **[skills]** Add canvas-design skill with font handling and sibling file support
- ADDED **[manage]** Show run trigger and human vs agent history
- ADDED **[ai]** Tag recalled history as human vs agent
- ADDED **[manage]** Distinguish action vs agent runs on the trajectory
- ADDED **[ai]** Record recalled history as pointers on run trajectories
- ADDED **[manage]** Show prompt breakdown and a readable run breadcrumb
- ADDED **[files]** Poll the local-files bridge only while folder UI is open
- ADDED **[ai]** Drive conversation turns through native Mastra AG-UI
- ADDED **[manage]** Add a cross-tenant AI run trajectory observer
- ADDED **[ai]** Capture SYSTEM/CONTEXT trajectory headers for the inspector
- ADDED **[spaces]** Promote Copilot out of the Agents roster
- ADDED **[spaces]** Paint markdown reader on shared paper
- ADDED **[spaces]** Distinguish single-line, multiline, and markdown table cells
- ADDED **[spaces]** Rename and nest artifacts in the Data tree
- ADDED **[spaces]** Edit database and CSV table artifacts in one grid
- ADDED **[spaces]** Drop markdown-only page dialogs after shared overflow
- ADDED **[spaces]** Add Artifacts + and row overflow menus by type
- ADDED **[spaces]** Icon artifacts by type and expand folders with a chevron
- ADDED **[spaces]** Mix markdown pages into Artifacts with a reader-first editor
- ADDED **[spaces]** List a Space's chats and keep a routine on one thread
- ADDED **[spaces]** Teach specialists to write Space Data and keep updating it
- ADDED **[spaces]** Give agents typed tables instead of CSV dumps
- ADDED **[ai]** Say what the specialist is doing while a routine runs
- ADDED **[spaces]** Open Folder, Upload, and Connect from the Dateien +
- ADDED **[spaces]** Collapse Data roots and list pages without a library folder
- ADDED **[ai]** A routine is a job that produces runs, not a standing task **[breaking]**
- ADDED **[e2e]** Add UC-10 daily digest scenario and harness
- ADDED **[ai]** Split space work into focused agent skills
- ADDED **[ai]** Key shared-room Mastra working memory on the Space
- ADDED **[spaces]** Add the agents roster and hire through Copilot
- ADDED **[ai]** Honor Mastra recall filters; keep semantic recall opt-in
- ADDED **[ai-ui]** One Action screen — sectioned detail, inline steps, honest list
- ADDED **[ai-ui]** Show what was asked above the run
- ADDED **[ai]** Record how a run actually started, instead of calling everything a message
- ADDED **[ai-ui]** Open a run from the Runs tab, and date the ones that predate the hire
- ADDED **[app-shell]** Enhance secondary navigation components with footer handling
- ADDED **[ai]** A graph node may ask for approval mid-run
- ADDED **[ai]** Copilot and coordinator can see, run, and author flows
- ADDED **[routines]** Agent Space routine UI — canvas, in-place designer, prompt edit rounds
- ADDED **[routines]** Promote an instruction routine to a flow — nothing is deleted
- ADDED **[ai-ui]** Inline routine editor, the routine drawn as a diagram, corpses swept
- ADDED **[ai]** Unpressed Actions in the routine flow picker; copilot declares invoke_action
- ADDED **[tasks]** Routines declare an outcome and a report floor
- ADDED **[agent]** Routine detail in the Plan tab, and leaving/deleting an agent
- ADDED **[agent]** Overflow menu on the agent page
- ADDED **[agent]** Draw the Manage tab in the admin design language
- ADDED **[agent]** Manage tab; fix admin showing no routines for an agent
- ADDED **[agent]** Plan and Runs tabs on the agent page
- ADDED **[routines]** A routine gets an agent of its own
- ADDED **[ai-ui]** Put routines on the agent desk
- ADDED **[tasks]** Routines are standing tasks - task templates retire **[breaking]**
- ADDED **[connections]** Surface the autonomous-mode gate before it bites
- ADDED **[ai]** Add OpenRouter as a second model gateway
- ADDED **[knowledge-base]** Give sources their own sidebar tab
- ADDED **[knowledge-base]** Pick and propose article templates during ingest
- ADDED **[knowledge-base]** Open the add-source wizard as a large modal
- ADDED **[knowledge-base]** Add sources through a guided wizard
- ADDED **[knowledge-base]** Analyze concepts first, then derive the pages
- ADDED **[knowledge-base]** Make agentic ingestion plannable and repeatable
- ADDED **[knowledge-base]** One ingest flow, independent content options
- ADDED **[tasks]** Govern approvals and model per goal
- ADDED **[tasks]** Only a human may resolve a tool approval
- ADDED **[engenty-tools]** Enhance approval handling and task artifact management
- ADDED **[knowledge-base]** Space-scope the module and give agents the full surface
- ADDED **[tasks]** Reviews become to-dos and the trust dial governs completion
- ADDED **[tasks]** Make goals a live coordinator surface
- ADDED **[spaces]** Include module skills automatically with their apps
- ADDED **[spaces]** Mark remote and team-hr as settings-placed modules
- ADDED **[spaces]** Make Copilot the live front door and align durable work
- ADDED **[agents]** Enhance agent tools and runtime contracts
- ADDED **[ai-ui]** Show specialist turns and /data results on the chat context card
- ADDED **[ai]** Let the Coordinator hire specialists and message them in chat
- ADDED **[manage]** Mark capable agent models in the Gateway catalog
- ADDED **[modules]** Declare Space policy on closed module operations
- ADDED **[ai]** Hide Gateway models that cannot run a tool-using agent turn
- ADDED **[modules]** Declare Space policy on open module operations
- ADDED **[ai-ui]** Carry Space contract into the voice lane
- ADDED **[ai]** Enforce Space policy on catalog, execute, and every runtime lane
- ADDED **[core]** Fail closed on Space resolution and enforce operation policy
- ADDED **[spaces]** Inject a canonical Space contract into SDK and prompts
- ADDED **[spaces]** Make the space home talk to the Coordinator
- ADDED **[agents]** Assign engenty kinds on closed module agents
- ADDED **[spaces]** Show each agent's engenty in the sidebar roster
- ADDED **[www]** Sit small engenties on the headlines, and lift the product mocks
- ADDED **[www]** Paint the landing in brand colour bands, with the locale chooser on dark chrome
- ADDED **[www]** Put English and German on /en and /de, advertised with hreflang
- ADDED **[www]** The public landing site for self-hosted open source, in English and German
- ADDED **[ai]** Add userId to agent desk starters for personalized caching
- ADDED **[mobile]** Safe-area + dynamic viewport foundation, phone smoke lane
- ADDED **[ai]** Carry starter chips on the agent instead of a hardcoded UI map
- ADDED **[ai]** Add starter catalogues for closed-module specialists
- ADDED **[agent-desk]** Per-agent starter chips and FAB clearance on the composer
- ADDED **[spaces]** Greet specialists with identity, not a splash
- ADDED **[spaces]** Hire allow-listed specialists live from the coordinator
- ADDED **[spaces]** Resolve agent approval per space and grant Plan as named facets
- ADDED **[spaces]** Mount a hired agent onto the space it was created for
- ADDED **[spaces]** Turn home into a briefing and specialists into chat
- ADDED **[ai]** Let space members share specialist and task-agent threads
- ADDED **[remote]** Classify remote agent as shared
- ADDED **[ai]** Activate cache-friendly observational memory
- ADDED **[spaces]** Replace create-space dialog with stepped wizard
- ADDED **[spaces]** Streamline task context and rail navigation
- ADDED **[spaces]** Make mounted agents actionable
- ADDED **[ui]** Make eligible mutations optimistic
- ADDED **[spaces]** Put the space's agents next to people, with a plus to add
- ADDED **[spaces]** Keep the space switcher in the breadcrumb when the column is closed
- ADDED **[spaces]** Let plugins own space tabs and mount tasks on every space
- ADDED **[inbox]** Keep the mailbox menu to Inbox and Archived
- ADDED **[ui]** Give cards, tables, and list shells one chrome class
- ADDED **[spaces]** Make the Data tab landing a real dashboard
- ADDED **[spaces]** The Data tab becomes a place you can do things
- ADDED **[files]** Connected folders become write targets
- ADDED **[ai]** Guard workspace delete, add move/copy, resume headless approvals
- ADDED **[spaces]** /data becomes a real filesystem, and delete lands gated
- ADDED **[files]** Let the Files adapter save an edit
- ADDED **[spaces]** The space's own files become a Data adapter root
- ADDED **[tasks]** A comment posted mid-run reaches the running agent (U4)
- ADDED **[tasks]** Surface a task's agent threads, and close an append hole (U3)
- ADDED **[tasks]** Give an agent one durable thread per task (U1)
- ADDED **[ai]** Upgrade Mastra 1.57.0 → 1.59.0 (U0)
- ADDED **[agents]** Hire an agent from a role instead of from an empty form
- ADDED **[tasks]** Answering a question resumes the run, instead of starting another
- ADDED **[tasks]** Run a dispatched task on Mastra's background-task substrate
- ADDED **[flows]** A gate decision is written where the question was asked
- ADDED **[agents]** HEARTBEAT.md finally reaches the runs it was written for
- ADDED **[triggers]** An event can start a flow, because its payload becomes the input
- ADDED **[admin]** One catalog for everything this workspace can run
- ADDED **[actions]** A button press is a trigger fire, and the action lane is gone
- ADDED **[tasks]** Review the field updates a flow's agent proposed
- ADDED **[flows]** Seed an Action's flow on first use, not by migration
- ADDED **[flows]** Compile an Action into the one-node flow it always was
- ADDED **[triggers]** A fire carries the values and the subject it was fired with
- ADDED **[triggers]** Run a trigger now and watch the run it started
- ADDED **[authz]** A module's agent can read its own module from the start
- ADDED **[authz]** Grant a role to an agent by name, not by uuid
- ADDED **[routines]** A routine can run a flow instead of an agent
- ADDED **[tasks]** Filter the list down to work that runs itself
- ADDED **[tasks]** Say what a flow task is actually doing
- ADDED **[tasks]** Hand a task to a flow, not just to an agent
- ADDED **[ai]** Find and install public skills from chat
- ADDED **[tasks]** A question carries how it can be answered
- ADDED **[spaces]** Put created folders in the Data tree, and give Data a home
- ADDED **[tasks]** A comment has a kind, instead of a leading emoji
- ADDED **[tasks]** Answer an agent's question from the task
- ADDED **[tasks]** Let a run speak on the task it is working
- ADDED **[ui]** Show that a scrollport has more, without painting over it
- ADDED **[tasks]** Make the wizard header the navigation
- ADDED **[tasks]** Put where-it-belongs back under the title, and phases in it
- ADDED **[tasks]** Create a task in two steps, not one wall of pills
- ADDED **[ai,tasks]** Let a scheduled task run a flow without an agent turn
- ADDED **[ai]** Make the canvas's "N to fix" badge actually fix things
- ADDED **[ai]** Live progress while a flow is being drafted
- ADDED **[ai-ui]** Put Flows and Artifacts on the Engenty dashboard
- ADDED **[ai-ui]** Give Flows the catalog chrome, and a place in the nav
- ADDED **[ai-ui]** Search, filters and a list view for the Flows catalog
- ADDED Draft flows on the planning tier, and give the designer a toolbar
- ADDED Teach and draw every control-flow entry type
- ADDED Durable long waits, and a create dialog that drafts the flow
- ADDED Invoke_action tool, and fix two bugs found by rendering the real UI
- ADDED LLM authoring, run monitoring and gate approval for graph actions
- ADDED **[ai-ui]** Action canvas — one picture for authoring, monitoring and approving
- ADDED **[ai]** Dispatch, resume and HTTP surface for graph actions
- ADDED **[ai]** Graph action primitives, data model and save-path validation
- ADDED **[ui]** Apps/ui joins the typecheck gate
- ADDED **[db-checks]** A single-signature rule guards query_chunks
- ADDED **[files]** Select all means the files, and the tree opens in one go
- ADDED **[spaces]** The Data tree's Projects folder follows the mount
- ADDED **[kb]** Retire the filesystem-sync module — the space Data lane is the sync
- ADDED **[files]** Folder rows in the files admin expand in place
- ADDED **[spaces]** The knowledge base is a Data adapter, and the legacy drive lane retires
- ADDED **[contacts]** The Contacts root is the address book's index
- ADDED **[invoices]** The space Data folders are receivables, not a list of five words
- ADDED **[spaces]** The app the copilot builds lands in the space's Data tree
- ADDED **[spaces]** A real list in the folder pane, and modules that own their index
- ADDED **[spaces]** A folder is a thing you can open, and its module can render it
- ADDED **[spaces]** One grid for CSV and .xlsx, and a pane that tells the copilot what is open
- ADDED **[spaces]** The Data tab — files as protocol, one tree, module-rendered nodes
- ADDED **[spaces]** Connections are mounted per account, agents get grants (Phase CN)
- ADDED **[spaces]** A space home you can ask, over the plan you already have
- ADDED **[spaces]** Contacts, the inbox and time tracking leave the app rail
- ADDED **[spaces]** A mount stops claiming a record scope nobody chose
- ADDED **[spaces]** A General section, controls on the right, removals that ask
- ADDED **[spaces]** One modal per mount kind, and a create dialog that only creates
- ADDED **[spaces]** Space settings become settings, not a second home screen
- ADDED **[spaces]** A real space settings page, under the space's own URL
- ADDED **[spaces]** Headless task runs follow their task's space; fix appearance saves
- ADDED **[spaces]** Connectors and delegation follow the space too (Phase C3b)
- ADDED **[spaces]** A run reaches only what its space mounts (Phase C3a)
- ADDED **[spaces]** The copilot knows its space, and space URLs read like places
- ADDED **[spaces]** Chat lives in a space (Phase C1 + C2)
- ADDED **[spaces]** Read-only roster, Settings in the sidebar foot, spaces on Team profiles
- ADDED **[spaces]** Personal spaces have no members; space roster lives in Settings
- ADDED **[spaces]** Real personal spaces, built the home-directory way
- ADDED **[spaces]** One sidebar column with the space on top and modules inside it
- ADDED **[spaces]** Bind triggers to a space so fired tasks stay in it
- ADDED **[spaces]** Bind work containers and knowledge bases to a space
- ADDED **[spaces]** Make the space the entry point in the UI
- ADDED **[spaces]** Add the Space tier between Project and Global
- ADDED **[copilot]** Keep parsed PDFs inspectable with page sentinels and reparse
- CHANGED **[ai-ui]** Pen icon on hover, counter at the card's bottom edge
- CHANGED **[engenty]** Standardize terminology from 'specialist' to 'engenty' across documentation and code
- CHANGED **[routes, dal, ui]** Streamline code formatting and improve readability
- CHANGED **[agents-workspace]** Remove deprecated action flows path and update references
- CHANGED **[tasks]** Move task settings onto core.tenant_settings typed KV
- CHANGED **[ai]** The Action is the word — no agent surface says "flow" anymore **[breaking]**
- CHANGED **[ai-ui]** One list, one name — Actions **[breaking]**
- CHANGED **[ai]** Rename action_graph -> flow_graph, ring 4 — the tool ids **[breaking]**
- CHANGED **[ai]** Rename action_graph -> flow_graph, ring 3 — the HTTP surface
- CHANGED **[ai]** Rename action_graph -> flow_graph, ring 2 — identifiers **[breaking]**
- CHANGED **[ai]** Rename action_graph -> flow_graph, ring 1 — the database **[breaking]**
- CHANGED **[www]** Drop unused SittingCrew and keep HeadlinePerch
- CHANGED **[ai-ui]** One chat-input base for every chat lane
- CHANGED **[tasks]** The background substrate IS the dispatch path now
- CHANGED **[spaces]** Split the Data pane so chrome, records, files, folders, and artifacts each have their own module
- CHANGED **[tasks]** Let the description flex instead of measuring it
- CHANGED **[spaces]** One roster, two rooms
- CHANGED **[spaces]** The tree stops dressing for a page that no longer exists
- CHANGED **[files]** The last two hand-rolled CSV parsers are gone
- DOCS **[deploy]** Rehearse the 0.1→0.2 upgrade, and correct what it disproved
- DOCS **[deploy]** Finish the 0.2.0 deletion inventory
- DOCS **[deploy]** A runbook for the 0.1.x install, and a banner that tells the truth
- DOCS **[global]** Say what 0.2.0 actually promises about upgrades
- DOCS **[global]** Give the server install the same shape as the local one
- DOCS **[global]** Call it Fair Source, not open source
- DOCS **[spaces]** Document the runtime contract and fail open-module authoring in CI
- DOCS **[work-model]** One page for how work starts, lives and runs
- DOCS **[global]** Call it Fair Source, not open source
- FIXED **[global]** Stop engenty setup deleting the UI's module dependencies
- FIXED **[deploy]** Publish the per-user browser image like every other one
- FIXED **[banking,finance-reports]** Scope cross-schema expense reads to the scope too
- FIXED **[deploy]** Name deploy images in full, and drop the -pro on publish
- FIXED **[deploy]** Declare the user-browser env in the manifest
- FIXED **[deploy]** Let the blue-green orchestrator follow ENGENTY_IMAGE_PREFIX
- FIXED **[deploy]** Put engenty Apps behind the apps compose profile
- FIXED **[global]** One list decides what stays out of the public mirror
- FIXED **[ai]** Keep the whole hand-off message on the colleague's desk
- FIXED **[ai-ui]** Show a colleague at work while the hand-off is in flight
- FIXED **[artifacts]** The desk pane lists what the chat produced, and keeps its tab
- FIXED **[ai]** Pause routines whose owner vanished, resume when they return
- FIXED **[ai-ui]** Markdown interrupt bodies; keep only the last assistant turn
- FIXED **[ai-ui]** Center colleague markers; quiet Streamdown tables
- FIXED **[ui]** Optically align Work-tab Engenty avatars with Inbox icons
- FIXED **[ai-ui]** Agent-name pills, clustered bubbles, and hover rails
- FIXED **[knowledge-base]** Store fetched HTML once per inbox row
- FIXED **[ai-ui]** Module workflows no longer read as awaiting publish
- FIXED **[ai-ui]** Stop voice input repeating finalized phrases
- FIXED **[spaces]** The create wizard's agents hint names the baseline agents
- FIXED **[ai]** Let specialists and delegated children obtain tool approvals
- FIXED **[spaces]** Let the create wizard drop suggested modules from the list
- FIXED **[ui-core]** Restore overlay shadow on glass menus
- FIXED **[app-shell]** Give the space tiles the same margin above as beside them
- FIXED **[app-shell]** Give Settings the same row geometry as a space
- FIXED **[app-shell]** Open extra spaces from a chooser instead of unfolding the rail
- FIXED **[manage]** Use eye and code icons for the ledger text switch
- FIXED **[ai-ui]** Use eye and code icons for the ledger text switch
- FIXED **[manage]** Format trajectory ledger and wire payloads
- FIXED **[ai-ui]** Format trajectory ledger and wire payloads
- FIXED **[ai]** Give each agent in a thread its own sandbox container
- FIXED **[manage]** Highlight trajectory rows and expand them from the gantt
- FIXED **[ai-ui]** Highlight trajectory rows and expand them from the gantt
- FIXED **[copilot]** Collapse the empty full-page drawer and keep the blob home
- FIXED **[ai]** Resolve every kind of Mastra resource id to its threads
- FIXED **[ai]** Capture assembled instructions on run trajectories
- FIXED **[files]** Show space and file names in the admin inspector
- FIXED **[spaces]** Resume last Copilot chat from the Work roster
- FIXED **[spaces]** Preview Files-tree PDFs in the native viewer
- FIXED **[spaces]** Load connected local folders from inside Files
- FIXED **[manage]** Load the shared reader paper surface
- FIXED **[spaces]** Keep Data overview under Copilot and hide row ⋮ until hover
- FIXED **[ui]** Show chat sender names only in shared rooms, above the bubble
- FIXED **[ui]** Keep the topbar and copilot header at one compact height
- FIXED **[ai]** Type the author-less thread honestly, and answer what it means
- FIXED **[ai]** Let a Space member open a routine run from the desk
- FIXED **[ai]** Make the ai.routines migration re-runnable
- FIXED **[ai]** Make a routine fire actually reach its Space and its desk
- FIXED **[ai]** Record headless task runs' events and usage on the desk run detail
- FIXED **[inbox]** Make agent-granted mailboxes visible to headless reads (CN.5)
- FIXED **[core]** Let a headless task run resolve its own private Space's surface
- FIXED **[ai]** A hire for recurring work is told the routine is still owed
- FIXED **[ai-ui]** A run's timeline shows the call, its arguments and its answer
- FIXED **[connections]** Grant an account to the agent id an agent actually has
- FIXED **[ai]** A hired specialist keeps the catalog floor whatever it declares
- FIXED **[copilot]** A recurring job gets an agent and a routine, not a lone flow
- FIXED **[ai]** A run that cannot start says so instead of reporting "queued"
- FIXED **[ai]** A graph node inside a task gets the task's tools
- FIXED **[ai-ui]** Unify the action detail screen; count readiness, not plumbing
- FIXED **[routines]** Promote 500, edit mode as the view, flows authored in place
- FIXED **[tests]** Ring-2 sweep fallout + the long-standing TS2571
- FIXED **[tasks]** UpdateTask persists flow_graph_id and flow_input
- FIXED **[actions]** A press is a subject-bound run, never a task **[breaking]**
- FIXED **[agent]** Tabs in the header, identity in the header, collapse on scroll
- FIXED **[routines]** One request, one routine
- FIXED **[ai]** Drop the agent silhouette CHECK so hiring works again
- FIXED **[tasks]** One routine, one page — close the Routines/Tasks split
- FIXED **[routines]** A live chat agent can never own a routine
- FIXED **[ai-ui]** Render timezone-carrying routine schedules verbatim
- FIXED **[tasks]** Make agent-created routines actually fire, attribute, and honor pre-approvals
- FIXED **[kb]** Prefill source name when editing an existing source
- FIXED **[knowledge-base]** Let one large item fill the analysis budget
- FIXED **[knowledge-base]** Read uploaded documents, not just store them
- FIXED **[knowledge-base]** Let long ingest calls outlive the client timeout
- FIXED **[knowledge-base]** Open an attached web original instead of signing it
- FIXED **[knowledge-base]** Ingest large documents whole
- FIXED **[ai]** Headless runs survive token expiry and never repeat a write
- FIXED **[ai]** Give the work coordinator its own model tier
- FIXED **[ai]** Replay an approved parked tool call exactly once on resume
- FIXED **[ui-icons]** Make always-on loaders actually spin
- FIXED **[spaces]** Keep home Coordinator sends and close approval on choose
- FIXED Fixed failing tests
- FIXED Unblock lint and the www production build
- FIXED **[time-tracking]** Use dvh for the notes popover max height
- FIXED **[ai]** Carry declared starters across the module capability seed
- FIXED **[dev]** Probe /api/ready instead of openapi so Portless startup is not killed
- FIXED **[spaces]** Keep rail overflow tiles opaque so the stack does not smear
- FIXED **[spaces]** Drop the specialist cover wash and merge the topbar
- FIXED **[tasks]** Make agent dispatch outcomes visible
- FIXED **[tasks]** Keep empty context visible
- FIXED **[ui]** Keep scrolled main content clear of the copilot FAB
- FIXED **[spaces]** The home column scrolls as one, not the briefing alone
- FIXED **[ui]** Tighten the space sidebar header against the name
- FIXED **[manage]** Use the shared card chrome on tenant and user grids
- FIXED **[spaces]** The Data CTA takes the shell's create-button shape
- FIXED **[spaces]** No cards inside cards on the Data landing
- FIXED **[spaces]** Rebuild the Data landing on the design system
- FIXED **[ai-ui]** Keep editor reset/delete in overflow menus and mark instruction overrides
- FIXED **[skills]** Show nested skill files in the instructions editor
- FIXED **[skills]** Search and install from skills.sh, not agentskill.sh
- FIXED **[spaces]** A module mounted in a space knows which of its pages is open
- FIXED **[copilot]** Do not offer a composer on a thread nobody may write to
- FIXED **[copilot]** A chat link opens the chat it names, inside a space too
- FIXED **[tasks]** An answer in the comment thread carries its question
- FIXED **[tasks]** One run-history row per run
- FIXED **[flows]** A flow with an agent node could not run headlessly at all
- FIXED **[tasks]** Read the activity feed in the same direction as comments
- FIXED **[ai]** A task run's transcript was never saved, and never readable
- FIXED **[ai]** The flow mirror called an op that does not exist
- FIXED **[tasks]** "plan only" now actually plans instead of starting
- FIXED **[tasks]** Cap the growing fields, and put belongs-to at the foot of the step
- FIXED **[core,ai]** Backdate server-lane JWT iat so PostgREST clock skew cannot reject scheduled fires
- FIXED **[tasks]** Detach timesheet rows before task delete so SET NULL does not collide on the unique index
- FIXED **[ui]** Keep closed plugins out of the public apps/ui catalog so open snapshot install stays valid
- FIXED **[core,ai]** Unbreak db:migrate and the thread-run route test after the merge
- FIXED **[ai]** Tenant-key the action_request sweep and run lookup
- FIXED **[ai]** Teach the drafting model the mapConfig rules it kept breaking
- FIXED **[ui-core]** Open the filter row on the first click, not the second
- FIXED **[ai-ui]** Move the Flows filters into the filter row
- FIXED **[ai-ui]** Let drafting run as long as the planning model actually takes
- FIXED **[ai]** Resolve the tenant's models for every graph delegation
- FIXED **[ui]** Blend the flow header into the topbar, and let skill cards breathe
- FIXED **[ai-ui]** Draw a branch as a branch
- FIXED Reject nested containers, and stop calling a loop "For each"
- FIXED Two bugs only the signed-in app could show
- FIXED **[ai]** Refuse waits the engine cannot durably hold
- FIXED **[import]** The server registrars speak the SDK's route type
- FIXED **[ui]** The dev session stats read fields that exist
- FIXED **[ai-ui]** One name for what an interrupt resume accepts
- FIXED **[ui-plugin-sdk]** The types catch up with the plugin runtime
- FIXED **[core]** State the function ACLs the spaces migrations left implicit
- FIXED **[offers]** The stage counts read the envelope's total
- FIXED **[tasks]** Derive the query allow-lists from the schemas
- FIXED **[search]** Reset space-blind index rows and scope artifact docs
- FIXED **[kb]** A rename stops resetting what it never touched, on every lane
- FIXED **[offers]** The bundle's prose members are HTML, and say so
- FIXED **[spaces]** Close the migration hazards the v0.2.x audit found
- FIXED **[build]** Give fast-csv the workspace's @types/node, not its own 14
- FIXED **[spaces]** Raise sidebar contrast — opaque when pinned, weight for selection
- FIXED **[spaces]** Stop the space's Settings link bleeding into module sidebars
- FIXED **[app-shell]** Keep the space rail's stack front tile still while it opens
- FIXED **[spaces]** Restore the check:space-storage-scope gate lost in the rebase
- FIXED **[spaces]** Reconcile the rebase with main
- FIXED **[dev]** Scope the predev Supabase check to the worktree's own stack
- FIXED **[copilot]** Parse chat PDFs without stuffing originals into the prompt
- OTHER Bring feat/spaces into main for 0.2.0
- OTHER Put the browser's tabs in the pane's own top bar, and let the page reach the edges.

The tab strip lived inside the view on a card of its own, below a pane
header that only repeated the pane's name — two bars and a margin before
the page began. The strip now portals into the pane top bar, the way the
artifact pane puts its chooser there; while no browser runs the panel
portals the name instead. Inside the pane the view drops its rounded card
and padding, so the toolbar and the page span the full width.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
- OTHER Real browser chrome for the live view — tabs, back, reload, address pill — and a page sized to the pane, streamed 1:1.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Give the browser view a tab strip and one toolbar row, and let the page fill the pane.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Give the agent browser_evaluate for hidden DOM; keep recording off.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Draw a draggable divider between stacked side panels; the split persists.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Stack side panels vertically in one end-pane column with a single width and handle.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Let an Engenty start the person's browser: ask in the chat, or without asking once allowed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Give the browser pane the artifact pane's chrome: end-pane slot, card, resize handle, expand.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Open the browser sidebar from any desk view, and explain it before it is started.

The pane now wraps the whole desk body, so the monitor toggle has somewhere
to open on the engagement list too, not only inside a conversation. Without
a running browser the pane reads as instructions: what the browser is,
Start → watch → take over → hand back, the unattended switch, and what Stop
and Sign out keep or forget.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Forget a burnt refresh token wherever the bearer is fetched, not only on first load.

The access token usually outlives the crash, so the first getSession() still
succeeds and the failure arrives minutes later, on the refresh inside the
next bearer lookup — thrown into ensure-current-user and shown verbatim on
the setup card. The bearer getter now treats that as a dead session (local
sign-out, no token) and the bootstrap's stale-session matcher knows the
message, so the shell reaches the login screen from either direction.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER A burnt refresh token means "sign in again", not "check your env vars".

After a hard crash mid-rotation the token in the browser is one Supabase
has already used, and getSession() reports it as an error. The shell showed
that message on the setup card with no way out. Now the dead token is
forgotten locally and the shell falls through to the login screen; any
other auth failure still shows its message.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Keep the draft of the Mastra issue about the CDP process-group kill next to the code that works around it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Pin the disarm against Mastra's real disconnect handler.

The control case shows the armed path does call process.kill on the
remembered group (with a PID that cannot exist); the disarmed handle
never does, even after Mastra writes the container's PID 1.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Never let the browser handle signal a host process; reach the browser by IP or loopback port.

Mastra's AgentBrowser reads the connected Chromium's PID over CDP and, on
disconnect or close, runs process.kill(-pid). Our Chromium is the container's
PID 1, so that was kill(-1) on the host — every process the apps/ai user owns.
It took the desktop down twice. The registry now makes the PID fields on our
handle write-ignoring, so the kill helper always returns before signalling;
a test pins it.

The container is created with the docker CLI carrying Mastra's labels. On a
dev host without a view network it publishes DevTools on an ephemeral
loopback port; on a deployment apps/ai dials the container's IP on the view
network — DevTools refuses a container-name Host header. Attaching a viewer
now launches the CDP session, waking a sleeping container, so the live view
shows a page without a tool call first.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Give the browser sidebar one header and a drag handle.

State, Start/Stop and Close sit on one row; the seat is shown once, next to
Take over. The left edge resizes the pane (min 320 px, the chat keeps 480 px)
and the width is remembered per browser. The canvas box keeps the page's
aspect ratio so the column does not jump while frames arrive.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Show the person's browser as a right sidebar on the agent desk.

A Monitor toggle next to the thread-context and artefact toggles opens a
420 px column beside the chat (an overlay when the content stack is narrow)
with the browser's state, Start, and the live view with take over / hand
back. The agent desk chat is where a person actually watches an Engenty work
in their browser, so this is where the button lives — the copilot drawer's
inline panel stays for the drawer.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Put the person's browser beside the chat, behind a monitor button.

A Monitor icon in the copilot header opens a panel above the transcript: the
state of your browser in the current Space, Start when there is none, and the
live view with take over / hand back when it runs. The view moves into
@engenty/ai-ui so the settings page and the copilot share one component.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Keep the space's name on the column inside a module, and drop the home line that only counts waiting and working.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Give each person their own browser in a Space, driven in their name and sealed off.

One headless Chromium per user per Space (engenty-browser-<tenant>-<space>-<user>),
started only when the person asks, driven host-side through Mastra's browser tools
wrapped with a seat the human always wins, streamed live with takeover, and reachable
from a routine only when the person switched on unattended use.

Egress is sealed: engenty-egress is internal, the allowlist proxy sits on the app
network for its own way out, browsers get their own internal network and an open but
logged blocklist proxy, and engenty-ai meets browsers on a view network only.

The copilot's frontend browser_* tools become ui_* so the two toolsets can share an
agent. browser_evaluate is excluded from day one.

PLAN-user-browser.md §4.1 records what landed and which host gates are still unrun.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Let artifacts move to a space, task, project or Engenty, and pin the ones you want on Work.

Storing was named pin, which hid that it changes where the artifact lives. Pin now means a personal shortcut on the Work sidebar and dashboard.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Let Data list Ablage like any other folder, and let people edit many rows at once.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Split Belege mail import into accounts and a list.

The space-home click dummy is caught up; scanner drops an unused env import.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Let Copilot keep its own sidebar, and let a Data folder be a list.

Work opens the chat module instead of mixing threads into the space column. Contacts, invoices and offers folders get a real table. The bell is a compact inbox, and home has its own topbar actions.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Put the space on the collapsed trail, and mark the current rail tile.

The name shrinks to the tile when the path is long or the screen is narrow. Close sits clear of the first crumb.
- OTHER Let the space's name carry its own pencil, and say nothing when there is nothing

The home header named the space at the same size as a list row. It is the
page's identity: the tile goes to 48px and the name to 17px, and a pencil
appears beside it on hover, so the one thing you do FROM a space's name —
change it — is where the name is.

"0 waiting for you, 0 working." is a line that says nothing. It renders now
only when one of the counts is not zero.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
- OTHER Grow menus from the trigger, card and contents on one beat.

Scaling the glass Positioner fought placement transform and collapsed
the origin to the top-left. Fill and enter/exit now live on the Popup,
with a little more room from the button.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Let the rail switch Spaces, and Close ride the column's seam.

The name stays a label on Work/Data/Plan and drops inside a module; Open lives in the topbar once the column is gone.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Stop waiting on a question the conversation already moved past

A desk row said "Wartet auf dich" about an ask from the day before. Nothing
was open: `requires_action` is how a suspended run ENDS, it is never cleared,
and both the sidebar and the home read every run in the feed and let the
oldest parked one speak for the agent for good — even though a later run in
the same thread had since completed.

Each conversation now answers for itself, judged by its own newest run, and
the agent takes the most urgent of them. An ask in ANOTHER thread still
outranks work in progress, so a desk running jobs in parallel keeps saying
the thing a person can act on.

And an App now reloads when it is activated. The frame in the chat was built
while the version was still proposed, so every engenty call it made came back
`apps.operationNotDeclared` — and it had no way to learn that the answer had
changed. The decision refetches the frontend and the release's state rides in
the frame key, so approving reloads the App where it stands.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
- OTHER Say what an App asks for, and let the person answer where they are

An App built by a colleague came to rest with nobody knowing they were the
blocker. The home said "Wartet auf deine Antwort" and offered to open a chat;
the chat offered a row of chips reading `expenses · expenses_list` and
`table · 01a0862f-…`. Identifiers, not consequences — and the card could not
even name which App, because a release is a marker message and a decision
notification, neither of which the home ever read.

It reads them now. The Space home unions the release markers, asks core once
per App whether those versions are still proposed, and the card carries the
verdict itself: `apps.approve` is a plain POST with no run to resume, so a
button there IS the decision rather than a weaker copy of the one in the chat.

And the consent surface reads like consent. The manifest is grouped by what
it lets the App DO — work in a module, read and write these tables, reach
these addresses, keep its own files, ask you again every time — each group
one collapsed line with a count, opening to the sentences that were already
being fetched and thrown away: the operation contract's summary, the table's
title. The high-risk group opens itself, because that is the part a person
most needs to have read. Card and banner derive their groups from the same
hook, so what the card promises is what the banner shows.

Around it, the smaller things that made the feature hard to use: the message
excerpt drops its markdown before it is cut, the App can move to the artifact
panel beside the conversation it belongs to, and closing the Data pane goes
back where you opened it from instead of stranding you in a file list.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
- OTHER Let a home card show the words, not the markdown around them.

The last-message excerpt is two lines of plain text, so asterisks and fences were showing through. Strip the notation, put the time next to the title so the description can run full width, and sit the bubble and composer in the same inset column. The inbox bell is a Button so its badge lands at the corner, not on the icon.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Do not treat /import as a record in legacy module links.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Give Belege an Import page for files, tables, mail, and connected apps.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Count what still waits, and let the row's menu have the corner

The badge on Dashboard and on the home's bell counted UNSEEN notifications,
so it went quiet the moment you glanced at the list — a space with an open
approval showed nothing. It now counts this space's open needs-you items,
the same set the notifications page groups under "Braucht deine Antwort",
via one shared hook so the two numbers cannot disagree.

And on hover a conversation row now yields its right edge: the timestamp
and the NEW badge fade, and the menu trigger drops its own background, so
the three dots land on the row's hover surface instead of on top of a word.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
- OTHER The Space's home is its sidebar, unfolded

A card per conversation, in the sidebar's own order: Favoriten first, then
the rest. A pinned row always has a card; an unpinned one only while it is
live — waiting on you, paused at the room's turn budget, running, or
finished since your last visit. Everything else is one line of names.

`GET /ai/spaces/:id/home` answers the states in one round trip: open
interrupts, `room_paused`, `ai.agent_run` rows since a cursor, and each
thread's newest message. `active-thread-runs.ts` is deliberately not a
source — it is an in-process map a second instance cannot see.

A thread shows at most one LIVE job per state (one room takes one run at a
time), while finished runs are counted rather than listed. Verdicts stay
where they can be given: the room's pause lifts on the card, an interrupt
opens the conversation, where its decision card already waits.

Beside the cards, what the Space keeps: its promoted artifacts and its
mounts. The same artifacts get a Work-tab section with the Data tree's own
row menu, and the Work list's Inbox row becomes the Dashboard, whose count
moved to a bell on the home.

Spaces gain a description — a name, an icon and a colour could not say what
a space is FOR — shown in the home's heading and edited in settings.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
- OTHER Keep Belege on one page for list and detail, and edit contacts, currency, and tags on the pane.

Split uses a hash on the list; the path with an id is fullscreen. Lieferant and Klient go through the contacts plugin, amounts carry a currency (plus a home-currency value when it differs), and tags commit as chips.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Upgrade agentOS to 0.2.19 and carry the build patch forward

deployApp() is still broken as published: the build VM has the guest tar
write the packed release through a host directory mount, and the guest
cannot write to it — "tar: Permission denied (os error 2)" — so every
deploy fails, including the package's own README example. createBuildVm
is byte-identical to the 0.2.14 original, so the patch is regenerated
unchanged against the new version.

Verified on 0.2.19: an App backend deploys, serves requests, and has a
real filesystem — node:fs works and /home/agentos survives sleep and a
cold start. It does not survive a release: the actor key is
<appId>/<releaseHash>/default, so publishing a new version creates a
different actor with an empty disk. App data therefore cannot live in
the isolate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
- OTHER A colleague's turn is somebody else's words

A room is one thread several agents answer in, and recall handed every
member the other members' answers as bare assistant messages — its own
words, as far as the model could tell. Live on 2026-09-08 a woken player
reasoned "I am the one agent in this conversation", concluded it had
already moved, answered nothing, and the room fell silent with every run
reported completed: no error, no pause, just a game that stopped at move
three.

Another agent's row now arrives as a user turn under the same
**Message from <name>** header the room's relays already carry — the
shape the shared-room instructions promised all along. Only what it
posted survives; its reasoning and its tool calls were its own work, and
read as the reader's they are the confusion itself. Rows carry the
author's name alongside the id so the header reads as a name.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Let a room's engenties overlap as shapes

A disc behind each blob punched a hole in the one beside it, so the
cluster read as three cut-out circles instead of one mark.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Give Belege a list-and-detail workspace and extract through the scanner pipeline.
- OTHER Allow catalog search entries to carry a null connector id.
- OTHER Route document extraction through the provider pipeline.
- OTHER A room is its own page, not a desk's engagement

/s/<key>/rooms/<threadId>: no agent header, a cluster-and-title crumb
that opens the room's info drawer (name, purpose, visibility, agents,
people), and a chevron that switches between every conversation of the
Space — desks and rooms alike, on desks too. The strip above the chat
is gone; old desk links naming a room redirect.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Keep the new finance modules off the public tree.

Expense categories can carry a bookkeeping account number, and the workspace plugin list enables Belege, Bank, and Reports in pro only.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Add incoming receipts, bank statement upload, and finance reports.

Sales invoices stay outgoing; Belege, uploaded statements, and period reports live as closed modules with the existing document-scanner extract path.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Mention a room or an artifact, not just a colleague

The `@` picker offered agents and people only, so the two things a Space chat
talks about most — the rooms its agents work in and the artifacts they built —
could only be named in prose. Rooms and artifacts join the list, and every row
now leads with a glyph: each agent as its own Engenty, an artifact by its type,
a room by the chat mark. Without one a mixed list is a single column of text
where a room reads like an agent.

Each ref kind carries its own instruction instead of one undifferentiated
"here are some references": an artifact says read it with `artifact_read`
first, a room says speak in it with `message_agent`'s new `room_id`.

`room_id` is what makes a mentioned room addressable. `agent_ids` names a room
by its member set, which from a desk always opens a NEW one — so the agent
would have answered in a second room beside the one the person named. With
`room_id` the room is the id: everyone in it takes a turn, `agent_ids` narrows
that to the members named. Membership, the turn budget and the pause stay
`deliverToRoom`'s; this refuses only a thread that is not a room of this Space.

Reading a room from a desk is still not possible, and the room entry says so
rather than letting the agent claim it read one.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER A built App asks for its approval in the chat

`app_build` left a version proposed and inert and told nobody. The preview
artifact carries the Approve/Reject banner, but a colleague builds it in its
own run, so the conversation the person is watching held no tool call to
render it in — and no notification was emitted on either hire path.

The publish step now writes an `engenty_app_release` marker row into that
conversation, which the transcript draws as the App itself, review banner and
all, and emits an `app_release_proposed` decision row for the bell. A decision
on either surface resolves the record.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Rank catalog pickers lexically and load search-index from source

Skills, tools, agents, workflows and slash commands now share the wizard's
BM25/stem ranking, so coding matches code. Vite and Vitest resolve
@engenty/search-index from src so a stale dist cannot hide that.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Keep desk composer pills and gutters aligned with the textarea

Horizontal mention rings stole space next to the token, a flush lane
drew the composer to both edges, and the thinking line still said
sending after the run had already started.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Show when a Space agent is working or waiting for you

A last-active timestamp while a run is in flight reads as stalled. Poll
the tenant run feed once for the sidebar, and refresh Space queries when
a desk turn finishes so a hired colleague appears without a reload.

Co-authored-by: Cursor <cursoragent@cursor.com>
- OTHER Update pnpm-lock.yaml and enhance Space components with catalog search functionality

- Updated dependencies in pnpm-lock.yaml, including a version bump for esbuild.
- Integrated `registerCatalogRankRoutes` in `app.ts` to support catalog ranking.
- Refactored `api-catalog-search-store.ts` to streamline imports and improve code clarity.
- Enhanced `catalog-ranking.ts` by exporting additional functions for better modularity.
- Implemented `useSpaceCatalogSearch` in various Space components to improve search capabilities and user experience.
- Updated localization files to include new strings for catalog searching feedback.
- Added tests for scoring prefix and inflection-style token matches in `catalog-lexical.test.ts`.

This commit improves the overall functionality and performance of the Space components while ensuring better dependency management.
- OTHER A new Space starts with its creator on the roster

`core.space_member` was written in exactly two places — an explicit invite
and claiming an orphaned personal space — so a freshly created Space had
no rows at all, not even for the person who made it. An open Space is
enterable without them, so nothing noticed: its People section, the room
bar's add-someone picker and the composer's `@` list were empty in a Space
somebody was working in every day. Creating one now writes the creator's
row as `owner`, which is also the row that keeps them in when the Space
later goes private. A failed write is logged, not fatal — the Space
exists and is usable.

`useSpacePeople` is the one place those rows are read, so the three
surfaces cannot disagree about who is here. The composer's `@` list also
offers every agent on the roster, the desk's own included: in a room the
host is one participant among the others, and Game Master was the one
name you could not mention.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Artifact pane picks from the whole Space, not from tabs

An artifact belongs to the Space we share, not to the chat that made it,
so the pane's tab strip is now one dropdown: what the pane already holds
on top, the rest of the Space's artifacts below it, and a search box once
the two groups pass five entries. The Space's list is the existing
`container=space:<id>` route, so it carries the Space's own artifacts plus
its projects' and tasks'.

Closing keeps the two meanings apart: an artifact of the pane's own scope
archives as it always did, while one opened from the chooser only leaves
the pane — it belongs to somebody else's chat. Opening the pane is offered
whenever the Space holds anything, not only when the current chat does.

`PaneTabStrip` goes with the strip it drew; nothing else used it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Sidebar lists conversations, not agents

The Work tab is a list of conversations, the way Slack's is: Favoriten,
then this person's own sections, then the built-ins Agenten (the desks),
Räume and Direktnachrichten. A row lives in exactly one place; pinning
moves it to Favoriten, hiding drops it until the next message, and a desk
can never be hidden.

Four kinds, one server-side answer (`threadKind`): a desk is the agent's
single shared line, a room carries `route_context.room`, a DM carries
`route_context.dm` — one per person × agent × Space, stable id, private —
and a pair thread stays what it was. Rooms are listed by participation
only; everything else in the Space is in `/s/<key>/chats` with a join
button.

The nav state is per person and lives in the user-settings document
`shell.spaces.conversation_nav.v1` — sections, order, placement, pins,
hidden_at — so nothing about one person's arrangement touches another's.
The old `agent_nav.v1` folds into it once on read.

Rooms also say who is speaking: every assistant row is stamped with the
agent that wrote it, the message list resolves the name through the
registry, and the transcript prints it above the bubble on desks and in
rooms — never in a DM, where there is only one voice to attribute. A
room's breadcrumb names the room and its members instead of offering the
host's agent switcher.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- OTHER Spacer should not have a hight
- OTHER **[spaces]** Interrupt-card dismiss and reconcile, contacts enhance workflow
- OTHER Popup design fix
- OTHER Cleanup
- OTHER Removed outdated concept
- OTHER Cleanup
- OTHER How claude shoudl answer
- OTHER Skills from anthopic and hermes
- OTHER **[spaces]** Drop the Chats list from the Work tab
- OTHER Lint
- OTHER Lint fix
- OTHER Code lint
- OTHER Change slogan
- PERFORMANCE **[knowledge-base]** Open an article without a skeleton
- CHORE **[ai-ui]** Drop the ten legacy admin redirects **[breaking]**

## [0.1.137] - 2026-09-02
- ADDED **[time-tracking]** Polish report documents and the weekly grid
- FIXED **[core]** Create Supabase clients only in infra adapters

## [0.1.136] - 2026-09-02
- FIXED **[time-tracking]** Compact report print so it matches the on-screen sheet

## [0.1.135] - 2026-09-02
- FIXED **[app-shell]** Stop print from clipping later pages
- FIXED **[time-tracking]** Match report export to the grouped view

## [0.1.134] - 2026-09-02
- FIXED **[copilot]** Hide the tool-approval resume nudge from the transcript

## [0.1.133] - 2026-09-02
- FIXED **[ai]** Shrink chat images before sending them to the model

## [0.1.132] - 2026-09-01
- FIXED **[ai]** Type the needs-input job mock so typecheck passes

## [0.1.131] - 2026-09-01
- ADDED **[time-tracking]** Load disciplines from commercial settings
- DOCS Time tracking uses the commercial discipline catalog
- FIXED **[ai]** Mastra's native REST API is not ours to serve
- OTHER Archify skill

## [0.1.130] - 2026-08-21
- ADDED **[ai]** An unattended run can say what it needs
- ADDED **[ai]** Only the copilot gets frontend tools
- ADDED **[ai]** Delete offer_file_downloads
- ADDED **[ai]** A file in storage can be an artifact
- ADDED **[ai]** Show_artifact becomes a backend presentation tool
- ADDED **[time-tracking]** Full AI face — 13 tools, 3 skills, tracker + reporter agents
- ADDED **[global]** Make a fresh clone runnable in three commands
- ADDED **[styleguide]** Engenty mascot system, fluffy renderer and manage styleguide
- CHANGED **[styleguide]** Lead the page with the brand marks
- FIXED **[copilot]** An answered approval reaches its final row immediately
- FIXED **[copilot]** The approval row's colour belongs to the verdict, not the shield
- FIXED **[invoices,offers]** Drop the dead invoke_frontend_tool id from the manager manifests
- FIXED **[time-tracking]** Wire agents and skills to operation contracts
- FIXED **[copilot]** An approval is not a decision, and an answered one must say what it approved

## [0.1.129] - 2026-08-18
- ADDED **[deploy]** Add blue-green edge releases
- FIXED **[ci]** Load closed packages optionally so public typecheck stays green

## [0.1.128] - 2026-08-18
- DOCS **[global]** Require scopes in commit messages
- FIXED **[time-tracking]** Hide empty assignment rows after a project ends

## [0.1.127] - 2026-08-18
- ADDED **[projects]** Pick disciplines and assignees with Combobox
- ADDED **[projects]** Edit phases in a side panel and tidy overview chrome
- FIXED **[time-tracking]** Keep move-dialog date and project in the field
- FIXED **[time-tracking]** Move hours when changing discipline
- FIXED **[time-tracking]** Keep the notes modal on the row discipline
- FIXED **[time-tracking]** Let the week grid scroll inside the shell

## [0.1.126] - 2026-08-11
- FIXED **[core]** Keep agent-token API tests offline after escalation is always on

## [0.1.125] - 2026-08-11
- ADDED **[ai]** Implement core approval retry mechanism for user consent
- FIXED **[inbox]** Harden conversation digests for Outlook mail
- FIXED **[core]** Always register the agent escalation policy, and clear the red typecheck

## [0.1.124] - 2026-08-11
- ADDED **[inbox]** Split the thread view into assistant zone, conversation footer and reply composer
- ADDED **[inbox]** Update message statuses and add dnd-kit dependencies
- ADDED **[inbox]** Draw the list-pane toggle as a two-state icon
- ADDED **[inbox]** Categories as list tabs, split runs to the bottom edge
- ADDED **[inbox]** Full-width list view, linked breadcrumb, card list surface
- ADDED **[inbox]** Lead with the mail, offer the conversation view only where it fits
- ADDED **[inbox]** Split-view action bar for the thread pane
- ADDED **[inbox]** Enhance thread digest and classification features
- CHANGED **[inbox]** Two levels of chrome instead of three
- DOCS **[inbox]** Record the split-view shell phase and worktree setup
- FIXED **[ai]** Relay chat approvals to the decision request core filed
- FIXED **[ai]** Correct the token accounting, and show what the numbers are made of
- FIXED **[copilot]** Render decision choosers live in full-page and KB chats
- FIXED **[inbox]** Dedicated classifier role, digests grants, alias-tolerant digest JSON
- FIXED **[inbox]** Use tenant classifier settings and tolerate index-map output
- OTHER Lint fixes
- PERFORMANCE **[ai]** Stop rewriting the prompt cache prefix, and slim the always-on tool surface
- PERFORMANCE **[ai]** Cut managed-skills seed/list to one manifest GET

## [0.1.123] - 2026-08-10
- ADDED **[team-hr]** Move the holiday add/edit form into a modal
- FIXED **[team]** Finish the typecheck pass for modules/team

## [0.1.122] - 2026-08-10
- ADDED **[team-hr]** Group holidays by month, add a type, edit from a row menu
- ADDED **[team-hr]** Manage public holidays in team settings
- ADDED **[team-hr]** Edit regular working hours inline instead of in a dialog
- FIXED **[contacts]** Move module settings under /settings/contacts

## [0.1.121] - 2026-08-10
- FIXED Add typecheck coverage to 34 packages, fix pre-existing errors

## [0.1.120] - 2026-08-10
- ADDED **[time-tracking]** One toolbar for the timesheet and the calendar
- FIXED **[time-tracking]** Stop clipping the entry notes popover
- FIXED **[time-tracking]** Show newly added rows in weeks with no entries
- PERFORMANCE **[deploy]** Probe every 2s during container startup (start_interval)

## [0.1.119] - 2026-08-10
- FIXED **[kb]** Serialize the custom: sort-by schema for OpenAPI
- FIXED **[deploy]** Probe / instead of /api/openapi.json in the edge healthcheck

## [0.1.118] - 2026-08-10
- FIXED **[deploy]** Prefer the SSH pre-pull path over the Coolify API

## [0.1.117] - 2026-08-10
- ADDED **[ui]** Move audit logs and users off the admin rail
- FIXED **[release]** Attribute About changelog commits to the new tag
- PERFORMANCE **[build]** Drop dts generation — internal packages read types from source
- PERFORMANCE **[deploy]** Pre-pull images on the VPS before queueing the deploy

## [0.1.116] - 2026-08-10
- ADDED **[authz]** Inspect roles and edit custom roles in setup console
- FIXED **[manage]** Show audit actor display names
- FIXED **[core]** Keep audit logs relevant and readable
- FIXED **[projects]** Replace detail loading text with layout skeleton
- OTHER Optimized setup ( dev runs )

## [0.1.115] - 2026-08-10
- ADDED **[team,ui-core]** Create user accounts when linking team members
- ADDED **[auth]** Add superadmin Login as with switch-back
- FIXED **[projects]** Keep client picker popover readable from icon trigger
- FIXED **[tasks]** Let inbox clear stale error and approval notifications
- FIXED **[deploy]** Give the healthcheck time for node's own startup
- FIXED **[env]** Regenerate .env.example for the server-lane key vars
- PERFORMANCE **[deploy]** Stop serialising the whole stack behind every deploy

## [0.1.114] - 2026-08-10
- ADDED **[core,ai]** Let the server lane sign ES256 for asymmetric projects
- FIXED **[deploy]** Unpin prod and pass the server-lane signing key through
- FIXED **[deploy]** Keep the 0.1.113 migrator while apps roll back to 0.1.112
- FIXED **[deploy]** Pin prod to v0.1.112 to restore service

## [0.1.113] - 2026-08-09
- ADDED Hard cutover — getDatabaseAdapter renamed getServiceDb, baseline emptied (WP8) **[breaking]**
- ADDED **[ci]** Nightly live-DB tenant-isolation checks (WP7)
- ADDED **[core,ai]** Tenant-locked core seams, apps/ai lane, retrieval + leak harness (WP5+WP6)
- ADDED **[modules]** Convert all modules to tenant-locked DB handles (WP4 wave)
- ADDED **[core]** SECURITY DEFINER lockdown + server-lane coverage checker (WP1 complete)
- ADDED **[tasks]** Convert to tenant-locked DB handles (WP4 pattern-setter)
- ADDED **[core]** Tenant-locked server lane — engenty_server role, RLS policy pair, getTenantDb seam
- FIXED **[time-tracking]** Put saved_report_snapshots on the server lane
- FIXED **[kb]** Hide the two remaining member-facing links into admin-only settings
- FIXED **[kb]** Stop offering knowledge-base creation to users who cannot do it
- FIXED Wire the boot preflight in, and make the leak sweep prove positive access
- FIXED Close the rest of the class — audit follow-ups from the live-smoke fixes
- FIXED Make the server lane usable end-to-end (subject, RPC grants, honest auth errors)

## [0.1.112] - 2026-08-09
- ADDED **[deploy]** Ship the docs site as a prebuilt image
- FIXED **[deploy]** Build the UI with the real version, not the cache sentinel
- FIXED **[ai]** Assert the copilot's write rule by substance, not its old wording
- FIXED **[time-tracking]** List the snapshot operations in the catalog guards

## [0.1.111] - 2026-08-09
- ADDED **[company-profile]** Add the module's missing skills
- ADDED **[pdf-templates]** Full template lifecycle in the AI catalog, plus authoring skills
- ADDED **[commercial-settings]** Collection-scoped write operations for the AI catalog
- ADDED **[time-tracking]** Implement report snapshots functionality
- ADDED **[time-tracking]** Professional sectioned report layout with table breaks
- ADDED **[time-tracking]** Add report type, entry descriptions, and on-demand LLM summaries
- ADDED **[ai]** Open the context meter's prompt number into a size breakdown
- ADDED **[time-tracking]** Add free-text notes to a saved report
- ADDED **[time-tracking]** Rework report filters into searchable rows
- ADDED **[time-tracking]** Add full list controls to saved reports
- ADDED **[time-tracking]** Refine the saved-reports UI
- ADDED **[projects]** Create many tasks in one approved call
- ADDED **[ai]** Let Code Mode write behind the approval gate
- ADDED **[time-tracking]** Add saved reports and reporting UI
- CHANGED **[time-tracking]** Split report detail page and snapshots dialog
- DOCS **[user]** Document every module and the cross-cutting agent operations
- FIXED **[dev]** Raise the open-file limit for `pnpm dev` too
- FIXED **[dev]** Raise the open-file limit before starting the dev stack
- FIXED **[manage]** Scope turbo env hashing to the manage portal build
- FIXED **[turbo]** Stop env edits from busting every package build cache
- FIXED **[commercial-settings]** Keep the settings page in sync with out-of-band writes
- FIXED **[copilot]** Make backend tools the only write path in the instructions
- FIXED **[ai-ui]** Show usage on every copilot surface and stop the flap opening empty
- FIXED **[copilot]** Stop navigate from reporting success for routes that do not exist
- FIXED **[time-tracking]** Raise summary token budget and polish report settings
- FIXED Fix build issue
- FIXED **[time-tracking]** Route report summaries through tenant AI settings
- FIXED **[ai]** Stop a snapshot resume re-persisting the user turn it is resuming
- FIXED **[ai-ui]** Mark the seam where the inspector timeline reverses direction
- FIXED **[ai-ui]** Route the decision card by tool name, not by tool output
- FIXED **[ai]** Stop the native decision suspend from losing and duplicating its turn
- FIXED **[ai]** Give the resume lanes the executor's post-run pass
- FIXED **[ai]** Make the snapshot resume exclusive and rebuild its agent context
- FIXED **[security]** Scope the portal client lookup to the project's tenant
- FIXED **[security]** Give tenantless join tables a real tenant boundary
- FIXED **[time-tracking]** Declare the nuqs dependency
- FIXED **[ai]** Fail loudly when a snapshot resume cannot finish
- FIXED **[ai]** Continue the run after a snapshot resume re-suspends
- FIXED **[ui-core]** Keep the doc-sidebar overlay sheet viewport-fixed
- FIXED **[ai]** Rebuild the workspace when resuming from a snapshot

## [0.1.110] - 2026-08-07
- PERFORMANCE **[deploy]** Keep the dependency layer stable across releases

## [0.1.109] - 2026-08-07
- ADDED **[copilot]** Add ui guide presentations and richer inputs
- ADDED **[copilot]** Add show_ui_guide spotlight frontend tools
- CHANGED **[chat]** Remove ArtifactPaneToggle and restructure chat layout
- FIXED **[copilot]** Float thread context card without a sidebar lane

## [0.1.108] - 2026-08-07
- FIXED **[release]** Strip closed plugins when snapshot-publishing the mirror
- PERFORMANCE **[deploy]** Install dependencies before copying source

## [0.1.107] - 2026-08-07
- FIXED **[ai]** Exit on SIGTERM instead of waiting to be killed

## [0.1.106] - 2026-08-07
- CHANGED **[ai-ui]** Stop sending unread route scope on every run
- FIXED **[ai]** Preserve Mastra's "signal" message role
- FIXED **[ai]** Stop discarding Mastra message metadata
- FIXED **[ai]** Stop rebuilding thread metadata from stale reads across the HITL lane
- FIXED **[ai]** Merge thread metadata in the database, not across a stale read
- FIXED **[ai-ui]** Report Auto effort in the control, not a toast

## [0.1.105] - 2026-08-06
- FIXED **[deps]** Drop stale time-tracking dnd-kit entries from lockfile

## [0.1.104] - 2026-08-06
- ADDED **[ai-ui]** Toast and flash when Auto resolves effort
- ADDED **[ai]** Size Auto effort with heuristics before cheap router
- ADDED **[copilot]** Add floating thread context box on full-page chat
- FIXED **[ai]** Stub resolveRunWorkspaces in thread-routes test harness
- FIXED **[ai]** Return auto-effort from promise instead of closure mutation
- FIXED **[shell]** Move Engenty admin icon above Settings in the rail
- FIXED **[ai-ui]** Only set aria-checked with checkbox role on decision choices

## [0.1.103] - 2026-08-06
- ADDED **[ui]** Add ui-card-* surface classes with selected state
- ADDED **[ai-ui]** Add Full Screen position that opens full-page chat
- FIXED **[ai-ui]** Richer ChainOfThought tool steps with type icons and briefs
- FIXED **[copilot]** Keep floating launcher position across reload
- FIXED **[ai-ui]** Keep tools in one ChainOfThought list with Show details
- FIXED **[ui]** Keep app-bar rail on canvas-family colors in dark mode
- OTHER Enhance tool call handling in conversation runs

- Introduced logic to repair dangling tool calls in conversation runs, ensuring that unresolved tool calls are addressed before the session reads history.
- Added functionality to emit error results for unresolved tool calls at the end of a run, preventing indefinite loading states in the UI.
- Updated the SessionAgUiConverter to track unresolved tool calls and close them appropriately, improving user experience during interactions.
- Enhanced decision artifact handling to support multi-select options and descriptions for choices, providing clearer user prompts.

This update improves the robustness of tool call management and enhances user interaction with decision-making artifacts.
- OTHER Fix foreign dock hover mixing module sidebar into Settings.

When previewing Settings (or any dock item with children), omit the current page's secondary header/after-items and use opaque chrome so module content cannot bleed into the overlay.

Co-authored-by: Cursor <cursoragent@cursor.com>

## [0.1.102] - 2026-08-06
- FIXED **[ai-ui]** Export missing composer types, drop stale test suppressions

## [0.1.101] - 2026-08-06
- FIXED **[ag-ui-bridge]** Commit missing AgentUiContextLike interface

## [0.1.100] - 2026-08-06
- ADDED **[ai]** Make show_artifact state-backed so the presented artifact syncs across windows
- ADDED **[ai]** Parallel live streaming into attached chat windows
- ADDED **[ai]** Durable chat run tracking, fail-loud choice resolution, cross-window sync
- ADDED **[offers]** Add draft document toolbar under the header
- CHANGED **[ai]** User-turn echo as protocol-native role:user text messages
- CHANGED **[ai]** Complete thread/session rename in frontend, files, and copy
- CHANGED **[ai]** Rename thread/session DAL, routes, and service layer **[breaking]**
- FIXED **[ai-ui]** Attached windows stop duplicating the current turn; artifact card + pane survive reload/sync
- FIXED **[dev]** Ignore module planning notes in watch rebuilds
- FIXED **[docs]** Move themeColor from metadata to viewport export
- FIXED **[ai]** Attached windows lose the user turn — close the attach seam, unify user message id
- FIXED **[ai]** Persist post-resume text, stop attach self-duplication in chat sync
- FIXED **[offers]** Polish draft settings, recipient display, and unit labels
- FIXED **[ai]** Correct mislabeled agent_sessions.* error-code prefixes per domain
- OTHER Cleaned up dev docs for copilot ( ai )

## [0.1.99] - 2026-08-04
- ADDED **[frontend-tools]** Implement frontend tool suspend lock management

## [0.1.98] - 2026-08-04
- ADDED **[dependencies]** Add '@engenty/app-shell' to multiple package configurations
- ADDED **[agents-catalog]** Implement agent reset functionality and enhance filtering

## [0.1.97] - 2026-08-04
- ADDED **[instructions]** Improve error handling for engenty.copilot seed file loading
- ADDED **[instructions]** Enhance agent instruction handling and append functionality
- ADDED **[agents-workspace]** Enhance agent detail files tab layout and functionality
- ADDED **[instruction]** Add reset instruction endpoint and logic
- ADDED **[manage]** Use a searchable model picker on role bindings
- ADDED **[manage]** Edit package and tenant AI policy including effort tiers
- ADDED **[core]** Allow operators to PATCH live commercial package rows
- ADDED **[entitlements]** Add a package patch schema for operator edits
- ADDED **[security]** Run the shared policy on the in-process gateway caller
- ADDED **[ai-ui]** Make AG-UI inspector resizable with a collapsible JSON tree
- ADDED **[manage]** Add tenant overview tab with editable settings
- ADDED **[ai-ui]** Show bound models on effort tiers in developer mode
- CHANGED **[core]** Remove the unused in-process method invoker
- FIXED **[dev]** Recover exited Supabase containers after reboot in predev-check
- FIXED **[ai]** Raise the expensive price-tier threshold to $4/Mtok
- FIXED **[ci]** Deploy step reaches its SSH fallback again

## [0.1.96] - 2026-08-04
- DOCS Move in-process gateway gate plan to workspace root
- DOCS Plan for gating the in-process gateway caller (audit uneven-enforcement row)
- FIXED **[release]** Module publish survives the GitHub Packages secondary rate limit
- FIXED **[security]** Close two in-process gateway-caller policy bypasses

## [0.1.95] - 2026-08-04
- ADDED **[ai]** One containment resolver — the visibility chain reaches every run
- CHANGED **[commercial]** Readers read the canonical line-item shape only
- CHANGED **[invoices]** Delete the unmounted flat-content edit modal
- CHANGED **[pdf-service]** Delete the dead legacy invoice renderer
- CHANGED **[ai]** One workspace shape — named mounts, no unscoped fallback **[breaking]**
- CHANGED **[ai]** Delete the unwired workspace-agent track and tool_profile **[breaking]**
- FIXED **[invoices]** Normalize agent-written blocks through the shared canonical normalizer
- FIXED **[env]** Regenerate .env.example for the email-notifier keys
- FIXED **[ai]** Name the "workspace declared but no mounts resolved" outcome

## [0.1.94] - 2026-08-04
- FIXED **[core]** Delete deprecated route aliases — one leaked audit logs cross-tenant **[breaking]**
- FIXED **[ai]** Never open a live tool call with an empty name ("Ran tool")
- FIXED **[approvals]** One goal-grant implementation, and actually reap it
- FIXED **[engenty-coordinator]** Drop the orphaned pg_cron coordinator heartbeat **[breaking]**
- FIXED **[web-ingest]** One SSRF guard, and validate every redirect hop **[breaking]**

## [0.1.93] - 2026-08-04
- ADDED **[ai]** ENGENTY_AI_SERVICE_SECRET is the only service credential **[breaking]**
- CHANGED **[ai]** Delete the userAccessToken scope shim, rename bags to accessToken **[breaking]**
- FIXED **[ai]** Say it loudly when the scheduler serves only part of the platform
- FIXED **[remote]** Channel approval policy "request" — defer executed gated ops

## [0.1.92] - 2026-08-04
- ADDED **[remote]** Honest channel approvals (defer), conversations UI, housekeeping
- ADDED **[core,ai]** Platform-scoped service credential — multi-tenant headless plane
- DOCS **[remote]** R4 per-tenant credentials implementation spec; live-defer caveat
- DOCS Audit open items in remote-channels plan post-v0.1.91
- FIXED **[ai]** Close the tenant-readiness gaps behind the per-tenant scheduler
- FIXED **[remote]** Forward the workspace anchor so bindings route by workspace

## [0.1.91] - 2026-08-03
- FIXED **[ai]** Survive adapter-post failures in the channel render driver
- FIXED **[remote]** Return tenant_id from resolve_sender; SLACK_API_URL test seam

## [0.1.90] - 2026-08-03
- ADDED **[remote]** Routing table, dedicated tenant threads, chat controls (R1-R3)
- ADDED **[core]** EvaluatePolicy spends approval grants itself (D2 phase 3)
- ADDED **[tasks,approvals]** Drop task-row grant columns — core store is the only grant store (D2)
- ADDED **[core,tasks,ai]** Dispatch reads approval grants from the core store (D2 2d)
- ADDED **[core,tasks]** Task approvals mint core grants the gates can spend (D2 2c)
- ADDED **[connections,core]** Fold connections approvals into the core store
- ADDED **[core]** Make approvals durable — one store for requests and grants
- ADDED **[copilot]** Give the supervisor app_build instead of only delegation
- CHANGED **[remote]** Enable channels by opt-out, delete legacy channel cluster
- CHANGED **[core]** Move the approval store client into @engenty/approvals-sdk
- CHANGED **[core]** One approval gate for all three transports
- DOCS Plan for remote-channels consolidation (routing table, dedicated threads, credentials)
- DOCS **[plan]** Record the v0.1.89 release of the security sweep
- FIXED **[connections-sdk]** Satisfy required apiKey.verify in repo test fixture
- FIXED **[remote]** Authorize the destination of proactive sends
- FIXED **[remote]** Mount channel webhooks under /ai so they ride the core gateway
- FIXED **[secrets]** Stop in-chat secret grants from outliving their goal
- FIXED **[core]** Bound and reap approval grants now that they outlive the process
- FIXED **[ci]** Make the turbo remote cache actually cache
- FIXED **[core,ai,modules]** Keep service-principal ids out of user columns
- OTHER WiP

## [0.1.89] - 2026-08-03
- ADDED **[tasks]** Say what a tool approval is about, and fix the card layout
- ADDED **[projects]** Lean projects - optional time planning, editable client
- ADDED **[manage]** Adopt compound ListToolbar on users and tenants lists
- ADDED **[ui-core]** Add compound ListToolbar and tighten list hub spacing
- ADDED **[apps]** Render a built App inline in the chat transcript
- ADDED **[connections]** GitHub connector (repos + pull requests)
- ADDED **[apps]** Connections guidance + release review surface
- CHANGED **[ai]** Delete Gondolin sandbox tier — Docker is the only agent-execution provider
- DOCS **[plan]** Record what landed in the act-first security sweep
- DOCS Sweep stale Gondolin mentions from env docs
- FIXED **[connections]** Scope connector write authority per connector (CON-02)
- FIXED **[security]** Close four critical authz holes and put core back under typecheck
- FIXED **[ui]** Keep changelog dock strokes at tiny font size
- FIXED **[apps]** Survive replica cold start; close app authoring to hand-driving
- FIXED **[ui-core]** Keep list search compact until focused
- FIXED **[contacts]** Await the post-create read on the roles path
- FIXED **[ui-core]** Switch thumb lands flush right, long dates clip
- FIXED **[projects]** Make the timeline density control a legible scale
- FIXED **[ui]** Keep contribution kinds the plugin pruner does not own
- FIXED **[core]** Never auto-confirm supabase db reset in setup --local when non-interactive
- FIXED **[core,apps]** Classify output-schema mismatches as 500, not 400
- FIXED **[apps]** Publish the app_build preview artifact to the user-facing thread
- OTHER Lint
- OTHER Lint
- OTHER Better ( larger ) avatars
- OTHER Align projects cards to style guidlines

## [0.1.88] - 2026-08-02
- ADDED **[connections]** In-chat popup connect flow for the agent connect card
- FIXED **[connections]** Unwrap the chat-run {ok, data} envelope in the connect card matcher
- FIXED **[core]** Exempt the platform service credential from approval escalation

## [0.1.87] - 2026-08-01
- ADDED **[ui]** Long-press rearrange for tenant dock module order
- ADDED **[ui]** Promote Engenty in dock and order modules by category
- FIXED **[ui]** Rearrange About dialog tagline and footer links

## [0.1.86] - 2026-08-01
- ADDED **[ai-core,ai]** Module function agents via defineModuleAi agentFns (Phase 4)
- ADDED **[ai]** Convert engenty.file-analyst to a function agent + phase-machine demo (Phase 3)
- ADDED **[ai]** FunctionAgentProvider — function agents render per thread with durable agent_state (Phase 2)
- ADDED **[ai-core]** Agent hooks — useX render layer producing AgentConfig (Phase 1)
- DOCS Add dev-server skill and fix the worktree first-run setup gap
- DOCS **[ai-core]** Document Agent Hooks — howto-agent-hooks.md with a phase-machine example
- DOCS Scope agent-hooks plan (useX authoring layer over AgentConfig)
- FIXED **[ai]** Thread resolveContext into the /generate assembly path
- FIXED Sync .env.example files with the env manifest

## [0.1.85] - 2026-08-01
- ADDED **[ai]** Voice option dropdowns and fix Voxtral realtime STT
- FIXED **[ui]** Format generated About-dialog JSON so CI lint stays green

## [0.1.84] - 2026-08-01
- ADDED **[ui]** Add About Changelog and Credits modals
- FIXED **[tasks]** Move group-by to the right with a muted label
- FIXED **[tasks]** Stop clipping the list toolbar on empty lists
- FIXED **[ai]** Run the scheduler reconcile under an authenticated tools context

## [0.1.83] - 2026-08-01
- ADDED **[db]** Grants coverage guard, and RLS on the last three uncovered tables
- DOCS OAuth redirect URIs, deploy-only keys, and the database guards

## [0.1.82] - 2026-08-01
- FIXED **[db]** Grant service_role on core tables created after the baseline grant

## [0.1.81] - 2026-07-27
- ADDED **[setup]** Show the OAuth redirect URI and deploy-env status on /setup/platform
- ADDED **[ai]** Split scope identity from data-access credential (CP4)
- ADDED **[core]** Answer workspace context for service principals (CP3)
- ADDED **[core]** Durable service credentials and short-lived service tokens (CP2)
- DOCS Service identity operator guide; record CP1-CP4 as implemented
- DOCS Inventory userAccessToken consumers for service identity (CP1)

## [0.1.80] - 2026-07-27
- ADDED **[ai]** Self-renewing service credential for headless runs
- DOCS Plan the first-class service identity (PLAN-service-identity.md)
- FIXED **[deploy]** Give edge the app-host URL and token

## [0.1.79] - 2026-07-26
- FIXED **[deploy]** Verify the agentos-apps patch without require.resolve

## [0.1.78] - 2026-07-26
- ADDED **[apps]** App-build workflow — the durable sequence behind app_build
- FIXED **[deploy]** Copy patches before pnpm fetch so images build again
- FIXED **[copilot]** Give the supervisor an agent-app_coder delegation tool
- OTHER Moved plans out of repo

## [0.1.77] - 2026-07-26
- ADDED **[ai-ui]** Gate expert model pinning on developer mode, show bound models
- ADDED **[manage]** Add the role binding console
- ADDED **[ai]** Effort selector replaces the model picker
- ADDED **[ai]** Make the gateway a column behind an adapter interface
- ADDED **[ai]** Let modules declare the model roles they need
- ADDED **[ai]** Plans grant effort tiers instead of enumerating model ids
- ADDED **[ai]** Resolve models from role bindings instead of env and constants
- ADDED **[ai-ui]** Include agents in the composer @ mention picker
- ADDED **[manage]** Add AI model console and allow-list editors
- ADDED **[ai]** Govern model selection through one shared allow-list
- ADDED **[ai]** Realtime voice cascade providers and chat-command skills
- ADDED **[manage]** Add platform settings under Settings with secondary nav
- DOCS How effort levels and model configuration work
- FIXED **[ai]** Isolate the placeholder session workspace per user
- FIXED **[core]** Make the model-gateway migration re-runnable
- FIXED **[ai-ui]** Correct import depth in use-mention-agent-candidates
- FIXED **[manage]** Drop duplicate formatMicros import from the merge

## [0.1.76] - 2026-07-26
- ADDED **[kb-filesystem-sync]** Migrate KB filesystem sync module from legacy repo
- ADDED **[doc-converter]** Add Mistral OCR as a document extraction provider
- FIXED **[manage]** Unify money formatting to Intl.NumberFormat + pin test locale
- FIXED **[app-host]** Stub deployApp so runtime guard tests need no Rivet engine

## [0.1.75] - 2026-07-26
- ADDED **[ai-ui]** Open work files in the chat-style artifact pane
- ADDED **[tasks]** Move routine actions into the topbar
- ADDED **[tasks]** Polish routine detail with cards, markdown, and tool picker
- ADDED **[ai-ui]** Browse work-panel files as a card grid with preview
- ADDED **[ai-ui]** Calm Engenty admin list hubs like Plan
- ADDED **[apps]** Bundle multi-file React frontends on the host
- ADDED **[apps]** Add app_config, and enforce the storage manifest flags
- ADDED **[apps]** Harden the engenty Apps runtime
- ADDED **[apps]** Make Apps usable by copilot and coordinator
- ADDED **[apps]** Add engenty.coder — the agent that authors engenty Apps
- ADDED **[apps]** Add the engenty Apps capability wall in apps/ai
- ADDED **[apps]** Render engenty Apps in the artifact pane via a bridged frame
- ADDED **[apps]** Add modules/engenty-apps — apps, versions, governance, catalog ops
- ADDED **[apps]** Add apps/app-host — runtime for tenant-authored engenty Apps
- CHANGED **[apps]** Rename engenty.coder to engenty.app-coder
- DOCS **[apps]** Add engenty Apps end-to-end test plan
- DOCS **[apps]** Re-spike SQLite against the Rivet cookbooks
- DOCS **[apps]** Add engenty Apps plan + Phase 0 agentOS spike findings
- FIXED **[test]** Enable Node localStorage for happy-dom vitest runs
- FIXED **[apps]** Satisfy lint for app-host and engenty-apps
- FIXED **[ui]** Keep Setup in the tenant app and add overview page
- FIXED **[tasks]** Put routine run CTA leftmost in the topbar
- FIXED **[apps]** Unwrap store envelopes in engenty:bridge
- FIXED **[apps]** Keep the app-host id inside agentOS's 63-character limit
- FIXED **[apps]** Give agentOS a backend entrypoint, or App backends never run
- FIXED Strip closed plugins from the public engenty.plugins map
- FIXED **[auth]** Time out setup fetches so a hung backend cannot hang login

## [0.1.74] - 2026-07-25
- ADDED **[tasks]** Center list toolbar and polish briefing motion stream
- ADDED **[tasks]** Redesign Plan briefing hub and calm list surfaces
- ADDED **[ui-core]** Add aboveStrip and belowStrip alignment options to DetailPageHeader
- ADDED **[tasks]** Add Plan list header tabs for tasks, goals, routines
- ADDED **[tasks]** Calm list headers, group-by toolbar, and Plan module label
- ADDED **[tasks]** Unify list page headers and routines list controls
- ADDED **[workspace]** Enhance workspace file tools and context handling
- ADDED **[ui]** Make Geist the default appearance font, OS stack as System Default
- CHANGED **[tasks]** Update DetailPageHeader to use aboveStrip for navigation
- FIXED **[team]** Align skill frontmatter name with pack folder
- FIXED **[core]** Collect audit distincts via keyset so later module ids appear
- FIXED **[tasks]** Unblock typecheck for run-now repo and list helpers
- FIXED **[ai]** Re-export commons storage prefix via export-from
- FIXED **[tasks]** Apply sidebar list settings to routines
- FIXED **[tasks]** Move sidebar search under list tabs

## [0.1.73] - 2026-07-24
- ADDED **[tasks]** Standing-task schedule routines with agent disposition
- DOCS Where-work-lives — rebase on shipped hardening + routine work (absorption list, tool-based Phase 3)

## [0.1.72] - 2026-07-24
- ADDED **[tasks]** Harden dispatch rails, typecheck UI, and blocked reasons
- ADDED **[queue]** At-least-once delivery with dead-letter cap
- ADDED **[ai]** Finish Mastra 1.52 schedules upgrade and message-shape fixes
- DOCS Update harness hardening plan checklists after implementation
- DOCS Where-work-lives — add storage-roles doctrine (§1b) + mirror-follows-versions
- DOCS Plan — where work lives: one scope model for artifacts, files & workspaces
- DOCS Plan — harness hardening (gap register + Mastra 1.52 completion)
- DOCS Plan rev 2.1 — trim discussion-only OpenClaw references, keep implementation semantics
- DOCS Plan rev 2 — routines run on ONE standing task with agent-decided disposition
- DOCS Plan — promote routines from task templates to scheduled specialists
- FIXED **[team]** Use interfaces for Habbo avatar option types

## [0.1.71] - 2026-07-24
- ADDED **[auth-ui]** Use engenties on login and setup surfaces
- ADDED **[team]** Generate Habbo avatars via Gemini with edge cleanup

## [0.1.70] - 2026-07-24
- FIXED **[deploy]** Survive the edge cold build — raise DTS heap, drop concurrency

## [0.1.69] - 2026-07-24
- ADDED **[deploy]** Build and ship the Manage portal in the edge image
- FIXED **[ui]** Gate the entire /setup surface to superadmins
- FIXED **[docs]** Add frontmatter to the internal docs moved out of docs/wip

## [0.1.68] - 2026-07-23
- ADDED **[manage]** Enhance tenant package details and enforcement settings
- ADDED **[manage]** Align list and detail chrome with core UI patterns
- ADDED **[manage]** Package detail, tenants package column, and create chooser
- ADDED **[core]** Expose tenant package_id and accept it on create
- ADDED **[manage]** List/detail UI refresh for tenants, users and packages
- ADDED **[manage]** Core-UI DetailPageHeader for the tenant detail page
- ADDED **[ai]** Governance seam for self-managed vs centrally-managed AI settings
- ADDED **[manage]** Readable feature-flag labels (P4d parity)
- ADDED **[manage]** Search-index diagnostics console (P4d)
- ADDED **[manage]** Tenant automation-rules tab (P4d)
- ADDED **[manage]** Approvals queue, module lifecycle, and platform settings (P4b/P4c)
- ADDED **[manage]** P4a observability — logs inspector + cross-tenant audit
- ADDED **[billing]** P3 package pricing, invoices, tenant billing tab
- ADDED **[satellites]** P2b satellite registry, health probe, manage UI
- ADDED **[entitlements]** P2a-5 manage UI (catalog, picker, overrides, resolved)
- ADDED **[entitlements]** P2a-4d maxUsers seat-limit enforcement
- ADDED **[entitlements]** P2a-4c write AI usage policy on entitlement change
- ADDED **[entitlements]** P2a-4b module allow-list enforcement
- ADDED **[entitlements]** P2a-4a compose package feature flags
- ADDED **[entitlements]** P2a-3 superadmin entitlements routes
- ADDED **[entitlements]** P2a-2 core.packages DB + DAL + boot sync
- ADDED **[entitlements]** P2a-1 authored package catalog + resolver
- ADDED **[manage]** Tenant control-plane Phase 1 (tenants, users, modules, flags)
- ADDED **[tasks]** Make agent task runs durable and consistent
- CHANGED **[entitlements]** One file per commercial package
- CHANGED **[manage]** Retrofit Phase 1 lists to the design system
- DOCS Point entitlements catalog at config/packages
- DOCS **[wip]** Unify tenancy plans into one two-tier spec (platform + satellites, manage app)
- DOCS **[wip]** Tenancy & deployment architecture — converged on plane split + tenant sandboxes
- DOCS **[wip]** Tenant sandbox runtime plan — independent base layer
- DOCS **[wip]** Tenant-box + OD headless spike charter (phase 0)
- FIXED **[coordinator]** Match the test to the heartbeat routine that shipped
- FIXED **[tasks,core]** Run details reveal the thread; repair Vitest 4 test signature
- FIXED **[core]** Tenant-scope the approval queue, add superadmin cross-tenant routes
- FIXED **[manage]** Recover to login on an expired/invalid session
- FIXED **[manage]** Make Phase 1 runnable via portless dev
- OTHER Add CardSection and align detail page content columns.

Centralize section title + card layouts (with header/body variants) so modules stop hand-rolling typography, and pad detail content inside max-width to match DetailPageHeader.

Co-authored-by: Cursor <cursoragent@cursor.com>

## [0.1.67] - 2026-07-23
- ADDED **[inbox]** Add AI face for triage, sync, and UI tools
- ADDED **[agent-ui]** Richer page briefs and DOM-first UI inspection
- ADDED **[copilot]** Add copy-thread action to the drawer menu
- FIXED **[ui]** Register the copilot composer draft bridge in the drawer
- FIXED **[ai]** Refresh invoices and offers agent skill docs
- FIXED **[ag-ui-bridge]** Unblock page-brief dts build for DOM region exports
- OTHER Always allow comments on tasks by agents

## [0.1.66] - 2026-07-22
- ADDED **[tasks]** Durable tool approvals for routine/task runs + routine linkage

## [0.1.65] - 2026-07-22
- ADDED **[ai]** Tiered chat attachments and file-analyst sub-agent
- ADDED **[import]** Clean CSV after upload and expose cleanup_csv tool
- FIXED **[import]** Type onCleanup callbacks for module DTS builds
- FIXED **[core]** Update startApiServer test to Vitest 4 it(name, options, fn) signature

## [0.1.64] - 2026-07-22
- ADDED **[tasks]** LLM inbox headlines, mark-as-seen, leaner sidebar nav
- ADDED **[tasks]** Richer inbox (needs-input vs notifications) + grouped sidebar
- ADDED **[tasks]** Project-style rows + 3-dot menu for goal linked tasks
- ADDED **[tasks]** Human/Agent filter toggle on tasks + goals lists
- ADDED **[tasks]** Goals list cards view + view chooser (list/cards, no kanban)
- ADDED **[tasks]** Hand a goal to the Coordinator (owner + planning kick-off)
- FIXED **[tasks]** Bump goal-owner migration to 20260722160100 (avoid version collision with core ai_agent_overrides)
- FIXED **[tasks]** Create agent_coordinator_dispatch pgmq queue in migration
- FIXED **[tasks]** Cards view default + first, scrollable cards, row-cards icon
- OTHER **[tasks]** Inbox rows — collapse preview whitespace, animated check dismiss
- OTHER **[tasks]** Compact full-width inbox rows + Clear-all, drop per-row seen

## [0.1.63] - 2026-07-22
- ADDED **[ui-icons]** Add Setup and Context Graph dock icons
- FIXED **[engenty-copilot]** Pin session sidebar and polish chat list rows

## [0.1.62] - 2026-07-22
- ADDED **[ai-settings]** Merge AI usage as a tab + move page to /setup/ai
- ADDED **[ai-settings]** Unified DetailPageHeader with title + tab strip

## [0.1.61] - 2026-07-21
- ADDED **[memory]** Core DetailPageHeader tabbed header on /settings/memory
- FIXED **[auth]** Stop dev-login ensure from revoking other Portless sessions
- FIXED **[memory]** Doc-editor dirty false-positives, handle-inside-card, aligned record cards

## [0.1.60] - 2026-07-21
- ADDED **[ui-core]** Add list toolbar hotkeys for search, filters, and new
- ADDED **[secrets]** Adopt list toolbar and richer vault reveal UX
- FIXED **[memory]** Org-tab list, memory_save boundary, frosted editor popovers
- OTHER Lint fix
- OTHER Removed from repo
- OTHER **[secrets]** Tighten vault chrome and sidebar scope
- OTHER Removed useless biome hints

## [0.1.59] - 2026-07-21
- FIXED **[core]** Skip platform-settings hydrate when Supabase is unreachable

## [0.1.58] - 2026-07-21
- FIXED Point runtime SDK packages at dist and sync nav tests

## [0.1.57] - 2026-07-21
- ADDED **[ai]** Per-agent iteration cap (limits.max_steps) governance dial
- ADDED **[tasks]** Task dependency graph — blocked_by_task_ids + auto-wake (coordination Phase 1)
- DOCS Plan for agent coordination — task dependency graph, doctrine skills, capability catalog

## [0.1.56] - 2026-07-21
- ADDED **[ai-ui]** Agent-proposal approval UI on the admin overview
- ADDED **[platform-settings]** Platform-wide settings, tenant credential overrides & connection agent
- ADDED **[ai-ui]** Agent-proposal approval UI on the admin overview
- FIXED **[platform-settings]** SLACK_BOT_TOKEN is platform-scoped in the config test

## [0.1.55] - 2026-07-21
- ADDED **[ai]** Agent_propose — governed agent-registry writer for the coordinator

## [0.1.54] - 2026-07-21
- FIXED **[ai-ui]** Narrow tenant-settings response before reading value

## [0.1.53] - 2026-07-21
- ADDED **[settings]** Enhance plugin deactivation flow and add dependency handling
- ADDED **[settings]** Add Connections overview and stronger icon tiles
- ADDED **[settings]** Add Engenty admin links to settings overview
- ADDED **[settings]** Move roles to Setup and add AI overview cards
- ADDED **[engenty-remote]** Assign engenty plugin category
- ADDED **[settings]** Add plugin categories and group Settings by catalog
- ADDED **[settings]** Add language picker to Appearance overview card
- ADDED **[ui]** Move plugins under Setup and add Appearance overview
- DOCS **[memory]** Add developer and user docs for agent memory
- FIXED **[settings]** Drop redundant labels on Appearance overview card
- FIXED **[settings]** Restore Settings sidebar header on /settings/* pages
- FIXED **[memory]** Remove dead copilot memory-settings page
- OTHER Update module dependencies
- OTHER Better icon sizes

## [0.1.52] - 2026-07-21
- FIXED **[engenty-remote]** Resolve migration timestamp collision blocking all migrations
- FIXED **[memory]** Declare UI in manifest so apps/ui dep survives sync (CI lockfile guard)

## [0.1.51] - 2026-07-21
- ADDED **[memory]** Memory document UI — TipTap doc projection + diff-sync (Phase 6)
- ADDED **[memory]** Weekly consolidation routine (Phase 5)
- ADDED **[memory]** Org governance + skill self-authoring (Phase 4)
- ADDED **[memory]** Entity memory — validated refs, auto-recall, contact Agent-notes card (Phase 3)
- ADDED **[memory]** Reflection loop — post-task reflect step + prior-learnings briefs (Phase 2)
- ADDED **[memory]** Memory module core — store, gateway ops, retrieval source, agent tools (Phase 1)

## [0.1.50] - 2026-07-20
- FIXED **[app-shell]** Stop settings separators from stealing /setup secondary nav

## [0.1.49] - 2026-07-20
- FIXED **[remote]** Grant service_role on module_remote + surface settings errors
- FIXED **[ui]** Tighten favicon framing so the blob fills the icon

## [0.1.48] - 2026-07-20
- ADDED **[ui]** Refreshed favicon/icon set + serve root favicons from the SPA
- ADDED **[modules]** Tag published modules with open/pro tier from CLOSED_PREFIXES
- ADDED **[cli]** Engenty modules add — install a module from the registry (Level A / A4)
- ADDED **[remote]** Settings UI, pairing claim page, identity-gate tests, docs
- ADDED **[remote]** Identity pairing, delegated actor tokens, proactive queue, Telegram (Phases 2-4 backend)
- ADDED **[remote]** Engenty-remote module + Mastra channels Slack runtime (Phase 1)
- CHANGED **[modules]** --pro opt-in instead of --open-only (safe default)
- FIXED **[environment]** Drop node:module from browser-bundled twin (white screen)
- FIXED **[engenty-remote]** Declare module.engenty-remote.read/write in manifest
- FIXED **[ci]** Cap module-build concurrency + use remote cache in publish workflow

## [0.1.47] - 2026-07-20
- ADDED **[modules]** Publish modules to GitHub Packages as overlays (Level A / A5)
- FIXED **[modules]** Avoid delete in publish transform (lint/performance/noDelete)

## [0.1.46] - 2026-07-20
- FIXED **[ci]** Stop the ai/edge deploy build OOMing (concurrency + reliable cache)

## [0.1.45] - 2026-07-20
- ADDED **[modules]** Load registry-installed modules from node_modules (Level A / A3)

## [0.1.44] - 2026-07-20
- ADDED **[modules]** Package each module as a self-contained tarball (Level A / A1)
- ADDED **[import]** Import from connections and move platform import to /setup
- FIXED **[plugins]** Make checkPluginManifest report missing on-disk plugins
- FIXED **[env]** Sync env example files with the manifest
- FIXED **[deps]** Sync lockfile for time-tracking package deps

## [0.1.43] - 2026-07-20
- ADDED **[notifications]** Make the email notifier source-agnostic
- ADDED **[test]** Add Playwright browser smoke lane
- FIXED **[connections]** Prefer integrations.sh /surface over live /discover

## [0.1.42] - 2026-07-20
- ADDED **[import]** Paste-to-import, Sheets TSV fixes, Secrets import

## [0.1.41] - 2026-07-20
- ADDED **[secrets]** Agent-gated reveals — identity forwarding, approval gate, durable goal grants
- ADDED **[secrets]** Password-manager vault UI with dock icon and client/project filters
- ADDED **[secrets]** Client-anchored secrets vault + services module
- DOCS **[secrets]** Record UI test results (U1-U6) in test plan
- FIXED **[core]** Move supabase client construction behind DAL seam
- FIXED **[dev]** Raise portless readiness probe timeout to 15s
- FIXED **[secrets]** Enforce tenant boundary in secrets_list (BUG-1)

## [0.1.40] - 2026-07-20
- ADDED **[deploy]** Pass SUPABASE_DB_URL + VAPID keys to engenty-ai
- FIXED **[desktop]** ⌥Space opens a new chat; stop native-listener churn on nav

## [0.1.39] - 2026-07-20
- ADDED **[notifications]** Web push channel (N2) — subscriptions, VAPID delivery, SW + profile toggle
- FIXED **[desktop]** Don't register the push service worker on tauri:// origin
- FIXED **[dev]** Pass ENGENTY_DEV_READY_MAX_WAIT_MS through turbo globalEnv
- FIXED **[ui]** Lint — drop unused catch binding + optional chain in push sw

## [0.1.38] - 2026-07-19
- ADDED **[team-chat]** Email notifications via the tenant's connector (N4)
- ADDED **[team-chat]** Slack-bridge binding UI (pro settings page)
- DOCS **[team-chat]** Plan bridge phase 7 — realtime Slack sync + reactions
- DOCS **[user]** Add Connect Slack guide (Slack bridge setup)
- FIXED **[team-chat]** Slack-bridge env var was missing its obtain strategy
- FIXED **[team-chat]** Annotate intentional thenable in slack-bridge test mock
- FIXED **[ci]** Cap turbo build concurrency at the runner's 4 vCPUs
- FIXED **[team-chat]** Slack bridge skips non-autonomous connections instead of erroring
- FIXED **[ci]** Stop cancelling in-progress main builds on new pushes

## [0.1.37] - 2026-07-19
- ADDED **[release]** Build the desktop dmg locally instead of on GitHub
- ADDED **[team-chat]** Slack bridge (pro) — outbound replay, inbound sync, binding ops
- ADDED **[team-chat]** User notifications — mention/DM fan-out into the platform inbox (N1)
- FIXED **[ci]** Persist turbo cache across verify runs
- FIXED **[ci]** Raise verify job timeout to 60min

## [0.1.36] - 2026-07-19
- ADDED **[desktop]** Deeper macOS integration — native menu, hotkey, autostart, drag&drop, realtime inbox, local connector host
- FIXED **[team-chat]** Limit conversation content width on wide viewports

## [0.1.35] - 2026-07-19
- ADDED **[desktop]** Reload via ⌘R + tray menu item; quieter error overlay

## [0.1.34] - 2026-07-19
- ADDED **[team-chat]** Render conversation tabs inline on the dashboard
- ADDED **[team-chat]** Design update — blended header, dashboard tabs, stats, unified author colors
- ADDED **[team-chat]** Unread + pins in activity feed, deep-link anchor scroll
- ADDED **[team-chat]** Activity dashboard on the module home
- ADDED **[team-chat]** Phase 5 — retrieval source, channel details, polish, tests
- ADDED **[team-chat]** Composer attachments (upload/paste images + files) and emoji picker
- ADDED **[team-chat]** Human-readable task activity lines in project channels
- ADDED **[team-chat]** Phase 4 project binding + activity feed; UI rework
- ADDED **[team-chat]** Phase 3 — agents as first-class participants
- ADDED **[team-chat]** Phase 2 — reactions, pins, mentions, edit, search, badge
- ADDED **[team-chat]** Phase 1 — Slack-compatible team messaging module
- DOCS **[team-chat]** Test plan for the design update
- DOCS **[team-chat]** Record dashboard verification
- DOCS **[team-chat]** Record UI polish round in test plan
- DOCS **[team-chat]** Mark details-popover + activity-toggle suppression verified
- DOCS **[team-chat]** Mark search verified, record scope_id indexing bug + guard
- DOCS **[team-chat]** Record Phase 1 live verification + follow-ups
- DOCS **[team-chat]** Design doc for Slack-compatible team-chat module
- FIXED **[deps]** Pin @hookform/resolvers to the consumer's zod via packageExtensions
- FIXED **[team-chat]** Align dashboard header with the content column
- FIXED **[team-chat]** Channel-head member roster, anchor-flash fade, pins popover close
- FIXED **[team-chat]** Action tooltips, anchored emoji picker, threads closed by default, clean index status
- FIXED **[team-chat]** Thread button opens a reply composer on reply-less messages
- FIXED **[team-chat]** Index messages — scope_id lives on conversations, not messages
- FIXED **[team-chat]** Visible hover highlight on message rows

## [0.1.33] - 2026-07-19
- FIXED **[desktop]** Resolve API/AI base URLs lazily + surface uncaught errors in the shell
- FIXED **[desktop-ci]** Dispatch falls back to latest v* tag when no GitHub release exists yet
- FIXED **[desktop-ci]** Host arm64 build — --target broke bundler path; dispatch attaches to latest release

## [0.1.32] - 2026-07-19
- FIXED **[lockfile]** Repair pnpm-lock after desktop rebase onto v0.1.30

## [0.1.31] - 2026-07-19
- ADDED **[desktop]** Tauri macOS shell bundling the web SPA with runtime server config

## [0.1.30] - 2026-07-19
- ADDED **[copilot]** Dock queue + approval surfaces as a flap attached to the composer
- ADDED **[generative-ui]** Rich record panels, internal MCP Apps, A2UI catalog (G1–G3)
- DOCS **[wip]** Note run/resume 409 wedge findings from generative-ui verification (unrelated defect)
- DOCS **[dev]** Add Generative UI page, refresh objects page (panels, askAgent, engenty:internal)
- FIXED **[copilot]** Reconcile orphaned interrupts + recover from 409 resumeInProgress
- FIXED **[a2ui]** Make show_ui actions + data-bindings resolve
- FIXED **[copilot]** Thread-scope the composer message queue and clear it on stop

## [0.1.29] - 2026-07-17
- ADDED **[projects]** Resizable task side panel with delete + full-page actions
- DOCS **[wip]** Generative-ui — correct 'iframe cannot host our components' to the precise claim
- DOCS **[wip]** Generative-ui — adjudicate the MCP-Apps-vs-A2UI challenge per use case

## [0.1.28] - 2026-07-17
- ADDED **[chat]** Slash commands + typed @-mentions in agent chats
- DOCS **[wip]** Mark chat slash-commands implemented + live-verified
- DOCS **[wip]** Record review decisions Q1-Q5 (carrier, aliases, action v1, availability, routing)
- DOCS **[wip]** Object-widgets merged to main — phase 3b dependency satisfied after rebase
- DOCS **[wip]** Chat slash-commands + typed @-mentions design
- DOCS **[wip]** Generative-ui — Q6 decided (A2UI first) + worked wire-format examples
- DOCS **[wip]** Generative-ui — evaluate OpenUI (Thesys) as G3 alternative to A2UI
- DOCS **[wip]** Generative-ui — cite official A2UI React renderer docs
- DOCS **[wip]** Correct generative-ui — A2UI React renderers are shipped, AG-UI carries A2UI
- DOCS **[wip]** Generative-ui design — rich panels, internal MCP Apps, A2UI
- FIXED **[chat]** Unwrap workspace-search match envelope, core group heading, route logger

## [0.1.27] - 2026-07-17
- ADDED **[objects]** Make the whole card clickable
- ADDED **[objects]** Make object card actions follow the chat surface
- ADDED **[objects]** Shared list chrome with row actions; stop restating cards in prose
- ADDED Chat object rendering — objects/artifacts/MCP Apps in chat (phases A–D)
- ADDED **[objects]** Tasks/team/invoices widgets, entity_refs backfill
- ADDED **[mcp-apps]** Productionize widget host — bridge, CSP, template cache
- ADDED **[objects]** Pane object tabs, display-hint execution, mention chips
- ADDED **[objects]** Contacts + offers chat object widgets
- ADDED **[objects]** ObjectRef contract, object-widget registry, show_objects tool
- DOCS **[dev]** Document artifacts, objects, widgets and MCP Apps
- DOCS Chat object rendering design (objects, artifacts, MCP Apps in chat)
- FIXED **[ai]** Normalize guessed object ref types in show_objects
- FIXED **[ai-ui]** Render object cards outside the collapsed tool timeline

## [0.1.26] - 2026-07-16
- ADDED **[ai-ui]** User + binding columns in the activity table
- ADDED **[ai-ui]** Full list UI for the activity page
- ADDED **[ai-ui]** Full list UI for artifacts catalog
- ADDED **[ai-ui]** Group artifacts by scope + make them openable
- ADDED **[ai-ui]** Add Artifacts section to Engenty admin

## [0.1.25] - 2026-07-16
- FIXED **[offers]** Ignore settings autosave in external-change banner
- FIXED **[commercial-editor]** Default tax row 70/30 and phase index tooltip
- FIXED **[offers,commercial-editor]** Remove recipient card right padding gap
- FIXED **[ui-core]** Let doc sidebar grow within a capped document row

## [0.1.24] - 2026-07-16
- FIXED **[test]** Update gmail action expectations and hide collapsed flap content
- FIXED **[inbox]** Use interface for attachment fetch result type
- OTHER Improve inbox thread preview: layout, attachments, and list metadata.

Make message cards size to content with attachment thumbnails, fix recipient fallbacks, and surface status tags plus multi-message counts in the list.

Co-authored-by: Cursor <cursoragent@cursor.com>

## [0.1.23] - 2026-07-15
- ADDED **[tasks,ui-core]** Refine task detail workspace + doc-sidebar polish

## [0.1.22] - 2026-07-14
- ADDED **[offers,invoices]** Refine draft doc-sidebar layout
- ADDED **[invoices]** Move draft settings sheet to doc sidebar
- ADDED **[offers]** Move draft settings sheet to doc sidebar

## [0.1.21] - 2026-07-14
- FIXED **[inbox]** Declare @engenty/ui-icons dependency

## [0.1.20] - 2026-07-14
- ADDED **[artifacts]** Project artifacts tab uses standard list views
- ADDED **[artifacts]** Phase D core — editing, download, search indexing
- FIXED **[app-shell]** Widen modules rail and align dock iconography
- OTHER Improve copilot FAB prompt launcher UX and status flap behavior.

Unify Float and Prompt into one speed-dial action that restores the last compact mode, make dial rows fully clickable, fix floating drag bounds to use measured launcher size, and animate status flap expand/collapse with persisted height.

Co-authored-by: Cursor <cursoragent@cursor.com>

## [0.1.19] - 2026-07-13
- ADDED **[artifacts]** Phase C — external project storage
- PERFORMANCE **[deploy]** Split pnpm install via pnpm fetch to fix Docker layer caching

## [0.1.18] - 2026-07-13
- ADDED **[time-tracking]** Outlook calendar overlay parity
- ADDED **[time-tracking]** Calendar sync settings — scope + company overlays (Phase 4)
- ADDED **[time-tracking]** Calendar pull-back / two-way sync (Phase 3)
- DOCS **[time-tracking]** Resolve calendar-sync open questions (overlay=calendar-only, push=all/all-future prompt, provider+delete as planned)
- DOCS **[time-tracking]** Mark calendar-sync phases 1-2 shipped, task list for phases 3-4 + Outlook parity

## [0.1.17] - 2026-07-13
- ADDED **[artifacts]** Phase B — promotion + surfaces

## [0.1.16] - 2026-07-13
- ADDED **[ai-ui]** File & photo upload in chat composer (all surfaces)
- CHANGED **[ai-ui]** Improve attachment preview margins in composer
- FIXED **[chat-upload]** Widen submitMessage to carry attachments, redesign attachment tiles, separate attachments from bubble
- FIXED **[chat-upload]** Resolve coreBaseUrl fallback, durable attachment persistence, and Gateway file-part encoding
- FIXED **[chat-upload]** Feed model + persist attachments; AI SDK tile variants

## [0.1.15] - 2026-07-13
- ADDED **[copilot]** Prefer artifacts for documents; bound frontend-tool interrupts
- ADDED **[engenty-copilot]** Show_artifact frontend tool — open the pane on a specific artifact
- ADDED **[ai-ui]** Real artifact pane — server-backed list, renderers, realtime, open-in-pane
- ADDED **[ai]** Artifacts backend — DAL, HTTP routes, type registry, copilot tools
- ADDED **[ai]** Ai.artifact + ai.artifact_version tables and realtime
- DOCS **[artifacts]** Mark Phase A done with deviations + realtime gotcha
- FIXED **[artifacts]** Review fixes — DAL atomicity, 4xx error mapping, pane/tool-call UI states, interrupt TTL rework
- FIXED **[copilot]** Expose artifact tools to the model and thread-scope the chat runtime

## [0.1.14] - 2026-07-13
- ADDED **[ai-ui]** Shared WorkspaceArtifactPane — tasks detail gets the artifact split
- ADDED **[ai-ui]** Expand control on the artifact pane
- ADDED **[app-shell]** Workspace end-pane slot — artifact pane spans full workspace height
- ADDED **[ai-ui]** Artifact pane + pane primitives — copilot chat split view
- ADDED **[projects]** Collapsible time plan, zoom slider fix, add-member link
- ADDED **[ui-core]** DocSidebar — responsive document sidebar; adopt on task detail
- CHANGED **[tasks]** Card surfaces on ui-canvas classes per DESIGN.md
- DOCS **[artifacts]** Implementation guide for phases A+B with outcome-test plan
- DOCS **[artifacts]** Files-sdk as storage adapter layer, connections as credential layer
- DOCS Artifacts backend & lifecycle spec (wip)
- DOCS Record workspace end-pane layout decision
- DOCS Phase 2 foundation status in app-shell unification doc
- DOCS Phase 1 status in app-shell unification doc
- DOCS **[release]** Uppercase change groups, bold module scopes
- DOCS App shell unification concept (wip)
- FIXED **[app-shell]** Narrow compact sidebar rail to 48px and stop menu-open shift
- FIXED **[app-shell]** Expanded end pane stays within the workspace row
- FIXED **[engenty-copilot]** Topbar action order — CTA, menu, pane toggle
- FIXED **[release]** Raise git-cliff maxBuffer to avoid ENOBUFS
- OTHER Migrate HR & employment module into pro (closed) (#14)

## [0.1.13] - 2026-07-13
- ADDED **[ai-ui]** Richer transcript rows for external connector tools
- ADDED **[browser-bridge]** Agent-controlled browser window via companion extension
- ADDED **[connections]** Import external connectors from OpenAPI specs, MCP servers, and the integrations.sh registry
- FIXED **[docs]** Add required title frontmatter to internal time-tracking doc
- FIXED **[ai]** Serialize parallel tool-approval suspensions and resume reliably

## [0.1.12] - 2026-07-13
- CHANGED Make time-tracking module pro-only

## [0.1.11] - 2026-07-12
- ADDED **[tasks]** Bulk delete, project column, and group-level select in task list

## [0.1.10] - 2026-07-12
- FIXED **[ci]** Keep public repo workflows untouched in open-source snapshot

## [0.1.9] - 2026-07-09
- ADDED **[time-tracking]** Push time entries to calendar (Phase 2)
- ADDED **[time-tracking]** Calendar overlay (Phase 1)
- FIXED **[ci]** Drop stray .claude/worktrees gitlink breaking submodule checkout

## [0.1.8] - 2026-07-09
- ADDED **[deploy]** Apply Supabase migrations automatically on deploy
- ADDED **[authz]** Roles & capabilities authorization with member access gating

## [0.1.7] - 2026-07-08
- FIXED **[copilot]** Restore pnpm kill script entry
- REMOVED **[copilot]** Frontend-tool confirmation
- ADDED **[copilot]** Per-tab agent session binding, realtime sync, and unified status UI
- FIXED **[projects]** Resolve lint failure blocking pnpm fix on main

## [0.1.6] - 2026-07-08
- ADDED **[time-tracking]** Calendar polish — animated weekend, dropdown pickers, vibrant entries
- ADDED **[time-tracking]** Work-week calendar with collapsible weekend, compact toolbar
- ADDED **[time-tracking]** Calendar view with drag-to-track time entries
- FIXED **[time-tracking]** Correct today navigation and week-switch scroll reset
- FIXED **[design-tokens]** Define missing --amber accent (--chart-4 resolved to nothing)

## [0.1.5] - 2026-07-08
- ADDED **[tasks]** Plugin list columns and group-by project
- ADDED **[projects]** Tasks column, sidebar layout, and linked-task counts
- ADDED **[time-tracking]** Improve section headers with SPA entity links
- ADDED **[projects]** Confirm project delete with optional task cascade
- FIXED **[ui]** Resolve ui-plugin-sdk from workspace source in dev
- FIXED **[ci]** Publish-open without checkout credential helper
- FIXED **[time-tracking]** Stabilize bootstrap and breadcrumb user picker
- FIXED **[time-tracking]** Scope team catalog to tenant admins

## [0.1.4] - 2026-07-08
- ADDED Enrich Engenty admin links with live counts
- ADDED Rename AI models label and add Engenty admin links
- ADDED Use squared logo tiles with initials fallback
- DOCS Add unreleased changelog entries
- FIXED Show module icons in settings sidebar
- FIXED Gate developer settings behind developer mode
- FIXED Restore root label and hide empty topbar
- FIXED Pin company-profile in apps/ui deps for settings shell imports
- FIXED Repair pnpm-lock.yaml after merge and add lockfile gate

## [Unreleased]
- FIXED Restore root label and hide empty topbar
- FIXED Pin company-profile in apps/ui deps for settings shell imports
- FIXED Repair pnpm-lock.yaml after merge and add lockfile gate

## [0.1.3] - 2026-07-08
- ADDED Overhaul settings page with modules, users, and plugins
- ADDED Wire real plugins with filtering and collapsed connections
- ADDED Wire real users with role and team member status
- CHANGED Redesign settings page with identity header and stacked layout
- DOCS Add /release skill steering work modes + release flow
- DOCS Consolidate scattered dev sections into one clear Develop block
- FIXED Stabilize tests and finish settings overhaul polish
- FIXED Use module icons from contributions and descriptions from manifest
- FIXED Pull_policy: always so the VPS pulls new :latest images
- FIXED Correct post-release hint — pushing the tag builds+deploys

## [0.1.2] - 2026-07-07
- DOCS Clarify dev + release/ship flow across README, CONTRIBUTING, dev doc
- FIXED Create annotated tag so --follow-tags pushes it

## [0.1.1] - 2026-07-07
- ADDED App menu with brand, version, settings and about
- ADDED Render CHANGELOG at /changelog from changelog.json
- FIXED Hardcode GHCR sandbox image in prebuilt compose

## [0.1.0] - 2026-07-07

- ADDED Coolify deploy pipeline — prebuilt GHCR images with SSH-triggered auto-deploy
- ADDED Guided deploy wizard (`deploy/scripts/deploy-wizard.mjs`)
- ADDED Docs — Coolify setup guide covering exposed schemas, auth hook, and the Traefik network pin
