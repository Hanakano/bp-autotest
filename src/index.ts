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

interface UserQAndConvId {
	user_question: string,
	conversation_id: string
}

// Generic retry function with backoff
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries = 3): Promise<T | undefined> {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		console.debug("Retry with backoff: attempt ", attempt)
		try {
			const result = await fn();
			if (result) return result;
		} catch (error) {
			console.warn(`Attempt ${attempt} failed: ${error}`);
		}
		// Exponentially increasing backoff, approx 2.5s, 7.5s, 19s
		await new Promise((res) => setTimeout(res, Math.pow(2.7, attempt) * 1000));
	}
	console.warn("Max retries reached. Returning undefined.");
	return undefined;
}

// Fetch all conversations with pagination
async function fetchAllConversations(
	api_client: AxiosInstance,
	webhook_id: string,
	user_key: string,
	limiter: Bottleneck
): Promise<ListConversationReturnType[]> {
	let conversations: ListConversationReturnType[] = [];
	let nextToken: string | undefined = undefined;

	for (let i = 0; i < 5; i++) {
		const response = await limiter.schedule(() =>
			api_client.request(getConversations(webhook_id, user_key, nextToken))
		);

		if (response.status !== 200) throw new Error("Error retrieving conversations");

		const { data } = response;
		conversations = conversations.concat(data.conversations || []);
		nextToken = data.meta?.nextToken;
		console.log("Is there a next token?", nextToken);

		if (!nextToken) break;
	}

	return conversations;
}

// Send message to Botpress
async function sendMessageToBotpressBot(params: SendMessageParams): Promise<UserQAndConvId> {
	const { limiter, api_client, webhook_id, user_key, conversation_id, message } = params;
	const limitedRequest = limiter.wrap((config: AxiosRequestConfig) => api_client.request(config));

	try {
		await limitedRequest(makeConversation(webhook_id, user_key, conversation_id));
		await limitedRequest(sendMessage(webhook_id, user_key, conversation_id, message));
		return { user_question: params.message, conversation_id: params.conversation_id }
	} catch (error) {
		console.error("Error in sendMessageToBotpressBot:", error);
		throw error;
	}
}

// Main execution
export default async function main() {
	console.log("Starting testing...");
	const api_client = axios.create({
		baseURL: "https://chat.botpress.cloud",
		headers: { accept: "application/json", "content-type": "application/json" },
	});

	const limiter = new Bottleneck({ minTime: 200, maxConcurrent: 3 });
	const webhook_id = "42536745-17d0-4cd6-a6e2-450d8c18c2a9";
	const sample_questions_filepath = "data/test_questions.jsonl";
	const user_id = "test_user" + uuidv4();
	console.debug("Using alias ", user_id)

	// Load sample questions
	const sample_questions: SampleQuestionLine[] = fs
		.readFileSync(sample_questions_filepath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));

	console.debug("Found ", sample_questions.length, " sample questions");
	console.debug(sample_questions[0])
	// Create user
	const resUser: AxiosResponse = await api_client.request(makeUser(webhook_id, user_id));
	if (resUser.status !== 200) throw new Error(`Error getting user key: ${JSON.stringify(resUser.data)}`);
	const user_key = resUser.data.key;
	console.debug("Got user key: ", user_key);
	console.debug("Sending messages to bot...");
	// Send messages
	const user_q_and_conv_ids = await Promise.all(
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
	console.debug("All messages sent!");
	console.log(user_q_and_conv_ids[0]);

	// Retrieve all conversations (handles pagination)
	const conversation_ids = await fetchAllConversations(api_client, webhook_id, user_key, limiter);
	console.debug("Retrieved ", conversation_ids.length, " conversations");
	console.debug(conversation_ids[0]);

	// Fetch bot responses with retry logic
	console.debug("Fetching bot answers...");
	const bot_responses = await Promise.all(
		conversation_ids.map(async ({ id }: ListConversationReturnType) => {
			const { user_question, bot_answer } = await retryWithBackoff(async (): Promise<{
				user_question: string | undefined;
				bot_answer: string | undefined;
			} | undefined> => {
				const transcriptResponse = await limiter.schedule(() =>
					api_client.request(getChatMessages(webhook_id, user_key, id))
				);

				let user_question: string | undefined;
				let bot_answer: string | undefined;

				if (transcriptResponse.status !== 200) {
					throw new Error("Error retrieving messages:\n", transcriptResponse.data);
				}

				const messages = transcriptResponse.data.messages;
				user_question = messages.length > 1 ? messages[messages.length - 1].payload.text : undefined;
				bot_answer = messages.length > 1 ? messages[messages.length - 2].payload.text : undefined;

				return bot_answer ? { user_question, bot_answer } : undefined;
			}, 3) || { user_question: undefined, bot_answer: undefined };
			return { id, user_question, bot_answer };
		})
	);

	console.debug("Fetched ", bot_responses.length, " bot answers");
	console.debug(bot_responses);

	// Format for OpenAI JSONL, filter out undefined bot answers
	console.debug("pushing to openai-formatted jsonl");
	const formatted_lines = bot_responses
		.filter((entry): entry is {
			id: string;
			user_question: string;
			bot_answer: string;
		} =>
			entry !== null &&
			typeof entry.bot_answer === 'string' &&
			typeof entry.user_question === 'string'
		)
		.map(({ id, user_question, bot_answer }) => {
			/* console.log("Question is: ", user_question, "\n And the bot said: ", bot_answer, "\n"); */
			return makeBatchAPILine(user_question, bot_answer, id, id);
		})
		.filter((line): line is NonNullable<typeof line> => line !== null);

	console.debug("Formatted ", formatted_lines.length, " lines");
	fs.writeFileSync(
		"data/batch_data.jsonl",
		formatted_lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
		"utf8"
	);
	console.log("✅ JSONL file created!");
}
await main()
