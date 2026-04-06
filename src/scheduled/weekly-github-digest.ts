import { Cron } from "croner";
import { env } from "@/env";
import {
	type ChangelogLlmPull,
	generateChangelogWithLlm,
} from "@/utils/changelog-llm";
import { postDiscordIncomingWebhook } from "@/utils/discord-incoming-webhook";
import {
	fetchRecentPulls,
	filterPullsInWindow,
	type GithubPullItem,
	parseOwnerRepo,
} from "@/utils/github-public";
import { logger } from "@/utils/logger";

const log = logger.child({ name: "scheduled/weekly-github-digest" });

const MAX_WHATS_NEW = 20;
const MAX_FIXES = 20;

function mergedInWindow(p: GithubPullItem, sinceMs: number): boolean {
	if (!p.merged_at) {
		return false;
	}
	const t = Date.parse(p.merged_at);
	return !Number.isNaN(t) && t >= sinceMs;
}

function neutralizeForCodeBlock(text: string): string {
	return text
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[*_`~|]/g, "")
		.replace(/```/g, "'''")
		.slice(0, 280);
}

function isMergeNoiseTitle(raw: string): boolean {
	const t = neutralizeForCodeBlock(raw).toLowerCase();
	return (
		/^merge pull request #\d+/i.test(t) ||
		/^merge branch\b/i.test(t) ||
		/^merge remote\b/i.test(t)
	);
}

function isFixCategoryTitle(raw: string): boolean {
	const t = neutralizeForCodeBlock(raw).toLowerCase();
	if (/^fix(es|ed)?\b/.test(t)) {
		return true;
	}
	if (/^hotfix\b/.test(t)) {
		return true;
	}
	if (/\bbug\b/.test(t)) {
		return true;
	}
	if (/^revert\b/.test(t)) {
		return true;
	}
	if (/\bregression\b/.test(t)) {
		return true;
	}
	return false;
}

const PREFIX_REWRITES: [RegExp, string][] = [
	[/^adds?\s+/i, "added "],
	[/^fix(es|ed)?\s+/i, "fixed "],
	[/^remove[ds]?\s+/i, "removed "],
	[/^update[ds]?\s+/i, "updated "],
	[/^improve[ds]?\s+/i, "improved "],
	[/^prevent[ds]?\s+/i, "prevented "],
	[/^implement(s|ed)?\s+/i, "delivered "],
	[/^refactor(s|ed)?\s+/i, "reworked "],
	[/^display\s+/i, "the UI now shows "],
	[/^show\s+/i, "there is now "],
	[/^bump\s+/i, "updated dependencies: "],
	[/^chore\s*[:(]\s*/i, "maintenance: "],
	[/^chore\s+/i, "maintenance: "],
];

/** One casual changelog line (lowercase start, no PR/merge wording). */
function toChangelogLine(raw: string): string {
	let t = neutralizeForCodeBlock(raw);
	if (!t) {
		return "minor update.";
	}

	for (const [pattern, replacement] of PREFIX_REWRITES) {
		if (pattern.test(t)) {
			t = t.replace(pattern, replacement);
			break;
		}
	}

	t = t.trim();
	if (!/[.!?]$/.test(t)) {
		t += ".";
	}
	return t.charAt(0).toLowerCase() + t.slice(1);
}

type ChangelogEntry = { text: string; url: string };

/** Discord suppresses link embeds for URLs wrapped in angle brackets. */
function angleWrapUrl(url: string): string {
	const trimmed = url.trim();
	if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
		return trimmed;
	}
	return `<${trimmed}>`;
}

function buildChangelogInner(
	whatsNew: ChangelogEntry[],
	fixes: ChangelogEntry[],
): string {
	const lines: string[] = [];
	let n = 1;

	const pushSection = (heading: string, entries: ChangelogEntry[]) => {
		if (entries.length === 0) {
			return;
		}
		if (lines.length > 0) {
			lines.push("");
		}
		lines.push(heading);
		for (const e of entries) {
			const href = angleWrapUrl(e.url);
			lines.push(`- ${e.text} [[${n}]](${href})`);
			n += 1;
		}
	};

	pushSection("## What's New", whatsNew);
	pushSection("## Fixes", fixes);

	if (lines.length === 0) {
		return "## What's New\n_no items this period._";
	}

	return lines.join("\n");
}

