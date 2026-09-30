export type PasswordStrength = {
  /** 0 = nothing typed yet, 1 weak ... 4 strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hint: string;
};

const COMMON = [
  "password",
  "passw0rd",
  "123456",
  "qwerty",
  "letmein",
  "welcome",
  "iloveyou",
  "admin",
];

/**
 * A quick, honest hint for the sign-up field, not a gate (the only rule is the length check).
 * Rewards length first, then variety, and calls out the obvious traps.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "", hint: "At least 8 characters." };
  if (password.length < 8) {
    return { score: 1, label: "Too short", hint: `${8 - password.length} more to go.` };
  }
  const lower = password.toLowerCase();
  if (COMMON.some((word) => lower.includes(word)) || /(.)\1{3,}/.test(password)) {
    return { score: 1, label: "Easy to guess", hint: "Skip common words and repeated characters." };
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let points = 1;
  if (password.length >= 12) points += 1;
  if (classes >= 3) points += 1;
  if (password.length >= 16 || (password.length >= 12 && classes === 4)) points += 1;
  const score = Math.min(points, 4) as 1 | 2 | 3 | 4;
  const copy = {
    1: { label: "Weak", hint: "Try a longer phrase, or mix in numbers and symbols." },
    2: { label: "Okay", hint: "Add a few more characters to make it stronger." },
    3: { label: "Good", hint: "Nice. A little longer makes it even better." },
    4: { label: "Strong", hint: "That's a solid one." },
  } as const;
  return { score, ...copy[score] };
}
