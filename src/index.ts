import express from "express";
import dotenv from "dotenv";
import { slackRouter } from "./routes/slack";
import { healthRouter } from "./routes/health";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Raw body parser for Slack signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(
  express.urlencoded({
    extended: true,
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use("/slack", slackRouter);
app.use("/health", healthRouter);

app.listen(PORT, () => {
  console.log(`🚀 Slack-Playwright bridge running on port ${PORT}`);
});

export default app;
