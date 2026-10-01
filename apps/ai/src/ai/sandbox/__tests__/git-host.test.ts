import { describe, expect, it } from "vitest";
import { isGitAuthFailure, parseGitRemote } from "../git-host.js";

describe("a git remote the host will talk to", () => {
  it("is a plain https URL", () => {
    expect(parseGitRemote(" https://github.com/Org/repo.git ")).toEqual({
      host: "github.com",
      url: "https://github.com/Org/repo.git",
    });
    expect(parseGitRemote("https://git.example.com:8443/a/b")?.host).toBe(
      "git.example.com:8443"
    );
  });

  it("never carries a credential or points anywhere but https", () => {
    for (const raw of [
      "https://token@github.com/org/repo.git",
      "https://user:pass@github.com/org/repo.git",
      "https://github.com/org/repo.git?x=1",
      "http://github.com/org/repo.git",
      "ssh://git@github.com/org/repo.git",
      "file:///etc/passwd",
      "ext::sh -c touch% /tmp/pwned",
      "https://github.com/",
      "not a url",
    ]) {
      expect(parseGitRemote(raw), raw).toBeNull();
    }
  });

  it("tells a login problem from any other failure", () => {
    expect(
      isGitAuthFailure({
        code: 128,
        output:
          "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      })
    ).toBe(true);
    expect(
      isGitAuthFailure({
        code: 128,
        output: "remote: Repository not found.",
      })
    ).toBe(true);
    expect(
      isGitAuthFailure({
        code: 1,
        output: "! [rejected] main -> main (non-fast-forward)",
      })
    ).toBe(false);
  });
});
