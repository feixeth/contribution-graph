require('dotenv').config();
const { syncGitHub } = require('./sync/github');
const { syncGitLab } = require('./sync/gitlab');
const { getStats } = require('./db/database');

async function main() {
  console.log('=== Test Sync ===\n');

  console.log('--- GitHub ---');
  let githubResult = { inserted: 0, repos: 0 };
  try {
    githubResult = await syncGitHub();
  } catch (err) {
    console.error('[github] Sync echouee:', err.message);
  }

  console.log('\n--- GitLab ---');
  let gitlabResult = { inserted: 0, projects: 0 };
  try {
    gitlabResult = await syncGitLab();
  } catch (err) {
    console.error('[gitlab] Sync echouee:', err.message);
  }

  const stats = getStats();

  console.log('\n=== Resultat ===');
  console.log(`GitHub        : ${githubResult.repos || 0} repos scannes, ${githubResult.inserted || 0} nouveaux commits`);
  console.log(`GitLab        : ${gitlabResult.projects || 0} projets scannes, ${gitlabResult.inserted || 0} nouveaux commits`);
  console.log(`Total en base : ${stats.total} commits (github: ${stats.github}, gitlab: ${stats.gitlab})`);
  console.log(`Plus ancien   : ${stats.oldest_commit || 'n/a'}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
