#!/usr/bin/env python3
"""Upload one backup file to Backblaze B2 and verify the remote object.

Standard library only (no install needed). Talks to the B2 native API over TLS.

Credentials are read ONLY from the environment (B2_KEY_ID, B2_APPLICATION_KEY,
B2_BUCKET_NAME), injected by systemd's EnvironmentFile. They are never accepted
as arguments (which would show up in `ps`) and are never printed or logged.
Only the object name, size, SHA-1 and B2's upload timestamp are printed.

Usage:
  b2-upload.py --check                 authorize only; print bucket + key capabilities
  b2-upload.py <local-file> [prefix]   upload to <prefix>/<basename> (default prefix: gco-postgres)

Exit codes: 0 ok, 3 config/credentials problem, 4 upload failed, 5 verification failed.
"""
import base64
import hashlib
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

AUTH_URL = "https://api.backblazeb2.com/b2api/v3/b2_authorize_account"
TIMEOUT = 60
UPLOAD_ATTEMPTS = 3
MAX_SIMPLE_UPLOAD = 4 * 1024**3  # B2 simple upload limit is 5 GB; stay below it


class B2Error(Exception):
    def __init__(self, msg, code):
        super().__init__(msg)
        self.code = code


def env(name):
    v = os.environ.get(name, "").strip()
    if not v:
        raise B2Error(f"{name} is not set (credentials not configured)", 3)
    return v


def api_json(url, token=None, body=None, basic=None):
    headers = {}
    if basic:
        headers["Authorization"] = "Basic " + base64.b64encode(basic.encode()).decode()
    elif token:
        headers["Authorization"] = token
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e)
            detail = f"{err.get('code')}: {err.get('message')}"
        except Exception:
            detail = str(e.code)
        raise B2Error(f"B2 API {e.code} ({detail})", 3 if e.code in (401, 403) else 4)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise B2Error(f"B2 network error: {type(e).__name__}", 4)


def authorize():
    d = api_json(AUTH_URL, basic=f"{env('B2_KEY_ID')}:{env('B2_APPLICATION_KEY')}")
    sa = d.get("apiInfo", {}).get("storageApi", {})
    legacy = d.get("allowed", {})
    token = d["authorizationToken"]
    api_url = sa.get("apiUrl") or d.get("apiUrl")
    bucket_id = sa.get("bucketId") or legacy.get("bucketId")
    bucket_name = sa.get("bucketName") or legacy.get("bucketName")
    caps = sa.get("capabilities") or legacy.get("capabilities") or []
    return token, api_url, bucket_id, bucket_name, caps


def resolve_bucket(token, api_url, bucket_id, bucket_name, want_name):
    if bucket_name and bucket_name != want_name:
        raise B2Error("credential is restricted to a different bucket than B2_BUCKET_NAME", 3)
    if bucket_id:
        return bucket_id
    raise B2Error("credential is not bucket-scoped; refusing (use a bucket-restricted key)", 3)


def sha1_of(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def upload_once(token, api_url, bucket_id, path, remote_name, size, sha1):
    up = api_json(f"{api_url}/b2api/v3/b2_get_upload_url", token, {"bucketId": bucket_id})
    u = urllib.parse.urlsplit(up["uploadUrl"])
    conn = http.client.HTTPSConnection(u.netloc, timeout=TIMEOUT)
    try:
        conn.putrequest("POST", u.path)
        conn.putheader("Authorization", up["authorizationToken"])
        conn.putheader("X-Bz-File-Name", urllib.parse.quote(remote_name, safe="/"))
        conn.putheader("Content-Type", "b2/x-auto")
        conn.putheader("Content-Length", str(size))
        conn.putheader("X-Bz-Content-Sha1", sha1)
        conn.endheaders()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                conn.send(chunk)
        resp = conn.getresponse()
        body = resp.read()
        if resp.status != 200:
            try:
                err = json.loads(body)
                detail = f"{err.get('code')}: {err.get('message')}"
            except Exception:
                detail = str(resp.status)
            raise B2Error(f"B2 upload rejected {resp.status} ({detail})", 4)
        return json.loads(body)
    except (OSError, http.client.HTTPException) as e:
        raise B2Error(f"B2 upload network error: {type(e).__name__}", 4)
    finally:
        conn.close()


def main(argv):
    try:
        want_bucket = env("B2_BUCKET_NAME")
        token, api_url, bucket_id, bucket_name, caps = authorize()
        bucket_id = resolve_bucket(token, api_url, bucket_id, bucket_name, want_bucket)

        if argv[1:2] == ["--check"]:
            print(f"b2: authorized; bucket={bucket_name}; capabilities={','.join(sorted(caps))}")
            if "writeFiles" not in caps:
                raise B2Error("key lacks required capability: writeFiles", 3)
            risky = [c for c in ("deleteFiles", "readFiles", "writeBucketRetentions", "writeBucketEncryption") if c in caps]
            if risky:
                print("b2: WARNING: key has more power than the backup job needs: " + ",".join(risky)
                      + " (a Write Only key is preferred)")
            if "listFiles" not in caps:
                print("b2: note: no listFiles - uploads will be verified from B2's upload response")
            return 0

        if len(argv) < 2:
            raise B2Error("usage: b2-upload.py <local-file> [prefix]", 3)
        path = argv[1]
        prefix = argv[2] if len(argv) > 2 else "gco-postgres"
        if not os.path.isfile(path) or os.path.getsize(path) == 0:
            raise B2Error("local file missing or empty", 3)
        size = os.path.getsize(path)
        if size > MAX_SIMPLE_UPLOAD:
            raise B2Error("file exceeds simple-upload limit; large-file upload not implemented", 4)
        if "writeFiles" not in caps:
            raise B2Error("key lacks capability: writeFiles", 3)
        remote_name = f"{prefix}/{os.path.basename(path)}"
        sha1 = sha1_of(path)

        last = None
        result = None
        for attempt in range(1, UPLOAD_ATTEMPTS + 1):
            try:
                result = upload_once(token, api_url, bucket_id, path, remote_name, size, sha1)
                last = None
                break
            except B2Error as e:
                last = e
                print(f"b2: upload attempt {attempt}/{UPLOAD_ATTEMPTS} failed: {e}", file=sys.stderr)
                time.sleep(2 * attempt)
        if last:
            raise last

        # Verification. Preferred: list the object back (needs listFiles).
        # Otherwise use B2's own upload response, which B2 only returns after it
        # has stored the file and checked the SHA-1 we sent.
        if "listFiles" in caps:
            d = api_json(f"{api_url}/b2api/v3/b2_list_file_names", token,
                         {"bucketId": bucket_id, "prefix": remote_name, "maxFileCount": 5})
            match = [x for x in d.get("files", []) if x.get("fileName") == remote_name]
            if not match:
                raise B2Error("verification failed: object not found after upload", 5)
            f, how = match[0], "list-back"
        else:
            f, how = result, "upload-response"
        if f.get("fileName") != remote_name or f.get("contentLength") != size or f.get("contentSha1") != sha1:
            raise B2Error("verification failed: remote name/size/sha1 differ from local file", 5)
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(f["uploadTimestamp"] / 1000))
        print(f"b2: verified ({how}) object={remote_name} bytes={size} sha1={sha1} uploaded={ts}")
        return 0
    except B2Error as e:
        print(f"b2: FAILED: {e}", file=sys.stderr)
        return e.code
    except Exception as e:  # never let an unexpected trace (which could embed headers) escape
        print(f"b2: FAILED: unexpected {type(e).__name__}", file=sys.stderr)
        return 4


if __name__ == "__main__":
    sys.exit(main(sys.argv))
