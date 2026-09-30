/** One-time code settings shared by the server config and the entry screens (client-safe). */
export const OTP_LENGTH = 6;
/** How long a code works. Links last an hour; codes are short-lived. */
export const OTP_EXPIRES_IN = 10 * 60;
/** Wrong guesses allowed per code; after that the code is deleted and a new one is needed. */
export const OTP_ALLOWED_ATTEMPTS = 5;
/** Seconds before the screens let someone ask for another email. */
export const RESEND_COOLDOWN_SECONDS = 30;
