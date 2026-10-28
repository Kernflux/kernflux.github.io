---
layout: home
title: "OpenDsec: open-source, E2B-compatible sandboxes for AI agents"
titleTemplate: false
description: Open-source sandboxes on your own machines for RL rollouts and code-executing AI agents. Firecracker microVMs in ~0.1 s, fork with memory, and an E2B-compatible API.

hero:
  name: OpenDsec
  text: Self-hosted AI sandboxes
  tagline: "E2B-compatible: change three environment variables and your code runs on your own cluster. Firecracker microVMs start in about 0.1 s and fork with their memory. Built from DeepSeek's DSec paper, for RL rollouts and code-executing agents."
  actions:
    - theme: brand
      text: Get started
      link: /en/docs/quickstart
    - theme: alt
      text: View on GitHub
      link: https://github.com/Kernflux/opendsec

features:
  - title: microVMs in about 0.1 s
    details: A Firecracker VM cold-starts in about 0.1 s, is created from a memory snapshot in about 55 ms, and resumes from a pause in about 50 ms.
  - title: Fork and memory snapshots
    details: fork(count=N) clones a running VM with its memory, pausing the source for about 10 ms. Copies on one node share pages; other nodes pull from the source node.
  - title: Pause a whole task
    details: When training is preempted, pause every sandbox of a task and release its memory. The next call to a paused sandbox resumes it.
  - title: E2B compatible
    details: Code written for the E2B SDK runs after changing three environment variables, including commands, files, PTY, ports, snapshots and the code interpreter.
  - title: Layered images
    details: Import from any OCI registry, compose layers without copying, and save an environment with pack_diff. The store lives on NFS, CephFS or JuiceFS.
  - title: Default-deny network
    details: Allow traffic by domain, CIDR and port per sandbox, changeable while it runs. Enforced with nftables and a DNS proxy.
  - title: Isolation
    details: A jailer with a uid per VM, core scheduling against SMT side channels, seccomp, read-only agents and per-session users.
  - title: Projects and quotas
    details: Nested projects, hierarchical quotas and bounded delegation. Raft-replicated IAM, mTLS between components, short-lived revocable tokens and audit logs.
  - title: Operations
    details: Staged fleet rollouts with automatic rollback, an offline bundle, Prometheus metrics and alerts. Upgrading any component leaves running sandboxes alone.
---

## What OpenDsec is

OpenDsec is open-source sandbox infrastructure: it runs large numbers of isolated sandboxes on your own Linux machines, from one machine to a cluster, for reinforcement-learning rollouts and code-executing AI agents. It comes with a Python SDK, a CLI and an E2B-compatible API, under AGPL-3.0.

- **A good fit for:** teams whose sandboxes must run in their own data center or offline; RL training that starts thousands of sandboxes at once; forking running environments with their memory; keeping E2B SDK code while moving to your own infrastructure.
- **Not a fit for:** wanting a hosted service with no machines to run (there is no hosted OpenDsec); platforms other than Linux x86_64.

How it differs from E2B, Daytona and Modal: see [the comparison](/en/docs/compare). Common questions: [FAQ](/en/docs/faq).

## What a first run looks like

<div class="demo"><img src="/demo.svg" alt="deploy/quickstart.sh, then the Python SDK creates a microVM, runs print(6*7) to get 42, and forks it into four copies" width="801" height="518" loading="lazy"></div>

Recorded on a bare-metal server, sandbox state on a local NVMe disk with XFS. The 6-minute quickstart is cut; everything after it runs in real time. 0.16 s is the whole API call (placement, boot, agent ready); the 0.1 s in the table below is the VM boot alone. The steps are in the [quickstart](/en/docs/quickstart).

## Measured

On bare metal with 2 × AMD EPYC 9Y24 (384 threads), 1.5 TB RAM, NVMe RAID0 and Ubuntu 24.04. These are our own measurements, not figures from the paper; how each was taken is in [docs/SPEC.md](/docs/spec).

| Parameter | Typical |
|---|---|
| microVM cold start<br><small>until the first command can run</small> | 0.1 s |
| Create from a memory snapshot<br><small>snapshot on the same node</small> | 55 ms |
| Resume after pause<br><small>memory fully released while paused</small> | 50 ms |
| Source pause during fork<br><small>incremental snapshot, dirty pages only</small> | 10 ms |
| Fork 8 copies to another node<br><small>pulled from the source node</small> | 0.58 s |
| Restore 64 copies at once<br><small>one node, shared pages</small> | 0.2 s |
| Burst of 5120 microVMs<br><small>one 384-thread node</small> | 37 s |
| Burst of 8192 containers<br><small>two nodes</small> | 0 failed |
| FnCall create<br><small>pre-built pool, through the API</small> | 2 ms |
| E2B code interpreter<br><small>`Sandbox.create()` / first `run_code`</small> | 280 / 45 ms |

