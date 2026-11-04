/**
 * Outbound requests to addresses a department configures (the Forge Academy /
 * Integration Hub base URLs). Those settings are typed in by department admins,
 * so before the server sends anything (often with stored tokens) we check the
 * address is public HTTPS: no localhost, private networks, cloud metadata
 * servers or internal names, and no redirects that could lead to one.
 */
const dns = require("node:dns").promises;
const net = require("node:net");

const BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost", ".lan", ".home", ".corp", ".intranet"];

function ipv4Parts(ip) {
  return ip.split(".").map(Number);
}

/** True for addresses that aren't on the public internet. */
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ipv4Parts(ip);
    return a === 0 || a === 10 || a === 127
      || (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
      || (a === 169 && b === 254) // link-local, cloud metadata
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224; // multicast and reserved
  }
  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase();
    if (value === "::" || value === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
    if (mapped) return isPrivateAddress(mapped[1]);
    // The URL parser writes IPv4-mapped addresses in hex (::ffff:7f00:1).
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
    if (mappedHex) {
      const high = parseInt(mappedHex[1], 16);
      const low = parseInt(mappedHex[2], 16);
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(value) || value.startsWith("64:ff9b:") || value.startsWith("2001:db8:");
  }
  return true;
}

/**
 * Check a configured URL is public HTTPS. Returns the parsed URL or throws an
 * Error with a message an admin can act on.
 */
function assertPublicHttpsUrl(value, label = "URL") {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error(`${label} is not a valid web address.`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must start with https://.`);
  if (url.username || url.password) throw new Error(`${label} can't contain a user name or password.`);
  if (url.port && url.port !== "443") throw new Error(`${label} must use the standard HTTPS port.`);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || (!host.includes(".") && !net.isIP(host))) {
    throw new Error(`${label} must be a public internet address.`);
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)) || host === "metadata.google.internal") {
    throw new Error(`${label} must be a public internet address.`);
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new Error(`${label} must be a public internet address.`);
  return url;
}

/** Same as assertPublicHttpsUrl, and every address the name resolves to must be public. */
async function assertPublicHttpsTarget(value, label = "URL", lookup = dns.lookup) {
  const url = assertPublicHttpsUrl(value, label);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return url;
  let addresses;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`${label}: ${host} could not be found.`);
  }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error(`${label} must be a public internet address.`);
  }
  return url;
}

/** fetch() to a configured address: checked first, and redirects are refused. */
async function safeOutboundFetch(target, init = {}, label = "Configured address") {
  await assertPublicHttpsTarget(target, label);
  return fetch(target, { ...init, redirect: "error" });
}

module.exports = {
  isPrivateAddress,
  assertPublicHttpsUrl,
  assertPublicHttpsTarget,
  safeOutboundFetch,
};
