# bp-autotest-ts

Test harness to evaluate a Botpress bot on a sample corpus using LLM as a judge and OpenAI's batch API.

## Installation

This project was developed using [**Nix**](https://nixos.org/) for reproducible dev environments. I recommend running it inside of a Nix shell or flake, and a `flake.nix` file is provided for this purpose.

1. Install dependencies with `bun install`
2. Put your questions in a JSONL format like this:

```json
{"id":"question-166","user_question":"How far is Mars from the sun?"}
```

3. Set your target bot's webhook ID as an env variable, either in the `flake.nix` or however your preferred JS runtime handles env variables.
4. Update the system prompt in [sys_prompt.ts](./src/sys_prompt.ts) to reflect all the judge model needs to assess the question/answer pairs.
5. Send the questions to your bot with `bun run src/index.ts`

The resulting data will be in a JSONL format suitable for [OpenAI's Batch API.](https://platform.openai.com/batches)
