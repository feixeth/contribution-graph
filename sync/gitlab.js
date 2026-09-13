require('dotenv').config();
const axios = require('axios');
const { insertCommits, getLastCommitDate } = require('../db/database');
const { normalizeGitLabCommit } = require('./normalizer');

const GITLAB_URL = (process.env.GITLAB_URL || '').replace(/\/$/, '');
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const MY_EMAILS = (process.env.MY_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const api = axios.create({
  baseURL: `${GITLAB_URL}/api/v4`,
  headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN },
});

async function requestWithRetry(url, config, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await api.get(url, config);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after'] || '5', 10);
        console.warn(`[gitlab] Rate limite (429). Attente ${retryAfter}s...`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (status >= 500) {
        console.warn(`[gitlab] Reponse ${status}, nouvelle tentative (${attempt + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`[gitlab] Echec apres ${retries} tentatives: ${url}`);
}

async function fetchAllProjects() {
  const projects = [];
  let page = 1;
  while (true) {
    const res = await requestWithRetry('/projects', {
      params: { membership: true, per_page: 100, page },
    });
    projects.push(...res.data);
    const nextPage = res.headers['x-next-page'];
    if (!nextPage) break;
    page = parseInt(nextPage, 10);
  }
  return projects;
}

async function fetchCommitsForProject(projectId, authorEmail, since) {
  const commits = [];
  let page = 1;
  while (true) {
    const params = { author_email: authorEmail, per_page: 100, page, all: true };
    if (since) params.since = since;

    let res;
    try {
      res = await requestWithRetry(`/projects/${projectId}/repository/commits`, { params });
    } catch (err) {
      if (err.response?.status === 404) break; // pas de repo git / pas d'acces
      throw err;
    }

    commits.push(...res.data);
    const nextPage = res.headers['x-next-page'];
    if (!nextPage) break;
    page = parseInt(nextPage, 10);
  }
  return commits;
}

async function syncGitLab() {
  if (!GITLAB_URL || !GITLAB_TOKEN) {
    console.warn('[gitlab] GITLAB_URL ou GITLAB_TOKEN manquant, sync ignoree.');
    return { inserted: 0, projects: 0 };
  }
  if (MY_EMAILS.length === 0) {
    console.warn('[gitlab] MY_EMAILS est vide, sync ignoree.');
    return { inserted: 0, projects: 0 };
  }

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const cutoff = twoYearsAgo.toISOString();
  const since = getLastCommitDate('gitlab') || cutoff;

  console.log('[gitlab] Recuperation des projets...');
  const projects = await fetchAllProjects();
  console.log(`[gitlab] ${projects.length} projets trouves.`);

  let totalInserted = 0;

  for (const project of projects) {
    const pathWithNamespace = project.path_with_namespace;
    const allCommits = [];

    for (const email of MY_EMAILS) {
      try {
        const commits = await fetchCommitsForProject(project.id, email, since);
        allCommits.push(...commits);
      } catch (err) {
        console.error(`[gitlab] Erreur sur ${pathWithNamespace} (${email}): ${err.message}`);
      }
    }

    const uniqueBySha = new Map();
    for (const c of allCommits) uniqueBySha.set(c.id, c);

    const normalized = Array.from(uniqueBySha.values())
      .map((c) => normalizeGitLabCommit(c, pathWithNamespace))
      .filter(Boolean);

    if (normalized.length > 0) {
      const inserted = insertCommits(normalized);
      totalInserted += inserted;
      console.log(`[gitlab] ${pathWithNamespace}: ${normalized.length} commits trouves (${inserted} nouveaux)`);
    }
  }

  console.log(`[gitlab] Sync terminee. ${totalInserted} nouveaux commits.`);
  return { inserted: totalInserted, projects: projects.length };
}

module.exports = { syncGitLab };
