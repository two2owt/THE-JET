import { createFileRoute } from "@tanstack/react-router";

declare const __APP_BUILD_ID__: string;

/**
 * Public build-provenance endpoint.
 *
 * Exposes only non-sensitive Vercel build metadata (repo owner/name, provider,
 * commit SHA, branch, deployment env) so we can confirm which GitHub repo the
 * live deployment was built from with a single curl.
 */
export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () => {
        const owner = process.env["VERCEL_GIT_REPO_OWNER"] ?? null;
        const repo = process.env["VERCEL_GIT_REPO_SLUG"] ?? null;
        const provider = process.env["VERCEL_GIT_PROVIDER"] ?? null;
        const sha = process.env["VERCEL_GIT_COMMIT_SHA"] ?? null;

        return Response.json(
          {
            // Changes on every deployment; clients poll this to auto-reload.
            buildId:
              sha ??
              (typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : null),
            repo: owner && repo ? `${owner}/${repo}` : repo,
            repoOwner: owner,
            repoName: repo,
            provider,
            commitSha: sha,
            commitShaShort: sha ? sha.slice(0, 7) : null,
            commitRef: process.env["VERCEL_GIT_COMMIT_REF"] ?? null,
            commitMessage:
              process.env["VERCEL_GIT_COMMIT_MESSAGE"]?.split("\n")[0] ?? null,
            repoUrl:
              owner && repo ? `https://github.com/${owner}/${repo}` : null,
            commitUrl:
              owner && repo && sha
                ? `https://github.com/${owner}/${repo}/commit/${sha}`
                : null,
            environment: process.env["VERCEL_ENV"] ?? null,
            deploymentUrl: process.env["VERCEL_URL"] ?? null,
            builtOnVercel: Boolean(process.env["VERCEL"]),
          },
          {
            headers: {
              "cache-control": "no-store",
            },
          },
        );
      },
    },
  },
});