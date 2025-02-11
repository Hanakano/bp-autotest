// src/sys_prompt.ts

import product_data from "../ data / products.json"
import * as faqs from "../ data / faqs.md"
import { readFileSync } from "fs";
import { join } from "path";

const faqs = readFileSync(join(__dirname, "../data/faqs.md"), "utf-8");

//This is where we will define the enormous system prompt
export const SYSTEM_PROMPT = `
You are an LLM judge! You need to use the data and evaluate whether or not the answer is correct and leave feedback about your answer.


CONTEXT
${JSON.stringify(product_data, null, 2)}

${faqs}

EXAMPLES:


QUESTION/ANSWER PAIR FOR EVALUATION:
`

export const CHAT_EVALUATION_SCHEMA = {
	"name": "chat_evaluation",
	"schema": {
		"type": "object",
		"properties": {
			"user_question": { "type": "string" },
			"bot_answer": { "type": "string" },
			"feedback": { "type": "string" },
			"is_fully_correct": { "type": "boolean" },
			"result": {
				"type": "string",
				"enum": ["correct", "partially_correct", "incorrect"]
			}
		},
		"required": ["user_question", "bot_answer", "feedback", "is_fully_correct", "result"],
		"additionalProperties": false
	},
	"strict": true
}
