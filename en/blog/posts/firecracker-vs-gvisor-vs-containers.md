---
title: "Firecracker vs gVisor vs containers: isolation for AI code sandboxes"
date: 2026-10-25
author: Kernflux
description: "Containers, gVisor, Firecracker microVMs or full VMs for AI-generated code: isolation, attack surface, start time, memory and compatibility, with measurements."
---

# Firecracker vs gVisor vs containers: isolation for AI code sandboxes

AI agents write code and run it, and reinforcement learning rollouts run model-written commands by the thousand. That code is untrusted: it may run as root, try to escape, scan the network or exhaust resources. So the first question for the sandbox that runs it is: **what isolates it?**

The short version:

- **For untrusted code, use microVMs** (Firecracker, for example). Each sandbox has its own kernel, and what it can attack is a handful of virtual devices rather than every system call of the host kernel. The cost: you need KVM, and every VM carries a guest kernel and its memory.
- **Without KVM (an ordinary cloud VM without nested virtualization) but wanting more than a container, use gVisor.** It implements a Linux-compatible kernel in user space and needs no hardware virtualization. The cost: compatibility, and performance for system-call-heavy work.
- **For trusted code, GPUs, or the highest density, use containers.** Fastest and leanest, but they share the host kernel, so a kernel bug can mean an escape.
- **For a full operating system or PCI passthrough, use a QEMU full VM.**

