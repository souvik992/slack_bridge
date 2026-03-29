import https from "https";

export interface TriggerOptions {
  /** The test suite/spec to run, e.g. "login" or "checkout" */
  testSuite?: string;
  /** Browser to use: chromium | firefox | webkit */
  browser?: string;
  /** Slack channel ID to post results back to */
  slackChannel: string;
  /** Slack user who triggered the run */
  triggeredBy: string;
}

/**
 * Fires a `repository_dispatch` event against the configured GitHub repo.
 * The Actions workflow listens for the event type "playwright-test" and
 * uses the `client_payload` to configure the Playwright run.
 */
export async function triggerGitHubActions(
  options: TriggerOptions
): Promise<void> {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;

  if (!token || !owner || !repo) {
    throw new Error(
      "Missing required env vars: GITHUB_PERSONAL_ACCESS_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME"
    );
  }

  const payload = JSON.stringify({
    event_type: "playwright-test",
    client_payload: {
      suite: options.testSuite ?? "all",
      browser: options.browser ?? "chromium",
      slack_channel: options.slackChannel,
      triggered_by: options.triggeredBy,
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.github.com",
        path: `/repos/${owner}/${repo}/dispatches`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization: `Bearer ${token}`,
          "User-Agent": "slack-playwright-bridge/1.0",
          Accept: "application/vnd.github.v3+json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          // GitHub returns 204 No Content on success
          if (res.statusCode === 204) {
            resolve();
          } else {
            reject(
              new Error(
                `GitHub API responded with ${res.statusCode}: ${data}`
              )
            );
          }
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}
