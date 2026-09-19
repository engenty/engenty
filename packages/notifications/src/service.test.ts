import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createChannelRegistry, runDeliveryOnce } from "./channels/registry.js";
import { BUILTIN_NOTIFICATION_KINDS } from "./contracts.js";
import {
  applyChannelPrefs,
  channelsFor,
  createNotificationsService,
  deferForQuietHours,
  resolveNotificationAudiences,
  subscribersFor,
} from "./service.js";

type Row = Record<string, unknown>;

/**
 * In-memory stand-in for the tenant-locked client. Implements exactly the
 * query shapes dal/store.ts builds; anything else throws so a new shape
 * fails loudly here rather than passing a test it never ran.
 */
function createFakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    notification_deliveries: [...(seed.notification_deliveries ?? [])],
    notification_push_subscriptions: [
      ...(seed.notification_push_subscriptions ?? []),
    ],
    notification_routes: [...(seed.notification_routes ?? [])],
    notification_seen: [...(seed.notification_seen ?? [])],
    notification_streams: [...(seed.notification_streams ?? [])],
    notifications: [...(seed.notifications ?? [])],
    user_settings: [...(seed.user_settings ?? [])],
  };
  let counter = 0;
  const nextId = () => `id-${++counter}`;

  function from(table: string) {
    const rows = tables[table];
    if (!rows) {
      throw new Error(`fake db: unknown table ${table}`);
    }
    type Filter = (row: Row) => boolean;
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: Row | Row[] = {};
    let limitN: number | null = null;
    let order: { asc: boolean; column: string } | null = null;

    const parseOr = (expr: string): Filter => {
      // "audience_kind.eq.tenant,audience_kind.eq.stream,and(audience_kind.eq.user,audience_id.eq.u1)"
      const parts: string[] = [];
      let depth = 0;
      let current = "";
      for (const ch of expr) {
        if (ch === "(") {
          depth += 1;
        }
        if (ch === ")") {
          depth -= 1;
        }
        if (ch === "," && depth === 0) {
          parts.push(current);
          current = "";
          continue;
        }
        current += ch;
      }
      parts.push(current);
      const clause = (part: string): Filter => {
        if (part.startsWith("and(")) {
          // Split on commas outside the `in.(…)` list.
          const inner = part
            .slice(4, -1)
            .split(/,(?![^(]*\))/)
            .map(clause);
          return (row) => inner.every((f) => f(row));
        }
        const inMatch = /^(\w+)\.in\.\((.*)\)$/.exec(part);
        if (inMatch) {
          const values = inMatch[2]!.split(",");
          return (row) => values.includes(String(row[inMatch[1]!]));
        }
        const [column, op, value] = part.split(".");
        if (op !== "eq") {
          throw new Error(`fake db: unsupported or op ${op}`);
        }
        return (row) => row[column as string] === value;
      };
      const clauses = parts.map(clause);
      return (row) => clauses.some((f) => f(row));
    };

    const run = () => {
      if (mode === "insert") {
        const inserted = (Array.isArray(payload) ? payload : [payload]).map(
          (row) => ({
            attempts: 0,
            coalesced_count: 1,
            created_at: new Date().toISOString(),
            id: nextId(),
            status: "pending",
            updated_at: new Date().toISOString(),
            ...row,
          })
        );
        rows.push(...inserted);
        return inserted;
      }
      if (mode === "upsert") {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const row of list) {
          const same = (r: Row) =>
            table === "notification_seen"
              ? r.notification_id === row.notification_id &&
                r.user_id === row.user_id
              : r.endpoint === row.endpoint;
          const idx = rows.findIndex(same);
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...row };
          } else {
            rows.push({ id: nextId(), ...row });
          }
        }
        return list;
      }
      let matched = rows.filter((row) => filters.every((f) => f(row)));
      if (mode === "update") {
        for (const row of matched) {
          Object.assign(row, payload);
        }
        return matched;
      }
      if (mode === "delete") {
        for (const row of matched) {
          rows.splice(rows.indexOf(row), 1);
        }
        return matched;
      }
      if (order) {
        const { asc, column } = order;
        matched = [...matched].sort((a, b) =>
          String(a[column]) < String(b[column]) ? (asc ? -1 : 1) : asc ? 1 : -1
        );
      }
      if (limitN !== null) {
        matched = matched.slice(0, limitN);
      }
      return matched;
    };

    const builder: Record<string, unknown> = {
      delete() {
        mode = "delete";
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      not(column: string, op: string, value: unknown) {
        if (op !== "is" || value !== null) {
          throw new Error(`fake db: unsupported not ${op}`);
        }
        filters.push(
          (row) => row[column] !== null && row[column] !== undefined
        );
        return builder;
      },
      insert(value: Row | Row[]) {
        mode = "insert";
        payload = value;
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      like(column: string, pattern: string) {
        const prefix = pattern.replace(/%$/, "");
        filters.push((row) => String(row[column]).startsWith(prefix));
        return builder;
      },
      lte(column: string, value: string) {
        filters.push((row) => String(row[column]) <= value);
        return builder;
      },
      or(expr: string) {
        filters.push(parseOr(expr));
        return builder;
      },
      order(column: string, opts: { ascending: boolean }) {
        order = { asc: opts.ascending, column };
        return builder;
      },
      select() {
        return builder;
      },
      // biome-ignore lint/suspicious/noThenProperty: the fake mimics PostgREST\'s thenable builder
      then(resolve: (value: { data: Row[]; error: null }) => void) {
        resolve({ data: run(), error: null });
      },
      update(value: Row) {
        mode = "update";
        payload = value;
        return builder;
      },
      upsert(value: Row | Row[]) {
        mode = "upsert";
        payload = value;
        return builder;
      },
    };
    return builder;
  }

  const client = {
    schema: () => ({ from }),
  } as unknown as SupabaseClient;
  return { client, tables };
}

