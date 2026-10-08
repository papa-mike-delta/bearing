import { minPasswordLength } from "./credentials.ts";

const errors: Record<string, string> = {
  "wrong-password": "That current password isn't right.",
  invalid: `Use a new password of at least ${minPasswordLength} characters.`,
  mismatch: "The new password and the confirmation don't match.",
  unavailable: "The password couldn't be changed. Try again.",
};

// The message for /account?error=…, or null. Own keys only, so a value like
// ?error=constructor can't reach a prototype property.
export function accountError(key: string | undefined) {
  return key && Object.hasOwn(errors, key) ? errors[key]! : null;
}
