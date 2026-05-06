#!/usr/bin/env node
/**
 * ProChefDesk — build script (v2.8.0+)
 *
 * Reads APP_VERSION from js/core/config.js and replaces __VERSION__
 * placeholders in index.html with the actual version string.
 *
 * Run automatically by Cloudflare Pages via the project's "Build command"
 * setting. Operator workflow becomes:
 *   1. Bump APP_VERSION in js/core/config.js
 *   2. git push
 *   3. Cloudflare runs `node build.js` -> replaces ?v=__VERSION__
 *      in index.html with the live APP_VERSION value
 *   4. Static deploy
 *
 * Why a placeholder + build hook instead of dynamic JS?
 * - FOUC-free: stylesheets cache-busted on first paint
 * - Sırasal güvence: no race condition between config.js load and
 *   subsequent script src updates
 * - No service worker required
 *
 * Why a Node script instead of sed?
 * - Cross-platform (operator may eventually run locally on Windows)
 * - Pinpoint validation: errors out loudly if APP_VERSION cannot be parsed
 *   or if no placeholders are found, rather than silently producing a
 *   broken deploy
 *
 * If this script fails, Cloudflare Pages reports a build failure and
 * the deploy aborts — the previous live version remains intact. Safe
 * by construction.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'app', 'js', 'core', 'config.js');
const HTML_PATH = path.join(__dirname, 'app', 'index.html');
const PLACEHOLDER = '__VERSION__';

function fail(msg) {
  console.error('[build] FATAL: ' + msg);
  process.exit(1);
}

function readVersion() {
  let src;
  try {
    src = fs.readFileSync(CONFIG_PATH, 'utf8');
  } catch (e) {
    fail('Cannot read ' + CONFIG_PATH + ': ' + e.message);
  }
  // Match: APP_VERSION: '2.8.0',
  const m = src.match(/APP_VERSION\s*:\s*['"]([0-9]+\.[0-9]+\.[0-9]+)['"]/);
  if (!m) fail('APP_VERSION not found in config.js (expected pattern: APP_VERSION: "X.Y.Z")');
  return m[1];
}

function injectIntoHtml(version) {
  let html;
  try {
    html = fs.readFileSync(HTML_PATH, 'utf8');
  } catch (e) {
    fail('Cannot read ' + HTML_PATH + ': ' + e.message);
  }

  const occurrences = (html.match(new RegExp(PLACEHOLDER, 'g')) || []).length;
  if (occurrences === 0) {
    fail('No ' + PLACEHOLDER + ' placeholders found in index.html — already injected? Source corruption?');
  }

  const out = html.split(PLACEHOLDER).join(version);
  fs.writeFileSync(HTML_PATH, out, 'utf8');
  return occurrences;
}

function main() {
  const version = readVersion();
  console.log('[build] APP_VERSION = ' + version);
  const replaced = injectIntoHtml(version);
  console.log('[build] Replaced ' + replaced + ' placeholders in index.html');
  console.log('[build] OK');
}

main();
