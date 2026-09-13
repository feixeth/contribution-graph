function normalizeGitHubCommit(commit, repository) {
  const sha = commit.sha;
  const date = commit.commit?.author?.date?.slice(0, 10);
  if (!sha || !date) return null;
  return { sha, date, provider: 'github', repository };
}

function normalizeGitLabCommit(commit, repository) {
  const sha = commit.id;
  const date = (commit.authored_date || commit.committed_date || commit.created_at || '').slice(0, 10);
  if (!sha || !date) return null;
  return { sha, date, provider: 'gitlab', repository };
}

module.exports = { normalizeGitHubCommit, normalizeGitLabCommit };
