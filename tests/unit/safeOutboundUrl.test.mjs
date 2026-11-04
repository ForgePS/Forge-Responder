import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { assertPublicHttpsUrl, assertPublicHttpsTarget, isPrivateAddress } = require("../../functions/lib/safeOutboundUrl.js");

test("public HTTPS addresses are allowed", () => {
  assert.equal(assertPublicHttpsUrl("https://forge-integration-hub-peorxtprba-uc.a.run.app").hostname, "forge-integration-hub-peorxtprba-uc.a.run.app");
  assert.ok(assertPublicHttpsUrl("https://academy.example.com/api"));
});

test("internal, private and non-HTTPS addresses are refused", () => {
  for (const bad of [
    "http://academy.example.com", "https://localhost", "https://127.0.0.1", "https://10.0.0.5",
    "https://192.168.1.1", "https://172.20.0.1", "https://169.254.169.254", "https://metadata.google.internal",
    "https://[::1]", "https://[fd00::1]", "https://[::ffff:127.0.0.1]", "https://intranet", "https://box.local",
    "https://user:pw@academy.example.com", "https://academy.example.com:8443", "ftp://academy.example.com", "not a url",
  ]) {
    assert.throws(() => assertPublicHttpsUrl(bad, "Hub base URL"), /Hub base URL/, bad);
  }
});

test("a public name that resolves to a private address is refused", async () => {
  const toPrivate = async () => [{ address: "10.1.2.3", family: 4 }];
  const toPublic = async () => [{ address: "34.120.1.1", family: 4 }];
  await assert.rejects(assertPublicHttpsTarget("https://sneaky.example.com", "Hub base URL", toPrivate), /public internet/);
  assert.ok(await assertPublicHttpsTarget("https://academy.example.com", "Hub base URL", toPublic));
});

test("private address ranges", () => {
  for (const ip of ["127.0.0.1", "10.9.9.9", "100.64.0.1", "169.254.169.254", "172.31.255.255", "192.168.0.1", "::1", "fe80::1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "34.120.1.1", "172.32.0.1", "2600:1f18::1"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});
