// src/botpress/botpressHelpers.ts
// Helper functions to do tasks with the Botpress Chat API

import { type AxiosRequestConfig } from "axios";

// Need to use these with an API client like:
// const apiClient = axios.create({
// 	baseURL: "https://chat.botpress.cloud",
// 	headers: {
// 		accept: "application/json",
// 		"content-type": "application/json",
// 	},
// });

// Helper function to create a new user
export function makeUser(
	webhook_id: string,
	user_id: string): AxiosRequestConfig {
	return {
		method: "POST",
		url: `/${webhook_id}/users`,
		data: {
			name: user_id,
			id: user_id,
		},
	};
}
// Helper function to create a new conversation
export function makeConversation(
	webhook_id: string,
	user_key: string,
	conversation_id: string): AxiosRequestConfig {
	return {
		method: "POST",
		url: `/${webhook_id}/conversations`,
		headers: {
			"x-user-key": user_key
		},
		data: {
			id: conversation_id,
		},
	};
}
// Helper function to send a message to a conversation
export function sendMessage(
	webhook_id: string,
	user_key: string,
	conversation_id: string,
	message: string): AxiosRequestConfig {
	return {
		method: "POST",
		url: `/${webhook_id}/messages`,
		headers: {
			"x-user-key": user_key
		},
		data: {
			conversationId: conversation_id,
			payload: {
				type: "text",
				text: message
			}
		},
	};
}
// Helper function to send a message to a conversation
export function getChatMessages(
	webhook_id: string,
	user_key: string,
	conversation_id: string): AxiosRequestConfig {
	return {
		method: "GET",
		url: `/${webhook_id}/conversations/${conversation_id}/messages`,
		headers: {
			"x-user-key": user_key
		},
	};
}

// Helper function to list all the conversations for a user
export function getConversations(
	webhook_id: string,
	user_key: string,
	nextToken?: string): AxiosRequestConfig {
	const next_token = nextToken ? "/?nextToken=" + nextToken : ""
	return {
		method: "GET",
		url: `/${webhook_id}/conversations${next_token}`,
		headers: {
			"x-user-key": user_key
		}
	}
}	
