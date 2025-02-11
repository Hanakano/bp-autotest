// src/index.ts
import Bottleneck from "bottleneck";
import axios from "axios";
import type { AxiosRequestConfig, AxiosResponse, AxiosInstance } from "axios";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { makeUser, makeConversation, sendMessage, getChatMessages, getConversations } from "@/botpress/botpressHelpers";
import { makeBatchAPILine } from "@/utils";
import type { SampleQuestionLine, ListConversationReturnType } from "@/schemas";

interface SendMessageParams {
	limiter: Bottleneck;
	api_client: AxiosInstance;
	webhook_id: string;
	user_key: string;
	conversation_id: string;
	message: string;
	question_id?: string;
}

// Generic retry function with backoff
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries = 3,
	delayMs = 1000): Promise<T | undefined> {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const result = await fn();
			if (result) return result;
		} catch (error) {
			console.warn(`Attempt ${attempt} failed: ${error}`);
		}
		// Exponential backoff (1-2s range)
		await new Promise((res) => setTimeout(res, delayMs + Math.random() * 1000));
	}
	console.warn("Max retries reached. Returning undefined.");
	return undefined;
}

// Fetch all conversations with pagination
async function fetchAllConversations(
	api_client: AxiosInstance,
	webhook_id: string,
	user_key: string,
	limiter: Bottleneck): Promise<ListConversationReturnType[]> {
	let conversations: ListConversationReturnType[] = [];
	let nextToken: string | undefined = undefined;
	let attempts = 0;

	do {
		const response = await limiter.schedule(() => api_client.request(getConversations(webhook_id, user_key, nextToken)));
		if (response.status !== 200) throw new Error("Error retrieving conversations");

		const { data } = response;
		conversations = conversations.concat(data.conversations || []);
		nextToken = data.meta?.nextToken;
		attempts++;
	} while (nextToken && attempts < 5);

	return conversations;
}

// Send message to Botpress
async function sendMessageToBotpressBot(params: SendMessageParams): Promise<void> {
	const { limiter, api_client, webhook_id, user_key, conversation_id, message } = params;
	const limitedRequest = limiter.wrap((config: AxiosRequestConfig) => api_client.request(config));

	try {
		await limitedRequest(makeConversation(webhook_id, user_key, conversation_id));
		await limitedRequest(sendMessage(webhook_id, user_key, conversation_id, message));
	} catch (error) {
		console.error("Error in sendMessageToBotpressBot:", error);
		throw error;
	}
}

// Main execution
export default async function main() {
	const api_client = axios.create({
		baseURL: "https://chat.botpress.cloud",
		headers: { accept: "application/json", "content-type": "application/json" },
	});

	const limiter = new Bottleneck({ minTime: 200, maxConcurrent: 3 });
	const webhook_id = "42536745-17d0-4cd6-a6e2-450d8c18c2a9";
	const sample_questions_filepath = "data/test_questions.jsonl";
	const user_id = "test-user-1";

	// Load sample questions
	const sample_questions: SampleQuestionLine[] = fs
		.readFileSync(sample_questions_filepath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));

	// Create user
	const resUser: AxiosResponse = await api_client.request(makeUser(webhook_id, user_id));
	if (resUser.status !== 200) throw new Error(`Error getting user key: ${JSON.stringify(resUser.data)}`);
	const user_key = resUser.data.key;

	// Send messages
	await Promise.all(
		sample_questions.map(({ id, user_question }) =>
			sendMessageToBotpressBot({
				limiter,
				api_client,
				webhook_id,
				user_key,
				conversation_id: uuidv4(),
				message: user_question,
				question_id: id,
			})
		)
	);

	// Retrieve all conversations (handles pagination)
	const conversation_ids = await fetchAllConversations(api_client, webhook_id, user_key, limiter);

	// Fetch bot responses with retry logic
	const bot_responses = await Promise.all(
		conversation_ids.map(async ({ id }: ListConversationReturnType) => {
			const bot_answer = await retryWithBackoff(async () => {
				const transcriptResponse = await limiter.schedule(() => api_client.request(getChatMessages(webhook_id, user_key, id)));
				if (transcriptResponse.status !== 200) throw new Error("Error retrieving messages");

				const messages = transcriptResponse.data.messages;
				return messages.length > 1 ? messages[messages.length - 2].payload.text : undefined;
			});

			return bot_answer ? { id, bot_answer } : null;
		})
	);

	// Format for OpenAI JSONL, filter out undefined bot answers
	const formatted_lines = bot_responses
		.filter((entry): entry is { id: string; bot_answer: string } => entry !== null)
		.map(({ id, bot_answer }) => {
			const question = sample_questions.find((q) => q.id === id);
			return question ? makeBatchAPILine(question.user_question, bot_answer, id, question.id) : null;
		})
		.filter(Boolean);

	fs.writeFileSync("data/batch_data.jsonl", formatted_lines.join("\n") + "\n", "utf8");
	console.log("✅ JSONL file created!");
}
