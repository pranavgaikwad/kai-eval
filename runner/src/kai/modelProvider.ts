import {
  KaiModelProvider,
  KaiModelProviderInvokeCallOptions,
} from "@editor-extensions/agentic";
import {
  ChatBedrockConverse,
  type ChatBedrockConverseInput,
} from "@langchain/aws";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import {
  BaseChatModel,
  type BindToolsInput,
} from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  isBaseMessage,
} from "@langchain/core/messages";
import { BasePromptValue } from "@langchain/core/prompt_values";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { ChatDeepSeek } from "@langchain/deepseek";
import {
  ChatGoogleGenerativeAI,
  type GoogleGenerativeAIChatInput,
} from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";
import { Logger } from "winston";

import { SupportedModelProviders } from "./types";

interface ModelCapabilities {
  supportsTools: boolean;
  supportsToolsInStreaming: boolean;
}

interface ModelProviderOptions {
  streamingModel: BaseChatModel;
  nonStreamingModel: BaseChatModel;
  capabilities: ModelCapabilities;
  logger: Logger;
}

function validateMissingConfigKeys(
  record: Record<string, unknown>,
  keys: string[],
  name: "environment variable(s)" | "model arg(s)",
): void {
  let missingKeys = keys.filter((k) => !(k in record));
  if (name === "environment variable(s)") {
    missingKeys = missingKeys.filter((key) => !(key in process.env));
  }
  if (missingKeys && missingKeys.length) {
    throw Error(
      `Required ${name} missing in model config${name === "environment variable(s)" ? " or environment " : ""}- ${missingKeys.join(", ")}`,
    );
  }
}

function hitMaxTokens(chunk: AIMessageChunk | undefined): boolean {
  if (!chunk) {
    return false;
  }
  const extractStopReason = (data: Record<string, unknown>) => {
    return (
      data &&
      ("messageStop" in data &&
      data.messageStop &&
      typeof data.messageStop === "object" &&
      "stopReason" in data.messageStop
        ? (data.messageStop as { stopReason: unknown }).stopReason
        : undefined)
    );
  };
  return (
    extractStopReason(chunk.response_metadata) === "max_tokens" ||
    extractStopReason(chunk.additional_kwargs) === "max_tokens"
  );
}

function languageModelInputToMessages(
  input: BaseLanguageModelInput,
): BaseMessage[] {
  let messages: BaseMessage[];
  if (typeof input === "string") {
    messages = [new HumanMessage(input)];
  } else if (input instanceof BasePromptValue && "toChatMessages" in input) {
    messages = input.toChatMessages();
  } else if (Array.isArray(input)) {
    messages = input
      .map((item) => {
        if (isBaseMessage(item)) {
          return item;
        }
      })
      .filter(Boolean) as BaseMessage[];
  } else {
    messages = input as unknown as BaseMessage[];
  }
  return messages;
}

