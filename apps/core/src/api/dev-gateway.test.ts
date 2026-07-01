import { describe, expect, it } from "vitest";
import {
  readDevDocsDirectOrigin,
  readDevGatewayPublicOrigin,
  rewriteDevGatewayLocationHeader,
  shouldRegisterDevGateway,
} from "./dev-gateway.js";

describe("dev-gateway", () => {
  it("shouldRegisterDevGateway is false without ENGENTY_DEV_GATEWAY", () => {
    const previous = process.env.ENGENTY_DEV_GATEWAY;
    delete process.env.ENGENTY_DEV_GATEWAY;
    try {
      expect(shouldRegisterDevGateway()).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.ENGENTY_DEV_GATEWAY;
      } else {
        process.env.ENGENTY_DEV_GATEWAY = previous;
      }
    }
  });

  it("shouldRegisterDevGateway is true with ENGENTY_DEV_GATEWAY even when ENV is unset", () => {
    const prevGateway = process.env.ENGENTY_DEV_GATEWAY;
    const prevEnv = process.env.ENV;
    delete process.env.ENV;
    process.env.ENGENTY_DEV_GATEWAY = "1";
    try {
      expect(shouldRegisterDevGateway()).toBe(true);
    } finally {
      if (prevGateway === undefined) {
        delete process.env.ENGENTY_DEV_GATEWAY;
      } else {
        process.env.ENGENTY_DEV_GATEWAY = prevGateway;
      }
      if (prevEnv === undefined) {
        delete process.env.ENV;
      } else {
        process.env.ENV = prevEnv;
      }
    }
  });

  it("readDevGatewayPublicOrigin prefers ENGENTY_UI_BASE_URL", () => {
    const prevUi = process.env.ENGENTY_UI_BASE_URL;
    const prevDomain = process.env.ENGENTY_DEV_DOMAIN;
    process.env.ENGENTY_UI_BASE_URL = "https://tab-ui.engenty.localhost";
    delete process.env.ENGENTY_DEV_DOMAIN;
    try {
      expect(readDevGatewayPublicOrigin()).toBe(
        "https://tab-ui.engenty.localhost"
      );
    } finally {
      if (prevUi === undefined) {
        delete process.env.ENGENTY_UI_BASE_URL;
      } else {
        process.env.ENGENTY_UI_BASE_URL = prevUi;
      }
      if (prevDomain === undefined) {
        delete process.env.ENGENTY_DEV_DOMAIN;
      } else {
        process.env.ENGENTY_DEV_DOMAIN = prevDomain;
      }
    }
  });

  it("readDevDocsDirectOrigin uses ENGENTY_DEV_DOMAIN", () => {
    const prev = process.env.ENGENTY_DEV_DOMAIN;
    process.env.ENGENTY_DEV_DOMAIN = "tab-ui";
    try {
      expect(readDevDocsDirectOrigin()).toBe(
        "https://tab-ui.docs.engenty.localhost"
      );
    } finally {
      if (prev === undefined) {
        delete process.env.ENGENTY_DEV_DOMAIN;
      } else {
        process.env.ENGENTY_DEV_DOMAIN = prev;
      }
    }
  });

  it("rewriteDevGatewayLocationHeader rewrites docs and manage redirects", () => {
    const gateway = "https://tab-ui.engenty.localhost";
    const docsDirect = "https://tab-ui.docs.engenty.localhost";
    expect(
      rewriteDevGatewayLocationHeader(`${docsDirect}/page`, gateway, docsDirect)
    ).toBe(`${gateway}/page`);
    expect(
      rewriteDevGatewayLocationHeader(
        "https://manage.engenty.localhost/login",
        gateway,
        docsDirect
      )
    ).toBe(`${gateway}/manage/login`);
  });
});
