/**
 * One-off: reset a user's password by writing a fresh scrypt hash directly
 * to account.password. Use this to unlock migrated users before Phase 11
 * (real password reset flow).
 *
 * Usage:
 *   npm run reset-password -- --email <email> --password <new-password> [--remote]
 *
 * Local (default) writes to .wrangler/state/v3/d1/.../db.sqlite via
 * `wrangler d1 execute`. --remote writes to production D1.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scrypt } from "@noble/hashes/scrypt.js";
import {
  bytesToHex,
  randomBytes,
} from "@noble/hashes/utils.js";

// Same params as src/lib/auth.ts
const SCRYPT_PARAMS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 };
const SALT_BYTES = 16;

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scrypt(password, salt, SCRYPT_PARAMS);
  return `${bytesToHex(salt)}:${bytesToHex(hash)}`;
}

function parseArgs(): { email: string; password: string; remote: boolean } {
  const args = process.argv.slice(2);
  let email = "";
  let password = "";
  let remote = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--email") email = args[++i] ?? "";
    else if (a === "--password") password = args[++i] ?? "";
    else if (a === "--remote") remote = true;
  }
  if (!email || !password) {
    console.error(
      "Usage: npm run reset-password -- --email <email> --password <pw> [--remote]"
    );
    process.exit(1);
  }
  return { email, password, remote };
}

function sqlLiteral(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

function main() {
  const { email, password, remote } = parseArgs();
  const hash = hashPassword(password);
  const target = remote ? "--remote" : "--local";

  const sql = `
    UPDATE account
       SET password = ${sqlLiteral(hash)},
           updatedAt = unixepoch() * 1000
     WHERE providerId = 'credential'
       AND userId = (SELECT id FROM "user" WHERE email = ${sqlLiteral(email)});

    SELECT u.id, u.email, u.role,
           CASE WHEN a.password = ${sqlLiteral(hash)} THEN 'updated' ELSE 'unchanged' END as status
      FROM "user" u
      LEFT JOIN account a ON a.userId = u.id AND a.providerId = 'credential'
     WHERE u.email = ${sqlLiteral(email)};
  `.trim();

  console.log(
    `[reset-password] Updating ${email} on ${remote ? "REMOTE" : "local"} D1...`
  );

  // Write SQL to a temp file — wrangler's --command doesn't handle newlines
  // in shell arguments cleanly across platforms.
  const tmp = mkdtempSync(join(tmpdir(), "pp-reset-"));
  const sqlFile = join(tmp, "reset.sql");
  writeFileSync(sqlFile, sql + "\n");

  try {
    const out = execSync(
      `npx wrangler d1 execute pantry-plan ${target} --file=${sqlFile}`,
      { encoding: "utf8", stdio: "pipe" }
    );
    console.log(out);
    console.log(
      `[reset-password] Done. Log in with ${email} / <your new password>.`
    );
  } catch (err) {
    if (err instanceof Error) {
      console.error("[reset-password] wrangler failed:", err.message);
    } else {
      console.error("[reset-password] wrangler failed:", err);
    }
    process.exit(1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
