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
		'You write short, user-facing product release notes for Discord (end users, not developers).',
		'You receive merged GitHub pull requests as JSON. Each item has a stable numeric id, the original PR title, and the canonical PR URL.',
		'Rewrite titles into clear, friendly bullets. You may lightly fix obvious PR-title typos if meaning is clear.',
		'Do not mention merges, pull requests, branches, GitHub workflow, or engineering process.',
		'Use a casual changelog voice; start each bullet with a lowercase letter unless a proper noun requires otherwise.',
		'End each bullet with a period before the link marker.',
	].join(' ');

	const user = [
		'Input JSON:',
		JSON.stringify(payload, null, 2),
		'',
		'Output requirements:',
		'- Return ONLY markdown (no surrounding ``` fences, no preamble or commentary).',
		"- Use sections ## What's New and ## Fixes only when they have at least one bullet.",
		"- Put fixes under ## Fixes and everything else under ## What's New (you may override suggestedSection if a title is clearly miscategorized).",
		'- One bullet per input pull unless two ids are truly the same user-facing change (avoid this unless obvious); prefer one bullet per id.',
		'- Every bullet for pull id K MUST end with this exact link pattern: ` [[K]](<URL>)` where URL is the exact `url` string from that id in the JSON (wrap the URL in angle brackets as shown).',
		'- Do not invent ids or URLs; only use ids and urls present in the input.',
		'- Do not add a footnote list; links are inline on each bullet only.',
	].join('\n');

	const t0 = performance.now();
	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				temperature: 0.35,
				max_tokens: 4096,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
			}),
		});
	} catch (err) {
		log.error({ err }, 'LLM changelog: request failed');
		return null;
	}

	const durationMs = Math.round(performance.now() - t0);

	if (!res.ok) {
		const errBody = await res.text();
		log.error(
			{ status: res.status, durationMs, body: errBody.slice(0, 500) },
			'LLM changelog: API error',
		);
		return null;
	}

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

	log.info(
		{ durationMs, chars: markdown.length, pulls: pulls.length },
		'LLM changelog: generated',
	);
	return markdown;
}
