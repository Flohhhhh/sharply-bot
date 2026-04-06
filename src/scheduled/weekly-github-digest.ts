import { Cron } from "croner";
import { env } from "@/env";
import { postDiscordIncomingWebhook } from "@/utils/discord-incoming-webhook";
import {
	fetchRecentPulls,
	filterPullsInWindow,
	type GithubPullItem,
	parseOwnerRepo,
} from "@/utils/github-public";
import { logger } from "@/utils/logger";

const log = logger.child({ name: "scheduled/weekly-github-digest" });

const MAX_SHIPPED = 20;
const MAX_IN_PROGRESS = 6;
const MAX_CLOSED = 5;

function mergedInWindow(p: GithubPullItem, sinceMs: number): boolean {
	if (!p.merged_at) {
		return false;
	}
	const t = Date.parse(p.merged_at);
	return !Number.isNaN(t) && t >= sinceMs;
}

/** Strip characters that break Discord markdown outside of link labels. */
function neutralizeDiscordMarkdown(text: string): string {
	return text
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[*_`~|]/g, "")
		.slice(0, 280);
}

/** `[]` inside `[label](url)` breaks Discord links — use harmless substitutes. */
function escapeDiscordLinkLabel(text: string): string {
	return text.replace(/\[/g, "(").replace(/\]/g, ")");
}

const SHIPPED_PREFIX_REWRITES: [RegExp, string][] = [
	[/^adds?\s+/i, "Added "],
	[/^fix(es|ed)?\s+/i, "Fixed "],
	[/^remove[ds]?\s+/i, "Removed "],
	[/^update[ds]?\s+/i, "Updated "],
	[/^improve[ds]?\s+/i, "Improved "],
	[/^prevent[ds]?\s+/i, "Prevented "],
	[/^implement(s|ed)?\s+/i, "Shipped "],
	[/^refactor(s|ed)?\s+/i, "Reworked "],
	[/^display\s+/i, "The app now shows "],
	[/^show\s+/i, "You can now see "],
	[/^bump\s+/i, "Updated dependencies for "],
	[/^chore\s*[:(]\s*/i, "Maintenance: "],
	[/^chore\s+/i, "Maintenance: "],
];

/**
 * Turn a merged PR title into one user-facing sentence (changelog tone).
 * Real polish still comes from good PR titles; this only nudges common patterns.
 */
function toShippedReleaseSentence(raw: string): string {
	let t = neutralizeDiscordMarkdown(raw);
	if (!t) {
		return "An update was merged.";
	}

	if (/^merge pull request #\d+/i.test(t)) {
		return "Integrated a merged pull request.";
	}

	for (const [pattern, replacement] of SHIPPED_PREFIX_REWRITES) {
		if (pattern.test(t)) {
			t = t.replace(pattern, replacement);
			break;
		}
	}

	t = t.charAt(0).toUpperCase() + t.slice(1);
	if (!/[.!?]$/.test(t)) {
		t += ".";
	}
	return t;
}

/** In-flight / closed lines: readable, but we do not guess past tense. */
function toSimpleReleaseLine(raw: string): string {
	const t = neutralizeDiscordMarkdown(raw);
	if (!t) {
		return "Update.";
	}
	const s = t.charAt(0).toUpperCase() + t.slice(1);
	return /[.!?]$/.test(s) ? s : `${s}.`;
}

function proseLinkBullet(sentence: string, url: string): string {
	return `- [${escapeDiscordLinkLabel(sentence)}](${url})`;
}

function sortByMergedAtDesc(a: GithubPullItem, b: GithubPullItem): number {
	const ta = a.merged_at ? Date.parse(a.merged_at) : 0;
	const tb = b.merged_at ? Date.parse(b.merged_at) : 0;
	return tb - ta;
}

function sortByUpdatedDesc(a: GithubPullItem, b: GithubPullItem): number {
	return Date.parse(b.updated_at) - Date.parse(a.updated_at);
}

function registerCronWithCroner(expression: string): void {
	const tz = process.env.TZ;
	new Cron(
		expression,
		{
			protect: true,
			...(tz ? { timezone: tz } : {}),
		},
		async () => {
			try {
				await runWeeklyGithubDigest({ reason: "cron" });
			} catch (err) {
				log.error({ err }, "Weekly digest run failed");
			}
		},
	);
}

export type WeeklyDigestRunContext = {
	reason: "startup" | "cron";
};

export async function runWeeklyGithubDigest(
	context: WeeklyDigestRunContext = { reason: "cron" },
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
			authenticated: Boolean(token),
		},
		"Weekly digest: start",
	);

	const fetchStarted = performance.now();
	const pullsRaw = await fetchRecentPulls({ owner, repo, token });

	log.debug(
		{
			reason: context.reason,
			durationMs: Math.round(performance.now() - fetchStarted),
			pullsFetched: pullsRaw.length,
		},
		"Weekly digest: GitHub fetches done",
	);

	const pulls = filterPullsInWindow(pullsRaw, sinceMs);

	log.debug(
		{
			reason: context.reason,
			pullsInWindow: pulls.length,
		},
		"Weekly digest: PRs filtered to window",
	);

	const shipped = pulls
		.filter((p) => mergedInWindow(p, sinceMs))
		.sort(sortByMergedAtDesc);
	const inProgress = pulls
		.filter((p) => p.state === "open")
		.sort(sortByUpdatedDesc);
	const closedNoMerge = pulls
		.filter((p) => p.state === "closed" && !p.merged_at)
		.sort(sortByUpdatedDesc);

	const shippedCount = shipped.length;
	const inProgressCount = inProgress.length;
	const closedCount = closedNoMerge.length;

	const lines: string[] = [`**What's new** — ${repoFull}`, ""];

	if (shippedCount === 0 && inProgressCount === 0 && closedCount === 0) {
		lines.push(
			`_No pull request activity in the past **${windowDays}** days._`,
		);
	} else {
		if (shippedCount > 0) {
			const slice = shipped.slice(0, MAX_SHIPPED);
			for (const p of slice) {
				lines.push(
					proseLinkBullet(toShippedReleaseSentence(p.title), p.html_url),
				);
			}
			if (shippedCount > MAX_SHIPPED) {
				lines.push(
					"",
					`_…and ${shippedCount - MAX_SHIPPED} more shipped updates — see GitHub for the full list._`,
				);
			}
		} else if (inProgressCount > 0 || closedCount > 0) {
			lines.push(
				`_Nothing merged to the main branch in the past **${windowDays}** days._`,
				"",
			);
		}

		if (inProgressCount > 0) {
			lines.push("", "_In progress_", "");
			const slice = inProgress.slice(0, MAX_IN_PROGRESS);
			for (const p of slice) {
				lines.push(proseLinkBullet(toSimpleReleaseLine(p.title), p.html_url));
			}
			if (inProgressCount > MAX_IN_PROGRESS) {
				lines.push(
					"",
					`_…and ${inProgressCount - MAX_IN_PROGRESS} more open PR(s)._`,
				);
			}
		}

		if (closedCount > 0) {
			lines.push("", "_Closed without merging_", "");
			const slice = closedNoMerge.slice(0, MAX_CLOSED);
			for (const p of slice) {
				lines.push(proseLinkBullet(toSimpleReleaseLine(p.title), p.html_url));
			}
			if (closedCount > MAX_CLOSED) {
				lines.push("", `_…and ${closedCount - MAX_CLOSED} more._`);
			}
		}
	}

	const content = lines.join("\n");
	log.debug(
		{
			reason: context.reason,
			contentChars: content.length,
			lineCount: lines.length,
		},
		"Weekly digest: message built",
	);

	const postStarted = performance.now();
	const { parts } = await postDiscordIncomingWebhook({
		webhookUrl,
		content,
		username: "Repo digest",
	});
	log.info(
		{
			reason: context.reason,
			parts,
			pullsInWindow: pulls.length,
			shipped: shippedCount,
			inProgress: inProgressCount,
			closedNoMerge: closedCount,
			contentChars: content.length,
			postMs: Math.round(performance.now() - postStarted),
			totalMs: Math.round(performance.now() - runStarted),
		},
		"Weekly digest: posted to Discord",
	);
}

export function startWeeklyGithubDigest(): void {
	const webhookUrl = env.WEEKLY_DIGEST_DISCORD_WEBHOOK_URL;
	const repoFull = env.WEEKLY_DIGEST_GITHUB_REPO;

	if (!webhookUrl || !repoFull) {
		log.debug(
			"Weekly digest disabled (set WEEKLY_DIGEST_DISCORD_WEBHOOK_URL and WEEKLY_DIGEST_GITHUB_REPO)",
		);
		return;
	}

	const expression = env.WEEKLY_DIGEST_CRON;

	try {
		registerCronWithCroner(expression);
		log.info({ expression, backend: "croner" }, "Weekly digest scheduled");
	} catch (err) {
		log.error({ err, expression }, "Failed to schedule weekly digest");
		return;
	}

	void runWeeklyGithubDigest({ reason: "startup" }).catch((err) => {
		log.error({ err }, "Startup digest run failed");
	});
	log.info("Weekly digest: queued startup run (cron also scheduled)");
}
