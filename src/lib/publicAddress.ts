import net from 'node:net';

/**
 * Plages qui ne désignent pas un hôte public d'Internet : boucle locale,
 * réseaux privés, lien local (métadonnées cloud en 169.254.169.254),
 * CGNAT, multidiffusion, plages réservées ou de documentation.
 */
const BLOCKED = new net.BlockList();

for (const [prefix, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(prefix, bits, 'ipv4');
}

for (const [prefix, bits] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(prefix, bits, 'ipv6');
}

/** Adresse IPv4 embarquée dans une IPv6 (`::ffff:a.b.c.d`, NAT64 `64:ff9b::a.b.c.d`), le cas échéant. */
function embeddedIPv4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = lower.match(/^(?:::ffff:|::ffff:0:|64:ff9b::|::)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1];

  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  }
  return null;
}

/**
 * Vrai si l'adresse IP littérale désigne un hôte public.
 *
 * Toute chaîne qui n'est pas une IP valide est refusée : on ne laisse passer
 * que ce qu'on a su classer.
 */
export function isPublicAddress(address: string): boolean {
  const unbracketed = address.replace(/^\[|\]$/g, '');
  const family = net.isIP(unbracketed);
  if (family === 4) return !BLOCKED.check(unbracketed, 'ipv4');
  if (family === 6) {
    const v4 = embeddedIPv4(unbracketed);
    if (v4) return net.isIPv4(v4) && !BLOCKED.check(v4, 'ipv4');
    return !BLOCKED.check(unbracketed, 'ipv6');
  }
  return false;
}
