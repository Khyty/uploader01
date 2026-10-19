// A private capability, never included in public sharing links.
export function guestKey(): string {
  const stored = localStorage.getItem("pannheu-guest-key");
  if (stored && /^[a-f0-9]{64}$/.test(stored)) return stored;
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  localStorage.setItem("pannheu-guest-key", key);
  return key;
}
