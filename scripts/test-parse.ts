import { parseClosesIssue } from "../src/github.js";

const cases: [string | null, number | null][] = [
  ["Closes #12", 12],
  ["This fixes #7 and more", 7],
  ["Resolves #100\n\nDetails...", 100],
  ["fixed #3", 3],
  ["See #42 for context", 42],
  ["no reference here", null],
  [null, null],
];

let ok = true;
for (const [body, want] of cases) {
  const got = parseClosesIssue(body);
  const pass = got === want;
  if (!pass) ok = false;
  console.log((pass ? "✅" : "❌"), JSON.stringify(body), "→", got, "(want", want + ")");
}
process.exit(ok ? 0 : 1);
