#!/usr/bin/env bash
# Issue #3: real reader root + PDF navigation, without unit/test-host isolation.
# This is not the provider-backed full acceptance.sh golden path.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ART="${RUNNER_TEMP:-$ROOT/test-results}/reader-root-smoke"
mkdir -p "$ART"
APP_PID=""; DUMMY_PID=""; OPEN_PID=""
cleanup() {
  if [ -n "$OPEN_PID" ]; then kill "$OPEN_PID" 2>/dev/null || true; fi
  if [ -n "$APP_PID" ]; then kill "$APP_PID" 2>/dev/null || true; fi
  if [ -n "$DUMMY_PID" ]; then kill "$DUMMY_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
sample_host() {
  if [ -n "$APP_PID" ]; then
    sample "$APP_PID" 3 -file "$ART/reader-host.sample" >/dev/null 2>&1 || true
    grep -E -C 3 'TabContainerView|MainView|PageFlowApp|TabManager|VibeReader.debug' "$ART/reader-host.sample" | head -220 || true
    ps -p "$APP_PID" -o pid,etime,%cpu,state,command || true
  fi
}
stage="preflight"
error_diagnostics() {
  local status=$?
  echo "READER_ROOT_SMOKE_FAIL: stage=$stage line=$1 status=$status"
  grep -n -C 3 'error:' "$ART/build.log" 2>/dev/null | head -90 || true
  tail -n 25 "$ART/build.log" 2>/dev/null || true
  cat "$ART/unavailable.log" "$ART/open.log" 2>/dev/null || true
  sample_host
  exit "$status"
}
trap 'error_diagnostics $LINENO' ERR
[ "$(uname -s)" = Darwin ] || { echo "macOS required"; exit 2; }
[ -z "${VIBEREADER_UNIT_TEST_HOST:-}" ] && [ -z "${VIBEREADER_TEST_HOST:-}" ]
if pgrep -x VibeReader >/dev/null; then echo "Existing reader; refusing ambiguous attribution"; exit 2; fi
stage="build"; echo "Stage: $stage"
scripts/build-native.sh >"$ART/build.log" 2>&1
APP_DIR="$(xcodebuild -project "$ROOT/apps/vibereader-macos/PageFlow.xcodeproj" -scheme PageFlow -configuration Debug -showBuildSettings 2>/dev/null | awk '/ BUILT_PRODUCTS_DIR =/ && !printed {print $3; printed=1}')"
APP="$APP_DIR/VibeReader.app"
FIXTURE="$ART/reader-startup-sample.pdf"
cp "$ROOT/test-fixtures/acceptance-sample.pdf" "$FIXTURE"
# Normal returning-user preference, not a test-host bypass. No default-handler change.
defaults write cn.yishuziyu.vibereader-macos hasShownDefaultPDFPrompt -bool true
cat > "$ART/unavailable.py" <<'PYTHON'
from http.server import BaseHTTPRequestHandler, HTTPServer
import json, sys, time
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        record = {"time": time.time(), "method": self.command, "path": self.path,
                  "ua": self.headers.get("User-Agent", ""),
                  "probe": self.headers.get("X-Smoke-Probe", "")}
        with open(sys.argv[1], "a", encoding="utf-8") as log:
            log.write(json.dumps(record) + "\n"); log.flush()
        self.send_response(500); self.end_headers(); self.wfile.write(b"unavailable")
    do_POST = do_GET
HTTPServer(("127.0.0.1",8766),H).serve_forever()
PYTHON
if lsof -ti tcp:8766 >/dev/null 2>&1; then
  echo "Port 8766 already occupied; refusing unknown service"; exit 2
fi
python3 -u "$ART/unavailable.py" "$ART/service-requests.jsonl" >"$ART/unavailable.log" 2>&1 &
DUMMY_PID=$!
stage="unavailable-service"; echo "Stage: $stage"
HTTP_CODE=000
for _ in $(seq 1 10); do
  kill -0 "$DUMMY_PID"
  HTTP_CODE="$(curl -s -o "$ART/unavailable-response.txt" -w '%{http_code}' -m 3 -H 'X-Smoke-Probe: preflight' http://127.0.0.1:8766/api/health || true)"
  [ "$HTTP_CODE" = 500 ] && break
  sleep 1
done
[ "$HTTP_CODE" = 500 ]
echo "Verified unavailable service: HTTP $HTTP_CODE"
stage="normal-app-launch"; echo "Stage: $stage"
LAUNCH_TIME="$(date +%s)"
open -n -a "$APP" "$FIXTURE" >"$ART/open.log" 2>&1 &
OPEN_PID=$!
for _ in $(seq 1 20); do
  APP_PID="$(pgrep -x VibeReader | head -1 || true)"
  [ -n "$APP_PID" ] && break
  sleep 1
done
[ -n "$APP_PID" ]
[ "$(ps -p "$APP_PID" -o comm=)" = "$APP/Contents/MacOS/VibeReader" ]
stage="startup-settle"; echo "Stage: $stage pid=$APP_PID"
sleep 12
sample_host
stage="acknowledge-real-service-error"; echo "Stage: $stage"
# The normal unavailable-service path presents a real blocking alert. Observe
# its exact text and acknowledge its native button; never suppress the alert.
screencapture -x "$ART/service-error-screen.png" 2>/dev/null || true
osascript - "$APP_PID" >"$ART/service-error-AX.txt" 2>&1 <<'APPLESCRIPT' &
on run argv
 tell application "System Events"
  tell (first process whose unix id is (item 1 of argv as integer))
   set frontmost to true
   set observedText to ""
   set observedElements to get entire contents of window 1
   repeat with elementReference in observedElements
    set observedElement to contents of elementReference
    if class of observedElement is static text then
     set observedText to observedText & (value of observedElement as text) & linefeed
    end if
   end repeat
   log observedText
   if observedText does not contain "知识库服务无法启动" then error "Expected real missing-service alert was not observed"
   if (count of (buttons of window 1 whose name is "好")) is not 1 then error "Expected unique native acknowledgement button was not observed"
   click button "好" of window 1
   log "Acknowledged real missing-service alert with native 好 button"
  end tell
 end tell
end run
APPLESCRIPT
ALERT_PID=$!
ALERT_DONE=0
for _ in $(seq 1 20); do
  if ! kill -0 "$ALERT_PID" 2>/dev/null; then ALERT_DONE=1; break; fi
  sleep 1
done
if [ "$ALERT_DONE" != 1 ]; then
  kill "$ALERT_PID" 2>/dev/null || true
  wait "$ALERT_PID" 2>/dev/null || true
  cat "$ART/service-error-AX.txt"
  echo "Real service-alert acknowledgement timed out"; exit 124
fi
ALERT_STATUS=0; wait "$ALERT_PID" || ALERT_STATUS=$?
cat "$ART/service-error-AX.txt"
[ "$ALERT_STATUS" = 0 ]
sleep 3
stage="first-page-OCR"; echo "Stage: $stage"
swift "$ROOT/scripts/reader-root-capture.swift" "$APP_PID" reader-startup-sample "$ART/page-1.png" 第一章
menu_action() {
  local action="$1" action_pid status
  osascript - "$APP_PID" "$action" <<'APPLESCRIPT' &
on run argv
 tell application "System Events"
  tell (first process whose unix id is (item 1 of argv as integer))
   set frontmost to true
   click menu item (item 2 of argv) of menu "Go" of menu bar item "Go" of menu bar 1
  end tell
 end tell
end run
APPLESCRIPT
  action_pid=$!
  for _ in $(seq 1 20); do
    if ! kill -0 "$action_pid" 2>/dev/null; then
      status=0; wait "$action_pid" || status=$?
      return "$status"
    fi
    sleep 1
  done
  kill "$action_pid" 2>/dev/null || true
  wait "$action_pid" 2>/dev/null || true
  echo "Real menu action timed out after 20 seconds: $action"
  return 124
}
stage="next-page-menu"; echo "Stage: $stage"
menu_action "Next Page"
sleep 3
stage="second-page-OCR"; echo "Stage: $stage"
swift "$ROOT/scripts/reader-root-capture.swift" "$APP_PID" reader-startup-sample "$ART/page-2.png" 第二章
! cmp -s "$ART/page-1.png.txt" "$ART/page-2.png.txt"
stage="previous-page-menu"; echo "Stage: $stage"
menu_action "Previous Page"
sleep 3
stage="returned-first-page-OCR"; echo "Stage: $stage"
swift "$ROOT/scripts/reader-root-capture.swift" "$APP_PID" reader-startup-sample "$ART/recovery-page-1.png" 第一章
stage="App-unavailable-service-request"; echo "Stage: $stage"
python3 - "$ART/service-requests.jsonl" "$LAUNCH_TIME" <<'PYTHON'
import json, sys
with open(sys.argv[1], encoding="utf-8") as log:
    records = [json.loads(line) for line in log]
for record in records:
    print("Observed service request:", json.dumps(record))
assert any(r["time"] >= int(sys.argv[2]) and r["path"] == "/api/health"
           and not r["probe"] and not r["ua"].lower().startswith("curl/")
           and ("VibeReader" in r["ua"] or "CFNetwork" in r["ua"])
           for r in records), "No attributed real App health request after launch"
PYTHON
kill -0 "$APP_PID"
echo "READER_ROOT_SMOKE_PASS: normal root, actual PDF text, Next/Previous navigation, reading/navigation with unavailable service"
