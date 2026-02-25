import { z } from 'zod'

export const MessageRoleSchema = z.enum(['user', 'model'])

export const RagSourceSchema = z.object({
  label: z.string(),
  url: z.string(),
})

export const MessageSchema = z.object({
  id: z.string(),
  role: MessageRoleSchema,
  content: z.string(),
  sources: z.array(RagSourceSchema).optional(),
  timestamp: z.date(),
})

export const ChatSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Message = z.infer<typeof MessageSchema>
export type ChatSession = z.infer<typeof ChatSessionSchema>
export type MessageRole = z.infer<typeof MessageRoleSchema>
