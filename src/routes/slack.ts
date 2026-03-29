import { Router, Request, Response } from "express";
import { verifySlackSignature } from "../utils/verifySlackSignature";
import { triggerGitHubActions } from "../utils/triggerGitHubActions";
import {
  postSlackMessage,
  buildTriggerBlocks,
  buildResultBlocks,
} from "../utils/slackClient";

export const slackRouter = Router();

/**
 * POST /slack/commands
 *
 * Receives Slack slash command payloads (e.g. `/playwright`).
 * Usage examples from Slack:
 *   /playwright                          → runs all tests in chromium
 *   /playwright login                    → runs "login" suite in chromium
 *   /playwright checkout firefox         → runs "checkout" suite in firefox
 */
slackRouter.post(
  "/commands",
  verifySlackSignature,
  async (req: Request, res: Response) => {
    const { text, channel_id, user_id, user_name } = req.body as {
      text: string;
      channel_id: string;
      user_id: string;
      user_name: string;
    };

    console.log("[slack/commands] request received", {
      text,
      channel_id,
      user_id,
      user_name,
      path: req.path,
      timestamp: new Date().toISOString(),
    });

    // Acknowledge Slack immediately (must respond within 3 s)
    res.status(200).json({
      response_type: "ephemeral",
      text: `⏳ Triggering Playwright tests… I'll post results in this channel.`,
    });

    // Run background workflow trigger without blocking this request
    const args = (text ?? "").trim().split(/\s+/).filter(Boolean);
    const testSuite = args[0] ?? "all";
    const browser = args[1] ?? "chromium";

    (async () => {
      try {
        console.log("[slack/commands] triggering GitHub Actions", {
          testSuite,
          browser,
          slackChannel: channel_id,
          triggeredBy: user_id,
        });

        await triggerGitHubActions({
          testSuite,
          browser,
          slackChannel: channel_id,
          triggeredBy: user_id,
        });

        await postSlackMessage(
          channel_id,
          `🎭 Playwright test run started by <@${user_id}>`,
          buildTriggerBlocks(user_id, testSuite, browser)
        );

        console.log("[slack/commands] GitHub Actions triggered successfully");
      } catch (err) {
        console.error("[slack/commands] Failed to trigger GitHub Actions:", err);

        try {
          await postSlackMessage(
            channel_id,
            `❌ <@${user_id}> Failed to trigger Playwright tests: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        } catch (postErr) {
          console.error("[slack/commands] Failed to post error message to Slack:", postErr);
        }
      }
    })();

    return;
  }
);

/**
 * POST /slack/results
 *
 * Called by the GitHub Actions workflow when the test run finishes.
 * The workflow sends a JSON body with the test results.
 *
 * Expected body shape:
 * {
 *   "slack_channel": "C0XXXXXXX",
 *   "triggered_by": "U0XXXXXXX",
 *   "passed": 42,
 *   "failed": 0,
 *   "total": 42,
 *   "duration": "1m 23s",
 *   "run_url": "https://github.com/org/repo/actions/runs/1234567"
 * }
 *
 * Secure this endpoint with a shared secret in production
 * (e.g. check for an Authorization header with RESULTS_SECRET).
 */
slackRouter.post("/results", async (req: Request, res: Response) => {
  const secret = process.env.RESULTS_WEBHOOK_SECRET;
  if (secret) {
    const authHeader = req.headers["authorization"];
    if (authHeader !== `Bearer ${secret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const { slack_channel, triggered_by, passed, failed, total, duration, run_url } =
    req.body as {
      slack_channel: string;
      triggered_by: string;
      passed: number;
      failed: number;
      total: number;
      duration: string;
      run_url: string;
    };

  if (!slack_channel) {
    console.error("[slack/results] missing slack_channel", req.body);
    res.status(400).json({ error: "Missing slack_channel" });
    return;
  }

  console.log("[slack/results] webhook received", {
    slack_channel,
    triggered_by,
    passed,
    failed,
    total,
    duration,
    run_url,
    timestamp: new Date().toISOString(),
  });

  console.log("[slack/results] payload", {
    slack_channel,
    triggered_by,
    passed,
    failed,
    total,
    duration,
    run_url,
    received: new Date().toISOString(),
  });

  try {
    const allPassed = failed === 0;
    const summary = allPassed
      ? `✅ All ${total} Playwright tests passed in ${duration}`
      : `❌ ${failed}/${total} Playwright tests failed — ${duration}`;

    await postSlackMessage(
      slack_channel,
      summary,
      buildResultBlocks(passed, failed, total, duration, run_url, triggered_by),
      triggered_by
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to post results to Slack:", err);
    res.status(500).json({ error: "Failed to post results" });
  }
});
