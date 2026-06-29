import { z } from "zod";

export const authCardFormSchema = z.object({
  email: z.string().email(),
  password: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().min(6).optional()
  ),
  fullName: z.string().optional(),
});

export type AuthCardFormValues = z.infer<typeof authCardFormSchema>;
