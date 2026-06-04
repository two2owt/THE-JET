import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Profile-page dialog button styling regression.
 *
 * The sign-out, delete-account, and report-issue dialogs require an
 * authenticated Supabase session to render in Playwright, so we can't
 * snapshot them in the e2e suite without auth mocks. Instead we statically
 * assert that every dialog button on /profile keeps the rounded-pill +
 * modern shadow treatment. The classes are applied unconditionally and
 * Tailwind compiles them to identical rules at both iPhone (390px) and
 * Android (360px) breakpoints — there are no responsive variants on the
 * radius or shadow utilities — so a source-level assertion is equivalent
 * to a per-breakpoint visual check.
 *
 * If any of these dialogs drops `rounded-full` or its shadow utility, this
 * test fails immediately with a pointer to the regression site.
 */

type Rule = {
  file: string;
  // Substring that uniquely identifies the button line in the file.
  anchor: string;
  // className tokens that must appear on the same line as the anchor.
  required: string[];
};

const RULES: Rule[] = [
  // Profile.tsx — sign-out confirmation AlertDialog
  {
    file: "src/pages/Profile.tsx",
    anchor: "<AlertDialogCancel",
    required: ["rounded-full", "border-primary/40"],
  },
  {
    file: "src/pages/Profile.tsx",
    anchor: "<AlertDialogAction",
    required: [
      "rounded-full",
      "bg-destructive",
      "shadow-lg",
      "shadow-destructive/20",
    ],
  },
  // DeleteAccountDialog — trigger, Cancel, Action
  {
    file: "src/components/settings/DeleteAccountDialog.tsx",
    anchor: 'className="w-full rounded-full',
    required: ["rounded-full", "shadow-lg", "shadow-destructive/20"],
  },
  {
    file: "src/components/settings/DeleteAccountDialog.tsx",
    anchor: "<AlertDialogCancel",
    required: ["rounded-full", "border-primary/40"],
  },
  {
    file: "src/components/settings/DeleteAccountDialog.tsx",
    anchor: "<AlertDialogAction",
    required: [
      "rounded-full",
      "bg-destructive",
      "shadow-lg",
      "shadow-destructive/20",
    ],
  },
  // ReportIssueDialog — trigger + submit
  {
    file: "src/components/ReportIssueDialog.tsx",
    anchor: 'variant="outline"',
    required: ["rounded-full", "border-primary/40"],
  },
  {
    file: "src/components/ReportIssueDialog.tsx",
    anchor: 'type="submit"',
    required: [
      "rounded-full",
      "shadow-lg",
      "shadow-primary/20",
      "font-semibold",
    ],
  },
];

function readFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function findLines(source: string, anchor: string): string[] {
  const lines = source.split("\n");
  // Scan window of 5 lines starting from each anchor occurrence so the
  // className can sit on a subsequent line in multi-line JSX.
  const hits: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(anchor)) {
      hits.push(lines.slice(i, i + 5).join(" "));
    }
  }
  return hits;
}

describe("profile dialog buttons keep rounded-pill + shadow styling", () => {
  for (const rule of RULES) {
    it(`${rule.file} :: "${rule.anchor}" retains ${rule.required.join(", ")}`, () => {
      const source = readFile(rule.file);
      const hits = findLines(source, rule.anchor);
      expect(
        hits.length,
        `Could not find anchor "${rule.anchor}" in ${rule.file}. ` +
          `If the dialog button was renamed, update RULES in this test.`,
      ).toBeGreaterThan(0);

      for (const hit of hits) {
        for (const token of rule.required) {
          expect(
            hit,
            `Dialog button at "${rule.anchor}" in ${rule.file} is missing ` +
              `required class token "${token}". This breaks the rounded-pill ` +
              `+ modern shadow regression contract enforced at both iPhone ` +
              `(390px) and Android (360px) breakpoints.`,
          ).toContain(token);
        }
      }
    });
  }
});