// src/sys_prompt.ts

import * as product_data from "../data/products.json"
import { readFileSync } from "fs";
import { join } from "path";

//const faqs = readFileSync(join(__dirname, "../data/faqs.md"), "utf-8");
export const CHAT_EVALUATION_SCHEMA: object = {
	"name": "chat_evaluation",
	"schema": {
		"type": "object",
		"properties": {
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
//${JSON.stringify(product_data, null, 2)}
//This is where we will define the enormous system prompt
export const SYSTEM_PROMPT = `
You are an LLM judge! You need to use the data and evaluate the answer given by the bot.
 
The point of this bot is to fully answer questions that Global Panels' salespeople have about their products. Good answers are not only accurate, but are also comprehensive and include enough additional information to ground the answer and address possible follow up questions.

To help ground your answers and verify the bot's answers, you will be given specs about the various globe panel products. Use them to double check information, especially numbers, that the bot gives to the user.

CONTEXT

ANSWER FORMAT:

${JSON.stringify(CHAT_EVALUATION_SCHEMA)}

EXAMPLES:

Example 1:   
"user_question":"what type of fire reaction does globeroof eco offer?",
"bot_answer":"The Globeroof Eco product offers a fire reaction that includes the formation of a protective layer when exposed to direct flame, which resists the spread of fire and self-extinguishes once the fire source is removed. This char layer acts as an insulating barrier between the external heat source and the unaffected insulation core.",
Assistant output: {
      "feedback":"the answer should include the specific certification type, which is B-s2,d0; but this one is not completely wrong, it explains what happens when the fire attacks the PIR foam",
      "is_fully_correct":false,
      "result":"partially_correct"
   }

Example 2:
"user_question":"What is the decibel reduction fort the acoustic roof panel?",
"bot_answer":"The GlobeRoof Noisestop panel reduces sound between 33.4 and 34.7 decibels, depending on thickness. They will also absorb between 65% and 95% of sound, also depending on thickness. Globeroof noisestop with higher thickness surfaces absorb more sound, making them suitable for noise control applications, thanks to its micro-perforated surface. The mineral wool core and micro-perforated options enhance sound insulation, making GlobeRoof Noisestop panels ideal for industrial facilities, auditoriums, and high-noise environments.",
Assistant output: {
      "feedback":"Not only are the numbers accurately taken from the source material, but the answer includes both sound absorbtion and reflection values. It discusses how thickness affects noise performance, and tells other properties about the panel's core and perforations.",
      "is_fully_correct":true,
      "result":"correct"
   }

Example 3:
"user_question":"How much does the panel weigh? (Obviously depending on the thickness)",
"bot_answer":"The weight of the Globe Roof insulated roofing panel will vary depending on the thickness of the steel gauge you choose. Here are the approximate weights for each thickness: For 0.4mm thickness: approximately 7.5 kg/m2. For 0.5mm thickness: approximately 9.0kg/m2. For 0.6mm thickness: approximately  10.5kg/m2. If you need further assistance or more specific details, feel free to ask!",
Assistant output: {
      "feedback":"Bot is responding with thickness of metal cladding, not thickness of the insulation core. Since the insulating core thickness is one of the primary features of an IMP, it should be assumed that its thickness is being asked about, not the metal cladding thickness.",
      "is_fully_correct":false,
      "result":"incorrect"
   }

QUESTION/ANSWER PAIR FOR EVALUATION:
`
