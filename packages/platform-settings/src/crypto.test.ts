import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptSettingSecret,
  defaultSettingsKeyWrapper,
  encryptSettingSecret,
  settingAad,
} from "./crypto.js";

beforeAll(() => {
  process.env.SECRETS_ENC_KEY = randomBytes(32).toString("base64");
});

const kw = defaultSettingsKeyWrapper;

describe("settingAad", () => {
  it("binds to scope|tenant|name and ignores tenantId for platform scope", () => {
    expect(
      settingAad({ scope: "platform", tenantId: null, name: "K" }).toString()
    ).toBe("setting|platform||K");
    expect(
      settingAad({ scope: "platform", tenantId: "t1", name: "K" }).toString()
    ).toBe("setting|platform||K");
    expect(
      settingAad({ scope: "tenant", tenantId: "t1", name: "K" }).toString()
    ).toBe("setting|tenant|t1|K");
  });
});

describe("encrypt/decrypt", () => {
  it("round-trips a platform secret", async () => {
    const { valueEnc, dekId } = await encryptSettingSecret({
      keyWrapper: kw,
      scope: "platform",
      tenantId: null,
      name: "AI_GATEWAY_API_KEY",
      plain: "sk-secret-123",
    });
    const out = await decryptSettingSecret({
      keyWrapper: kw,
      scope: "platform",
      tenantId: null,
      name: "AI_GATEWAY_API_KEY",
      valueEnc,
      dekId,
    });
    expect(out).toBe("sk-secret-123");
  });

  it("fails closed when the name differs (AAD mismatch)", async () => {
    const { valueEnc, dekId } = await encryptSettingSecret({
      keyWrapper: kw,
      scope: "platform",
      tenantId: null,
      name: "A",
      plain: "x",
    });
    await expect(
      decryptSettingSecret({
        keyWrapper: kw,
        scope: "platform",
        tenantId: null,
        name: "B",
        valueEnc,
        dekId,
      })
    ).rejects.toThrow();
  });

  it("fails closed when a platform blob is copied into a tenant row", async () => {
    const { valueEnc, dekId } = await encryptSettingSecret({
      keyWrapper: kw,
      scope: "platform",
      tenantId: null,
      name: "SLACK_BOT_TOKEN",
      plain: "xoxb-1",
    });
    await expect(
      decryptSettingSecret({
        keyWrapper: kw,
        scope: "tenant",
        tenantId: "t1",
        name: "SLACK_BOT_TOKEN",
        valueEnc,
        dekId,
      })
    ).rejects.toThrow();
  });

  it("fails closed across different tenants", async () => {
    const { valueEnc, dekId } = await encryptSettingSecret({
      keyWrapper: kw,
      scope: "tenant",
      tenantId: "t1",
      name: "SLACK_BOT_TOKEN",
      plain: "xoxb-1",
    });
    await expect(
      decryptSettingSecret({
        keyWrapper: kw,
        scope: "tenant",
        tenantId: "t2",
        name: "SLACK_BOT_TOKEN",
        valueEnc,
        dekId,
      })
    ).rejects.toThrow();
  });
});
