#!/usr/bin/env node
// Lightweight regression checks for index.html — zero dependencies, plain
// Node built-ins only (matches the app's own "no npm deps" rule).
//
// Run with: node check.js
//
// This exists because two real bugs have now shipped from the same root
// cause: App.saveSettingsFromForm rebuilds the whole `settings` object from
// scratch, and a new persisted field added elsewhere in the file silently
// gets dropped the next time someone saves their baseline (avatarClass and
// avatarScheme, then later workoutProgress/workoutDayIndex/fitnessAssessment
// — see CLAUDE.md). Nothing here replaces reading the code; it just makes
// that specific mistake, plus a broken <script> tag and a mascot render
// throwing, fail loudly instead of shipping quietly.

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const INDEX = path.join(__dirname, 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log('  ok    ' + name);
  } catch (e) {
    failures.push(name + ' -- ' + e.message);
    console.log('  FAIL  ' + name + ' -- ' + e.message);
  }
}

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error('No <script> block found in index.html — is this still a single-file app?');
  process.exit(1);
}
const script = scriptMatch[1];

check('extracted <script> block has valid JS syntax', function () {
  const tmp = path.join(os.tmpdir(), 'solotracker_check_' + process.pid + '_' + Date.now() + '.js');
  fs.writeFileSync(tmp, script);
  try {
    execSync('node --check ' + JSON.stringify(tmp), { stdio: 'pipe' });
  } finally {
    fs.unlinkSync(tmp);
  }
});

check('every settings.<field> assignment survives App.saveSettingsFromForm', function () {
  const fnMatch = script.match(/App\.saveSettingsFromForm\s*=\s*async function\s*\(\)\s*\{([\s\S]*?)\n  \};/);
  if (!fnMatch) throw new Error('could not find App.saveSettingsFromForm — did it get renamed or restructured?');
  const fnBody = fnMatch[1];

  const rebuildMatch = fnBody.match(/settings\s*=\s*\{([\s\S]*?)\n    \};/);
  if (!rebuildMatch) throw new Error('found the function but not its `settings = {...}` rebuild object — update the marker in check.js if the formatting changed');
  const rebuildBody = rebuildMatch[1];

  const rebuiltKeys = new Set();
  const keyRe = /^\s*([a-zA-Z0-9_]+):/gm;
  let km;
  while ((km = keyRe.exec(rebuildBody))) rebuiltKeys.add(km[1]);
  if (!rebuiltKeys.size) throw new Error('parsed zero keys out of the rebuild object — the parsing regex is probably out of date');

  // Every `settings.<field> = ` assignment anywhere else in the app is a
  // field that has to survive that rebuild. Excluding the rebuild's own
  // literal (which assigns `settings` as a whole, not `settings.<field>`).
  const scriptMinusRebuild = script.slice(0, fnMatch.index) + script.slice(fnMatch.index + fnMatch[0].length);
  const assignRe = /\bsettings\.([a-zA-Z0-9_]+)\s*=(?!=)/g;
  const assigned = new Set();
  let am;
  while ((am = assignRe.exec(scriptMinusRebuild))) assigned.add(am[1]);

  const missing = Array.from(assigned).filter(function (f) { return !rebuiltKeys.has(f); });
  if (missing.length) {
    throw new Error(
      'these fields are assigned somewhere in the app but are NOT carried over in the rebuild, ' +
      'so they get silently wiped on the next baseline save: ' + missing.join(', ')
    );
  }
});

check('AVATAR_CLASSES / mascotSVG render cleanly for every class, scheme, and score band', function () {
  const startMarker = 'function clamp(v, lo, hi)';
  const endMarker = 'function pickMotivationalQuote()';
  const start = script.indexOf(startMarker);
  const end = script.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      'could not locate the gamification/mascot code region (looked for "' + startMarker +
      '" through "' + endMarker + '") — these markers have moved, update them in check.js'
    );
  }
  const snippet = script.slice(start, end);

  const sandbox = { module: { exports: {} }, console: console };
  vm.createContext(sandbox);
  vm.runInContext(
    snippet + '\nmodule.exports = { mascotSVG: mascotSVG, AVATAR_CLASSES: AVATAR_CLASSES, AVATAR_CLASS_ORDER: AVATAR_CLASS_ORDER };',
    sandbox,
    { filename: 'mascot-region.js' }
  );
  const mascotSVG = sandbox.module.exports.mascotSVG;
  const AVATAR_CLASSES = sandbox.module.exports.AVATAR_CLASSES;
  const AVATAR_CLASS_ORDER = sandbox.module.exports.AVATAR_CLASS_ORDER;

  if (!AVATAR_CLASS_ORDER || !AVATAR_CLASS_ORDER.length) throw new Error('AVATAR_CLASS_ORDER is empty');

  // A specific class name + head-silhouette combo was flagged once already
  // as a trademark lookalike (see CLAUDE.md's IP note) and renamed away
  // from. Keep that from silently regressing under a different session.
  var BANNED_CLASS_NAMES = ['murloc'];

  var scoreBands = [-3, -1.5, 0, 1.5, 3]; // covers all 5 physique bands
  var problems = [];

  AVATAR_CLASS_ORDER.forEach(function (cid) {
    var cdef = AVATAR_CLASSES[cid];
    if (!cdef) { problems.push('AVATAR_CLASS_ORDER references missing class "' + cid + '"'); return; }
    if (BANNED_CLASS_NAMES.indexOf(cid.toLowerCase()) !== -1) {
      problems.push('class key "' + cid + '" matches a name already flagged for a trademark concern');
    }
    if (!cdef.schemes || !cdef.schemes.length) { problems.push('class "' + cid + '" has no color schemes'); return; }
    cdef.schemes.forEach(function (sch, i) {
      scoreBands.forEach(function (score) {
        try {
          var svg = mascotSVG(score, cid, i);
          if (typeof svg !== 'string' || svg.indexOf('<svg') === -1) {
            problems.push(cid + '[' + i + '] at score ' + score + ' did not return an <svg> string');
          }
        } catch (e) {
          problems.push(cid + '[' + i + '] at score ' + score + ' threw: ' + e.message);
        }
      });
    });
  });

  if (problems.length) throw new Error(problems.join('; '));
});

console.log('');
if (failures.length) {
  console.log(failures.length + ' check(s) failed.');
  process.exit(1);
}
console.log('All checks passed.');
