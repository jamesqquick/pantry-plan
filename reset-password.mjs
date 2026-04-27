#!/usr/bin/env node
/**
 * One-shot password reset script. Delete after use.
 *
 * Usage:
 *   node reset-password.mjs <email> <new-password>
 *
 * Generates a scrypt hash matching the app's auth config, then prints
 * the wrangler command to update the account row in remote D1.
 */

import { scrypt } from "@noble/hashes/scrypt.js";
import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";

const [email, newPassword] = process.argv.slice(2);

if (!email || !newPassword) {
  console.error("Usage: node reset-password.mjs <email> <new-password>");
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scrypt(newPassword, salt, { N: 2 ** 14, r: 8, p: 1, dkLen: 32 });
const encoded = `${bytesToHex(salt)}:${bytesToHex(hash)}`;

console.log(`\nHash generated for ${email}\n`);
console.log("Run this command to update the password in remote D1:\n");
console.log(
  `wrangler d1 execute pantry-plan --remote --command "UPDATE account SET password = '${encoded}' WHERE userId = (SELECT id FROM user WHERE email = '${email}') AND providerId = 'credential';"`
);
console.log();
