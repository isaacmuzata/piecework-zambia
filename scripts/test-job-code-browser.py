"""Browser test for the job-code lookup (Nov 10, 2026): a new user who just
installed the app should be able to type a job's number and jump straight
to it, e.g. code 135 opens the Yango bicycle rider job.

The test registers a poster through the real signup API on a throwaway
DB, creates an open job and a draft job, then in a real browser:
  - home view: typing the open job's code lands on its detail page, and
    the detail shows "Job code: <id>";
  - Find Jobs view: typing a bogus code shows "No job with that code.
    Check the number and try again." and stays on the list;
  - Find Jobs view as a different user: typing the draft job's code shows
    the same not-found message (no draft leak).

Usage: /tmp/pw-venv3/bin/python scripts/test-job-code-browser.py
Spawns the server against a fresh throwaway DB in /tmp. Nothing here
touches the live Turso database.
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

PORT = 3201
BASE = f"http://127.0.0.1:{PORT}"
DB_FILE = "/tmp/pwz-job-code-browser.db"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

failures = []


def check(name, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"  ({detail})"))
    if not ok:
        failures.append(name)


class Api:
    """Tiny API client with a cookie jar, for setup only. Keeps the
    pw_token auth cookie: the server sets pw_device AND pw_token on
    verify, and taking only the first Set-Cookie header keeps the
    device cookie, which does not authenticate."""

    def __init__(self):
        self.cookie = ""

    def req(self, method, path, body=None):
        headers = {"Content-Type": "application/json"}
        if self.cookie:
            headers["Cookie"] = self.cookie
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(r) as resp:
                for sc in resp.headers.get_all("Set-Cookie") or []:
                    if sc.startswith("pw_token="):
                        self.cookie = sc.split(";")[0]
                return resp.status, json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as e:
            for sc in e.headers.get_all("Set-Cookie") or []:
                if sc.startswith("pw_token="):
                    self.cookie = sc.split(";")[0]
            return e.code, json.loads(e.read() or b"{}")


def norm_phone(raw):
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("260"):
        return "+" + digits
    if digits.startswith("0"):
        return "+260" + digits[1:]
    return "+" + digits


def latest_signup_code(phone):
    norm = norm_phone(phone)
    for _ in range(40):
        con = sqlite3.connect(DB_FILE)
        row = con.execute(
            "SELECT body FROM sms_log WHERE phone = ? AND kind = 'signup_code' ORDER BY id DESC LIMIT 1",
            (norm,),
        ).fetchone()
        con.close()
        if row:
            m = re.search(r"signup code is (\d{6})", row[0] or "")
            if m:
                return m[1]
        time.sleep(0.25)
    raise RuntimeError("no signup code found in sms_log for " + norm)


def register_user(name, phone):
    api = Api()
    st, js = api.req("POST", "/api/auth/register", {
        "name": name, "phone": phone, "password": "test-pass-123",
        "city": "Lusaka", "avatar": IMG, "selfie": IMG,
    })
    assert st == 200 and js.get("verification_required"), f"register start failed: {st} {js}"
    code = latest_signup_code(phone)
    st, js = api.req("POST", "/api/auth/register/verify", {"phone": phone, "code": code})
    assert st == 201 and api.cookie, f"register verify failed: {st} {js}"
    return api


def wait_up(timeout=60):
    for _ in range(timeout * 2):
        try:
            with urllib.request.urlopen(BASE + "/", timeout=5) as r:
                if r.status:
                    return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError("server did not come up")


def main():
    try:
        os.unlink(DB_FILE)
    except FileNotFoundError:
        pass
    env = dict(os.environ)
    env.pop("TURSO_DATABASE_URL", None)
    env.pop("TURSO_AUTH_TOKEN", None)
    env.update({
        "DB_PATH": DB_FILE, "PORT": str(PORT),
        "VAPID_PUBLIC_KEY": "", "VAPID_PRIVATE_KEY": "",
        "MAIL_TRANSPORT": "stream",
        "BREVO_SMTP_USER": "test@smtp-brevo.com", "BREVO_SMTP_PASS": "test-key",
    })
    server = subprocess.Popen(
        ["node", "server.js"], cwd=ROOT, env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        wait_up()

        poster = register_user("Code Poster", "0970000501")
        st, js = poster.req("POST", "/api/jobs", {
            "title": "Test code lookup job", "category": "Gardening",
            "description": "Cut the grass and tidy the yard.",
            "city": "Lusaka", "area": "Kabulonga", "date_needed": "2027-06-01",
            "pay_amount": 150, "pay_type": "per_day",
            "workers_needed": 1, "terms_accepted": True,
        })
        assert st in (200, 201), f"job create failed: {st} {js}"
        job_id = (js.get("job") or js).get("id")
        assert job_id, f"no job id in {js}"

        # Draft via the real draft path: only a title is required.
        st, js = poster.req("POST", "/api/jobs", {
            "title": "Test draft job", "draft": True,
        })
        assert st in (200, 201), f"draft job create failed: {st} {js}"
        draft_id = (js.get("job") or js).get("id")
        assert draft_id, f"no draft job id in {js}"

        other = register_user("Code Other", "0970000502")
        token = poster.cookie.split("=", 1)[1]
        other_token = other.cookie.split("=", 1)[1]

        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 390, "height": 844})
            ctx.add_cookies([{"name": "pw_token", "value": token,
                              "domain": "127.0.0.1", "path": "/"}])
            page = ctx.new_page()

            # --- Home view: real code lands on the job detail ---
            page.goto(BASE + "/#/", wait_until="networkidle")
            page.wait_for_selector("#home-code", timeout=15000)
            check("home view shows the job code lookup", True)
            page.fill("#home-code", f"  {job_id}  ")
            page.click("#home-code-btn")
            page.wait_for_url(f"**#/job/{job_id}", timeout=15000)
            check("home lookup navigates to the job detail",
                  f"#/job/{job_id}" in page.url, page.url)
            page.wait_for_selector("#job-code", timeout=15000)
            code_text = page.inner_text("#job-code")
            check("job detail shows the job code label",
                  code_text.strip() == f"Job code: {job_id}", code_text)
            check("job detail shows the job title",
                  "Test code lookup job" in page.content())

            # --- Find Jobs view: bogus code shows the not-found message ---
            page.goto(BASE + "/#/jobs", wait_until="networkidle")
            page.wait_for_selector("#browse-code", timeout=15000)
            page.fill("#browse-code", "999999")
            page.click("#browse-code-btn")
            page.wait_for_selector("#browse-code-msg:not([hidden])", timeout=15000)
            msg = page.inner_text("#browse-code-msg")
            check("bogus code shows the not-found message",
                  msg.strip() == "No job with that code. Check the number and try again.", msg)
            check("bogus code stays on Find Jobs", "#/jobs" in page.url, page.url)

            # --- Find Jobs view: non-digit code shows the same message ---
            page.fill("#browse-code", "abc")
            page.click("#browse-code-btn")
            page.wait_for_function(
                "document.querySelector('#browse-code-msg') && "
                "!document.querySelector('#browse-code-msg').hidden",
                timeout=15000)
            msg2 = page.inner_text("#browse-code-msg")
            check("non-digit code shows the not-found message",
                  msg2.strip() == "No job with that code. Check the number and try again.", msg2)

            # --- Draft job: another user gets the same message, no leak ---
            ctx2 = browser.new_context(viewport={"width": 390, "height": 844})
            ctx2.add_cookies([{"name": "pw_token", "value": other_token,
                               "domain": "127.0.0.1", "path": "/"}])
            page2 = ctx2.new_page()
            page2.goto(BASE + "/#/jobs", wait_until="networkidle")
            page2.wait_for_selector("#browse-code", timeout=15000)
            page2.fill("#browse-code", str(draft_id))
            page2.click("#browse-code-btn")
            page2.wait_for_selector("#browse-code-msg:not([hidden])", timeout=15000)
            msg3 = page2.inner_text("#browse-code-msg")
            check("draft code shows the not-found message, no leak",
                  msg3.strip() == "No job with that code. Check the number and try again.", msg3)
            check("draft code does not navigate away",
                  "#/jobs" in page2.url, page2.url)
            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()

    print(f"\nJOB CODE TESTS: {len(failures)} failed")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
