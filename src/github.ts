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
