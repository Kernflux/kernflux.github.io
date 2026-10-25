---
title: "Self-hosting E2B: run E2B code sandboxes on your own servers"
date: 2026-10-25
author: Kernflux
description: "Two ways to self-host E2B, and a step-by-step E2B-compatible code sandbox with open-source OpenDsec: one-machine install, code interpreter, fork and snapshots."
---

# Self-hosting E2B: run E2B code sandboxes on your own servers

[E2B](https://e2b.dev) is one of the most used code execution sandboxes for AI agents: the code an agent writes runs in an isolated Firecracker microVM, and many agent frameworks support E2B. But E2B is mainly a hosted cloud service, so your code and data go to E2B's cloud. When data must stay on your network, the network is air-gapped, or you run enough sandboxes that the hosted price stops making sense, you self-host.

The short version. There are two ways to self-host E2B:

1. **E2B's own open-source runtime** ([e2b-dev/runtime](https://github.com/e2b-dev/runtime), Apache-2.0). It can be self-hosted on one machine (Embed); deploying into your own cloud account (BYOC) is an enterprise feature.
2. **OpenDsec's E2B gateway.** [OpenDsec](https://github.com/Kernflux/opendsec) is an open-source sandbox platform with a gateway that serves the E2B API. Code written for the E2B SDK runs unchanged on your own machine or cluster after you set three environment variables.

This post walks through the second: a single-machine install, calling it with the E2B SDK, setting up the code interpreter, growing into a cluster, and how it differs from E2B.

## Step 1: install on one machine

You need a Linux x86_64 machine (tested on Ubuntu 24.04) with systemd and cgroup v2. For microVMs (Firecracker, as in E2B) you also need `/dev/kvm`: bare metal, or a cloud VM with nested virtualization.

```sh
sudo -i                                    # the rest runs as root
apt update && apt install -y make git python3-venv
curl -fsSL https://go.dev/dl/go1.27.3.linux-amd64.tar.gz | tar -C /usr/local -xz
git clone https://github.com/kernflux/opendsec && cd opendsec
deploy/quickstart.sh
```

The script builds the binaries, downloads Firecracker and the guest kernel, and installs every service, **including the E2B gateway** (port 7400) with a template named `base` (Python 3.12). On a fresh 8-core VM the whole run took about 11 minutes, most of it building.

## Step 2: call it with the E2B SDK

The install writes `/root/opendsec-ops/demo.env`, which already holds the three variables the E2B SDK reads:

```sh
. /root/opendsec-ops/demo.env       # sets E2B_API_URL, E2B_SANDBOX_URL, E2B_API_KEY
python3 -m venv .venv && .venv/bin/pip install e2b
```

`E2B_API_KEY` is an OpenDsec token. From here the code is exactly what you would write for E2B's cloud (run it with `.venv/bin/python`):

```python
from e2b import Sandbox

sbx = Sandbox.create()                          # template "base"
print(sbx.commands.run("python3 -V").stdout)
sbx.files.write("/tmp/a.txt", "hello")
print(sbx.files.read("/tmp/a.txt"))
sbx.kill()
```

To call it from another machine, point the three variables at this machine:

```sh
export E2B_API_URL=http://<gateway>:7400
export E2B_SANDBOX_URL=http://<gateway>:7400
export E2B_API_KEY=<your OpenDsec token>
```

The JS/TS SDK works too (Node.js 22.19 or newer).

## Fork, snapshots and pause

On microVMs, fork, snapshots and pause all keep **memory**, so running processes carry on:

```python
from e2b import Sandbox

src = Sandbox.create(timeout=300)
src.files.write("/tmp/state", "v1")

forks = src.fork(count=2)                       # two copies of the running sandbox
snap = src.create_snapshot()                    # a snapshot
again = Sandbox.create(snap.snapshot_id)        # a sandbox from the snapshot

# Pause instead of ending at the timeout; connect resumes
s = Sandbox.create(timeout=60, lifecycle={"on_timeout": "pause", "auto_resume": True})
s2 = Sandbox.connect(s.sandbox_id)

for x in [src, *forks, again, s2]:
    x.kill()
```

Forks suit an agent's tree search, or fanning out many RL rollouts from one prepared environment.

## Step 3: set up the code interpreter

E2B's code interpreter (`run_code`, with results, charts and pandas tables) needs a template of its own. OpenDsec builds it from E2B's open-source code-interpreter server: a memory snapshot of a microVM already running that server and a Python Jupyter kernel, so a new sandbox runs code at once.

The build installs packages inside the sandbox, so the machine needs access to apt mirrors and PyPI. Still in the `opendsec` directory:

```sh
curl -fsSL https://codeload.github.com/e2b-dev/code-interpreter/tar.gz/refs/heads/main | tar -xz
. /root/opendsec-ops/env                        # the admin token: publishing into the root project
.venv/bin/pip install ./sdk/python
.venv/bin/python deploy/e2b/build-code-interpreter.py code-interpreter-main/template
```

That builds the image `root/code-interpreter:v1`. Add a template for it under `e2b.templates` in `/root/opendsec-ops/opendsec.json`:

```json
"code-interpreter-v1": {"image": "root/code-interpreter:v1", "backend": "microvm", "cpu": 2, "memory_mb": 2048}
```

Push the config and restart:

```sh
export OPENDSEC_OPS=/root/opendsec-ops
deploy/prod/opendsecops push-config all && deploy/prod/opendsecops restart
```

Callers then install `e2b-code-interpreter` and use it:

```python
from e2b_code_interpreter import Sandbox

sbx = Sandbox.create("code-interpreter-v1")
print(sbx.run_code("6 * 7").text)               # 42
```

## Speed

Measured on 2026-10-23 on the project's bare-metal test machines (AMD EPYC 9Y24), through the gateway, on Firecracker microVMs:

| Operation | Time |
|---|---|
| `Sandbox.create()`, template `base` (2 vCPU, 1 GB, cold start) | p50 166 ms |
| First command after create | p50 12 ms |
| `Sandbox.create("code-interpreter-v1")` (2 GB memory snapshot) | about 250 ms |
| First `run_code` | about 40 ms |
| `fork(count=2)` | about 100–150 ms |
| `create_snapshot()` | about 40–70 ms |
| `Sandbox.create(snapshot_id)` | about 65–85 ms |

## Growing into a cluster

If one machine is enough, stop here. With more sandboxes, OpenDsec grows into a multi-machine cluster ([deployment docs](/en/docs/cluster)), and the E2B gateway into several replicas:

1. In the cluster config's `e2b` section, list the gateways' addresses, the project sandboxes go into, and the templates.
2. Give nodes the fleet role `e2b=<index>`.
3. Put a load balancer in front: TCP 7400, health check HTTP 9467 `/readyz`.

The gateway keeps no state of its own and makes every call to OpenDsec with the caller's token, so permissions, quotas and audit records apply as usual.

## How it differs from E2B's cloud

The full list is in [E2B compatibility](/en/docs/e2b). The main points:

| | E2B | OpenDsec gateway |
|---|---|---|
| Templates | Built with E2B's template build | An admin maps template names to OpenDsec images in the config; no template build API |
| Sandbox ports | Can be public | Need the token (the SDK sends it) |
| Filesystem-only pause | Supported | Refused (400): pause always keeps memory |
| Filesystem-only snapshots | Supported | Refused (400) on microVMs; container snapshots are filesystem-only anyway |
| Code interpreter languages | Python, JavaScript, R, Java, Bash | Python |
| Not supported | | Directory watching, signed file URLs, MCP, volumes |

Options the gateway cannot honour return 400 instead of being ignored, so a program never runs without a setting it asked for.

## E2B self-hosted or OpenDsec?

- **E2B self-hosted (Embed)** suits one machine that is enough and a preference for E2B's own code; deploying into your own cloud account (BYOC) is an E2B enterprise feature.
- **OpenDsec** suits multi-machine clusters, air-gapped installs, large bursts of creation such as RL rollouts, or wanting containers, QEMU VMs and task-level pause besides the E2B SDK. The cost is the compatibility gaps above, and the project is still 0.x.

More in [OpenDsec compared with E2B, Daytona and Modal](/en/docs/compare).

## FAQ

### Can E2B be self-hosted?

Yes. E2B's runtime is open source (Apache-2.0) and can be self-hosted on one machine; deploying into your own cloud account is an enterprise feature. Alternatively, OpenDsec's E2B gateway serves the API the E2B SDK calls on your own machine or cluster.

### Do I need to change my E2B code to use OpenDsec?

No. Set `E2B_API_URL`, `E2B_SANDBOX_URL` and `E2B_API_KEY` to point the SDK at the gateway. Features the gateway lacks, such as directory watching, return a clear error.

### Does it support E2B's code interpreter?

Yes. Build the template with `deploy/e2b/build-code-interpreter.py` and `run_code` works, with results, logs, errors, charts and pandas tables. Only the Python kernel for now.

### Does it work on a cloud VM without KVM?

Yes. Without `/dev/kvm` the install sets up containers only, and the gateway's `base` template uses the container backend. Fork and snapshots then keep only the file system, and the code interpreter template needs microVMs.

### Can it run fully offline?

Yes. OpenDsec has an offline bundle (`deploy/offline`); we tested installing it and using the E2B SDK on a VM with no internet access. See [Install](/en/docs/install).

### What does self-hosting cost?

OpenDsec is free, open-source software (server AGPL-3.0, SDKs Apache-2.0); you only need your own machines.

## Further reading

- [E2B compatibility: what works and what differs](/en/docs/e2b)
- [Quickstart](/en/docs/quickstart)
- [Multi-machine cluster deployment](/en/docs/cluster)
- [DeepSeek's DSec paper](/en/blog/posts/dsec-paper): where OpenDsec's design comes from

*OpenDsec is not affiliated with E2B; it implements the API the E2B SDK calls. What this post says about E2B comes from its documentation and repositories, checked on 2026-10-25.*
