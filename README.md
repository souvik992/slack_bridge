# Slack-Playwright Bridge

A middleware service that connects Slack slash commands to GitHub Actions Playwright test runs, enabling seamless test execution from Slack.

## Features

- **Slack Integration**: Receive slash commands from Slack and trigger test runs
- **GitHub Actions**: Automatically dispatch events to run Playwright tests in CI/CD
- **Security**: HMAC-SHA256 signature verification for Slack requests
- **Health Monitoring**: Built-in health check endpoint
- **TypeScript**: Fully typed codebase for better development experience

## Prerequisites

- Node.js 18+
- A Slack App with the following scopes:
  - `chat:write` (to send messages)
  - `commands` (to receive slash commands)
- GitHub repository with Playwright tests
- GitHub Personal Access Token with `repo` and `actions` permissions

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/souvik992/slack_bridge.git
   cd slack_bridge
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your actual values:
   ```env
   # Slack App credentials
   SLACK_SIGNING_SECRET=your_slack_signing_secret_here
   SLACK_BOT_TOKEN=xoxb-your-bot-token-here

   # GitHub credentials
   GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_pat_here
   ```

## Configuration

### Slack App Setup

1. Create a new Slack App at https://api.slack.com/apps
2. Add the following bot token scopes:
   - `chat:write`
   - `commands`
3. Install the app to your workspace
4. Copy the **Signing Secret** from Basic Information → App Credentials
5. Copy the **Bot User OAuth Token**

### GitHub Setup

1. Create a Personal Access Token (classic) at https://github.com/settings/tokens
2. Give it these permissions:
   - `repo` (full control of private repositories)
   - `actions` (read/write access to actions)
3. The token should have `Contents: write` for repository_dispatch events

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SLACK_SIGNING_SECRET` | Slack app signing secret for request verification | Yes |
| `SLACK_BOT_TOKEN` | Bot user OAuth token for sending messages | Yes |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub PAT for triggering actions | Yes |
| `PORT` | Server port (default: 3000) | No |

## Usage

### Development

```bash
# Start development server with hot reload
npm run server:dev
```

### Production

```bash
# Build the project
npm run build

# Start the production server
npm start
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and timestamp.

### Slack Commands
```
POST /slack/command
```
Handles incoming Slack slash commands and triggers GitHub Actions.

## Slack Slash Command Setup

1. In your Slack App settings, go to **Slash Commands**
2. Create a new command (e.g., `/test`)
3. Set the **Request URL** to: `https://your-domain.com/slack/command`
4. Set **Request Method** to `POST`

## How PalletPOS Tests and the Bridge Connect

The bridge acts as the glue between Slack and Playwright tests running inside the PalletPOS GitHub repository. The full round-trip works in five steps:

```
Slack user          Bridge (this service)         GitHub Actions          PalletPOS repo
    │                        │                           │                      │
    │── /playwright login ──>│                           │                      │
    │                        │── 200 OK (immediate) ──>  │                      │
    │                        │                           │                      │
    │                        │── repository_dispatch ──> │                      │
    │                        │   event_type:             │                      │
    │                        │   "playwright-test"       │                      │
    │                        │   payload: {suite,        │                      │
    │                        │    browser, channel,      │                      │
    │                        │    triggered_by}          │                      │
    │                        │                           │── runs Playwright ──>│
    │                        │                           │   tests              │
    │                        │                           │<── test results ─────│
    │                        │<── POST /slack/results ───│                      │
    │<── result message ─────│                           │                      │
```

**Step-by-step:**

1. **Slack slash command** — A user runs `/playwright [suite] [browser]` (e.g. `/playwright login chromium`). Slack POSTs the payload to `POST /slack/commands` on this bridge.

2. **Immediate 200 response** — The bridge replies to Slack within milliseconds (required to avoid Slack's 3-second timeout). All heavy work happens in the background via `setImmediate`.

3. **GitHub `repository_dispatch`** — The bridge fires a `repository_dispatch` event against the PalletPOS repo with `event_type: "playwright-test"` and a `client_payload` containing `suite`, `browser`, `slack_channel`, and `triggered_by`. This is what wakes up the GitHub Actions workflow.

4. **Playwright runs in CI** — The PalletPOS workflow picks up the event, installs Playwright, and runs the specified test suite in the specified browser. When finished, the workflow POSTs a JSON result body to `POST /slack/results` on this bridge (authenticated with `RESULTS_WEBHOOK_SECRET`).

5. **Results posted to Slack** — The bridge formats the pass/fail counts, duration, and a link to the Actions run, then posts a rich Block Kit message back to the original Slack channel (or falls back to a DM if the channel can't be found).

### PalletPOS workflow setup

Your PalletPOS repo needs a workflow that listens for the `playwright-test` dispatch event:

```yaml
name: Playwright Tests
on:
  repository_dispatch:
    types: [playwright-test]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npx playwright install --with-deps
      - run: npx playwright test --project=${{ github.event.client_payload.browser }} ${{ github.event.client_payload.suite }}

      - name: Post results back to bridge
        if: always()
        run: |
          curl -X POST https://your-bridge-domain.com/slack/results \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.RESULTS_WEBHOOK_SECRET }}" \
            -d '{
              "slack_channel": "${{ github.event.client_payload.slack_channel }}",
              "triggered_by": "${{ github.event.client_payload.triggered_by }}",
              "passed": <passed>,
              "failed": <failed>,
              "total": <total>,
              "duration": "<duration>",
              "run_url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            }'
```

Add `RESULTS_WEBHOOK_SECRET` to both your bridge `.env` and the PalletPOS repo secrets so the results callback is authenticated.

## Security

- All Slack requests are verified using HMAC-SHA256 signatures
- Requests older than 5 minutes are rejected
- Environment variables containing secrets are never logged
- The `.env` file is excluded from version control

## Project Structure

```
src/
├── index.ts                 # Main application entry point
├── middleware/              # Custom middleware (if any)
├── routes/
│   ├── health.ts           # Health check endpoint
│   └── slack.ts            # Slack command handling
└── utils/
    ├── slackClient.ts      # Slack API client
    ├── triggerGitHubActions.ts  # GitHub Actions trigger
    └── verifySlackSignature.ts  # Slack signature verification
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Troubleshooting

### Server won't start
- Check that all required environment variables are set
- Verify Slack credentials are correct
- Ensure port 3000 is not in use

### Slack commands not working
- Confirm the Request URL in Slack App settings matches your deployed URL
- Check that the Slack App is installed in your workspace
- Verify the signing secret matches

### GitHub Actions not triggering
- Ensure the GitHub PAT has correct permissions
- Check that the target repository has the workflow file
- Verify the repository owner/name in the dispatch event

## Support

For issues and questions, please open an issue on the GitHub repository.