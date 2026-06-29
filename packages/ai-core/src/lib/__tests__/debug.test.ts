import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_CHAT_MODEL_ID } from "../../config/chat-model-id.js";
import { logAiGenerationResult, logAiLoopTrace } from "../debug.js";

describe("ai debug helpers", () => {
  const originalAiDebug = process.env.AI_DEBUG;
  const originalAiDebugLogStdout = process.env.AI_DEBUG_LOG_STDOUT;
  const originalLogDir = process.env.LOG_DIR;
  const originalAiDebugLogDir = process.env.AI_DEBUG_LOG_DIR;
  const originalAiDebugLogFile = process.env.AI_DEBUG_LOG_FILE;
  let tempDir: string | null = null;

  afterEach(() => {
    if (originalAiDebug == null) {
      Reflect.deleteProperty(process.env, "AI_DEBUG");
    } else {
      process.env.AI_DEBUG = originalAiDebug;
    }
    if (originalAiDebugLogStdout == null) {
      Reflect.deleteProperty(process.env, "AI_DEBUG_LOG_STDOUT");
    } else {
      process.env.AI_DEBUG_LOG_STDOUT = originalAiDebugLogStdout;
    }
    if (originalLogDir == null) {
      Reflect.deleteProperty(process.env, "LOG_DIR");
    } else {
      process.env.LOG_DIR = originalLogDir;
    }
    if (originalAiDebugLogDir == null) {
      Reflect.deleteProperty(process.env, "AI_DEBUG_LOG_DIR");
    } else {
      process.env.AI_DEBUG_LOG_DIR = originalAiDebugLogDir;
    }
    if (originalAiDebugLogFile == null) {
      Reflect.deleteProperty(process.env, "AI_DEBUG_LOG_FILE");
    } else {
      process.env.AI_DEBUG_LOG_FILE = originalAiDebugLogFile;
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("logs the final AI generation result when AI_DEBUG is enabled", () => {
    process.env.AI_DEBUG = "true";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ai-debug-"));
    process.env.AI_DEBUG_LOG_DIR = tempDir;
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
    };

    logAiGenerationResult(logger, {
      modelId: DEFAULT_AI_CHAT_MODEL_ID,
      prompt: "Hello",
      result: {
        text: '{"ok":true}',
        steps: [{ text: "step one" }],
      },
    });

    expect(logger.info).toHaveBeenCalledWith(
      "AI generation result",
      expect.objectContaining({
        model_id: DEFAULT_AI_CHAT_MODEL_ID,
        prompt: "Hello",
        steps: [{ text: "step one" }],
        text: '{"ok":true}',
      })
    );
    const fileContent = fs.readFileSync(
      path.join(tempDir, "agents.log"),
      "utf8"
    );
    expect(fileContent).toContain('"event":"ai_generation_result"');
    expect(fileContent).toContain('"prompt":"Hello"');
  });

  it("removes encrypted reasoning fields, keeps useful text, and truncates noisy metadata", () => {
    process.env.AI_DEBUG = "true";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ai-debug-"));
    process.env.AI_DEBUG_LOG_DIR = tempDir;
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
    };
    const longText = "x".repeat(160);
    const longMetadata = "m".repeat(160);

    logAiLoopTrace(logger, {
      agentId: "dashboard_widget_generator",
      maxSteps: 2,
      modelId: DEFAULT_AI_CHAT_MODEL_ID,
      systemPrompt: longText,
      toolNames: [],
      userMessage: "Build widget",
      result: {
        steps: [
          {
            text: longText,
            providerMetadata: {
              openai: {
                serviceTier: longMetadata,
              },
            },
            content: [
              {
                itemId: "rs_123",
                reasoningEncryptedContent: "gAAAAABpt8KtgNPAOD-secret",
              },
            ],
          },
        ],
        text: longText,
      },
    });

    const fileContent = fs.readFileSync(
      path.join(tempDir, "agents.log"),
      "utf8"
    );
    expect(fileContent).not.toContain("reasoningEncryptedContent");
    expect(fileContent).not.toContain("gAAAAABpt8KtgNPAOD-secret");
    expect(fileContent).toContain(longText);
    expect(fileContent).not.toContain(longMetadata);
    expect(fileContent).toContain("[truncated 60 chars]");
  });

  it("logs every AI loop step when AI_DEBUG is enabled", () => {
    process.env.AI_DEBUG = "true";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ai-debug-"));
    process.env.AI_DEBUG_LOG_DIR = tempDir;
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
    };

    logAiLoopTrace(logger, {
      agentId: "dashboard_widget_generator",
      maxSteps: 5,
      modelId: DEFAULT_AI_CHAT_MODEL_ID,
      systemPrompt: "system",
      toolNames: ["engentyApiCatalog", "engentyApi"],
      userMessage: "Build widget",
      result: {
        finishReason: "stop",
        steps: [
          { text: "step one" },
          { toolCalls: [{ toolName: "engentyApiCatalog" }] },
        ],
        text: '{"title":"Hello"}',
      },
    });

    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      "AI loop started",
      expect.objectContaining({
        agent_id: "dashboard_widget_generator",
        tool_names: ["engentyApiCatalog", "engentyApi"],
      })
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      "AI loop step",
      expect.objectContaining({
        step_index: 1,
        text: "step one",
      })
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      3,
      "AI loop step",
      expect.objectContaining({
        step_index: 2,
        tool_calls: [{ toolName: "engentyApiCatalog" }],
      })
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      4,
      "AI loop completed",
      expect.objectContaining({
        finish_reason: "stop",
        step_count: 2,
      })
    );
    const fileContent = fs.readFileSync(
      path.join(tempDir, "agents.log"),
      "utf8"
    );
    expect(fileContent).toContain('"event":"ai_loop_started"');
    expect(fileContent).toContain('"event":"ai_loop_step"');
    expect(fileContent).toContain('"event":"ai_loop_completed"');
  });

  it("uses a custom AI debug log filename when configured", () => {
    process.env.AI_DEBUG = "true";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ai-debug-"));
    process.env.AI_DEBUG_LOG_DIR = tempDir;
    process.env.AI_DEBUG_LOG_FILE = "custom-agents.ndjson";
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
    };

    logAiGenerationResult(logger, {
      modelId: DEFAULT_AI_CHAT_MODEL_ID,
      prompt: "Hello",
      result: {
        text: '{"ok":true}',
      },
    });

    const fileContent = fs.readFileSync(
      path.join(tempDir, "custom-agents.ndjson"),
      "utf8"
    );
    expect(fileContent).toContain('"event":"ai_generation_result"');
  });

  it("can disable stdout logging while keeping file logging", () => {
    process.env.AI_DEBUG = "true";
    process.env.AI_DEBUG_LOG_STDOUT = "false";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ai-debug-"));
    process.env.AI_DEBUG_LOG_DIR = tempDir;
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
    };

    logAiLoopTrace(logger, {
      agentId: "dashboard_widget_generator",
      maxSteps: 2,
      modelId: DEFAULT_AI_CHAT_MODEL_ID,
      systemPrompt: "system",
      toolNames: [],
      userMessage: "Build widget",
      result: {
        steps: [{ text: "step one" }],
        text: '{"title":"Hello"}',
      },
    });

    expect(logger.info).not.toHaveBeenCalled();
    const fileContent = fs.readFileSync(
      path.join(tempDir, "agents.log"),
      "utf8"
    );
    expect(fileContent).toContain('"event":"ai_loop_started"');
    expect(fileContent).toContain('"event":"ai_loop_completed"');
  });
});