const TENANT = "11111111-1111-1111-1111-111111111111";

function serviceWith(seed?: Record<string, Row[]>) {
  const fake = createFakeDb(seed);
  const created: string[] = [];
  const service = createNotificationsService({
    db: { forTenant: () => fake.client },
    emailDelayMinutes: 5,
    onCreated: (record) => created.push(record.kind),
  });
  return { created, fake, service };
}

describe("kind table", () => {
  it("classifies every builtin kind", () => {
    for (const cls of Object.values(BUILTIN_NOTIFICATION_KINDS)) {
      expect(["decision", "alert", "todo", "update"]).toContain(cls);
    }
  });

  it("refuses an unregistered kind", async () => {
    const { service } = serviceWith();
    await expect(
      service.emit({
        kind: "not_a_kind",
        source: "test",
        summary: "x",
        tenantId: TENANT,
      })
    ).rejects.toThrow(/not registered/);
  });

  it("accepts a kind a module registered", async () => {
    const { service } = serviceWith();
    service.registerKinds({ "contacts.import_finished": "update" });
    const record = await service.emit({
      kind: "contacts.import_finished",
      source: "contacts",
      summary: "42 contacts imported",
      tenantId: TENANT,
    });
    expect(record.class).toBe("update");
  });
});

describe("audience ladder", () => {
  it("addresses shared work to its place, a person only when the subject is theirs", () => {
    const decision = (
      input: Parameters<typeof resolveNotificationAudiences>[0]
    ) => resolveNotificationAudiences(input, "decision");
    expect(
      decision({
        assigneeUserId: "a",
        audience: { key: "leads", kind: "stream" },
      })
    ).toEqual([{ key: "leads", kind: "stream" }]);
    // A parked run in a space: the space, whoever pressed or owns the routine.
    expect(
      decision({ initiatorUserId: "i", ownerUserId: "o", spaceId: "s1" })
    ).toEqual([{ kind: "space", spaceId: "s1" }]);
    // A private subject: its people, one row each — even inside a space.
    expect(
      decision({ participantUserIds: ["p1", "p2", "p1"], spaceId: "s1" })
    ).toEqual([
      { kind: "user", userId: "p1" },
      { kind: "user", userId: "p2" },
    ]);
    // A task outside any space: its assignee.
    expect(decision({ assigneeUserId: "a", ownerUserId: "o" })).toEqual([
      { kind: "user", userId: "a" },
    ]);
    // Nothing known: the tenant. Owner/initiator never address shared work.
    expect(decision({ initiatorUserId: "i", ownerUserId: "o" })).toEqual([
      { kind: "tenant" },
    ]);
  });

  it("keeps assigned work on the assignee and FYI on the person it concerns", () => {
    expect(
      resolveNotificationAudiences(
        { assigneeUserId: "a", spaceId: "s1" },
        "todo"
      )
    ).toEqual([{ kind: "user", userId: "a" }]);
    expect(
      resolveNotificationAudiences(
        { initiatorUserId: "i", spaceId: "s1" },
        "update"
      )
    ).toEqual([{ kind: "user", userId: "i" }]);
    expect(resolveNotificationAudiences({ spaceId: "s1" }, "update")).toEqual([
      { kind: "space", spaceId: "s1" },
    ]);
  });

  it("subscribes the people the old ladder addressed, on top of explicit ones", () => {
    expect(
      subscribersFor(
        { kind: "space", spaceId: "s1" },
        { initiatorUserId: "i", ownerUserId: "o", subscribers: ["x", "o"] }
      )
    ).toEqual(["x", "o", "i"]);
    expect(
      subscribersFor({ kind: "user", userId: "u" }, { ownerUserId: "o" })
    ).toEqual(["u"]);
    expect(subscribersFor({ key: "k", kind: "stream" }, {})).toEqual([]);
  });
});

