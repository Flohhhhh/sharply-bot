import { logger } from '@/utils/logger';

const log = logger.child({ name: 'utils/changelog-llm' });

export type ChangelogLlmPull = {
	/** Stable reference 1..N used in [[id]](url) in the output. */
	id: number;
	githubNumber: number;
	title: string;
	url: string;
	suggestedSection: 'whats_new' | 'fixes';
};

export type GenerateChangelogLlmInput = {
	apiKey: string;
	baseUrl: string;
	model: string;
	repoFull: string;
	windowDays: number;
	pulls: ChangelogLlmPull[];
};

const OUTPUT_CAP = 4096;

/** Newer OpenAI models reject `max_tokens` and require `max_completion_tokens`. */
function prefersMaxCompletionTokens(model: string): boolean {
	const m = model.trim().toLowerCase();
	if (m.startsWith('gpt-5')) {
		return true;
	}
	if (m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) {
		return true;
	}
	if (/^o\d/.test(m)) {
		return true;
	}
	return false;
}

function shouldRetryWithMaxCompletionTokens(errBody: string): boolean {
	try {
		const j = JSON.parse(errBody) as {
			error?: { param?: string; message?: string };
		};
		const param = j.error?.param;
		const msg = j.error?.message ?? '';
		return (
			param === 'max_tokens' ||
			(msg.includes('max_tokens') && msg.includes('max_completion_tokens'))
		);
	} catch {
		return false;
	}
}

function stripOuterMarkdownFence(text: string): string {
	const trimmed = text.trim();
	if (!trimmed.startsWith('```')) {
		return trimmed;
	}
	const lines = trimmed.split('\n');
	lines.shift();
	while (lines.length > 0) {
		const last = lines[lines.length - 1]?.trim() ?? '';
		if (last === '```' || last.startsWith('```')) {
			lines.pop();
		} else {
			break;
		}
	}
	return lines.join('\n').trim();
}

/**
 * Discord: wrap http(s) destinations in `](<url>)` to reduce embeds. Idempotent if
 * already `](<https://...>)`.
 */
export function ensureMarkdownHttpLinksAngleWrapped(text: string): string {
	return text.replace(/\]\(([^)]+)\)/g, (full, hrefRaw: string) => {
		const href = hrefRaw.trim();
		if (/^<https?:\/\//i.test(href) && href.endsWith('>')) {
			return `](${href})`;
		}
		if (/^https?:\/\//i.test(href)) {
			return `](<${href}>)`;
		}
		return full;
	});
}

/**
 * Turn merged PR metadata into user-facing Discord markdown (What's New / Fixes).
 * OpenAI-compatible `POST /chat/completions` (works with OpenAI, Groq, etc.).
 */
