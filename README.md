# QA Agent Workbench (desktop)

AI agents for everyday QA work. AI drafts, a human reviews and approves.
Workflow: Input -> AI analysis -> Human review -> Execution -> Feedback -> Improvement.

Agents: Requirement Review, Test Case Generation, API Contract, Automation Code Review, Failure Triage, Flaky-Test Analysis, Defect Drafting, Regression Selection, Release Summary.

> Status note: this code passes syntax checks and a small unit test (`node test-lib.js`), but it has not been run against real Jira, Confluence, GitHub Models, Anthropic or test-management tools. Try each integration with your own accounts before relying on it.

---

## 1. Run it
Requires Node.js 18+.

    npm install
    npm start          # run the app
    npm run dist       # build installer (.exe / .dmg / AppImage) into dist/

## 2. Install as a Windows .exe

**Option A: build on your Windows PC**
1. Install Node.js 18+ from nodejs.org.
2. Unzip `qa-agent-desktop.zip`.
3. Open a terminal in the unzipped folder (in File Explorer, type `cmd` in the address bar).
4. Run `npm install`.
5. Run `npm run dist`.
6. Open the `dist` folder and run `QA Agent Workbench Setup 1.0.0.exe` (the version number may differ).

To try it without installing, run `npm start` after step 4.

**Option B: build automatically with GitHub**
1. Create a GitHub repository and upload the unzipped folder to the `main` branch. Make sure the hidden `.github` folder uploads too.
2. Open the **Actions** tab, choose **Build Windows installer**, and click **Run workflow**.
3. When it finishes, open the run and download the **QA-Agent-Workbench-Windows** artifact. It contains the Setup `.exe`.
4. Optional: push a tag like `v1.0.0` to also attach the .exe to a GitHub Release.

Windows may show an "unknown publisher" warning because the build is not code-signed. Click **More info -> Run anyway**.
For a portable single .exe, change `"win": { "target": "nsis" }` to `"portable"` in package.json.

## 3. Choose an AI provider (the settings panel in the app)
- **Claude**: Anthropic API key (console.anthropic.com -> API Keys). API usage is billed separately from a Claude chat subscription.
- **GitHub Copilot (GitHub Models)**: GitHub personal access token with the `models` permission (GitHub Settings -> Developer settings -> Personal access tokens). Model IDs look like `openai/gpt-4.1`. Microsoft 365 Copilot has no general chat API; for Azure OpenAI use Custom.
- **Custom LLM**: any OpenAI-compatible /chat/completions server (Ollama, LM Studio, vLLM, Azure OpenAI...). The key is optional for local servers.

Click **Save & test** to confirm the connection. Keys are stored encrypted with the OS keychain (Electron safeStorage) and never shown in the UI. Never paste keys into chats, emails or repositories; if one is exposed, revoke it and create a new one.

## 4. Jira & Confluence
Open **Jira & Confluence** in the app, enter your site URL and credentials, then use **Load from: Jira / Confluence** above the input box.
- Cloud: `https://yourcompany.atlassian.net` + account email + API token (id.atlassian.com -> Security -> API tokens).
- Server / Data Center: choose "personal access token" and enter the Jira and Confluence URLs separately.
- Jira: fetch a story by key (PROJ-123), or search a project and tap a result. Optional comments. Pulls summary, status, description, acceptance criteria (if your Jira has such a field), labels, components and linked issues.
- Confluence: search pages (optionally within a space) and tap one to load its text.
- Each load is added to the input, so you can combine a story with its Confluence spec. **Clear input** resets it.
- Reading is the default. A classic Atlassian API token carries all of your permissions, so a least-privilege account is safer.
- Fetched text is treated as data for the agent; instructions inside it are ignored. You still review every output.
- Pages and stories are cut off at about 15,000 characters. Project search tries Atlassian's newer search endpoint and falls back to the older one.

## 5. Features
1. **Post back to Jira**: after you approve an output, the Execution step can post it as a comment on an issue, or create a Bug, Task, Story or Sub-task. The app always shows a confirmation first. The token needs write permission. Markdown tables and headings are converted to Jira's format, and comments are labelled as an AI-assisted draft approved by a QA engineer. "Create issue" may fail if your Jira project requires extra fields; the error message says which.
2. **Batch loading**: the Jira panel has a query box (JQL) with templates for open sprint, open bugs and updated in the last 7 days. It loads up to 50 issues at once, for Regression Selection or Release Summary.
3. **Import test results**: the **Import file** button reads JUnit XML and summarizes totals, failures and per-test results. It also takes logs, CSV and JSON. Import several runs to give Flaky-Test Analysis a history.
4. **Export test cases**: save generated test-case tables as CSV for TestRail, Xray or Zephyr Scale. You map the columns in each tool's import screen (exact import formats not verified).
5. **Masking**: before text is sent to the model, emails, tokens, `password=` values, card numbers (Luhn-checked), IP addresses and phone numbers are replaced with placeholders, then restored in the answer on your machine. A checkbox next to Run turns it off. It is pattern-based and will not catch things like customer names or free-text IDs, so still review sensitive inputs.
6. **Traceability**: each approved run is linked to the Jira stories and Confluence pages in its input. The Impact panel shows, per source, runs, test cases and defect drafts, and flags stories with no test cases yet. Exports to CSV. It only tracks runs where you used the **Load from** bar, not pasted text.
7. **Editable agent instructions**: each agent has an editable prompt with reset, plus export and import so a team can share its standards.

## 6. Impact & savings panel
- **Net time saved** and **cost saved**: for each approved run, the manual minutes set for that agent minus your review time (counted as at least 2 minutes). Rejected runs save nothing. Defaults are 15-30 manual minutes per agent; they are estimates, so edit them to match your team.
- **Hourly cost and currency** are configurable.
- **Approval rate**, **approved as-is vs. approved with edits**, **rejected**, **average review time**, **average edit size**.
- A per-agent table, **Export run log (CSV)** and **Reset metrics** (lessons are kept).
- Drafts you abandon without approving or rejecting count as runs but not as decisions.

## 7. Feedback and learning
Rate each output and leave a note. Notes are saved per agent and added to that agent's next run.

## 8. Notes
- Output appears all at once (no streaming).
- GitHub Models URL and model IDs are from memory; check GitHub's docs if "Save & test" fails.
- Microsoft 365 Copilot cannot be selected as a provider (no simple public chat API). Azure OpenAI works via Custom.
- This desktop app is the full version; the earlier browser version does not have the Jira/Confluence features.
- If you already built an installer, build it again to pick up changes.