describe("class channel gate", () => {
  const policy = { emailUpdateSources: ["team-chat"] };
  it("pushes and mails decisions to subscribers; a stream goes through its routes", () => {
    expect(
      channelsFor(
        {
          audience_kind: "user",
          class: "decision",
          priority: "high",
          source: "tasks",
        },
        policy
      )
    ).toEqual(["web_push", "email"]);
    expect(
      channelsFor(
        {
          audience_kind: "space",
          class: "decision",
          priority: "high",
          source: "tasks",
        },
        policy
      )
    ).toEqual(["web_push", "email"]);
    expect(
      channelsFor(
        {
          audience_kind: "stream",
          class: "decision",
          priority: "high",
          source: "tasks",
        },
        policy
      )
    ).toEqual([]);
  });

  it("keeps team-chat mention push and never mails a plain completion", () => {
    expect(
      channelsFor(
        {
          audience_kind: "user",
          class: "update",
          priority: "high",
          source: "team-chat",
        },
        policy
      )
    ).toEqual(["web_push", "email"]);
    expect(
      channelsFor(
        {
          audience_kind: "user",
          class: "update",
          priority: "medium",
          source: "tasks",
        },
        policy
      )
    ).toEqual([]);
  });
});

describe("emit", () => {
  it("writes the record with the resolved audience and a delivery row per channel", async () => {
    const { created, fake, service } = serviceWith();
    const record = await service.emit({
      assigneeUserId: "user-1",
      kind: "tool_approval",
      priority: "high",
      source: "tasks",
      subject: { id: "run-1", type: "run" },
      summary: "Approve sending the invoice",
      tenantId: TENANT,
    });
    expect(record.audience_kind).toBe("user");
    expect(record.audience_id).toBe("user-1");
    expect(record.class).toBe("decision");
    const deliveries = fake.tables.notification_deliveries;
    expect(deliveries.map((d) => d.channel).sort()).toEqual([
      "email",
      "web_push",
    ]);
    expect(deliveries.every((d) => d.notification_id === record.id)).toBe(true);
    expect(created).toEqual(["tool_approval"]);
  });

  it("addresses a decision in a space to the space and pushes its subscribers", async () => {
    // A graph gate in a space: every member sees it; the presser and the
    // routine's owner get the push they got before.
    const { fake, service } = serviceWith();
    const record = await service.emit({
      initiatorUserId: "presser",
      kind: "action_gate",
      ownerUserId: "owner",
      priority: "high",
      source: "workflows",
      spaceId: "space-1",
      subject: { id: "run-1", type: "run" },
      summary: "Send the invoice?",
      tenantId: TENANT,
    });
    expect(record.audience_kind).toBe("space");
    expect(record.audience_id).toBe("space-1");
    expect(record.space_id).toBe("space-1");
    const targets = fake.tables.notification_deliveries
      .filter((d) => d.channel === "web_push")
      .map((d) => (d.target as { user_id: string }).user_id)
      .sort();
    expect(targets).toEqual(["owner", "presser"]);
    expect(fake.tables.notifications).toHaveLength(1);
  });

  it("fans a private subject out to its participants, one row each, one resolve for all", async () => {
    const { fake, service } = serviceWith();
    await service.emit({
      dedupeKey: "int:i1",
      kind: "agent_question",
      participantUserIds: ["p1", "p2"],
      preSeenUserIds: ["p1"],
      source: "agents",
      spaceId: "space-1",
      subject: { id: "i1", type: "thread_interrupt" },
      summary: "Which one?",
      tenantId: TENANT,
    });
    const rows = fake.tables.notifications;
    expect(
      rows.map((r) => [r.audience_kind, r.audience_id, r.dedupe_key])
    ).toEqual([
      ["user", "p1", "int:i1:p1"],
      ["user", "p2", "int:i1:p2"],
    ]);
    // p1 is looking at the card: seen for them, new for p2.
    expect(
      (await service.count({ spaceId: null, tenantId: TENANT, userId: "p1" }))
        .total
    ).toBe(0);
    expect(
      (await service.count({ spaceId: null, tenantId: TENANT, userId: "p2" }))
        .total
    ).toBe(1);
    expect(
      await service.resolve({
        outcome: "resumed",
        subjectId: "i1",
        subjectType: "thread_interrupt",
        tenantId: TENANT,
      })
    ).toBe(2);
  });

  it("coalesces on dedupe_key while the first record is pending", async () => {
    const { fake, service } = serviceWith();
    await service.emit({
      dedupeKey: "routine_failed:r1",
      kind: "routine_failed",
      source: "routines",
      summary: "boom",
      tenantId: TENANT,
    });
    const second = await service.emit({
      dedupeKey: "routine_failed:r1",
      kind: "routine_failed",
      source: "routines",
      summary: "boom again",
      tenantId: TENANT,
    });
    expect(fake.tables.notifications).toHaveLength(1);
    expect(second.coalesced_count).toBe(2);
    expect(second.summary).toBe("boom again");
  });
});

