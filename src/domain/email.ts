/** Email address rules shared by sign-up, profile and invitations. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same address, ignoring case and surrounding spaces. */
export const sameEmail = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
