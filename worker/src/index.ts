import { createGameApp } from "./app.ts";
import { D1GameRepository, type D1DatabaseLike } from "./d1Repository.ts";

interface Bindings {
  DB: D1DatabaseLike;
  ALLOWED_ORIGINS?: string;
  ADMIN_PUBLISH_TOKEN?: string;
  AI_CONFIG_ENCRYPTION_KEY?: string;
  DEEPSEEK_API_KEY?: string;
}

export default {
  async fetch(request: Request, environment: Bindings): Promise<Response> {
    const allowedOrigins = environment.ALLOWED_ORIGINS
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    const app = createGameApp(new D1GameRepository(environment.DB), {
      allowedOrigins,
      adminToken: environment.ADMIN_PUBLISH_TOKEN,
      aiEncryptionKey: environment.AI_CONFIG_ENCRYPTION_KEY,
      deepSeekApiKey: environment.DEEPSEEK_API_KEY,
    });

    return app.fetch(request);
  },
};
