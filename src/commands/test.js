import { loadConfig, configPath } from "../core/config.js";
import { resolveLang, t } from "../core/i18n.js";
import { pushAll } from "../providers/index.js";
import { toast } from "../providers/toast.js";

export async function cmdTest(args) {
  const dryRun = Boolean(args.flags["dry-run"]);
  const config = loadConfig();
  const lang = resolveLang(config);
  const msg = {
    title: t(lang, "testTitle"),
    body: t(lang, "testBody"),
    priority: "normal"
  };

  if (config.toast && !dryRun) {
    try {
      await toast(msg);
      console.log("toast      OK");
    } catch (err) {
      console.log(`toast      FAILED  ${err.message}`);
    }
  }

  const enabled = Object.entries(config.channels).filter(([, c]) => c.enabled);
  if (enabled.length === 0) {
    console.log(`No channels enabled. Edit ${configPath()} — set "enabled": true and paste your webhook, then rerun.`);
    return;
  }

  const results = await pushAll(config, msg, { dryRun });
  let failed = 0;
  for (const r of results) {
    if (r.dryRun) console.log(`[dry-run] ${r.name}: POST ${r.url}\n  ${r.body}`);
    else if (r.ok) console.log(`${r.name.padEnd(10)} OK`);
    else {
      console.log(`${r.name.padEnd(10)} FAILED  ${r.error}`);
      failed++;
    }
  }
  if (failed > 0) process.exitCode = 1;
}
