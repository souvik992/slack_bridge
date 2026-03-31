import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

/**
 * Middleware to verify that incoming requests genuinely come from Slack.
 * Uses the HMAC-SHA256 signing secret approach documented by Slack.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  req: Request & { rawBody?: Buffer },
  res: Response,
  next: NextFunction
): void {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
  if (!slackSigningSecret) {
    console.error("SLACK_SIGNING_SECRET is not set");
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }

  const timestamp = req.headers["x-slack-request-timestamp"] as string;
  const slackSignature = req.headers["x-slack-signature"] as string;

  if (!timestamp || !slackSignature) {
    res.status(400).json({ error: "Missing Slack headers" });
    return;
  }

  // Reject requests older than 5 minutes to prevent replay attacks
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 5 * 60;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) {
    res.status(400).json({ error: "Request timestamp is too old" });
    return;
  }

  const rawBody = req.rawBody?.toString() ?? "";
  const sigBaseString = `v0:${timestamp}:${rawBody}`;
  const computedSig =
    "v0=" +
    crypto
      .createHmac("sha256", slackSigningSecret)
      .update(sigBaseString, "utf8")
      .digest("hex");

  const computedBuf = Buffer.from(computedSig);
  const receivedBuf = Buffer.from(slackSignature);

  const signaturesMatch =
    computedBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(computedBuf, receivedBuf);

  if (!signaturesMatch) {
    res.status(401).json({ error: "Invalid Slack signature" });
    return;
  }

  next();
}
