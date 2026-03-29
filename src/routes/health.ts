import { Router, Request, Response } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "slack-playwright-bridge",
    timestamp: new Date().toISOString(),
  });
});