export async function createModel(
  provider: SupportedModelProviders,
  args: Record<string, unknown>,
  env: Record<string, string>,
  _logger: Logger,
): Promise<BaseChatModel> {
  switch (provider) {
    case "AzureChatOpenAI": {
      const defaultArgs = {
        streaming: true,
        temperature: 0.1,
        maxRetries: 2,
      };
      const mergedArgs = { ...defaultArgs, ...args };
      validateMissingConfigKeys(
        env,
        ["AZURE_OPENAI_API_KEY"],
        "environment variable(s)",
      );
      return new AzureChatOpenAI({
        openAIApiKey: env.AZURE_OPENAI_API_KEY,
        ...mergedArgs,
      });
    }
    case "ChatBedrock": {
      const defaultArgs = {
        streaming: true,
        model: "meta.llama3-70b-instruct-v1:0",
      };
      const mergedArgs = { ...defaultArgs, ...args };
      validateMissingConfigKeys(mergedArgs, ["model"], "model arg(s)");
      const config: ChatBedrockConverseInput = {
        ...mergedArgs,
        region: env.AWS_DEFAULT_REGION,
      };
      if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
        config.credentials = {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        };
      }
      return new ChatBedrockConverse(config);
    }
    case "ChatDeepSeek": {
      const defaultArgs = {
        model: "deepseek-chat",
        streaming: true,
        temperature: 0,
        maxRetries: 2,
      };
      const mergedArgs = { ...defaultArgs, ...args };
      validateMissingConfigKeys(mergedArgs, ["model"], "model arg(s)");
      validateMissingConfigKeys(
        env,
        ["DEEPSEEK_API_KEY"],
        "environment variable(s)",
      );
      return new ChatDeepSeek({
        apiKey: env.DEEPSEEK_API_KEY,
        ...mergedArgs,
      });
    }
    case "ChatGoogleGenerativeAI": {
      const defaultArgs = {
        model: "gemini-pro",
        temperature: 0.7,
        streaming: true,
      };
      const mergedArgs = { ...defaultArgs, ...args };
      validateMissingConfigKeys(mergedArgs, ["model"], "model arg(s)");
      validateMissingConfigKeys(
        env,
        ["GOOGLE_API_KEY"],
        "environment variable(s)",
      );
      return new ChatGoogleGenerativeAI({
        apiKey: env.GOOGLE_API_KEY,
        ...mergedArgs,
      } as GoogleGenerativeAIChatInput);
    }
    case "ChatOllama": {
      const defaultArgs = {
        temperature: 0.1,
        streaming: true,
      };
      const mergedArgs = { ...defaultArgs, ...args };
      validateMissingConfigKeys(
        mergedArgs,
        ["model", "baseUrl"],
        "model arg(s)",
      );
      return new ChatOllama({
        ...mergedArgs,
      });
    }
    case "ChatOpenAI": {
      const defaultArgs = {
        model: "gpt-4o",
        temperature: 0.1,
        streaming: true,
      };
      const mergedArgs = { ...defaultArgs, ...args };
      validateMissingConfigKeys(mergedArgs, ["model"], "model arg(s)");
      validateMissingConfigKeys(
        env,
        ["OPENAI_API_KEY"],
        "environment variable(s)",
      );
      return new ChatOpenAI({
        openAIApiKey: env.OPENAI_API_KEY,
        ...mergedArgs,
      });
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function getModelCapabilities(
  provider: SupportedModelProviders,
): ModelCapabilities {
  switch (provider) {
    case "ChatBedrock":
    case "ChatOpenAI":
    case "AzureChatOpenAI":
    case "ChatGoogleGenerativeAI":
      return {
        supportsTools: true,
        supportsToolsInStreaming: true,
      };
    case "ChatDeepSeek":
    case "ChatOllama":
      return {
        supportsTools: true,
        supportsToolsInStreaming: false,
      };
    default:
      return {
        supportsTools: false,
        supportsToolsInStreaming: false,
      };
  }
}

export class BaseModelProvider implements KaiModelProvider {
  constructor(private readonly options: ModelProviderOptions) {
    options.logger = options.logger.child({
      module: "ModelProvider",
    });
  }

  async invoke(
    input: BaseLanguageModelInput,
    options?: Partial<KaiModelProviderInvokeCallOptions>,
  ): Promise<AIMessage> {
    const runnable = this.options.nonStreamingModel;

    const messages: BaseMessage[] = languageModelInputToMessages(input);

    let response = (await runnable.invoke(messages, options)) as AIMessageChunk;

    let maxTokensReached = hitMaxTokens(response);
    let attempts = 10;
    while (maxTokensReached && attempts > 0) {
      this.options.logger.silly(
        "Max tokens reached during invoke, continuing generation, attempts left: ",
        attempts,
      );
      const newResponse: AIMessageChunk = (await runnable.invoke(
        [...messages, response],
        options,
      )) as AIMessageChunk;
      response = response.concat(newResponse);
      maxTokensReached = hitMaxTokens(newResponse);
      attempts--;
    }

    return response;
  }

  async stream(
    input: BaseLanguageModelInput,
    options?: Partial<KaiModelProviderInvokeCallOptions>,
  ): Promise<IterableReadableStream<AIMessageChunk>> {
    const runnable = this.options.streamingModel;

    const messages: BaseMessage[] = languageModelInputToMessages(input);
    const logger = this.options.logger;

    return new ReadableStream({
      async start(controller) {
        let accumulatedResponse: AIMessageChunk | undefined;
        let continueStreaming = true;
        let attempts = 10;
        let currentInput: BaseMessage[] = messages;
        try {
          while (continueStreaming && attempts > 0) {
            const streamOnce = await runnable.stream(currentInput, options);
            for await (const chunk of streamOnce) {
              if (!accumulatedResponse) {
                accumulatedResponse = chunk;
              } else {
                accumulatedResponse = accumulatedResponse.concat(chunk);
              }
              controller.enqueue(chunk);
            }
            if (accumulatedResponse && hitMaxTokens(accumulatedResponse)) {
              attempts--;
              logger.silly(
                "Max tokens reached during streaming, continuing generation, attempts left: ",
                attempts,
              );
              currentInput = [
                ...messages,
                accumulatedResponse,
                new HumanMessage("Continue. Do not repeat."),
              ];
              continueStreaming = true;
            } else {
              continueStreaming = false;
            }
          }
          controller.close();
        } catch (error) {
          logger.error(`Error streaming: ${error}`);
          controller.error(error);
        }
      },
    }) as IterableReadableStream<AIMessageChunk>;
  }

  bindTools(
    tools: BindToolsInput[],
    kwargs?: Partial<KaiModelProviderInvokeCallOptions>,
  ): KaiModelProvider {
    if (!this.options.capabilities.supportsTools) {
      throw new Error("This model does not support tool calling");
    }

    const boundStreamingModel = this.options.streamingModel.bindTools?.(
      tools,
      kwargs,
    );
    const boundNonStreamingModel = this.options.nonStreamingModel.bindTools?.(
      tools,
      kwargs,
    );

    if (!boundStreamingModel || !boundNonStreamingModel) {
      throw new Error("Failed to bind tools to model");
    }

    return new BaseModelProvider({
      ...this.options,
      streamingModel: boundStreamingModel as BaseChatModel,
      nonStreamingModel: boundNonStreamingModel as BaseChatModel,
    });
  }

  toolCallsSupported(): boolean {
    return this.options.capabilities.supportsTools;
  }

  toolCallsSupportedInStreaming(): boolean {
    return this.options.capabilities.supportsToolsInStreaming;
  }
}

export async function createModelProvider(
  provider: SupportedModelProviders,
  args: Record<string, unknown>,
  env: Record<string, string>,
  logger: Logger,
): Promise<KaiModelProvider> {
  const capabilities = getModelCapabilities(provider);

  const streamingModel = await createModel(
    provider,
    { ...args, streaming: true },
    env,
    logger,
  );
  const nonStreamingModel = await createModel(
    provider,
    { ...args, streaming: false },
    env,
    logger,
  );

  const options: ModelProviderOptions = {
    streamingModel,
    nonStreamingModel,
    capabilities,
    logger,
  };

  return new BaseModelProvider(options);
}
