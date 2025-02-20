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
		// Exponentially increasing backoff, 3s, 12s, 39s, total of 54 sec
		await new Promise((res) => setTimeout(res, Math.pow(3.4, attempt) * 1000));
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

// Utility function to split array into chunks
function chunk<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
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
	const output_filepath = "data/batch_data.jsonl";

	// Load sample questions
	const sample_questions: SampleQuestionLine[] = fs
		.readFileSync(sample_questions_filepath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
	console.debug("Found ", sample_questions.length, " sample questions");

	// Process in batches of 20
	const BATCH_SIZE = 20;
	const batches = chunk(sample_questions, BATCH_SIZE);
	console.debug(`Split into ${batches.length} batches of size ${BATCH_SIZE}`);

	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = batches[batchIndex];
		const user_id = `batch_user_${batchIndex}_` + uuidv4();
		console.debug(`Processing batch ${batchIndex + 1}/${batches.length} with user ${user_id}`);

		try {
			// Create user for this batch
			const resUser: AxiosResponse = await api_client.request(makeUser(webhook_id, user_id));
			if (resUser.status !== 200) throw new Error(`Error getting user key: ${JSON.stringify(resUser.data)}`);
			const user_key = resUser.data.key;
			console.debug("Got user key: ", user_key);

			// Send messages for this batch
			await Promise.all(
				batch.map(({ id, user_question }) =>
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
			console.debug(`Batch ${batchIndex + 1}: All messages sent!`);

			// Retrieve conversations for this batch
			const conversation_ids = await fetchAllConversations(api_client, webhook_id, user_key, limiter);
			console.debug(`Retrieved ${conversation_ids.length} conversations for batch ${batchIndex + 1}`);

			// Fetch bot responses for this batch
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

			// Format and save this batch
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
					return makeBatchAPILine(user_question, bot_answer, id, id);
				})
				.filter((line): line is NonNullable<typeof line> => line !== null);

			// Append this batch's results to the output file
			fs.appendFileSync(
				output_filepath,
				formatted_lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
				"utf8"
			);

			console.log(`✅ Batch ${batchIndex + 1}/${batches.length} processed and saved successfully`);

		} catch (error) {
			console.error(`❌ Error processing batch ${batchIndex + 1}:`, error);
			// Continue with next batch instead of failing completely
			continue;
		}
	}

	console.log("✅ All batches processed!");
}
await main()
