require('dotenv').config();
const axios = require('axios');
const { insertCommits, getLastCommitDate } = require('../db/database');
const { normalizeGitHubCommit } = require('./normalizer');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const MY_EMAILS = (process.env.MY_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const api = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
});

function parseLinkHeader(header) {
  if (!header) return {};
  const links = {};
  header.split(',').forEach((part) => {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) links[match[2]] = match[1];
  });
  return links;
}

async function requestWithRetry(url, config, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await api.get(url, config);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403 || status === 429) {
        const remaining = err.response.headers['x-ratelimit-remaining'];
        const resetHeader = err.response.headers['x-ratelimit-reset'];
        if (remaining === '0' && resetHeader) {
          const waitMs = Math.max(0, resetHeader * 1000 - Date.now()) + 1000;
          console.warn(`[github] Rate limit atteint (429/403). Attente ${Math.round(waitMs / 1000)}s...`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        console.warn(`[github] Reponse ${status}, nouvelle tentative (${attempt + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`[github] Echec apres ${retries} tentatives: ${url}`);
}

async function fetchAllRepos() {
  const repos = [];
  let url = '/user/repos';
  let params = { type: 'all', per_page: 100, page: 1 };

  while (url) {
    const res = await requestWithRetry(url, { params });
    repos.push(...res.data);
    const links = parseLinkHeader(res.headers.link);
    if (links.next) {
      const nextUrl = new URL(links.next);
      url = nextUrl.pathname + nextUrl.search;
      params = undefined;
    } else {
      url = null;
    }
  }
  return repos;
}

async function fetchCommitsForRepo(fullName, since) {
  const commits = [];
  let url = `/repos/${fullName}/commits`;
  let params = { author: GITHUB_USERNAME, per_page: 100, page: 1 };
  if (since) params.since = since;

  while (url) {
    try {
      const res = await requestWithRetry(url, { params });
      commits.push(...res.data);
      const links = parseLinkHeader(res.headers.link);
      if (links.next) {
        const nextUrl = new URL(links.next);
        url = nextUrl.pathname + nextUrl.search;
        params = undefined;
      } else {
        url = null;
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 409 || status === 404) {
        // Repo vide ou inaccessible (fork sans historique, etc.)
        break;
      }
      throw err;
    }
  }
  return commits;
}

async function syncGitHub() {
  if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
    console.warn('[github] GITHUB_TOKEN ou GITHUB_USERNAME manquant, sync ignoree.');
    return { inserted: 0, repos: 0 };
  }

  // Pas de limite de date sur le premier scan : on remonte jusqu'au premier
  // commit de chaque repo. Seuls les runs suivants (base non vide) passent
  // un `since` pour ne recuperer que les nouveaux commits.
  const since = getLastCommitDate('github') || undefined;

  console.log(`[github] Recuperation des repos pour ${GITHUB_USERNAME}...`);
  const repos = await fetchAllRepos();
  console.log(`[github] ${repos.length} repos trouves.`);

  let totalInserted = 0;

  for (const repo of repos) {
    const fullName = repo.full_name;
    try {
      const commits = await fetchCommitsForRepo(fullName, since);
      const filtered = commits.filter((c) => {
        const email = c.commit?.author?.email?.toLowerCase();
        const login = c.author?.login;
        return (email && MY_EMAILS.includes(email)) || login === GITHUB_USERNAME;
      });
      const normalized = filtered.map((c) => normalizeGitHubCommit(c, fullName)).filter(Boolean);

      if (normalized.length > 0) {
        const inserted = insertCommits(normalized);
        totalInserted += inserted;
        console.log(`[github] ${fullName}: ${normalized.length} commits trouves (${inserted} nouveaux)`);
      }
    } catch (err) {
      console.error(`[github] Erreur sur ${fullName}: ${err.message}`);
    }
  }

  console.log(`[github] Sync terminee. ${totalInserted} nouveaux commits.`);
  return { inserted: totalInserted, repos: repos.length };
}

module.exports = { syncGitHub };
