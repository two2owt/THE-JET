import { createFileRoute } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PresenceDot } from "@/components/ui/presence-dot";
import { usePresence } from "@/hooks/usePresence";

const title = "Presence harness — JET";
const description =
  "Development-only harness for verifying presence dot states on avatars.";

/** Fixed ids so e2e can drive deterministic status transitions. */
const SELF_ID = "harness-self";
const FRIENDS = [
  { id: "harness-friend-1", name: "Ava" },
  { id: "harness-friend-2", name: "Ben" },
  { id: "harness-friend-3", name: "Cleo" },
];

function PresenceHarness() {
  const { getStatus, selfStatus } = usePresence(SELF_ID);

  if (!import.meta.env.DEV) {
    return <p style={{ padding: 24 }}>Not available.</p>;
  }

  return (
    <main style={{ padding: 24 }} data-presence-harness-ready="true">
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>Presence harness</h1>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 13 }}>Header avatar</h2>
        <span
          data-testid="harness-header-avatar"
          style={{ position: "relative", display: "inline-flex" }}
        >
          <Avatar className="w-11 h-11">
            <AvatarFallback>ME</AvatarFallback>
          </Avatar>
          <PresenceDot status={selfStatus} userId={SELF_ID} size={12} />
        </span>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 13 }}>Social avatars</h2>
        <div style={{ display: "flex", gap: 16 }}>
          {FRIENDS.map((f) => (
            <span
              key={f.id}
              data-testid={`harness-friend-${f.id}`}
              style={{ position: "relative", display: "inline-flex" }}
            >
              <Avatar className="w-11 h-11">
                <AvatarFallback>{f.name[0]}</AvatarFallback>
              </Avatar>
              <PresenceDot status={getStatus(f.id)} userId={f.id} size={13} />
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}

export const Route = createFileRoute("/dev/presence")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PresenceHarness,
});
