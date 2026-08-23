"""Small stdio bridge for the published DeepSeek Harness Python SDK."""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path


def main() -> int:
    try:
        request = json.load(sys.stdin)
        from deepseek_harness import DeepSeekHarness

        cwd = str(Path(request["cwd"]).resolve())
        session_root = str(Path(request["session_root"]).resolve())
        Path(session_root).mkdir(parents=True, exist_ok=True)
        kwargs = {
            "provider": request.get("provider") or "deepseek-official",
            "model": request.get("model") or "deepseek-v4-flash",
            "cwd": cwd,
            "session_root": session_root,
        }
        if request.get("max_tokens") is not None:
            kwargs["max_tokens"] = int(request["max_tokens"])
        if request.get("cordis"):
            kwargs["cordis"] = str(Path(request["cordis"]).resolve())
        with DeepSeekHarness(**kwargs) as harness:
            result = harness.run(str(request.get("prompt") or ""), session_id=request["session_id"])
        print(json.dumps({
            "ok": True,
            "session_id": result.session_id,
            "final_response": result.final_response,
            "finish_reason": result.finish_reason,
        }, ensure_ascii=False))
        return 0
    except Exception as exc:  # The parent adapter converts this to a stable error.
        print(json.dumps({
            "ok": False,
            "error": {"code": "HARNESS_CRASHED", "message": str(exc)},
        }, ensure_ascii=False))
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
