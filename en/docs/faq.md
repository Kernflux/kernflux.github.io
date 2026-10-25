---
description: "OpenDsec FAQ: what it is, a self-hosted E2B alternative, microVM vs container isolation, how many sandboxes a cluster runs, RL training, Kubernetes, licensing, KVM, GPUs and production readiness."
---

# FAQ

## What is OpenDsec?

Open-source sandbox infrastructure for reinforcement-learning rollouts and code-executing AI agents. It runs isolated sandboxes (Firecracker microVMs, containers and QEMU VMs) on your own Linux machines, from one machine to a cluster, and serves its own Python SDK as well as an E2B-compatible API. It implements the DSec paper (arXiv:2609.22978) and is AGPL-3.0.

## Does it work without KVM?

Yes. Without `/dev/kvm` the installer sets up the container backend only, and the SDK and E2B API work as usual. For microVMs, use bare metal or a cloud VM with nested virtualization.

## Which Linux distributions are supported?

Fully verified on fresh Ubuntu 24.04. It needs x86_64, kernel 5.15 or newer, cgroup v2 and systemd. Other distributions should work but have not each been verified; please [open an issue](https://github.com/Kernflux/opendsec/issues) if one does not.

## How does it relate to E2B?

OpenDsec serves an E2B-compatible API. Code written for the E2B SDK runs once `E2B_API_URL`, `E2B_SANDBOX_URL` and `E2B_API_KEY` point at your gateway, and the sandboxes run on your own machines. E2B's Python SDK (sync and async) and JS/TS SDK acceptance checks all pass.

Directory watching, signed file URLs and template builds are not supported yet. The differences and how to migrate are in [docs/E2B.md](/en/docs/e2b).

## Is there an open-source, self-hosted alternative to E2B?

Yes: OpenDsec runs on your own machines and speaks E2B's API, so E2B SDK code moves over by changing three environment variables. E2B's own runtime is also open source and can be self-hosted on one machine. How OpenDsec, E2B, Daytona and Modal differ is in [the comparison](/en/docs/compare).

## How does it relate to DeepSeek?

It doesn't. OpenDsec is an independent implementation of the DSec paper that DeepSeek published. It is not endorsed by DeepSeek and contains none of its code.

## microVM, container or gVisor: which isolation?

OpenDsec offers microVMs (Firecracker, each with its own kernel and a jailer with its own uid) for untrusted code, which is the default, and containers (namespaces, cgroups, seccomp; they share the host kernel) for trusted, performance-sensitive code and image builds. It does not use gVisor. Both start in about 0.1 s; only microVMs fork and pause with their memory. See [Concepts](/en/docs/concepts#_2-1-backends).

## How many sandboxes can a cluster run?

On 2 × AMD EPYC 9Y24 bare metal (384 threads, 1.5 TB RAM per node), one node created 5120 microVMs in a single 37-second burst, and two nodes created 8192 containers with no failures. Memory is usually the limit: with the memory optimizations on (virtio-pmem images, free page reporting, zram), 16 idle 512 MB VMs used about 31% of the host memory they used without them, and 5120 idle 512 MB VMs used about 91 MB each.

## Is it suited to RL training?

That is what it is built for. Batch creation makes up to 32768 sandboxes in one call; sandboxes carry a `task_id`, so a preempted training job can pause all of its sandboxes at once and free their memory; `fork(count=N)` copies a running microVM with its memory for tree search; retries never create duplicate sandboxes. See [Concepts](/en/docs/concepts).

## Does it run on Kubernetes?

Experimentally: the manifests in `deploy/k8s/` run container sandboxes (no microVMs), and multi-node is not fully verified. The verified ways are a single machine and a systemd-managed cluster; see [Deployment](/en/docs/deploy).

## Is it free for commercial use?

Yes. The servers are AGPL-3.0 and the SDK and clients Apache-2.0, so programs that call OpenDsec are not bound by the AGPL. If you modify the servers and offer them to others over a network, the AGPL asks you to publish your changes. A commercial license, support and an enterprise edition are available; see [License](/en/docs/license).

## How do I install without internet access?

Use the offline bundle; see [Deployment](/en/docs/deploy#air-gapped).

## Is it ready for production?

It is at 0.x, and interfaces may change before 1.0; see [VERSIONING.md](/en/docs/versioning). Rolling upgrades, a hard reset of a control node and an IAM leader change have each been run under load with no failed calls. For support or a commercial license, see [License](/en/docs/license).

## Does it support GPUs?

GPUs can be given to container sandboxes exclusively or shared, and the full VM backend supports PCI passthrough. Neither has been tested on real GPUs yet.

## Something else?

See [Troubleshooting](/en/docs/troubleshooting), which lists the problems we have met by symptom, with causes and fixes. If yours is not there, please [open an issue](https://github.com/Kernflux/opendsec/issues).
