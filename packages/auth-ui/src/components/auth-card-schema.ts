import { z } from "zod";

export const authCardFormSchema = z.object({
  email: z.string().email(),
  // Not z.preprocess: its input type is `unknown`, which breaks the
  // react-hook-form resolver generics for every consumer of this schema.
  password: z
    .string()
    .optional()
    .transform((val) => (val === "" ? undefined : val))
    .pipe(z.string().min(6).optional()),
  fullName: z.string().optional(),
});

export type AuthCardFormValues = z.infer<typeof authCardFormSchema>;
