#!/usr/bin/env node
/**
 * Hash a password for OPSBLAZE_LOCAL_AUTH_FILE (scrypt).
 * Usage: node bin/local-auth-hash.cjs [password]
 * If password is omitted, reads from terminal (no echo).
 */

const { randomBytes, scryptSync } = require("crypto");
const readline = require("readline");

const KEY_LEN = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, SCRYPT_OPTIONS);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

function promptHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  let password = process.argv[2];
  if (!password) {
    password = await promptHidden("Password to hash: ");
  }
  if (!password) {
    console.error("No password provided.");
    process.exit(1);
  }
  console.log(hashPassword(password));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
