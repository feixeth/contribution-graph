require('dotenv').config();
const express = require('express');
const cron = require('node-cron');

const { getCommitsSince, getStats } = require('./db/database');
const { renderSVG } = require('./render/svg');
const { svgToPng } = require('./render/png');
const { syncGitHub } = require('./sync/github');
const { syncGitLab } = require('./sync/gitlab');

const app = express();
const PORT = process.env.PORT || 3210;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

let lastSyncAt = null;

function buildDataMap() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 364);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = getCommitsSince(cutoffStr);
  const map = {};
  for (const row of rows) map[row.date] = row.count;
  return map;
}

function buildSVG(theme) {
  const dataMap = buildDataMap();
  const stats = getStats();
  return renderSVG(dataMap, { githubCount: stats.github, gitlabCount: stats.gitlab, theme });
}

app.get('/graph.svg', (req, res) => {
  try {
    const theme = req.query.theme === 'dark' ? 'dark' : 'light';
    const svg = buildSVG(theme);
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(svg);
  } catch (err) {
    console.error('[graph.svg] Erreur:', err);
    res.status(500).send('Error generating graph');
  }
});

app.get('/graph.png', async (req, res) => {
  try {
    const theme = req.query.theme === 'dark' ? 'dark' : 'light';
    const svg = buildSVG(theme);
    const png = await svgToPng(svg);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (err) {
    console.error('[graph.png] Erreur:', err);
    res.status(500).send('Error generating graph');
  }
});

app.post('/refresh', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!REFRESH_SECRET || token !== REFRESH_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [githubResult, gitlabResult] = await Promise.all([
      syncGitHub().catch((err) => ({ inserted: 0, error: err.message })),
      syncGitLab().catch((err) => ({ inserted: 0, error: err.message })),
    ]);

    const errors = [];
    if (githubResult.error) errors.push(`github: ${githubResult.error}`);
    if (gitlabResult.error) errors.push(`gitlab: ${gitlabResult.error}`);

    lastSyncAt = new Date().toISOString();
    const synced = (githubResult.inserted || 0) + (gitlabResult.inserted || 0);
    res.json({ synced, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/stats', (req, res) => {
  const stats = getStats();
  res.json({
    total: stats.total,
    github: stats.github,
    gitlab: stats.gitlab,
    last_sync: lastSyncAt,
    oldest_commit: stats.oldest_commit,
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

cron.schedule('0 3 * * *', async () => {
  console.log('[cron] Debut de la sync quotidienne...');
  try {
    await syncGitHub();
    await syncGitLab();
    lastSyncAt = new Date().toISOString();
    console.log('[cron] Sync terminee.');
  } catch (err) {
    console.error('[cron] Sync echouee:', err);
  }
});

app.listen(PORT, () => {
  console.log(`Contribution graph server en ecoute sur le port ${PORT}`);
});
