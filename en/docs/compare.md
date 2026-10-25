---
description: "How OpenDsec compares with E2B, Daytona and Modal Sandboxes: where each runs, license, isolation, memory snapshots and fork, pause, GPUs and E2B compatibility, and when to choose which."
---

# OpenDsec vs E2B, Daytona and Modal

OpenDsec is sandbox infrastructure you run on your own Linux machines: Firecracker microVMs, containers and QEMU VMs, with fork and pause that keep memory, and an API that E2B's SDKs talk to. E2B, Daytona and Modal are mainly hosted services. This page compares the four on what matters for RL rollouts and code-executing agents, and says when each fits.

Facts about the other products come from their own documentation and repositories, checked on 2026-10-25 (links under [Sources](#sources)). Hosted products change often: check their docs before deciding. Where their docs did not say, the table says so rather than guess. If something here is wrong or out of date, please [open an issue](https://github.com/Kernflux/opendsec/issues).

## At a glance

| | OpenDsec | E2B | Daytona | Modal Sandboxes |
|---|---|---|---|---|
| Where it runs | Your machines only: one Linux machine or a cluster, also air-gapped. No hosted service | Hosted cloud. Open-source runtime for self-hosting on one machine ("Embed"); BYOC for enterprise | Hosted cloud; "bring your own compute" deployments | Modal's cloud only |
| License | AGPL-3.0 servers; Apache-2.0 SDK and clients | Apache-2.0 (SDKs and runtime) | Open-source repository archived in 2026 (last release v0.190.0, AGPL-3.0); development continues in a private codebase | Proprietary |
| Isolation | Firecracker microVM with jailer (default); also containers and QEMU VMs | Firecracker microVM | "Dedicated kernel"; container and VM runtimes (the docs do not name the technology) | gVisor by default; a VM runtime is alpha |
| Fork a running sandbox with memory | Yes: `fork(count=N)`, up to 256 copies, source pauses ~10 ms | Yes: snapshots keep memory by default; many sandboxes from one snapshot | Not described in the docs we reviewed | Memory snapshots are alpha |
| Pause and resume with memory | Yes; resume ~50 ms; a whole task at once | Yes; pause ~4 s per GiB of RAM, resume ~1 s | Not described in the docs we reviewed | Through memory snapshots (alpha) |
| Measured start | ~0.1 s cold microVM; ~55 ms from a memory snapshot | Not stated in the docs we reviewed | "Under 90 ms" | Not stated in the docs we reviewed |
| Longest sandbox lifetime | Set by the administrator (default limit 7 days) | 1 hour (Hobby), 24 hours (Pro) | Not stated in the docs we reviewed | 24 hours |
| GPUs | Containers (exclusive or shared) and QEMU PCI passthrough; not yet tested on real GPUs | Not offered | NVIDIA and AMD GPU sandboxes | Yes (gVisor runtime) |
| E2B SDK | Supported through a gateway ([what differs](/en/docs/e2b)) | Native | Own SDK | Own SDK |
| Cost | Free software on your hardware; commercial license optional | Per-second vCPU and RAM, plus plans | Hosted pricing | Hosted pricing |

## When to choose which

**OpenDsec** fits when:
- sandboxes must run on your own machines: a private data center, an air-gapped network, data that may not leave, or hardware you already own;
- you run RL rollouts at scale: one burst of 5120 microVMs on a single 384-thread node took 37 s, and 8192 containers on two nodes all succeeded;
- you need to branch running state: `fork(count=N)` copies a microVM with its memory, for tree search or many rollouts from one prepared environment;
- your code already uses the E2B SDK and you want to keep it while moving onto your own infrastructure.

**E2B** fits when you want a managed service and do not want to run infrastructure, or a single self-hosted machine is enough.

**Modal** fits when sandboxes need GPUs today, or your workloads already run on Modal.

**Daytona** fits when you want its hosted sandboxes, including GPU ones. Its open-source repository is archived, so self-hosting means running the last open release without updates.

## What OpenDsec does not do (yet)

- **No hosted service:** you install and operate it; [Get started](/en/docs/quickstart) takes about 10 minutes on one machine, a cluster is described in [Cluster deployment](/en/docs/cluster).
- **0.x:** interfaces may change before 1.0 ([versioning](/en/docs/versioning)).
- **GPUs untested:** the code is there, but nobody has run it on real GPUs yet.
- **E2B gaps:** directory watching, signed file URLs and template builds are not supported yet ([details](/en/docs/e2b)).
- **Linux x86_64 only;** microVMs need `/dev/kvm` (bare metal, or a cloud VM with nested virtualization).

## Sources

Checked on 2026-10-25.

- OpenDsec: [Concepts](/en/docs/concepts) (backends, timeouts, fork), [measurements](/en/) on 2 × AMD EPYC 9Y24 bare metal, [E2B compatibility](/en/docs/e2b), [License](/en/docs/license).
- E2B: [open source](https://e2b.dev/open-source.md) and [e2b-dev/runtime](https://github.com/e2b-dev/runtime) (Apache-2.0, Firecracker, Embed), [persistence](https://docs.e2b.dev/sandbox/persistence) (pause and resume), [snapshots](https://docs.e2b.dev/sandbox/snapshots), [pricing](https://e2b.dev/pricing) (plans, session length, no GPUs).
- Daytona: [daytonaio/daytona](https://github.com/daytonaio/daytona) (archived; last release v0.190.0 on 2026-06-23), [docs](https://www.daytona.io/docs) (isolation, start time, GPU sandboxes, bring your own compute).
- Modal: [Sandboxes guide](https://modal.com/docs/guide/sandboxes) (gVisor, GPUs, 24-hour timeout), [Sandbox snapshots](https://modal.com/docs/guide/sandbox-snapshots) (memory snapshots alpha), [VM Sandboxes](https://modal.com/docs/guide/vm-sandboxes.md) (alpha).
