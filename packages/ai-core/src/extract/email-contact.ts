import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveChatModelId } from "../config/chat-model-id.js";

const emailContactExtractionSchema = z.object({
  contact_info: z.object({
    company: z.string().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    role: z.string().optional(),
    website: z.string().optional(),
  }),
  footer_snippet: z.string().optional(),
  is_automated_or_newsletter: z.boolean(),
});

export type EmailContactExtraction = z.infer<
  typeof emailContactExtractionSchema
>;

export async function extractEmailContactInfo(params: {
  bodyText: string;
}): Promise<EmailContactExtraction> {
  const textToAnalyze = params.bodyText.slice(0, 4000);
  const { output } = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    output: Output.object({ schema: emailContactExtractionSchema }),
    prompt: `Analyze the following email body.
1. Extract the sender's contact information (name, role, company, phone, website) if they are a real person sending a normal email.
2. Identify the exact signature/footer block at the end of the email so it can be removed later. Provide the exact string match.
3. If this is a marketing newsletter or automated notification, set is_automated_or_newsletter to true and skip extracting contact info.

Email Body:
---
${textToAnalyze}
---`,
  });
  return output;
}
