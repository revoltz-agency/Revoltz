#!/usr/bin/env node
// Generates an AUDIT_OWNER_PASSWORD_HASH value for the Audit Inbox owner login.
//
// Usage:
//   node scripts/hash-audit-password.mjs            # prompts on stdin, never echoes
//   node scripts/hash-audit-password.mjs '<password>'  # argv (mind your shell history)
//
// The password is read, hashed with scrypt and printed as a single line to
// stdout. The password itself is never written to stdout, stderr or any file.
// Paste the printed value into your host's environment variable store — never
// into .env, never into Git.

import crypto from 'node:crypto';

import { hashOwnerPassword, MIN_PASSWORD_LENGTH } from '../server/session.js';

function readFromStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

const fromArgv = process.argv[2];
let password = fromArgv;

if (!password) {
  if (process.stdin.isTTY) {
    process.stdout.write(`Owner password (minimum ${MIN_PASSWORD_LENGTH} characters, not echoed): `);
  }
  password = (await readFromStdin()).replace(/\r?\n$/, '');
}

if (!password) {
  process.stderr.write('No password supplied.\n');
  process.exit(1);
}

if (password.length < MIN_PASSWORD_LENGTH) {
  process.stderr.write(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.\n`);
  process.exit(1);
}

const salt = crypto.randomBytes(16);
process.stdout.write(`${hashOwnerPassword(password, salt)}\n`);
