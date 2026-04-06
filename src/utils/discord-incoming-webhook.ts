import { logger } from "@/utils/logger";

const log = logger.child({ name: "utils/discord-incoming-webhook" });

const DISCORD_CONTENT_MAX = 2000;

export type PostWebhookResult = { parts: number };

/**
 * POST markdown/plain text to a Discord incoming webhook. Splits content into
 * multiple messages if longer than Discord's limit.
 */
export async function postDiscordIncomingWebhook(options: {
	webhookUrl: string;
	content: string;
	username?: string;
	/**
	 * When true, send exactly one message (no line-splitting). Use for fenced
	 * code blocks so Discord never receives a broken ``` pair.
	 */
	singleMessageOnly?: boolean;
}): Promise<PostWebhookResult> {
	const { webhookUrl, content, username, singleMessageOnly } = options;
	const chunks =
		singleMessageOnly === true
			? (() => {
					if (content.length > DISCORD_CONTENT_MAX) {
						throw new Error(
							`Discord webhook content length ${content.length} exceeds ${DISCORD_CONTENT_MAX}`,
						);
					}
					return [content];
				})()
			: splitDiscordContent(content, DISCORD_CONTENT_MAX);
	let parts = 0;

	log.debug(
		{
			totalChars: content.length,
			partCount: chunks.length,
			hasUsername: Boolean(username),
		},
		"Discord webhook: sending payload",
	);

	for (const [i, chunk] of chunks.entries()) {
		const t0 = performance.now();
		const res = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				content: chunk,
				...(username ? { username } : {}),
			}),
		});

		if (!res.ok) {
			const body = await res.text();
			log.error(
				{ status: res.status, partIndex: i + 1, partCount: chunks.length },
				"Discord webhook: request failed",
			);
			throw new Error(`Discord webhook ${res.status}: ${body.slice(0, 200)}`);
		}
		log.debug(
			{
				partIndex: i + 1,
				partCount: chunks.length,
				chunkChars: chunk.length,
				durationMs: Math.round(performance.now() - t0),
			},
			"Discord webhook: part accepted",
		);
		parts += 1;
	}

	log.debug({ parts, totalChars: content.length }, "Discord webhook: complete");
	return { parts };
}

/**
 * Split on newlines where possible so chunks stay readable.
 */
export function splitDiscordContent(text: string, maxLen: number): string[] {
	if (text.length <= maxLen) {
		return [text];
	}

	const chunks: string[] = [];
	let rest = text;

	while (rest.length > 0) {
		if (rest.length <= maxLen) {
			chunks.push(rest);
			break;
		}

		let cut = maxLen;
		const window = rest.slice(0, maxLen);
		const nl = window.lastIndexOf("\n");
		if (nl > maxLen * 0.5) {
			cut = nl;
		}

		chunks.push(rest.slice(0, cut).trimEnd());
		rest = rest.slice(cut).trimStart();
	}

	return chunks;
}
