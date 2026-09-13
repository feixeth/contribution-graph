# 🟣 Contribution Graph — GitHub + GitLab unified

> One heatmap to rule them all.

## The problem

GitHub shows your contribution graph — but only for GitHub.
GitLab shows its own — but only for GitLab.

If you work across both platforms (a personal GitHub account + a self-hosted company GitLab instance), **your real activity is split in two and never visible in one place.**

There's no official tool that merges them. So I built one.

## What it does

This small Node.js service fetches your commits from both platforms, normalizes them into a single SQLite database, and generates a unified contribution heatmap as an SVG/PNG — served at a public URL you can embed anywhere.

```
https://your-domain.tld/graph.svg   → embed in README, Discord, Slack...
https://your-domain.tld/graph.png   → for clients that don't render SVG
https://your-domain.tld/stats       → raw JSON stats
```

The graph uses a purple gradient across 5 intensity levels, covering the last 52 weeks — commits from GitHub and GitLab are counted together per day.

## Use it yourself

Everything runs on **your own server**. Your tokens never leave your machine.

### Requirements

- Node.js 20+
- A VPS or any server with a public domain
- A GitHub Personal Access Token (scope: `repo`)
- A GitLab Personal Access Token (scope: `read_api`) — works with self-hosted instances

### Setup

```bash
git clone https://github.com/feixeth/contribution-graph.git
cd contribution-graph
npm install
cp .env.example .env
nano .env   # fill in your tokens and identity
```

### Configure `.env`

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_USERNAME=your-github-username

GITLAB_URL=https://gitlab.your-company.com
GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
GITLAB_USERNAME=your-gitlab-username

# All emails you commit with across both platforms
MY_EMAILS=you@gmail.com,you@company.com

# Protect the /refresh endpoint
REFRESH_SECRET=generate-with-openssl-rand-hex-32

PORT=3210
```

### First sync

```bash
npm run test-sync
```

This validates your tokens and counts your commits without starting the server.

### Run

```bash
npm start
# → http://localhost:3210/graph.svg
```

### Production (PM2 + Nginx)

```bash
pm2 start server.js --name contrib-graph
pm2 save
pm2 startup
```

Then configure an Nginx vhost and run `certbot --nginx -d your-domain.tld` for HTTPS.

### Embed in your GitHub profile README

```markdown
### 🟣 Contributions — GitHub + GitLab
![Contribution graph](https://your-domain.tld/graph.svg)
```

## How it works

```
GitHub API  ──┐
              ├──▶  Normalizer  ──▶  SQLite  ──▶  SVG/PNG renderer  ──▶  /graph.svg
GitLab API  ──┘
```

- Commits are deduplicated by SHA — a commit that exists on both platforms counts once
- Sync runs automatically every day at 03:00 via cron
- Subsequent syncs are incremental — only new commits are fetched
- Identity mapping: configure all your commit emails in `MY_EMAILS` to make sure every commit is attributed to you across platforms

## Notes

- GitLab self-hosted is fully supported (Personal Access Token + `read_api` scope)
- The GitLab Events API is **not** used — commits are fetched directly from each repository's Git history, so there's no 3-year limit
- GitLab's `author_email` server-side filter has a known pagination bug on some self-hosted instances — this project fetches full history and filters client-side to work around it

## License

MIT — do whatever you want with it.
