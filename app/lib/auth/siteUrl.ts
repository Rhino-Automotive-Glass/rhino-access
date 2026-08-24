/**
 * Absolute base URL for links sent in emails (invites, signup confirmations).
 *
 * Set NEXT_PUBLIC_SITE_URL to the canonical production domain. Nothing sets it
 * automatically — without it, emails sent from a deployment previously pointed
 * at http://localhost:3000, which is unreachable for the recipient.
 *
 * VERCEL_URL is only a fallback: it is the deployment-specific hostname
 * (rhino-access-<hash>.vercel.app), not the production domain, so links built
 * from it work but are not stable.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, '')}`;

  return 'http://localhost:3000';
}
