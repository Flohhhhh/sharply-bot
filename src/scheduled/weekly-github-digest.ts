import { Cron } from 'croner';
import { env } from '@/env';
import { postDiscordIncomingWebhook } from '@/utils/discord-incoming-webhook';
import {
  fetchRecentCommits,
  fetchRecentPulls,
  filterPullsInWindow,
  firstLineOfCommitMessage,
  parseOwnerRepo
} from '@/utils/github-public';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'scheduled/weekly-github-digest' });

const MAX_PR_BULLETS = 12;
const MAX_COMMIT_BULLETS = 10;

function registerCronWithCroner(expression: string): void {
  const tz = process.env.TZ;
  new Cron(
    expression,
    {
      protect: true,
      ...(tz ? { timezone: tz } : {})
    },
    async () => {
      try {
        await runWeeklyGithubDigest({ reason: 'cron' });
      } catch (err) {
        log.error({ err }, 'Weekly digest run failed');
      }
    }
  );
}

export type WeeklyDigestRunContext = {
  reason: 'startup' | 'cron';
};

export async function runWeeklyGithubDigest(
  context: WeeklyDigestRunContext = { reason: 'cron' }
): Promise<void> {
  const runStarted = performance.now();
  const webhookUrl = env.WEEKLY_DIGEST_DISCORD_WEBHOOK_URL;
  const repoFull = env.WEEKLY_DIGEST_GITHUB_REPO;
  if (!webhookUrl || !repoFull) {
    return;
  }

  const { owner, repo } = parseOwnerRepo(repoFull);
  const windowDays = env.WEEKLY_DIGEST_WINDOW_DAYS;
  const sinceMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const token = env.GITHUB_TOKEN;

  log.info(
    {
      reason: context.reason,
      repo: repoFull,
      windowDays,
      sinceIso,
      authenticated: Boolean(token)
    },
    'Weekly digest: start'
  );

  const fetchStarted = performance.now();
  const [commits, pullsRaw] = await Promise.all([
    fetchRecentCommits({ owner, repo, sinceIso, token }),
    fetchRecentPulls({ owner, repo, token })
  ]);

  log.debug(
    {
      reason: context.reason,
      durationMs: Math.round(performance.now() - fetchStarted),
      commitsFetched: commits.length,
      pullsFetched: pullsRaw.length
    },
    'Weekly digest: GitHub fetches done'
  );

  const pulls = filterPullsInWindow(pullsRaw, sinceMs);

  log.debug(
    {
      reason: context.reason,
      pullsInWindow: pulls.length
    },
    'Weekly digest: PRs filtered to window'
  );

  const mergedInWindow = pulls.filter((p) => {
    if (!p.merged_at) {
      return false;
    }
    const t = Date.parse(p.merged_at);
    return !Number.isNaN(t) && t >= sinceMs;
  }).length;

  const openCount = pulls.filter((p) => p.state === 'open').length;
  const closedUnmerged = pulls.filter((p) => p.state === 'closed' && !p.merged_at).length;

  const baseSummary = `In the last **${windowDays}** day(s), **${repoFull}** had **${commits.length}** new commit(s) on the default branch and **${pulls.length}** pull request(s) with updates`;
  const detail =
    mergedInWindow > 0 || openCount > 0 || closedUnmerged > 0
      ? `, including **${mergedInWindow}** merged, **${openCount}** still open, and **${closedUnmerged}** closed without merge`
      : '';
  const summary = `${baseSummary}${detail}.`;

  const lines: string[] = [`**Weekly digest** — ${repoFull}`, '', summary, '', '**Changes**'];

  if (pulls.length === 0 && commits.length === 0) {
    lines.push('- No commits or PR activity in this window.');
  } else {
    const prSlice = pulls.slice(0, MAX_PR_BULLETS);
    for (const p of prSlice) {
      const merged = p.merged_at && Date.parse(p.merged_at) >= sinceMs ? 'merged' : p.state;
      lines.push(`- PR #${p.number}: ${p.title} (${merged})`);
    }
    if (pulls.length > MAX_PR_BULLETS) {
      lines.push(`- _…and ${pulls.length - MAX_PR_BULLETS} more PR(s)_`);
    }

    const commitSlice = commits.slice(0, MAX_COMMIT_BULLETS);
    for (const c of commitSlice) {
      const msg = firstLineOfCommitMessage(c.commit.message);
      lines.push(`- \`${c.sha.slice(0, 7)}\` ${msg}`);
    }
    if (commits.length > MAX_COMMIT_BULLETS) {
      lines.push(`- _…and ${commits.length - MAX_COMMIT_BULLETS} more commit(s)_`);
    }
  }

  const content = lines.join('\n');
  log.debug(
    {
      reason: context.reason,
      contentChars: content.length,
      lineCount: lines.length
    },
    'Weekly digest: message built'
  );

  const postStarted = performance.now();
  const { parts } = await postDiscordIncomingWebhook({
    webhookUrl,
    content,
    username: 'Repo digest'
  });
  log.info(
    {
      reason: context.reason,
      parts,
      commits: commits.length,
      pulls: pulls.length,
      contentChars: content.length,
      postMs: Math.round(performance.now() - postStarted),
      totalMs: Math.round(performance.now() - runStarted)
    },
    'Weekly digest: posted to Discord'
  );
}

export function startWeeklyGithubDigest(): void {
  const webhookUrl = env.WEEKLY_DIGEST_DISCORD_WEBHOOK_URL;
  const repoFull = env.WEEKLY_DIGEST_GITHUB_REPO;

  if (!webhookUrl || !repoFull) {
    log.debug(
      'Weekly digest disabled (set WEEKLY_DIGEST_DISCORD_WEBHOOK_URL and WEEKLY_DIGEST_GITHUB_REPO)'
    );
    return;
  }

  const expression = env.WEEKLY_DIGEST_CRON;

  try {
    registerCronWithCroner(expression);
    log.info({ expression, backend: 'croner' }, 'Weekly digest scheduled');
  } catch (err) {
    log.error({ err, expression }, 'Failed to schedule weekly digest');
    return;
  }

  void runWeeklyGithubDigest({ reason: 'startup' }).catch((err) => {
    log.error({ err }, 'Startup digest run failed');
  });
  log.info('Weekly digest: queued startup run (cron also scheduled)');
}
