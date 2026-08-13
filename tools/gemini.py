#!/usr/bin/env python3
"""Gemini helper for the dev-team (design + creative ideation "member").

Reads the API key from env GEMINI_DESIGN_API_KEY, else from
~/.claude/gemini_design.key. Calls Gemini generateContent and prints the reply.
Stdlib only (no pip install).

Usage:
  python gemini.py "give me 3 bold UI ideas for a cafe menu screen"
  echo "prompt" | python gemini.py --system "You are a senior product designer."
  python gemini.py "critique this screenshot" --image shot.png --model gemini-2.5-pro
"""
import sys, os, json, base64, argparse, mimetypes
import urllib.request, urllib.error


def load_key() -> str:
    k = os.environ.get("GEMINI_DESIGN_API_KEY", "").strip()
    if k:
        return k
    p = os.path.join(os.path.expanduser("~"), ".claude", "gemini_design.key")
    try:
        with open(p, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def main() -> int:
    ap = argparse.ArgumentParser(description="Ask Gemini (design/ideation helper).")
    ap.add_argument("prompt", nargs="?", default="", help="prompt (or pipe via stdin)")
    # free-tier key: flash models work; pro/image need billing (429 quota=0 otherwise).
    ap.add_argument("--model", default="gemini-flash-latest", help="e.g. gemini-flash-latest | gemini-3.6-flash | gemini-pro-latest(billing)")
    ap.add_argument("--image", action="append", default=[], help="image path (repeatable)")
    ap.add_argument("--system", default="", help="system instruction")
    args = ap.parse_args()

    prompt = (args.prompt or sys.stdin.read()).strip()
    if not prompt:
        print("ERROR: empty prompt", file=sys.stderr)
        return 2

    key = load_key()
    if not key:
        print("ERROR: no Gemini key (set GEMINI_DESIGN_API_KEY or ~/.claude/gemini_design.key)", file=sys.stderr)
        return 2

    parts = [{"text": prompt}]
    for img in args.image:
        try:
            with open(img, "rb") as f:
                data = base64.b64encode(f.read()).decode()
        except OSError as e:
            print(f"ERROR: cannot read image {img}: {e}", file=sys.stderr)
            return 2
        mime = mimetypes.guess_type(img)[0] or "image/png"
        parts.append({"inline_data": {"mime_type": mime, "data": data}})

    body = {"contents": [{"parts": parts}]}
    if args.system:
        body["system_instruction"] = {"parts": [{"text": args.system}]}

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{args.model}:generateContent"
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            resp = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode(errors='replace')[:600]}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    try:
        text = "".join(p.get("text", "") for p in resp["candidates"][0]["content"]["parts"])
    except (KeyError, IndexError):
        text = json.dumps(resp, ensure_ascii=False)[:2000]
    print(text.strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
