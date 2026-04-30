import { AccountSection } from "@/components/settings/AccountSection";

/**
 * Dev-only QA harness for E2E testing of AccountSection in isolation.
 * Mounted at /dev/account-test (DEV builds only) so Playwright can drive
 * the form with mocked Supabase auth responses without going through the
 * full Profile page (which requires a real authenticated session).
 */
export default function AccountSectionQA() {
  return (
    <main className="min-h-screen bg-background py-8 px-4">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-4 text-xl font-bold text-foreground">
          AccountSection — E2E Harness
        </h1>
        <AccountSection
          userId="00000000-0000-0000-0000-000000000001"
          currentEmail="current@example.com"
        />
      </div>
    </main>
  );
}