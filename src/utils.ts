// src/utils.ts
import fs from "fs";
import { SYSTEM_PROMPT, CHAT_EVALUATION_SCHEMA } from "@/sys_prompt";
import { BatchAPILine } from "@/schemas";

export function makeBatchAPILine(
	user_question: string,
	bot_answer: string,
	conversation_id: string,
	question_id: string
): BatchAPILine {
	return {
		custom_id: conversation_id,
		method: "POST",
		url: "/v1/chat/completions",
		body: {
			model: "o3-mini",
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: `user question: ${user_question}\n\nbot answer: ${bot_answer}` },
			],
			max_tokens: 500,
			temperature: 0.2,
			response_format: { type: "json_schema", json_schema: CHAT_EVALUATION_SCHEMA },
			metadata: { conversation_id, question_id },
		},
	};
}

export function convertAnsweredQuestionsToOpenAIJSONL(inputFile: string, outputFile: string): void {
	const lines = fs.readFileSync(inputFile, "utf8").split("\n").filter(Boolean);
	const outputLines = lines.map((line) => {
		const { id, conversation_id, user_question, bot_answer } = JSON.parse(line);
		return JSON.stringify(makeBatchAPILine(user_question, bot_answer, conversation_id, id));
	});

	fs.writeFileSync(outputFile, outputLines.join("\n") + "\n", "utf8");
	console.log(`✅ Converted ${lines.length} questions to OpenAI-ready JSONL!`);
}
