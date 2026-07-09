// Decide whether an event should reach remote channels (phone/IM),
// as opposed to only the local desktop toast.
//
// - "waiting" (agent blocked on user input) always pushes: it is the
//   highest-value notification.
// - "done" pushes only for long tasks. An unknown duration (no start
//   marker — e.g. Codex, which has no start event) is treated as long,
//   because missing a real notification is worse than one extra ping.
export function shouldPushRemote({ event, durationSec, thresholdSeconds }) {
  if (event === "waiting") return true;
  if (event !== "done") return false;
  if (durationSec == null) return true;
  return durationSec >= thresholdSeconds;
}