describe("count and list", () => {
  it("counts badge classes only, split by space", async () => {
    const { service } = serviceWith();
    await service.emit({
      kind: "task_failed",
      source: "tasks",
      spaceId: "s1",
      summary: "a",
      tenantId: TENANT,
    });
    await service.emit({
      kind: "task_failed",
      source: "tasks",
      spaceId: "s2",
      summary: "b",
      tenantId: TENANT,
    });
    await service.emit({
      kind: "task_completed",
      source: "tasks",
      spaceId: "s1",
      summary: "c",
      tenantId: TENANT,
    });
    await service.emit({
      kind: "routine_failed",
      source: "routines",
      summary: "global",
      tenantId: TENANT,
    });
    // A space count is that space's rows only — tenant-wide alerts stay on Tenant.
    const counts = await service.count({
      accessibleSpaceIds: ["s1"],
      spaceId: "s1",
      tenantId: TENANT,
      userId: "u1",
    });
    expect(counts).toEqual({ inSpace: 1, total: 2 });
    expect(
      await service.count({
        accessibleSpaceIds: ["s1", "s2"],
        spaceId: "s1",
        tenantId: TENANT,
        userId: "u1",
      })
    ).toEqual({ inSpace: 1, total: 3 });
  });

  it("shows a space row to its members and to nobody else", async () => {
    const { service } = serviceWith();
    await service.emit({
      kind: "action_gate",
      source: "workflows",
      spaceId: "s1",
      summary: "in s1",
      tenantId: TENANT,
    });
    const member = await service.list({
      accessibleSpaceIds: ["s1"],
      limit: 50,
      status: "open",
      tenantId: TENANT,
      userId: "u1",
    });
    expect(member.map((r) => r.summary)).toEqual(["in s1"]);
    const outsider = await service.list({
      accessibleSpaceIds: ["s2"],
      limit: 50,
      status: "open",
      tenantId: TENANT,
      userId: "u2",
    });
    expect(outsider).toEqual([]);
  });

  it("keeps seen per person and never lets a decision be dismissed", async () => {
    const { service } = serviceWith();
    const alert = await service.emit({
      kind: "routine_failed",
      source: "routines",
      spaceId: "s1",
      summary: "boom",
      tenantId: TENANT,
    });
    const gate = await service.emit({
      kind: "action_gate",
      source: "workflows",
      spaceId: "s1",
      summary: "gate",
      tenantId: TENANT,
    });
    const scope = { accessibleSpaceIds: ["s1"], tenantId: TENANT };
    expect(await service.markAllSeen({ ...scope, userId: "u1" })).toBe(1);
    const forU1 = await service.list({
      ...scope,
      limit: 50,
      status: "open",
      userId: "u1",
    });
    expect(forU1.map((r) => [r.summary, r.seen]).sort()).toEqual([
      ["boom", true],
      ["gate", false],
    ]);
    const forU2 = await service.list({
      ...scope,
      limit: 50,
      status: "open",
      userId: "u2",
    });
    expect(forU2.every((r) => r.seen === false)).toBe(true);
    expect(
      await service.count({ ...scope, spaceId: "s1", userId: "u1" })
    ).toEqual({ inSpace: 1, total: 1 });
    expect(
      await service.count({ ...scope, spaceId: "s1", userId: "u2" })
    ).toEqual({ inSpace: 2, total: 2 });
    expect(await service.dismiss({ id: gate.id, tenantId: TENANT })).toBe(
      "decide_instead"
    );
    expect(await service.dismiss({ id: alert.id, tenantId: TENANT })).toBe(
      "ok"
    );
  });

  it("shows a user their own records plus the tenant's, never another user's", async () => {
    const { service } = serviceWith();
    await service.emit({
      assigneeUserId: "u1",
      kind: "task_question",
      source: "tasks",
      summary: "for u1",
      tenantId: TENANT,
    });
    await service.emit({
      assigneeUserId: "u2",
      kind: "task_question",
      source: "tasks",
      summary: "for u2",
      tenantId: TENANT,
    });
    await service.emit({
      kind: "routine_failed",
      source: "routines",
      summary: "team",
      tenantId: TENANT,
    });
    const mine = await service.list({
      limit: 50,
      status: "open",
      tenantId: TENANT,
      userId: "u1",
    });
    expect(mine.map((r) => r.summary).sort()).toEqual(["for u1", "team"]);
  });
});

