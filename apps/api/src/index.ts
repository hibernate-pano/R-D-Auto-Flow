import { buildServer } from "./server.js";

const cwd = process.cwd();
const { app, env } = await buildServer(cwd);

await app.listen({ port: env.PORT, host: "127.0.0.1" });
