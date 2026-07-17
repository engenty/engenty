import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { useEffect, useState } from "react";

/**
 * Global vault (phase 1) — the engrdian dashboard analogue. Metadata list of
 * secrets the caller is in scope for, with per-row reveal via the audited
 * /api/secrets/:id/reveal endpoint. Nothing decrypted is persisted to browser
 * storage (contrast engrdian H2/H3 — see the audit doc).
 *
 * Minimal-but-real implementation (plain fetch via @engenty/api-client, no
 * query-client) so create→reveal can be driven end-to-end through the app.
 */
interface SecretRow {
  id: string;
  name: string;
  kind: string;
  owner_scope: string;
}

async function unwrap<T>(p: Promise<unknown>): Promise<T> {
  const r = (await p) as { data?: T } & T;
  return (r && typeof r === "object" && "data" in r ? r.data : r) as T;
}

export function VaultPage() {
  const [rows, setRows] = useState<SecretRow[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [name, setName] = useState("Acme DB login");
  const [username, setUsername] = useState("alice");
  const [password, setPassword] = useState("hunter2");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const res = await unwrap<{ rows: SecretRow[] }>(
      requestApiJson("/api/operations/secrets_list/invoke", {
        method: "POST",
        body: { input: {} },
      })
    );
    setRows(res?.rows ?? []);
  }

  useEffect(() => {
    (async () => {
      try {
        const tok = await getCurrentAccessToken();
        if (tok) {
          setUserId(JSON.parse(atob(tok.split(".")[1])).sub as string);
        }
        await refresh();
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    })();
  }, []);

  async function createSecret() {
    setBusy(true);
    setErr(null);
    try {
      await requestApiJson("/api/operations/secrets_create/invoke", {
        method: "POST",
        body: {
          input: {
            owner_scope: "user",
            owner_id: userId,
            name,
            kind: "username_password",
            payload: { username, password },
          },
        },
      });
      await refresh();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function reveal(id: string) {
    setErr(null);
    try {
      const res = await unwrap<{ payload: unknown }>(
        requestApiJson(`/api/secrets/${id}/reveal`, { method: "POST" })
      );
      setRevealed((r) => ({ ...r, [id]: JSON.stringify(res?.payload) }));
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        Secrets Vault
      </h1>
      <p style={{ color: "#666", marginBottom: 20 }}>
        Client-anchored secrets. Payloads are AES-256-GCM encrypted server-side;
        reveal is audited and never cached in the browser.
      </p>

      {err && (
        <div
          style={{
            background: "#fee",
            color: "#900",
            padding: 10,
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          display: "grid",
          gap: 8,
        }}
      >
        <strong>New secret</strong>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <button type="button" onClick={createSecret} disabled={busy || !userId}>
          {busy ? "Creating…" : "Create secret"}
        </button>
      </div>

      <strong>Secrets ({rows.length})</strong>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
        {rows.map((s) => (
          <li
            key={s.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 6,
              padding: "10px 12px",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>
              <strong>{s.name}</strong>{" "}
              <span style={{ color: "#999", fontSize: 12 }}>
                {s.kind} · {s.owner_scope}
              </span>
              {revealed[s.id] && (
                <div style={{ fontFamily: "monospace", fontSize: 12, marginTop: 4 }}>
                  {revealed[s.id]}
                </div>
              )}
            </span>
            <button type="button" onClick={() => reveal(s.id)}>
              Reveal
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
