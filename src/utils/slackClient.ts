import https from "https";

/**
 * Post a message to a Slack channel using the Web API.
 * Requires the `chat:write` OAuth scope on the bot token.
 */
export async function postSlackMessage(
  channel: string,
  text: string,
  blocks?: object[]
): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not set");
  }

  const body = JSON.stringify({ channel, text, blocks });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "slack.com",
        path: "/api/chat.postMessage",
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            reject(new Error(`Slack API error: ${parsed.error}`));
          } else {
            resolve();
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Build Slack Block Kit blocks for a test-triggered notification.
 */
export function buildTriggerBlocks(
  triggeredBy: string,
  testSuite: string,
  browser: string
): object[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🎭 *Playwright test run triggered!*`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Suite:*\n${testSuite}` },
        { type: "mrkdwn", text: `*Browser:*\n${browser}` },
        { type: "mrkdwn", text: `*Triggered by:*\n<@${triggeredBy}>` },
        { type: "mrkdwn", text: `*Status:*\n⏳ Running…` },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Results will be posted here when the run completes.`,
        },
      ],
    },
  ];
}

/**
 * Build Slack Block Kit blocks for test results.
 */
export function buildResultBlocks(
  passed: number,
  failed: number,
  total: number,
  duration: string,
  runUrl: string,
  triggeredBy: string
): object[] {
  const allPassed = failed === 0;
  const icon = allPassed ? "✅" : "❌";
  const status = allPassed ? "All tests passed!" : `${failed} test(s) failed`;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${icon} *Playwright Results — ${status}*`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Passed:*\n${passed}` },
        { type: "mrkdwn", text: `*Failed:*\n${failed}` },
        { type: "mrkdwn", text: `*Total:*\n${total}` },
        { type: "mrkdwn", text: `*Duration:*\n${duration}` },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Run" },
          url: runUrl,
          action_id: "view_run",
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Requested by <@${triggeredBy}>`,
        },
      ],
    },
  ];
}
