// src/schemas.ts
import { z } from "zod";

export const SampleQuestionSchema = z.object({
	id: z.string(),
	user_question: z.string(),
});

export type SampleQuestionLine = z.infer<typeof SampleQuestionSchema>;

export const BatchAPILineSchema = z.object({
	custom_id: z.string(),
	method: z.literal("POST"),
	url: z.literal("/v1/chat/completions"),
	body: z.object({
		model: z.string(),
		store: z.boolean().default(true),
		messages: z.array(
			z.object({
				role: z.enum(["developer", "user"]),
				content: z.string(),
			})
		),
		max_completion_tokens: z.number(),
		response_format: z.object({
			type: z.string(),
			json_schema: z.object({}).optional()
		}).optional(),
		metadata: z.object({
			conversation_id: z.string(),
			question_id: z.string(),
		}),
	}),
});

export type BatchAPILine = z.infer<typeof BatchAPILineSchema>;

export const ListConversationsReturnSchema = z.object({
	id: z.string(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
	meta: z.object({
		nextToken: z.string().optional()
	})
})

export type ListConversationReturnType = z.infer<typeof ListConversationsReturnSchema>