describe("resolve", () => {
  it("resolves open decisions about a subject and closes alerts only on success", async () => {
    const { service } = serviceWith();
    await service.emit({
      kind: "tool_approval",
      source: "tasks",
      subject: { id: "run-1", type: "run" },
      summary: "d",
      tenantId: TENANT,
    });
    await service.emit({
      kind: "task_failed",
      source: "tasks",
      subject: { id: "task-1", type: "task" },
      summary: "a",
      tenantId: TENANT,
    });
    expect(
      await service.resolve({
        outcome: "resumed",
        subjectId: "run-1",
        subjectType: "run",
        tenantId: TENANT,
      })
    ).toBe(1);
    expect(
      await service.resolve({
        outcome: "resumed",
        subjectId: "task-1",
        subjectType: "task",
        tenantId: TENANT,
      })
    ).toBe(0);
    expect(
      await service.resolve({
        outcome: "completed",
        subjectId: "task-1",
        subjectType: "task",
        tenantId: TENANT,
      })
    ).toBe(1);
  });
});

describe("delivery loop", () => {
  it("claims due rows for registered channels, skips read records, retries failures", async () => {
    const { fake, service } = serviceWith();
    const pushed: string[] = [];
    const channels = createChannelRegistry();
    channels.register({
      deliver: async (record) => {
        if (record.summary === "fail me") {
          throw new Error("nope");
        }
        pushed.push(record.summary);
      },
      id: "web_push",
    });
    const a = await service.emit({
      assigneeUserId: "u1",
      kind: "tool_approval",
      source: "tasks",
      summary: "send me",
      tenantId: TENANT,
    });
    const b = await service.emit({
      assigneeUserId: "u1",
      kind: "tool_approval",
      source: "tasks",
      summary: "already read",
      tenantId: TENANT,
    });
    await service.emit({
      assigneeUserId: "u1",
      kind: "tool_approval",
      source: "tasks",
      summary: "fail me",
      tenantId: TENANT,
    });
    await service.markSeen({ id: b.id, tenantId: TENANT, userId: "u1" });

    const summary = await runDeliveryOnce({
      channels,
      store: service.store,
      tenantId: TENANT,
    });
    expect(pushed).toEqual(["send me"]);
    expect(summary).toEqual({ failed: 1, sent: 1, skipped: 1 });
    const byNotification = Object.fromEntries(
      fake.tables.notification_deliveries
        .filter((d) => d.channel === "web_push")
        .map((d) => [d.notification_id, d.status])
    );
    expect(byNotification[a.id]).toBe("sent");
    expect(byNotification[b.id]).toBe("skipped");
    // email rows are not due yet (5 min delay) and no email channel is registered here
    expect(
      fake.tables.notification_deliveries
        .filter((d) => d.channel === "email")
        .every((d) => d.status === "pending")
    ).toBe(true);
  });
});

