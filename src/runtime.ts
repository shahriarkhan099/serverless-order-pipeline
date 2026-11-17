import path from "node:path";
import { pathToFileURL } from "node:url";

export async function launchIfMain(argv1: string | undefined, moduleUrl: string, start: () => Promise<unknown>) {
  if (!argv1) return false;
  if (pathToFileURL(path.resolve(argv1)).href !== moduleUrl) return false;
  try {
    await start();
    return true;
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
    return false;
  }
}