## Architecture

The apiserver is stateless and picks nodes with power-of-k over the state the watcher aggregates; the edge on each node decides from real usage. Any component can restart without touching running sandboxes.

<div class="arch">
<svg viewBox="0 0 880 410" role="img" aria-label="OpenDsec architecture: clients, E2B gateway, apiserver, IAM, watcher, edges and the shared image store">
<defs>
<marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="ah" d="M0,0 L8,4 L0,8 z"/></marker>
<marker id="am" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="ah m" d="M0,0 L8,4 L0,8 z"/></marker>
</defs>
<rect class="box" x="20" y="120" width="160" height="62" rx="6"/><text class="t1" x="34" y="146">Python SDK</text><text class="t2" x="34" y="166">opendsecctl</text>
<rect class="box" x="20" y="250" width="160" height="62" rx="6"/><text class="t1" x="34" y="276">E2B SDK</text><text class="t2" x="34" y="296">Python · JS</text>
<rect class="box" x="210" y="250" width="120" height="62" rx="6"/><text class="t1" x="224" y="276">E2B gateway</text><text class="t2" x="224" y="296">:7400</text>
<rect class="box acc" x="370" y="150" width="170" height="80" rx="6"/><text class="t1" x="386" y="178">apiserver ×N</text><text class="t2" x="386" y="198">stateless · placement</text><text class="t2" x="386" y="216">power-of-k</text>
<rect class="box" x="370" y="20" width="170" height="70" rx="6"/><text class="t1" x="386" y="46">IAM · Raft ×3</text><text class="t2" x="386" y="66">projects · quota · tokens</text>
<rect class="box" x="620" y="20" width="240" height="70" rx="6"/><text class="t1" x="636" y="46">watcher ×N</text><text class="t2" x="636" y="66">probes edges · scheduling state</text>
<rect class="box" x="620" y="120" width="240" height="56" rx="6"/><text class="t1" x="636" y="144">edge</text><text class="t2" x="636" y="163">microVM · container · FnCall</text>
<rect class="box" x="620" y="188" width="240" height="56" rx="6"/><text class="t1" x="636" y="212">edge</text><text class="t2" x="636" y="231">microVM · container · full VM</text>
<rect class="box" x="620" y="256" width="240" height="56" rx="6"/><text class="t1" x="636" y="280">edge</text><text class="t2" x="636" y="299">in each sandbox: aether · chronus</text>
<rect class="store" x="370" y="346" width="490" height="46" rx="6"/><text class="t1" x="386" y="374">Shared image store</text><text class="t2" x="530" y="374">NFS 4.2 · CephFS · JuiceFS</text>
<path class="ln" d="M180 165 H366" marker-end="url(#ar)"/>
<path class="ln" d="M180 281 H206" marker-end="url(#ar)"/>
<path class="ln" d="M330 281 H350 V205 H366" marker-end="url(#ar)"/>
<path class="ln" d="M455 150 V94" marker-end="url(#ar)"/>
<path class="ln" d="M540 170 H580 V55 H616" marker-end="url(#ar)"/>
<path class="ln" d="M540 190 H600 V148 H616" marker-end="url(#ar)"/>
<path class="ln" d="M600 190 V216 H616" marker-end="url(#ar)"/>
<path class="ln" d="M600 216 V284 H616" marker-end="url(#ar)"/>
<path class="ln dash" d="M860 90 V116" marker-end="url(#am)"/>
<path class="ln dash" d="M740 312 V342" marker-end="url(#am)"/>
<path class="ln dash" d="M455 230 V342" marker-end="url(#am)"/>
</svg>
</div>
<p class="swipe">Swipe sideways to see the whole diagram</p>

## Based on the DSec paper

OpenDsec implements [*DeepSeek Elastic Compute (DSec): A Sandbox Infrastructure for Effective Agentic Training at Scale*](https://arxiv.org/abs/2609.22978) (arXiv:2609.22978). The architecture and most of the design come from the paper. How network policy is enforced, the shared-file-system image store, Firecracker as the main backend, fleet operations and E2B compatibility are our own. The SPEC in the repository marks the source of each design point. We thank the paper's authors for publishing the design in such detail.

OpenDsec is an independent project: not affiliated with, endorsed by or maintained by DeepSeek, and it contains no DeepSeek code. "DeepSeek" and "DSec" belong to their owners and are used here only to name the paper.
