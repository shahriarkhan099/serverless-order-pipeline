export type AppConfig = {
  kafkaBrokers: string[];
  port: number;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1) {
    throw new Error("PORT must be a positive integer");
  }
  const kafkaBrokers = (env.KAFKA_BROKERS ?? "localhost:9092")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return { kafkaBrokers, port };
}
