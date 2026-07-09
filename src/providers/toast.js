import { spawn } from "node:child_process";

// Desktop toast. Zero-dependency: PowerShell WinRT on Windows,
// osascript on macOS, notify-send on Linux (best effort).
export async function toast(msg) {
  if (process.platform === "win32") return winToast(msg);
  if (process.platform === "darwin") return macToast(msg);
  return linuxToast(msg);
}

function run(cmd, args, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd} timed out`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(stderr.trim() || `${cmd} exited ${code}`));
    });
  });
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function winToast(msg) {
  // "waiting" is the one notification you must not miss — pin it on screen
  // (scenario="reminder") instead of letting it auto-dismiss to Action Center
  // after ~5s like a normal "done" toast.
  const urgent = msg.priority === "high";
  const toastAttrs = urgent ? ' scenario="reminder"' : "";
  const actions = urgent
    ? '<actions><action activationType="system" arguments="dismiss" content="Dismiss"/></actions>'
    : "";
  // Borrow PowerShell's registered AppUserModelID so no app registration is needed.
  const script = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast${toastAttrs}><visual><binding template="ToastGeneric"><text>${xmlEscape(msg.title).replace(/'/g, "''")}</text><text>${xmlEscape(msg.body).replace(/'/g, "''")}</text></binding></visual>${actions}</toast>')
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  await run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-EncodedCommand",
    encoded
  ]);
}

function appleEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function macToast(msg) {
  await run("osascript", [
    "-e",
    `display notification "${appleEscape(msg.body)}" with title "${appleEscape(msg.title)}"`
  ]);
}

async function linuxToast(msg) {
  try {
    await run("notify-send", [msg.title, msg.body]);
  } catch (err) {
    if (err.code === "ENOENT") return; // no notify-send — remote channels still work
    throw err;
  }
}
