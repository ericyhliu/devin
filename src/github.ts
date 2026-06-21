import crypto from "node:crypto";

/**
 * Verify a GitHub webhook signature.
 *
 * GitHub signs the raw request body with HMAC-SHA256 using the webhook secret
 * and sends it in the `X-Hub-Signature-256` header as `sha256=<hex>`. We
 * recompute it over the EXACT bytes we received and compare in constant time.
 *
 * @param rawBody  the raw request body bytes (must not be re-serialized JSON)
 * @param signatureHeader  value of the `x-hub-signature-256` header
 * @param secret  the shared webhook secret
 */
export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  // timingSafeEqual throws if lengths differ, so guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Extract the issue number a PR closes, from its body. Matches GitHub's closing
 * keywords ("Closes #12", "Fixes #12", etc.) and falls back to a bare "#12".
 * Returns null if no issue reference is found.
 */
export function parseClosesIssue(body: string | null | undefined): number | null {
  if (!body) return null;
  const keyword = body.match(
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i,
  );
  if (keyword) return Number(keyword[1]);
  const bare = body.match(/#(\d+)/);
  return bare ? Number(bare[1]) : null;
}
