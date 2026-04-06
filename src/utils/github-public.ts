import { logger } from '@/utils/logger';

const log = logger.child({ name: 'utils/github-public' });

export type GithubCommitItem = {
  sha: string;
  commit: { message: string };
  html_url: string;
};

export type GithubPullItem = {
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  updated_at: string;
  html_url: string;
};

function githubHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'sharply-bot-weekly-digest'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export function parseOwnerRepo(full: string): { owner: string; repo: string } {
  const [owner, repo] = full.split('/');
  if (!owner || !repo) {
    throw new Error('Invalid owner/repo');
  }
  return { owner, repo };
}

export async function fetchRecentCommits(options: {
  owner: string;
  repo: string;
  sinceIso: string;
  token?: string;
  perPage?: number;
}): Promise<GithubCommitItem[]> {
  const { owner, repo, sinceIso, token, perPage = 30 } = options;
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/commits`);
  url.searchParams.set('since', sinceIso);
  url.searchParams.set('per_page', String(perPage));

  log.debug({ owner, repo, sinceIso, perPage }, 'GitHub: GET /repos/{owner}/{repo}/commits');
  const t0 = performance.now();
  const res = await fetch(url, { headers: githubHeaders(token) });
  const items = await readJson<GithubCommitItem[]>(res);
  log.debug(
    {
      owner,
      repo,
      count: items.length,
      durationMs: Math.round(performance.now() - t0)
    },
    'GitHub: commits response'
  );
  return items;
}

export async function fetchRecentPulls(options: {
  owner: string;
  repo: string;
  token?: string;
  perPage?: number;
}): Promise<GithubPullItem[]> {
  const { owner, repo, token, perPage = 50 } = options;
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
  url.searchParams.set('state', 'all');
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('direction', 'desc');
  url.searchParams.set('per_page', String(perPage));

  log.debug({ owner, repo, perPage }, 'GitHub: GET /repos/{owner}/{repo}/pulls');
  const t0 = performance.now();
  const res = await fetch(url, { headers: githubHeaders(token) });
  const items = await readJson<GithubPullItem[]>(res);
  log.debug(
    {
      owner,
      repo,
      count: items.length,
      durationMs: Math.round(performance.now() - t0)
    },
    'GitHub: pulls response'
  );
  return items;
}

export function filterPullsInWindow(pulls: GithubPullItem[], sinceMs: number): GithubPullItem[] {
  return pulls.filter((p) => {
    const t = Date.parse(p.updated_at);
    return !Number.isNaN(t) && t >= sinceMs;
  });
}

export function firstLineOfCommitMessage(message: string): string {
  const line = message.split('\n')[0]?.trim() ?? '';
  return line.slice(0, 120);
}
