/**
 * Image generation on the platform `image` role: every caller (agent looks,
 * team avatars, knowledge-base covers) resolves the model from the role
 * binding and draws through one path, so the binding is the only knob.
 */
import { generateImage, generateText } from "ai";
import {
  DEFAULT_MODEL_GATEWAY_ID,
  formatModelRef,
  parseModelRef,
} from "../config/model-ref.js";
import { roleModelRef } from "../config/platform-bindings.js";

export const IMAGE_MODEL_ROLE = "image";

/** The `image` role is bound to a gateway that cannot draw images. */
export class ImageModelGatewayError extends Error {
  readonly gateway: string;
  readonly modelRef: string;

  constructor(gateway: string, modelId: string) {
    const modelRef = formatModelRef({ gateway, modelId });
    super(
      `The "Image generation" model role is bound to ${modelRef}, but image generation only runs on the ${DEFAULT_MODEL_GATEWAY_ID} gateway. Rebind the role to a ${DEFAULT_MODEL_GATEWAY_ID} image model in the role bindings.`
    );
    this.name = "ImageModelGatewayError";
    this.gateway = gateway;
    this.modelRef = modelRef;
  }
}

/**
 * The model id the platform `image` role is bound to. Only the default gateway exposes image models, so a binding on
 * any other gateway throws `ImageModelGatewayError` rather than being
 * silently redirected.
 */
export function resolvePlatformImageModelId(): string {
  const ref = parseModelRef(roleModelRef(IMAGE_MODEL_ROLE));
  if (ref.gateway !== DEFAULT_MODEL_GATEWAY_ID) {
    throw new ImageModelGatewayError(ref.gateway, ref.modelId);
  }
  return ref.modelId;
}

export interface ImageReference {
  bytes: Uint8Array;
  mediaType: string;
}

export interface GenerateImageBytesInput {
  aspectRatio?: `${number}:${number}`;
  modelId: string;
  prompt: string;
  /** Optional input image (edit / likeness hint). */
  reference?: ImageReference | null;
}

/**
 * Gemini image models are chat models that answer with image files; dedicated
 * image models (Imagen, gpt-image) go through `generateImage`.
 */
export function isChatImageModel(modelId: string): boolean {
  return modelId.includes("gemini") && modelId.includes("image");
}

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
}

async function generateViaChat(
  input: GenerateImageBytesInput
): Promise<Uint8Array> {
  const { modelId, prompt, reference } = input;
  const result = await generateText({
    model: modelId,
    messages: reference
      ? [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image",
                image: reference.bytes,
                mediaType: reference.mediaType,
              },
            ],
          },
        ]
      : [{ role: "user", content: prompt }],
  });
  const file = result.files?.find((entry) =>
    (entry.mediaType ?? "").startsWith("image/")
  );
  if (file?.uint8Array && file.uint8Array.byteLength > 0) {
    return file.uint8Array;
  }
  throw new Error("Image model returned no image file");
}

async function generateViaImageModel(
  input: GenerateImageBytesInput
): Promise<Uint8Array> {
  const { aspectRatio, modelId, prompt, reference } = input;
  const result = await generateImage({
    model: modelId,
    n: 1,
    prompt: reference ? { images: [reference.bytes], text: prompt } : prompt,
    ...(aspectRatio ? { aspectRatio } : {}),
  });
  const img = result.image ?? result.images?.[0];
  if (img?.uint8Array && img.uint8Array.byteLength > 0) {
    return img.uint8Array;
  }
  if (img?.base64) {
    return base64ToBytes(img.base64);
  }
  throw new Error("Image model returned no image bytes");
}

/** One image from `modelId` (a default-gateway id), as raw bytes. */
export function generateImageBytes(
  input: GenerateImageBytesInput
): Promise<Uint8Array> {
  return isChatImageModel(input.modelId)
    ? generateViaChat(input)
    : generateViaImageModel(input);
}
