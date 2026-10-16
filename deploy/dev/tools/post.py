#!/usr/bin/env python3
"""Post messages to a running irvc dev server as a seed user.

Single:  post.py -u sean -m "hello" [--at "2026-10-12 09:30"]
Batch:   post.py --jsonl convo.jsonl      (lines: {"user","text","at"?})

Messages go through the real API (auth, validation, websocket broadcast).
The API stamps messages with the current time, so when --at is given the
row's created_at is rewritten in the sqlite db afterwards (--db, default
./irvc.db). Post in chronological order: history is ordered by message id.
"""
import argparse, json, sqlite3, sys, time
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import HTTPError

def parse_at(s):
    if s.isdigit():
        return int(s)
    return int(datetime.fromisoformat(s).timestamp())  # naive = local time

class Client:
    def __init__(self, base):
        self.base, self.cookies = base.rstrip("/"), {}

    def call(self, method, path, body=None, user=None):
        data = json.dumps(body).encode() if body is not None else None
        req = Request(self.base + path, data=data, method=method,
                      headers={"Content-Type": "application/json"})
        # Session cookies are Secure, which urllib's jar refuses over http.
        if user in self.cookies:
            req.add_header("Cookie", self.cookies[user])
        try:
            resp = urlopen(req)
        except HTTPError as e:
            sys.exit(f"{method} {path}: {e.code} {e.read().decode()}")
        if path == "/api/login":
            self.cookies[user] = resp.headers["Set-Cookie"].split(";")[0]
        return json.load(resp)

    def login(self, user, password):
        if user not in self.cookies:
            self.call("POST", "/api/login", {"username": user, "password": password}, user)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-u", "--user")
    ap.add_argument("-m", "--message")
    ap.add_argument("--at", help="ISO local time or unix seconds")
    ap.add_argument("--jsonl")
    ap.add_argument("--channel", default="general", help="text channel name")
    ap.add_argument("--password", default="11111111")
    ap.add_argument("--url", default="http://localhost:8080")
    ap.add_argument("--db", default="irvc.db")
    a = ap.parse_args()

    if a.jsonl:
        items = [json.loads(l) for l in open(a.jsonl) if l.strip()]
    elif a.user and a.message:
        items = [{"user": a.user, "text": a.message, "at": a.at}]
    else:
        ap.error("need --user and --message, or --jsonl")

    c = Client(a.url)
    first = items[0]["user"]
    c.login(first, a.password)
    chans = c.call("GET", "/api/channels", user=first)
    chan = next(x["id"] for x in chans if x["type"] == "text" and x["name"] == a.channel)

    db = sqlite3.connect(a.db, timeout=5) if any(i.get("at") for i in items) else None
    for i in items:
        c.login(i["user"], a.password)
        m = c.call("POST", f"/api/channels/{chan}/messages", {"body": i["text"]}, i["user"])
        if i.get("at"):
            db.execute("UPDATE messages SET created_at = ? WHERE id = ?", (parse_at(str(i["at"])), m["id"]))
            db.commit()
        time.sleep(0.02)
    print(f"posted {len(items)} message(s) to #{a.channel}")

main()
