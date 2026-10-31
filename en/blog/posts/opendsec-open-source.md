---
title: "OpenDsec: self-hosted sandboxes for RL rollouts and code-running agents"
date: 2026-10-24
author: Kernflux
description: "An open-source implementation of DeepSeek's DSec sandbox design: Firecracker microVMs that start in 0.16 s, fork with their memory, and pause as a batch. What it is, and how to try it on one machine."
---

# OpenDsec: self-hosted sandboxes for RL rollouts and code-running agents

If you train a model with agentic reinforcement learning, every rollout needs somewhere to run code: install a package, run the tests, hit the network, write files. Thousands of those run at once. When the training job is preempted they all have to stop together and come back later. And when you want to explore one state several ways, you want copies of the environment as it is right now, memory included, not fresh ones from the image.

Hosted sandbox services cover part of this. We wanted all of it on our own machines, so we built [OpenDsec](https://github.com/Kernflux/opendsec) and published it under the AGPL.

This post covers what it does, what it looks like to run, and where its limits are.

## One run, start to finish

![deploy/quickstart.sh, then a microVM sandbox prints 42 and forks into four copies](/demo.svg)

That is a real recording on one bare-metal server: the install script, then a short Python program that creates a Firecracker microVM, runs `print(6*7)` in it and forks it into four copies. The six minutes of building and installing are cut; everything after runs at real speed. The 0.16 s is the whole API call (placement, boot, the in-VM agent ready), measured from the client.

The program is the whole client side:

```python
import asyncio, time
from opendsec import DSecClient, DSecRunArgs

async def main():
    async with DSecClient() as client:
        t = time.perf_counter()
        sb = await client.run_sandbox(DSecRunArgs(backend="microvm", image="root/py:3.12"))
        print(f"ready in {time.perf_counter() - t:.2f}s (whole API call: placement + boot)")
        print((await sb.run_shell("python3 -c 'print(6*7)'")).stdout.strip())
        t = time.perf_counter()
        forks = await sb.fork(count=4)    # copies with memory
        print(f"forked 4 in {time.perf_counter() - t:.2f}s")
        await asyncio.gather(*(s.stop() for s in [sb, *forks]))

asyncio.run(main())
```

## Where the design comes from

DeepSeek described the sandbox platform behind their agentic RL training in [*DeepSeek Elastic Compute (DSec)*](https://arxiv.org/abs/2609.22978). OpenDsec follows that paper: a stateless apiserver, IAM with nested projects and quotas, a watcher that aggregates scheduling state, power-of-k placement where each node has the final say on admission, layered images loaded on demand, a default-deny network policy, and pausing a whole task at once.

Where the paper leaves things open, or where we chose differently, the decisions are ours: nftables and a DNS proxy instead of eBPF for the network policy, any shared file system (NFS, CephFS, JuiceFS) instead of 3FS for images, and Firecracker with memory snapshots as the main backend. The [design document](/en/docs/spec) marks every point as either from the paper or our own.

OpenDsec is an independent project. It is not affiliated with DeepSeek and contains none of its code.

## What you get

- **Three kinds of sandbox** behind one API: Firecracker microVMs, containers, and full QEMU VMs. Exec, files, processes, PTY and HTTP into the sandbox work the same on all of them.
- **Fast microVMs.** About 0.1 s for the VM to boot, about 55 ms to create one from a memory snapshot, about 50 ms to resume one from a pause.
- **Fork with memory.** `fork(count=N)` pauses the source for about 10 ms and gives you N copies with the same processes, imports and open ports. On one node the copies share memory pages; on another node they pull the snapshot from the source node directly.
- **Scale.** One 384-thread node took a burst of 5120 microVMs in 37 s. A two-node cluster took 8192 containers in one burst with no failures.
- **Task-level pause.** Pause every sandbox of a training task in one call, push their memory to swap, resume them later.
- **E2B compatible.** Code written for E2B's SDKs runs against your own machines after changing three environment variables (`E2B_API_URL`, `E2B_SANDBOX_URL`, `E2B_API_KEY`). E2B's own Python and JS SDK checks pass.
- **Operable.** mTLS between all components, a Raft-replicated IAM, Prometheus metrics and alerts, staged rollouts with automatic rollback, offline installs. Restarting or upgrading any component leaves running sandboxes alone.

All numbers are our own measurements on our bare-metal machines; the design document says how each was measured. Your hardware will give different ones. For example, the fork time depends on the file system under the sandbox state: 0.1 s on XFS, which copies memory files by reflink, and about 1 s on ext4, which has to copy them.

## Try it on one machine

You need a Linux x86_64 machine with systemd and cgroup v2 (we test on Ubuntu 24.04). MicroVMs also need `/dev/kvm`, so use bare metal or a cloud VM with nested virtualization; without it you get containers only.

```sh
sudo -i
apt update && apt install -y make git python3-venv
curl -fsSL https://go.dev/dl/go1.27.3.linux-amd64.tar.gz | tar -C /usr/local -xz
git clone https://github.com/kernflux/opendsec && cd opendsec
deploy/quickstart.sh
```

The script checks the machine, builds everything, downloads Firecracker and the guest kernel (checked against pinned hashes), installs the components as systemd services with their own CA, imports `python:3.12` from Docker Hub, and runs one container and one microVM as a check. Then:

```sh
python3 -m venv .venv && .venv/bin/pip install ./sdk/python
. /root/opendsec-ops/demo.env
.venv/bin/python sdk/python/examples/quickstart.py
```

`deploy/quickstart.sh --uninstall` removes all of it again. [Get started](/en/docs/quickstart) has the details, and [Deployment](/en/docs/deploy) covers clusters and offline installs.

## What it is not (yet)

- It is 0.x. Interfaces may change before 1.0.
- We have only verified Ubuntu 24.04 hosts. Other distributions, real GPUs and multi-node Kubernetes are untested.
- It is infrastructure you run. There is no hosted version.

## License

The servers are AGPL-3.0. The Python SDK, the Go client and the API definitions are Apache-2.0, so programs that only call OpenDsec are not bound by the AGPL. A [commercial license](/en/docs/license) is available for closed modifications.

## Next

[Firecracker, gVisor and containers compared](/en/blog/posts/firecracker-vs-gvisor-vs-containers) for running AI-generated code: isolation, start time, memory and compatibility, with measurements.

The code is at [github.com/Kernflux/opendsec](https://github.com/Kernflux/opendsec), the docs [here](/en/docs/). Issues and questions are welcome on GitHub.
