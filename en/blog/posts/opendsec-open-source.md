---
title: OpenDsec is open source
date: 2026-10-24
author: Kernflux
description: Sandbox infrastructure built from DeepSeek's DSec paper, now open source under AGPL-3.0, with Firecracker microVMs, fork with memory, task-level pause and an E2B-compatible API.
---

# OpenDsec is open source

Today we published the OpenDsec source on [GitHub](https://github.com/Kernflux/opendsec). OpenDsec is sandbox infrastructure for reinforcement-learning training and code-executing agents: it creates, pauses, copies and destroys isolated environments in bulk, on your own machines.

## Why

Agentic RL training runs thousands of rollouts at once, and each needs an isolated environment that can install dependencies, run tests and reach the network. Training gets preempted, so environments must pause as a batch. The same state gets explored several ways, so environments must be copied together with their memory.

DeepSeek described the system they built for this in [*DeepSeek Elastic Compute (DSec)*](https://arxiv.org/abs/2609.22978). OpenDsec follows that paper: a stateless apiserver, IAM with nested projects and quotas, a watcher that aggregates scheduling state, power-of-k placement with final admission on each node, layered images, a default-deny network policy and task-level pause. Where the paper is silent we made our own choices, and the [SPEC](/docs/spec) in the repository marks which design points come from the paper and which are ours.

OpenDsec is an independent project. It is not affiliated with DeepSeek and contains none of its code.

## What it does

- **Fast**: a Firecracker microVM cold-starts in about 0.1 s, is created from a memory snapshot in about 55 ms and resumes from a pause in about 50 ms.
- **Fork**: `fork(count=N)` copies a running VM with its memory while pausing the source for about 10 ms. Copies on one node share memory pages; 64 of them restore concurrently in about 0.2 s.
- **Scale**: one 384-thread node took a burst of 5120 microVMs in 37 s.
- **E2B compatible**: code written for the E2B SDK runs on your machines after changing three environment variables. E2B's own Python and JS SDK acceptance checks all pass.
- **Operable**: mTLS between components and a Raft-replicated IAM; staged fleet rollouts with automatic rollback; offline installs. Upgrading any component leaves running sandboxes alone.

These numbers come from our own bare-metal machines; the SPEC says how each was measured.

## Try it

One Linux machine with Ubuntu 24.04, about 10 minutes:

```sh
sudo -i
apt update && apt install -y make git python3-venv
curl -fsSL https://go.dev/dl/go1.27.3.linux-amd64.tar.gz | tar -C /usr/local -xz
git clone https://github.com/kernflux/opendsec && cd opendsec
deploy/quickstart.sh
```

See [Get started](/en/docs/quickstart) for the details, and [Deployment](/en/docs/deploy) for clusters and offline installs.

## License

The servers are AGPL-3.0. The Python SDK, the Go client and the API definitions are Apache-2.0, so programs that call OpenDsec are not bound by the AGPL. A [commercial license](/en/docs/license) covers closed modifications, offering OpenDsec as a service without publishing changes, and the enterprise edition's single sign-on and audit export.

## What's next

OpenDsec is at 0.x, and interfaces may change before 1.0. Not yet verified: distributions other than Ubuntu 24.04, real GPUs, and multi-node Kubernetes. Issues and pull requests are welcome on GitHub.
