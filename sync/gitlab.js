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

const PER_PAGE = 100;

async function fetchAllProjects() {
  const projects = [];
  let page = 1;
  while (true) {
    const res = await requestWithRetry('/projects', {
      params: { membership: true, per_page: PER_PAGE, page },
    });
    projects.push(...res.data);

    const nextPage = res.headers['x-next-page'];
    if (nextPage) {
      page = parseInt(nextPage, 10);
    } else if (res.data.length === PER_PAGE) {
      // GitLab omet parfois les headers de pagination : on continue tant
      // qu'une page pleine est renvoyee.
      page += 1;
    } else {
      break;
    }
  }
  return projects;
}

async function fetchCommitsForProject(projectId, since) {
  // On ne filtre PAS par author_email cote serveur : combine a `all: true`,
  // l'API de cette instance GitLab renvoie page 2 = une copie de la page 1
  // (l'offset n'avance pas) puis saute une partie de l'historique a partir
  // de la page 3, ce qui perd silencieusement des commits. On recupere donc
  // tout l'historique (pagination fiable et verifiee) et on filtre par
  // auteur cote client dans syncGitLab().
  const commits = [];
  let page = 1;
  while (true) {
    const params = { per_page: PER_PAGE, page, all: true };
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
    if (nextPage) {
      page = parseInt(nextPage, 10);
    } else if (res.data.length === PER_PAGE) {
      page += 1;
    } else {
      break;
    }
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

  // Pas de limite de date sur le premier scan : on remonte jusqu'au premier
  // commit de chaque projet. Seuls les runs suivants (base non vide) passent
  // un `since` pour ne recuperer que les nouveaux commits.
  const since = getLastCommitDate('gitlab') || undefined;

  console.log('[gitlab] Recuperation des projets...');
  const projects = await fetchAllProjects();
  console.log(`[gitlab] ${projects.length} projets trouves.`);

  let totalInserted = 0;

  for (const project of projects) {
    const pathWithNamespace = project.path_with_namespace;
    let allCommits = [];

    try {
      allCommits = await fetchCommitsForProject(project.id, since);
    } catch (err) {
      console.error(`[gitlab] Erreur sur ${pathWithNamespace}: ${err.message}`);
      continue;
    }

    const filtered = allCommits.filter((c) => MY_EMAILS.includes((c.author_email || '').toLowerCase()));

    const normalized = filtered
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