function fitChangelogToLimit(
	whatsNewAll: ChangelogEntry[],
	fixesAll: ChangelogEntry[],
	repoUrl: string,
): string {
	let whatsNew = whatsNewAll.slice(0, MAX_WHATS_NEW);
	let fixes = fixesAll.slice(0, MAX_FIXES);
	let omitted =
		whatsNewAll.length - whatsNew.length + (fixesAll.length - fixes.length);

	for (;;) {
		let inner = buildChangelogInner(whatsNew, fixes);
		if (omitted > 0) {
			inner += `\n\n_…and ${omitted} more — ${angleWrapUrl(repoUrl)}_`;
		}
		if (inner.length <= 2000) {
			return inner;
		}

		if (fixes.length > 0) {
			fixes = fixes.slice(0, -1);
			omitted += 1;
			continue;
		}
		if (whatsNew.length > 0) {
			whatsNew = whatsNew.slice(0, -1);
			omitted += 1;
			continue;
		}
		return "## What's New\n_note: changelog too long for one Discord message; see GitHub._";
	}
}

function sortByMergedAtDesc(a: GithubPullItem, b: GithubPullItem): number {
	const ta = a.merged_at ? Date.parse(a.merged_at) : 0;
	const tb = b.merged_at ? Date.parse(b.merged_at) : 0;
	return tb - ta;
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
	const repoUrl = `https://github.com/${owner}/${repo}`;

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
		.filter((p) => !isMergeNoiseTitle(p.title))
		.sort(sortByMergedAtDesc);

	const pullsForLlm: ChangelogLlmPull[] = [];
	const whatsNew: ChangelogEntry[] = [];
	const fixes: ChangelogEntry[] = [];

	let id = 1;
	for (const p of shipped) {
		pullsForLlm.push({
			id,
			githubNumber: p.number,
			title: p.title,
			url: p.html_url,
			suggestedSection: isFixCategoryTitle(p.title) ? "fixes" : "whats_new",
		});
		const entry: ChangelogEntry = {
			text: toChangelogLine(p.title),
			url: p.html_url,
		};
		if (isFixCategoryTitle(p.title)) {
			fixes.push(entry);
		} else {
			whatsNew.push(entry);
		}
		id += 1;
	}

	let content: string;
	let changelogSource: "llm" | "heuristic" | "empty" = "heuristic";

	if (shipped.length === 0) {
		changelogSource = "empty";
		content = "## What's New\n_no items this period._";
	} else if (env.WEEKLY_DIGEST_LLM_API_KEY) {
		const llmMd = await generateChangelogWithLlm({
			apiKey: env.WEEKLY_DIGEST_LLM_API_KEY,
			baseUrl: env.WEEKLY_DIGEST_LLM_BASE_URL,
			model: env.WEEKLY_DIGEST_LLM_MODEL,
			repoFull,
			windowDays,
			pulls: pullsForLlm,
		});
		if (llmMd && llmMd.trim().length > 0) {
			changelogSource = "llm";
			content =
				llmMd.length > 2000
					? `${llmMd.slice(0, 1990)}\n\n_…truncated._`
					: llmMd;
			log.info("Weekly digest: using LLM changelog");
		} else {
			content = fitChangelogToLimit(whatsNew, fixes, repoUrl);
			log.warn("Weekly digest: LLM failed or empty; using heuristic changelog");
		}
	} else {
		content = fitChangelogToLimit(whatsNew, fixes, repoUrl);
	}

	log.debug(
		{
			reason: context.reason,
			changelogSource,
			contentChars: content.length,
			whatsNew: whatsNew.length,
			fixes: fixes.length,
			shipped: shipped.length,
		},
		"Weekly digest: message built",
	);

	const postStarted = performance.now();
	const { parts } = await postDiscordIncomingWebhook({
		webhookUrl,
		content,
		username: "Repo digest",
		singleMessageOnly: true,
	});
	log.info(
		{
			reason: context.reason,
			changelogSource,
			parts,
			pullsInWindow: pulls.length,
			shipped: shipped.length,
			whatsNew: whatsNew.length,
			fixes: fixes.length,
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