describe("streams", () => {
  it("refuses an unknown stream and fans a known one out through its routes", async () => {
    const { fake, service } = serviceWith({
      notification_routes: [
        {
          channel: "remote",
          enabled: true,
          id: "r1",
          min_priority: "high",
          stream_id: "s1",
          target: { external_thread_id: "T1", platform: "slack" },
          tenant_id: TENANT,
        },
        {
          channel: "web_push",
          enabled: true,
          id: "r2",
          min_priority: "low",
          stream_id: "s1",
          target: { user_id: "u1" },
          tenant_id: TENANT,
        },
        {
          channel: "email",
          enabled: false,
          id: "r3",
          min_priority: "low",
          stream_id: "s1",
          target: { user_id: "u1" },
          tenant_id: TENANT,
        },
      ],
      notification_streams: [
        {
          id: "s1",
          key: "leads",
          name: "Leads",
          space_id: "space-9",
          tenant_id: TENANT,
        },
      ],
    });
    await expect(
      service.emit({
        audience: { key: "nope", kind: "stream" },
        kind: "stream_escalation",
        source: "engenties",
        summary: "x",
        tenantId: TENANT,
      })
    ).rejects.toThrow(/does not exist/);
    const record = await service.emit({
      audience: { key: "leads", kind: "stream" },
      kind: "stream_escalation",
      priority: "medium",
      source: "engenties",
      summary: "New lead: ACME wants a quote",
      tenantId: TENANT,
    });
    expect(record.audience_kind).toBe("stream");
    expect(record.space_id).toBe("space-9");
    // medium < high → the remote route is skipped; disabled email skipped.
    expect(fake.tables.notification_deliveries.map((d) => d.channel)).toEqual([
      "web_push",
    ]);
  });
});

