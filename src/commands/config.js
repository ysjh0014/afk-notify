import { loadConfig, maskedConfig, configPath } from "../core/config.js";

export async function cmdConfig() {
  console.log(configPath());
  console.log(JSON.stringify(maskedConfig(loadConfig()), null, 2));
}
