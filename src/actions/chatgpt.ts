import { defineAction } from "astro:actions";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { createAuth } from "@/lib/auth";
import { chatgptRedirectUriSchema, configureChatgptClient, disconnectChatgpt } from "@/lib/oauth-connections";
import { getDb, requireAdmin, requireUser } from "./_shared";

export const chatgpt = {
  disconnect: defineAction({
    input: z.object({}).strict(),
    handler: async (_, ctx) => {
      const user = requireUser(ctx);
      await disconnectChatgpt(getDb(), user.id);
      return { disconnected: true };
    },
  }),
  configure: defineAction({
    input: z.object({ redirectUri: chatgptRedirectUriSchema }).strict(),
    handler: async ({ redirectUri }, ctx) => {
      requireAdmin(ctx);
      return configureChatgptClient(getDb(), createAuth(env), ctx.request.headers, env.AUTH_URL, redirectUri);
    },
  }),
};
