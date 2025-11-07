import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function patchEsm() {
  const target = resolve(
    process.cwd(),
    "node_modules/@editor-extensions/agentic/dist/index.js"
  );
  try {
    const orig = await readFile(target, "utf8");
    const before = 'import zodToJsonSchema from "zod-to-json-schema";';
    const after = 'import { zodToJsonSchema } from "zod-to-json-schema";';
    if (orig.includes(after)) return;
    if (!orig.includes(before)) return;
    const updated = orig.replace(before, after);
    await writeFile(target, updated, "utf8");
  } catch {}
}

async function patchCjs() {
  const target = resolve(
    process.cwd(),
    "node_modules/@editor-extensions/agentic/dist/index.cjs"
  );
  try {
    const orig = await readFile(target, "utf8");
    const beforeUse = "import_zod_to_json_schema.default";
    const afterUse = "import_zod_to_json_schema.zodToJsonSchema";
    if (orig.includes(afterUse)) return;
    if (!orig.includes(beforeUse)) return;
    const updated = orig.replaceAll(beforeUse, afterUse);
    await writeFile(target, updated, "utf8");
  } catch {}
}

async function run() {
  await Promise.all([patchEsm(), patchCjs()]);
}

run();