describe("preferences", () => {
  it("drops channels a user switched off and keeps digest email-only", () => {
    const prefs = {
      channels: { "decision.web_push": "off", "update.email": "digest" },
      quietHours: null,
      quietHoursTimeZone: null,
    } as const;
    expect(applyChannelPrefs(["web_push", "email"], "decision", prefs)).toEqual(
      ["email"]
    );
    expect(applyChannelPrefs(["web_push", "email"], "update", prefs)).toEqual([
      "email",
    ]);
    expect(applyChannelPrefs(["web_push", "email"], "alert", prefs)).toEqual([
      "web_push",
      "email",
    ]);
  });

  it("reads prefs off user_settings at emit", async () => {
    const { fake, service } = serviceWith({
      user_settings: [
        {
          name: "notifications.decision.web_push",
          user_id: "u1",
          value_string: "off",
        },
      ],
    });
    await service.emit({
      assigneeUserId: "u1",
      kind: "tool_approval",
      source: "tasks",
      summary: "d",
      tenantId: TENANT,
    });
    expect(fake.tables.notification_deliveries.map((d) => d.channel)).toEqual([
      "email",
    ]);
  });

  it("defers delivery to the end of quiet hours, wrapping midnight", () => {
    const at = (iso: string) => new Date(iso);
    expect(
      deferForQuietHours(
        at("2026-09-03T23:30:00Z"),
        "22:00-07:00",
        "UTC"
      ).toISOString()
    ).toBe("2026-09-04T07:00:00.000Z");
    expect(
      deferForQuietHours(
        at("2026-09-03T12:00:00Z"),
        "22:00-07:00",
        "UTC"
      ).toISOString()
    ).toBe("2026-09-03T12:00:00.000Z");
    expect(
      deferForQuietHours(at("2026-09-03T12:00:00Z"), null, null).toISOString()
    ).toBe("2026-09-03T12:00:00.000Z");
    expect(
      deferForQuietHours(
        at("2026-09-03T12:00:00Z"),
        "garbage",
        null
      ).toISOString()
    ).toBe("2026-09-03T12:00:00.000Z");
  });
});

describe("resolve closes what the subject settled", () => {
  it("resolves rows someone looked at and stamps why", async () => {
    // A decision someone looked at but did not answer is still about the
    // subject; it must close with it, and the row records the reason.
    const { fake, service } = serviceWith();
    const record = await service.emit({
      kind: "approval_requested",
      metadata: { operation_id: "inbox_sync_run" },
      source: "connections",
      subject: { id: "req-1", type: "approval_request" },
      summary: "needs your approval",
      tenantId: TENANT,
    });
    await service.markSeen({ id: record.id, tenantId: TENANT, userId: "u1" });
    expect(
      await service.resolve({
        outcome: "decided",
        subjectId: "req-1",
        subjectType: "approval_request",
        tenantId: TENANT,
      })
    ).toBe(1);
    const row = fake.tables.notifications.find((r) => r.id === record.id);
    expect(row?.status).toBe("resolved");
    expect(row?.metadata).toMatchObject({
      operation_id: "inbox_sync_run",
      resolved_reason: "decided",
    });
  });

  it("mark-all-seen leaves decisions open", async () => {
    // "Seen" hides an FYI; it must never stand in for a decision, or the
    // agent behind the gate stays blocked while the person thinks it is done.
    const { fake, service } = serviceWith();
    await service.emit({
      kind: "approval_requested",
      source: "connections",
      subject: { id: "req-2", type: "approval_request" },
      summary: "gate",
      tenantId: TENANT,
    });
    await service.emit({
      kind: "task_completed",
      source: "tasks",
      summary: "done",
      tenantId: TENANT,
    });
    expect(await service.markAllSeen({ tenantId: TENANT, userId: "u1" })).toBe(
      1
    );
    expect(fake.tables.notifications.every((r) => r.status === "pending")).toBe(
      true
    );
    expect(fake.tables.notification_seen.map((r) => r.notification_id)).toEqual(
      [fake.tables.notifications.find((r) => r.kind === "task_completed")?.id]
    );
  });
});