export async function generateChangelogWithLlm(
	input: GenerateChangelogLlmInput,
): Promise<string | null> {
	const { apiKey, baseUrl, model, repoFull, windowDays, pulls } = input;
	if (pulls.length === 0) {
		return null;
	}

	const root = baseUrl.replace(/\/$/, '');
	const url = `${root}/chat/completions`;

	const payload = {
		repo: repoFull,
		windowDays,
		pulls: pulls.map((p) => ({
			id: p.id,
			githubNumber: p.githubNumber,
			title: p.title,
			url: p.url,
			suggestedSection: p.suggestedSection,
		})),
	};

	const system = [
		'You are a product writer turning engineering PR titles into polished, user-facing release notes.',
		'Audience: photographers and shoppers using the product—never developers.',
		'Input: JSON array of merged work items; each has id, githubNumber, title, url, suggestedSection.',
		'Your job is to infer themes (search, browse, gear cards, lists, compare, profiles, catalog/data, mobile, etc.) and write a SHORT digest that feels like a human PM wrote it.',
		'Never mention merges, PRs, branches, commits, GitHub, or how the sausage is made.',
	].join('\n');

	const styleExemplar = [
		'Target voice and density (your bullets should feel like this—not a dry rewrite of each PR title):',
		'- global search got a big refresh with smarter suggestions, better keyboard flow, recent searches, and quicker jump-offs to results.',
		'- search accuracy is better for tricky gear queries like aperture values, and it avoids more irrelevant one-number matches.',
		'- browse pages now have cleaner sorting/filter reset behavior, plus better mobile search/header behavior.',
		'- gear card actions are more reliable, including save, wishlist, and collection state.',
		'- saving an item to a list now includes a quick "View list" shortcut.',
		'- public profile and list pages have clearer empty states and error handling.',
		'- compare pages are easier to navigate, with item names linking directly to their gear pages.',
		'- gear pages can now show trusted creator video coverage when available.',
		'- the catalog was cleaned up with added sensor formats, updated slugs/mount data, and some visual polish to gear cards.',
	].join('\n');

	const user = [
		styleExemplar,
		'',
		'How to write from the JSON:',
		'- CLUSTER related items into the same bullet when they clearly touch the same user-facing area (e.g. several search PRs → one rich search bullet with multiple clauses joined by commas, "and", "plus", "including").',
		'- Prefer FEWER, LONGER bullets over one thin bullet per PR. If there are many PRs, aim for roughly half to two-thirds as many bullets as PRs when themes overlap.',
		'- Start most bullets with a lowercase letter unless a proper noun forces otherwise.',
		'- Use varied rhythms: "X got…", "X is better…", "X now…", "X was cleaned up with…", "Y can now…".',
		'- Fixes: under ## Fixes, same style—group related bugfix titles into one sentence when they are the same area; still user-benefit language ("spacing feels right", "no more …") not "fixed bug in component".',
		'',
		'Links (required): include every id from the input exactly once across the whole digest (each id appears in exactly one bullet, in that bullet\'s trailing link group).',
		'- Put ALL link tokens for that bullet at the END of the line, after the final period, separated by single spaces.',
		'- Format for each id K: [[K]](<URL>) — the URL inside parentheses MUST be wrapped in angle brackets (Discord): always `](<https://...>)`, never bare `](https://...)`.',
		'- Example shape: `- browse and mobile search feel smoother, with cleaner resets and header behavior. [[2]](<https://...>) [[5]](<https://...>)`',
		'- Do not add a separate footnote block at the bottom.',
		'',
		'Structure (order matters):',
		'- First: 1–3 short sentences that summarize the main user-visible themes of this batch (no ## heading for this part—plain prose only, optional light **bold**).',
		'- Then a single blank line.',
		"- Then ## What's New and ## Fixes sections as described above (omit empty sections).",
		'',
		'Output:',
		'- Return ONLY markdown. No surrounding ``` fences (the app wraps the final message).',
		"- Use suggestedSection as a hint; move items if the title is clearly miscategorized.",
		'- Only use ids and urls that exist in the JSON.',
		'',
		'Input JSON:',
		JSON.stringify(payload, null, 2),
	].join('\n');

	const messages = [
		{ role: 'system' as const, content: system },
		{ role: 'user' as const, content: user },
	];

	const baseBody = {
		model,
		temperature: 0.55,
		messages,
	};

	const t0 = performance.now();
	let res: Response;
	try {
		const firstBody = prefersMaxCompletionTokens(model)
			? { ...baseBody, max_completion_tokens: OUTPUT_CAP }
			: { ...baseBody, max_tokens: OUTPUT_CAP };

		res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(firstBody),
		});

		if (!res.ok && res.status === 400 && 'max_tokens' in firstBody) {
			const errText = await res.text();
			if (shouldRetryWithMaxCompletionTokens(errText)) {
				log.info(
					{ model },
					'LLM changelog: retrying with max_completion_tokens',
				);
				res = await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify({
						...baseBody,
						max_completion_tokens: OUTPUT_CAP,
					}),
				});
				if (!res.ok) {
					const retryErr = await res.text();
					const durationMsEarly = Math.round(performance.now() - t0);
					log.error(
						{
							status: res.status,
							durationMs: durationMsEarly,
							body: retryErr.slice(0, 500),
						},
						'LLM changelog: API error after max_completion_tokens retry',
					);
					return null;
				}
			} else {
				const durationMs = Math.round(performance.now() - t0);
				log.error(
					{ status: res.status, durationMs, body: errText.slice(0, 500) },
					'LLM changelog: API error',
				);
				return null;
			}
		} else if (!res.ok) {
			const errBody = await res.text();
			const durationMs = Math.round(performance.now() - t0);
			log.error(
				{ status: res.status, durationMs, body: errBody.slice(0, 500) },
				'LLM changelog: API error',
			);
			return null;
		}
	} catch (err) {
		log.error({ err }, 'LLM changelog: request failed');
		return null;
	}

	const durationMs = Math.round(performance.now() - t0);

	const data = (await res.json()) as {
		choices?: { message?: { content?: string | null } }[];
		error?: { message?: string };
	};

	if (data.error?.message) {
		log.error({ durationMs, message: data.error.message }, 'LLM changelog: error object');
		return null;
	}

	const raw = data.choices?.[0]?.message?.content;
	if (!raw || typeof raw !== 'string') {
		log.error({ durationMs }, 'LLM changelog: empty content');
		return null;
	}

	const markdown = stripOuterMarkdownFence(raw);
	if (!markdown) {
		log.error({ durationMs }, 'LLM changelog: blank after fence strip');
		return null;
	}

	const normalized = ensureMarkdownHttpLinksAngleWrapped(markdown);

	log.info(
		{ durationMs, chars: normalized.length, pulls: pulls.length },
		'LLM changelog: generated',
	);
	return normalized;
}
