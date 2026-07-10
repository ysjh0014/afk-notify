import { spawn } from "node:child_process";

export const TOAST_GROUP = "afk-notify";

// Well-known AppUserModelID for powershell.exe — used both to show and to
// later look up/remove a toast, so it must match between the two calls.
const WIN_APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

// Desktop toast. Zero-dependency: PowerShell WinRT on Windows,
// osascript on macOS, notify-send on Linux (best effort).
//
// opts.persistent pins the toast on screen until dismissed (used for "waiting
// for approval" — the one you really can't miss); otherwise it lingers longer
// than the ~5s default (duration="long") and then auto-collapses normally.
// opts.tag lets a later dismissToast() call remove this exact notification.
export async function toast(msg, opts = {}) {
  if (process.platform === "win32") return winToast(msg, opts);
  if (process.platform === "darwin") return macToast(msg);
  return linuxToast(msg);
}

// Best-effort removal of a toast shown earlier with the same tag, e.g. once
// the user approves in the CLI so the "waiting" reminder doesn't linger after
// it's already been handled. Windows-only: mac/Linux have no zero-dependency
// way to target one specific past notification.
export async function dismissToast({ tag, group = TOAST_GROUP } = {}) {
  if (process.platform !== "win32" || !tag) return;
  const script = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.ToastNotificationManager]::History.Remove('${tag.replace(/'/g, "''")}', '${group.replace(/'/g, "''")}', '${WIN_APP_ID.replace(/'/g, "''")}')
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

async function winToast(msg, { persistent = false, tag, group = TOAST_GROUP } = {}) {
  const toastAttrs = persistent ? ` scenario="reminder"` : ` duration="long"`;
  const actions = persistent
    ? `<actions><action activationType="system" arguments="dismiss" content="Dismiss"/></actions>`
    : "";
  const tagLines = tag
    ? `$toast.Tag = '${tag.replace(/'/g, "''")}'\n$toast.Group = '${group.replace(/'/g, "''")}'`
    : "";
  const script = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast${toastAttrs}><visual><binding template="ToastGeneric"><text>${xmlEscape(msg.title).replace(/'/g, "''")}</text><text>${xmlEscape(msg.body).replace(/'/g, "''")}</text></binding></visual>${actions}</toast>')
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
${tagLines}
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${WIN_APP_ID.replace(/'/g, "''")}').Show($toast)
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