describe("coalesce", () => {
  it("merges a re-ask into the open row and points it at the newest subject", async () => {
    // A routine re-filing the same gated operation every fire: 4 rows in 3
    // days on the dev DB. Now one row, ×N, whose subject is the newest
    // request — deciding the row decides that request.
    const { fake, service } = serviceWith();
    const key = "agent:inbox.assist:inbox_sync_run:global";
    const first = await service.emit({
      coalesceKey: key,
      dedupeKey: "approval-request:req-1",
      kind: "approval_requested",
      source: "connections",
      subject: { id: "req-1", type: "approval_request" },
      summary: "first",
      tenantId: TENANT,
    });
    await service.markSeen({ id: first.id, tenantId: TENANT, userId: "u1" });
    const second = await service.emit({
      coalesceKey: key,
      dedupeKey: "approval-request:req-2",
      kind: "approval_requested",
      metadata: { approval_request_id: "req-2" },
      source: "connections",
      subject: { id: "req-2", type: "approval_request" },
      summary: "second",
      tenantId: TENANT,
    });
    expect(second.id).toBe(first.id);
    expect(fake.tables.notifications).toHaveLength(1);
    const row = fake.tables.notifications[0];
    expect(row).toMatchObject({
      coalesced_count: 2,
      dedupe_key: "approval-request:req-2",
      status: "pending",
      subject_id: "req-2",
      summary: "second",
    });
    // New again for everyone: u1's glance at the first ask is forgotten.
    expect(fake.tables.notification_seen).toEqual([]);
    // The newest request's own repeat is the dedupe no-op it always was.
    const repeat = await service.emit({
      coalesceKey: key,
      dedupeKey: "approval-request:req-2",
      kind: "approval_requested",
      source: "connections",
      subject: { id: "req-2", type: "approval_request" },
      summary: "second again",
      tenantId: TENANT,
    });
    expect(repeat.id).toBe(first.id);
    expect(fake.tables.notifications).toHaveLength(1);
  });
});

describe("origin enrichment", () => {
  it("fills actor and space labels from ids on every emit", async () => {
    const fake = createFakeDb();
    const service = createNotificationsService({
      db: { forTenant: () => fake.client },
      origin: {
        agent: async (_t, id) =>
          id === "01a04a10-fcf6-7cad-b761-e852b7473c90"
            ? { id: "inbox.assist", name: "Inbox Assistant" }
            : null,
        space: async (_t, id) =>
          id === "space-1"
            ? { key: "second-brain", name: "Second Brain" }
            : null,
        user: async () => null,
      },
    });
    const record = await service.emit({
      actor: { id: "01a04a10-fcf6-7cad-b761-e852b7473c90", kind: "agent" },
      kind: "agent_message_received",
      metadata: { thread_id: "thr-1" },
      source: "agents",
      spaceId: "space-1",
      summary: "Brain handed off to KB Manager",
      tenantId: TENANT,
    });
    expect(record.actor_id).toBe("inbox.assist");
    expect(record.metadata).toEqual({
      actor_label: "Inbox Assistant",
      actor_ref: "agent:inbox.assist",
      space_key: "second-brain",
      space_name: "Second Brain",
      thread_id: "thr-1",
    });
  });
});
