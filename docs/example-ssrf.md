# Worked example — audit → fix → prove, no human writing code

This is a representative run of the dev team on a common real-world bug: a server-side **image-proxy** endpoint with an **SSRF** hole. Hosts, ports, and paths below are **generic placeholders** for illustration.

> The point of the example isn't the bug — it's the *process*: how six agents catch, fix, and prove a change with a manager gate that trusts nothing.

## The task (one prompt)
> "Review the security of my image-proxy endpoint `/img`, and fix anything you find."

## What the team did

### 🔵 security — found it (static review)
> `/img` fetches a user-supplied URL with no host validation — only an `http/https` prefix check. That's SSRF + an open proxy. Also: `image-fetch` has no permission gate, and no fetch client re-validates redirects. *(5 findings, ranked, with file:line and a fix for each — and an honest "checked & OK" list of what was already safe.)*

### 🔴 hacker — proved it (non-destructive probes)
```
GET /img?u=https://example.com/favicon.ico   → 200  image/x-icon   # open proxy: relays arbitrary content
GET /img?u=http://127.0.0.1:<port>/          → 404                 # internal service is UP (state oracle)
GET /img?u=http://127.0.0.1:1/               → 502                 # port closed
GET /img?u=gopher://127.0.0.1/  &  file:///  → 400                 # non-http(s) correctly blocked
```
> Broke in — SSRF + open proxy + internal port scanner. It also **corrected the brief** (the real query param differed from what was assumed) — because it read the code and tested, instead of trusting the description. It deliberately did **not** exfiltrate cloud-metadata secrets — reported reachability only.

### 📋 manager — ruled REVISE, divided the fix
Independently re-read every file to confirm the claims, then wrote a concrete spec: *one shared hardened HTTP client whose dialer validates the **resolved IP at connect time** (defeats DNS-rebind + redirect-to-internal), wire it into every fetch client, and add the missing permission gate.* Assigned a task + acceptance criterion to each member.

### 🟢 coder — wrote the real code
Created a single `httpx` helper (a `net.Dialer.Control` hook that rejects loopback/private/link-local/CGNAT/unspecified IPs, plus a redirect guard), wired it into all fetch clients, consolidated the denylist, and added the permission gate. Build + vet green. **No stubs. Did not deploy.**

### 🔴 hacker (round 2) + 🟢 tester — verified the fix
Hacker re-attacked the patched source (encoded IPs, IPv4-mapped IPv6, redirect-to-loopback, DNS-rebind, an unwired path…): **COULD NOT BREAK IN — zero breaches.** Tester ran the full `build` + `vet` on the whole module: **green.**

### 📋 manager (gate) — PASS
Re-ran the two load-bearing exploits against real sockets itself, re-read the diff, confirmed every claim, and only then returned **PASS** — with the residual risk surfaced explicitly, not silently shipped.

## Result
- Critical SSRF closed at the only unbypassable layer, in one shared helper.
- Every claim independently verified by the gate — no "trust me, it works."
- Code edited, **not deployed** — the human reviews the `git diff` and ships.

**One prompt → researched, planned, coded, attacked, tested, and gated — automatically.**
