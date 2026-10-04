"""Run one native stage against the same isolated API as the browser acquisition test.

Requires SIDESEAT_SHARE_QA_DIR (including source-manifest.json),
SIDESEAT_SHARE_SIMULATOR_ID, and a prior build-for-testing in QA_DIR/DerivedData.
The system may ask to allow the test runner to read the copied share URL.
"""
from pathlib import Path
import json
import os
import plistlib
import subprocess
import sys

out = Path(os.environ["SIDESEAT_SHARE_QA_DIR"]).resolve()
simulator = os.environ["SIDESEAT_SHARE_SIMULATOR_ID"]
products = Path(os.environ.get("SIDESEAT_SHARE_TEST_PRODUCTS", str(out / "DerivedData/Build/Products")))
bases = list(products.glob("SideSeat-Development_*.xctestrun"))
assert len(bases) == 1, "Build the Development UI tests for this simulator first"
name, *methods = sys.argv[1:]
assert name.replace("-", "").isalnum() and methods
result = out / (name + ".xcresult")
assert not result.exists(), "Preserve previous run evidence instead of overwriting it"
settings = plistlib.loads(bases[0].read_bytes())
for target in ("SideSeatTests", "SideSeatUITests"):
    settings[target].setdefault("EnvironmentVariables", {}).update(
        SIDESEAT_LIVE_API_BASE_URL=os.environ.get("PLAYWRIGHT_BASE_URL", "http://127.0.0.1:3033"),
        SIDESEAT_LIVE_UI_TESTS="1",
    )
    settings[target]["EnvironmentVariables"].update({
        k: v for k, v in os.environ.items() if k.startswith("SIDESEAT_SHARE_")
    })
run = products / ("ShareAcquisition-" + name + ".xctestrun")
run.write_bytes(plistlib.dumps(settings))
(out / (name + "-source-manifest.json")).write_bytes((out / "source-manifest.json").read_bytes())
args = ["xcodebuild", "test-without-building", "-quiet", "-xctestrun", str(run),
        "-destination", "platform=iOS Simulator,id=" + simulator, "-parallel-testing-enabled", "NO",
        "-resultBundlePath", str(result)] + ["-only-testing:" + method for method in methods]
with (out / (name + ".log")).open("w") as log:
    process = subprocess.run(args, stdout=log, stderr=subprocess.STDOUT)
if result.exists():
    summary = json.loads(subprocess.check_output([
        "xcrun", "xcresulttool", "get", "test-results", "summary", "--path", str(result)
    ]))
    (out / (name + "-summary.json")).write_text(json.dumps(summary, indent=2) + "\n")
    attachments = out / (name + "-attachments")
    subprocess.run(["xcrun", "xcresulttool", "export", "attachments", "--path", str(result),
                    "--output-path", str(attachments)], check=True, stdout=subprocess.DEVNULL)
    for item in json.loads((attachments / "manifest.json").read_text()):
        for attachment in item.get("attachments", []):
            if "share93-copied-share-url" in attachment.get("suggestedHumanReadableName", ""):
                (out / "copied-share-url.txt").write_bytes((attachments / attachment["exportedFileName"]).read_bytes())
    print(json.dumps(summary, indent=2))
raise SystemExit(process.returncode)