The rest explains how each works and what it trades, with measurements from our open-source project [OpenDsec](https://github.com/Kernflux/opendsec).

## At a glance

| | Containers | gVisor | Firecracker microVM | QEMU full VM |
|---|---|---|---|---|
| Kernel | Shared with the host | A user-space "application kernel" (the Sentry, written in Go) handles system calls | Its own Linux kernel per VM, on KVM hardware virtualization | Its own kernel, a full device model |
| What code in the sandbox talks to | The host kernel's system calls (narrowed by seccomp) | The Sentry, which does not pass system calls through to the host kernel | A few virtual devices (network, block, vsock and so on) and KVM | More virtual devices |
| Needs `/dev/kvm` | No | No (the default systrap platform); with KVM, the faster KVM platform | Yes | Yes |
| Compatibility | Native | Not every system call or `/proc` and `/sys` file is implemented | Full Linux | A full system, other operating systems included |
| Performance cost | Almost none | System-call-heavy work can be much slower | Compute over 95% of bare metal (official specification) | Slower start, more memory |
| License | — | Apache-2.0 | Apache-2.0 | GPL-2.0 |

What this post says about gVisor and Firecracker comes from their official documentation, linked at the end.

## Containers: a shared kernel, a narrowed interface

A container combines Linux kernel features: namespaces isolate the view (processes, network, mounts), cgroups limit resources, overlayfs provides the file system. Processes in the sandbox call the host kernel directly, so:

- **Fast and lean:** no virtualization layer; starting one is starting a process, and memory is just what the processes use.
- **Security depends on how narrow the kernel interface is:** drop unneeded capabilities, and refuse dangerous system calls with seccomp (mounts, `bpf`, `userfaultfd`, kernel modules, creating user namespaces...). The hundreds of system calls left still reach the host kernel, and one exploitable kernel bug can be an escape.

So containers suit **trusted** code: building images, your own grading programs, GPU training jobs.

## gVisor: another kernel, in user space

gVisor keeps the sandbox away from the host kernel. Its core, the Sentry, is an "application kernel" written in Go that implements Linux's system call interface: a system call from the sandbox is intercepted by the platform layer (by default systrap, built on seccomp) and handled by the Sentry. File access goes through another host process, the Gofer.

- **Upside:** no hardware virtualization needed, so ordinary cloud VMs work; it ships as the OCI runtime `runsc`, usable from Docker and Kubernetes; a flexible footprint with no fixed VM cost.
- **Cost:** the documentation says gVisor "does not presently implement every system call, /proc file, or /sys file", and system-call-heavy workloads may perform poorly. Agent code can run anything (compilers, package managers, databases), so test compatibility with real workloads.

The hosted service Modal uses gVisor for its sandboxes by default.

## Firecracker microVMs: a minimal VM per sandbox

Firecracker is the virtual machine monitor (VMM) AWS built for Lambda and Fargate; it is open source under Apache-2.0. It runs real VMs on KVM but leaves out almost every device, keeping a few: network, block, vsock, entropy, pmem. Its specification:

- **≤125 ms** from the start request to the guest kernel running;
- **≤5 MiB** memory overhead for the VMM threads (a 1 vCPU, 128 MiB VM);
- compute performance **over 95%** of bare metal.

Root in the sandbox is root of the guest kernel only; escaping means breaking Firecracker's few virtual devices or KVM. In production, Firecracker's own jailer starts it: chroot, cgroups and namespaces, then dropped privileges, plus per-thread seccomp filters.

The costs: **KVM is required** (bare metal, or a cloud VM with nested virtualization); each VM carries a guest kernel and its memory; there is no GPU passthrough.

Besides isolation, microVMs do something containers find hard: **memory snapshots**. A whole VM's memory is saved and restored tens of milliseconds later, with running processes carrying on. That is what makes starting from a snapshot, pause and resume, and forking with memory possible. E2B is built on Firecracker too.

## QEMU full VMs

QEMU has a full device model: it can run an image's own init, other operating systems, and pass a GPU through to the VM over PCI. The costs are a slower start, more memory and a larger attack surface. Use it when the task needs a full system, not as the default for many sandboxes.

## Measured: OpenDsec's three backends

OpenDsec has container, Firecracker microVM and QEMU full VM backends (not gVisor), and the caller picks one when creating a sandbox. Measured on the project's bare-metal test machines (2 × AMD EPYC 9Y24, 384 threads, 1.5 TB RAM):

| | Container | Firecracker microVM | QEMU full VM |
|---|---|---|---|
| Start | about 0.1 s | about 0.1 s cold; about 55 ms from a memory snapshot | about 0.23 s |
| One create through the API (network and TLS included) | about 65 ms | about 190 ms | about 300 ms |
| Pause | Processes frozen; memory can be swapped out | Memory snapshot, then the process ends and all memory is freed; resume about 50 ms | vCPUs stopped, memory kept |
| Fork | Files only | With memory | Not supported |
| Burst creation | 8,192 (0.25 core, 256 MB) on two nodes, all succeeded | 5,120 (512 MB) on one node, all succeeded | — |

The 5,120 microVMs deserve a word: they requested 2.6 TB of memory in total, and the host actually used about 468 GB, about 91 MB per VM. Two things do that:

- **Free page reporting:** the guest kernel tells the host which pages are free, and the host takes them back.
- **virtio-pmem with DAX:** read-only images are mapped into VMs through a pmem device, so the page cache of an image is shared by every VM using it instead of cached once per VM.

So the "every VM has its own guest memory" cost can be kept small under real load.

## Why OpenDsec defaults to microVMs

DeepSeek's DSec paper uses containers as its main backend and microVMs where stronger isolation is needed. OpenDsec made Firecracker microVMs the default instead ([the paper, explained](/en/blog/posts/dsec-paper)), because of:

1. **Isolation:** agent code is untrusted, and not sharing the host kernel is the most direct defence.
2. **Memory snapshots:** prepare an environment once, snapshot it, and start each sandbox from the snapshot, with dependencies, loaded models and running services in place, ready in about 55 ms.
3. **Fork:** copy a running sandbox with its memory, for tree search and fanning many rollouts out of one state.
4. **Enough density:** as measured above, microVM memory overhead can be brought down to about 91 MB each under real load.

The container backend stays, for GPU work (Firecracker has no GPU passthrough), for large batches of trusted work most sensitive to start time and memory, and for machines without KVM.

Whatever the backend, OpenDsec adds the same layers on the host: outbound network denied by default (nftables and a DNS proxy), CPU core scheduling (two sandboxes never run on the two hyperthreads of one physical core at once, which blocks side channels through hyperthreading), and a cap on each command's output; the agent and the grader can also run as different users. See the [security model](/en/docs/security).

## How to choose

| Your situation | Use |
|---|---|
| Untrusted, AI-generated code, with bare metal or nested virtualization | Firecracker microVMs |
| Untrusted code, but only ordinary cloud VMs without KVM | gVisor (test your workload's compatibility and speed first) |
| Already on Kubernetes and want a stronger runtime | gVisor (`runsc`), or something like Kata Containers that runs containers in VMs |
| Trusted code, speed and density first, or GPUs | Containers, with seccomp and a minimal capability set |
| A full operating system or PCI passthrough | QEMU full VMs |
| Pause and resume, start from a snapshot, fork with memory | microVMs |

## FAQ

### Which is more secure, Firecracker or gVisor?

Both are stronger than plain containers, by different means. Firecracker uses hardware virtualization, so the sandbox faces a few virtual devices and KVM; gVisor reimplements the kernel interface in user space, so the sandbox faces the Sentry. For untrusted code on machines with KVM we recommend microVMs: the boundary is hardware virtualization, and you get memory snapshots too.

### Can Docker containers run AI-generated code?

Yes, if you accept the risk: a container shares the host kernel, and one exploitable kernel bug can be an escape. At least drop extra capabilities, refuse dangerous system calls with seccomp, forbid creating user namespaces, and restrict the network. Prefer microVMs or gVisor for untrusted code.

### What does Firecracker need?

A Linux host with `/dev/kvm`: a bare-metal server, or a cloud VM with nested virtualization. Without KVM, use containers or gVisor.

### Are microVMs much slower than containers?

Not to start: OpenDsec measures about 0.1 s for a cold microVM and about 55 ms from a memory snapshot, the same order as a container. For compute, Firecracker's specification is over 95% of bare metal. The difference is memory: each VM has its own guest kernel, which free page reporting and a shared page cache keep small.

### Does gVisor run every program?

Not necessarily. gVisor's documentation says it does not yet implement every system call or `/proc` and `/sys` file, and system-call-heavy workloads may perform poorly. Test with your real workload first.

### Can I use Firecracker on Kubernetes?

Through projects such as Kata Containers (Firecracker's README says it has been integrated into Kata Containers). OpenDsec instead manages Firecracker on its nodes itself, without Kubernetes; see [concepts](/en/docs/concepts).

## References

- Firecracker: [README](https://github.com/firecracker-microvm/firecracker), [specification](https://github.com/firecracker-microvm/firecracker/blob/main/SPECIFICATION.md)
- gVisor: [documentation](https://gvisor.dev/docs/), [platforms](https://gvisor.dev/docs/architecture_guide/platforms/)
- OpenDsec: [concepts](/en/docs/concepts) (the backends), [security model](/en/docs/security), [compared with E2B, Daytona and Modal](/en/docs/compare)

*What this post says about gVisor and Firecracker comes from their official documentation, checked on 2026-10-25; OpenDsec's numbers come from the project's test records.*
