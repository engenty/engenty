import { describe, expect, it } from "vitest";
import { resolveSpeechRecognitionLang } from "./speech-recognition-types.js";

describe("resolveSpeechRecognitionLang", () => {
  it("maps German UI locales to de-DE", () => {
    expect(resolveSpeechRecognitionLang("de")).toBe("de-DE");
    expect(resolveSpeechRecognitionLang("de-DE")).toBe("de-DE");
    expect(resolveSpeechRecognitionLang("de-AT")).toBe("de-DE");
  });

  it("maps English UI locales to en-US", () => {
    expect(resolveSpeechRecognitionLang("en")).toBe("en-US");
    expect(resolveSpeechRecognitionLang("en-GB")).toBe("en-US");
  });

  it("defaults to en-US when locale is missing", () => {
    expect(resolveSpeechRecognitionLang()).toBe("en-US");
    expect(resolveSpeechRecognitionLang("")).toBe("en-US");
  });

  it("passes through other BCP-47 tags unchanged", () => {
    expect(resolveSpeechRecognitionLang("fr-FR")).toBe("fr-FR");
  });
});
