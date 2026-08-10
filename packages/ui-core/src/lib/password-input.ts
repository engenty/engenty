/** Password strength score + random password helpers for PasswordInput. */

export type PasswordStrengthLevel = "weak" | "medium" | "strong";

export interface PasswordStrength {
  level: PasswordStrengthLevel;
  /** 0–100 for progress bars */
  score: number;
}

const GENERATE_ALPHABET =
  "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*";

export function scorePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) {
    score += 25;
  }
  if (password.length >= 12) {
    score += 25;
  }
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score += 20;
  }
  if (/\d/.test(password)) {
    score += 15;
  }
  if (/[^a-zA-Z0-9]/.test(password)) {
    score += 15;
  }

  if (score >= 75) {
    return { level: "strong", score };
  }
  if (score >= 50) {
    return { level: "medium", score };
  }
  return { level: "weak", score };
}

export function generateRandomPassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (b) => GENERATE_ALPHABET[b % GENERATE_ALPHABET.length]
  ).join("");
}
