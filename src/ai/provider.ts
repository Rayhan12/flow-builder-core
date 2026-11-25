export type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
}

export type GenerateRequest = {
  system: string
  messages: ChatMessage[]
  jsonSchema?: object
}

export interface LLMProvider {
  id: string
  listModels(): Promise<string[]>
  generate(req: GenerateRequest): Promise<string>
}

export type CreateProviderOptions = {
  apiKey: string
  model: string
}
