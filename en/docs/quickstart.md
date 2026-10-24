# Get started

Install every OpenDsec component on one Linux machine, then create sandboxes with the Python SDK, the E2B SDK or the command line. On a fresh 8-core VM the whole run takes about 10 minutes, most of it building.

## Requirements

- Linux x86_64 with systemd, cgroup v2 and kernel 5.15 or newer. Fully verified on Ubuntu 24.04.
- With `/dev/kvm` you get microVMs too; without it, containers only. For microVMs, use bare metal or a cloud VM with nested virtualization.
- Run every step below as root: the installer sets up system services and writes its files to `/root/opendsec-ops`.

## 1. Install the prerequisites

```sh
sudo -i
apt update && apt install -y make git python3-venv
curl -fsSL https://go.dev/dl/go1.27.3.linux-amd64.tar.gz | tar -C /usr/local -xz
```

## 2. Install OpenDsec

```sh
git clone https://github.com/kernflux/opendsec
cd opendsec
deploy/quickstart.sh
```

The script:

1. checks the machine, builds the binaries, and downloads Firecracker and the guest kernel, checking each against `deploy/deps.lock`;
2. installs IAM, watcher, apiserver, edge and the E2B gateway as systemd services;
3. imports `python:3.12` and creates the project `root/demo` with a caller;
4. runs one container and one microVM sandbox as a check.

::: tip Other options
- `--no-microvm`: containers only.
- `--kernel FILE`: use a guest kernel you already have instead of downloading it.
- `--build-kernel`: build the guest kernel yourself.
- No internet access on the machine? Use the [offline bundle](/en/docs/deploy#air-gapped).
:::

## 3. Create a sandbox

Load the caller's environment, then install the SDK:

```sh
. /root/opendsec-ops/demo.env
python3 -m venv .venv
.venv/bin/pip install ./sdk/python
.venv/bin/python sdk/python/examples/quickstart.py
```

`demo.env` holds the caller's address, token and CA, and also sets the three variables the E2B SDK reads. Pick any of these:

::: code-group

```python [Python SDK]
import asyncio
from opendsec import DSecClient, DSecRunArgs

async def main():
    # reads OPENDSEC_ADDR, OPENDSEC_TOKEN and friends
    async with DSecClient() as client:
        sb = await client.run_sandbox(DSecRunArgs(
            backend="microvm", image="root/py:3.12",
            cpu_cores_limit=1, memory_limit_mb=1024))
        try:
            r = await sb.run_shell("python3 -c 'print(6*7)'")
            print(r.stdout)
            # four copies, memory included
            forks = await sb.fork(count=4)
            for f in forks:
                await f.stop()
        finally:
            await sb.stop()

asyncio.run(main())
```

```python [E2B SDK]
# pip install e2b
# demo.env already sets E2B_API_URL, E2B_SANDBOX_URL, E2B_API_KEY
from e2b import Sandbox

sbx = Sandbox.create()
print(sbx.commands.run("uname -r").stdout)

# on microVMs the snapshot includes memory
snap = sbx.create_snapshot()
copy = Sandbox.create(snap.snapshot_id)
copy.kill()
sbx.kill()
```

```sh [CLI]
. /root/opendsec-ops/env      # the admin environment
opendsecctl status
ID=$(opendsecctl sandbox create -backend microvm \
      -image root/py:3.12 | grep -m1 '"id"' | cut -d'"' -f4)
opendsecctl exec "$ID" python3 -c 'print(6*7)'
opendsecctl sandbox stop "$ID"
```

:::

## 4. Uninstall

```sh
deploy/quickstart.sh --uninstall
```

## Next

- A multi-node cluster or an offline install: see [Deployment](/en/docs/deploy).
- Moving from E2B: see [docs/E2B.md](/en/docs/e2b).
- Every command: `opendsecctl --help`.
