import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export const createConversationSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().max(120).optional(),
});

export const createMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1),
});
