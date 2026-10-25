---
title: "DeepSeek's DSec paper: sandbox infrastructure for agentic RL at scale"
date: 2026-10-25
author: Kernflux
description: "DeepSeek's DSec paper explained: how its agentic RL sandbox platform schedules, overcommits, loads images on demand and blocks cheating, and how OpenDsec differs."
---

# DeepSeek's DSec paper: sandbox infrastructure for agentic RL at scale

Training AI agents that write code and use tools takes a sandbox for every reinforcement learning (RL) rollout: an isolated environment that can install dependencies, run commands and read and write files. DeepSeek's paper *DeepSeek Elastic Compute (DSec): A Sandbox Infrastructure for Effective Agentic Training at Scale* ([arXiv:2609.22978](https://arxiv.org/abs/2609.22978), September 2026) describes the sandbox platform they run in production.

The short version. Five things in the paper are worth copying:

1. **Sandboxes use little of what they ask for.** About 90% of sandboxes use at most 5% of the CPU they request on average, so you can overcommit heavily, as long as CPU core scheduling protects the latency-sensitive work.
2. **Don't pull whole images.** A sandbox reads only 4–13% of its image, so on-demand loading is far faster than a full pull.
3. **Scheduling can be simple.** Power-of-k random choice, a local record of placements in flight, and the node has the final say.
4. **RL needs task-level operations.** When training is preempted or finishes, pause, resume or stop all of a task's sandboxes at once.
5. **Agents cheat.** The paper records real reward hacking and escape attempts, and the sandbox has to defend against them.

The details follow. Our open-source project [OpenDsec](https://github.com/Kernflux/opendsec) implements this paper; the end of this post says where it chose differently. OpenDsec is not affiliated with DeepSeek.

## Scale

The paper's production numbers:

| | Number |
|---|---|
| One production unit | about 160 nodes |
| Sandboxes created per day | about 3 million |
| Sandboxes running at once | over 380,000 |
| Creation rate | over 5,000 per second |
| One training job | up to 32K sandboxes |
| One node, stable | 3,200 containers or 800 microVMs |
| RL sandbox lifetime | p99 over 3 hours |

The last row is easy to miss: sandboxes outlive a deploy, so upgrading a node cannot kill them.

## One SDK, four backends, no abstraction

DSec has four backends: function calls (FnCall), containers, microVMs and full VMs. They share one SDK, but the SDK does **not** try to hide them behind one interface: the caller picks the backend, and each backend has its own arguments. The reason is practical. Containers, microVMs and VMs differ a lot in start time, isolation and whether they can have a GPU, and a common abstraction would only hide that.

## Scheduling: power-of-k, and the node decides

Placement uses the classic power-of-k choices (the paper cites Mitzenmacher): pick k candidate nodes at random and take the least loaded. It needs no exact global state and still spreads load evenly.

Two details make it work under heavy concurrency:

- **In-flight overlay.** Node load is reported periodically, so a sandbox placed between two reports is invisible. Each scheduler instance records a placement the moment it picks a node and adds it to the load it computes, so a burst does not pile onto one node.
- **The node has the final admission decision.** Placement is best effort. The node checks its own capacity and memory pressure again and refuses if it is short; the scheduler retries elsewhere.

The control-plane services (API server, state collector) keep no persistent state: after a restart they poll the nodes again. A sandbox id encodes its node, so routing needs no lookup.

## Overcommit and CPU core scheduling

About 90% of sandboxes use at most 5% of the CPU they request on average. Allocating by request wastes most of the machines, so DSec overcommits CPU heavily.

The cost falls on latency-sensitive work. Marking background work `SCHED_IDLE` is not enough: it only decides who runs first on one hardware thread, not what the neighbour on the other hyperthread of the same core does to the shared execution units and caches. The paper measured that, under a 50% interfering load, latency rose 45.2% unprotected; `SCHED_IDLE` improved that by at most 3.4%; with Linux CPU core scheduling the rise was 17.3%.

For memory, the paper also shares and reclaims: paused sandboxes have their memory swapped out, and identical read-only data is shared between sandboxes.

## Images: layered builds, on-demand loading

RL environments are many, and each is used little, so pulling a whole image onto a node first is wasteful. DSec instead:

- **Layers** environments from independently versioned parts such as base, workspace and toolkit, so changing one part does not rebuild the whole image.
- **Loads on demand** from 3FS, DeepSeek's distributed file system: a sandbox fetches only the data it uses, which the paper measured at 4–13% of the image.
- **Result:** a burst of 8,192 containers took 35 minutes with on-demand loading and over 60 minutes with a full pull.
- **Separates building from running:** the accounts that build environments are not the accounts that run tasks, so a running task cannot write into an image others use.

## A lifecycle designed for RL

DSec is co-designed with the RL training framework: stateful rollout execution happens in sandboxes, separate from GPU training, which can be preempted. For that the platform provides:

- **Task-level operations:** pause, resume or stop all of a task's sandboxes. Pause them all when training is preempted; resume them all when it is back.
- **Transparent resume:** any operation on a paused sandbox resumes it first.
- **Reclaim on timeout:** an explicit stop, or an idle timeout.
- **Nested projects and bounded delegation:** projects nest to any depth (say `root/rl/job-42/agent-7`), and an identity can only delegate permissions it holds.

## Cheating and escape attempts

The paper records what agents actually did inside sandboxes: unbounded output filling the disk, forged requests to the sandbox's own management process, reading that process's logs for the answers, overwriting `/bin/bash`, corrupting file system metadata with ioctls, and scanning ports for package mirrors.

DSec's defences include AppArmor confinement and a network policy enforced with eBPF: outbound traffic denied by default and allowed by rule.

## Cloud bursting

Above 80% utilization of the on-premises cluster, DSec sends part of the container work to the cloud. Only tasks whose images are in a deduplicated EROFS set of about 30 TB qualify; that set covers about 70% of container tasks.

## Lessons for building your own sandbox platform

- **Plan capacity by use, not by request**, then protect latency-sensitive work with core scheduling.
- **Image size is not the problem; how much gets read is.** Load on demand first, tune storage later.
- **Simple random placement is enough** if nodes have the final say and schedulers remember what they just placed.
- **Design task-level operations and pause from day one.** RL training will be preempted.
- **Treat the agent as untrusted code:** capped output, deny-by-default network, grading kept apart from the agent.

## OpenDsec: an open-source implementation, with different choices

[OpenDsec](/en/) implements the paper's architecture (IAM, placement, state collection, nodes, SDK and image store) and runs in production on two 384-thread bare-metal nodes. We chose differently in a few places:

| | DSec paper | OpenDsec |
|---|---|---|
| Main backend | Containers; microVMs where stronger isolation is needed | Firecracker microVMs: no shared host kernel, and memory snapshots. Containers for GPUs and machines without KVM |
| Fork and pause | Task-level pause and resume | The same, plus forking a running microVM with its memory (`fork(count=N)`), for tree search |
| Network policy | eBPF | nftables and a built-in DNS proxy, same semantics: deny by default, allow by domain, address and port, changeable at run time |
| Image storage | 3FS | Any shared file system: NFS, CephFS, JuiceFS |
| Compatibility | Its own SDK | Its own SDK, plus an E2B-compatible gateway |

Some measurements made against the paper (the project's bare-metal test machines, 2 × AMD EPYC 9Y24):

- **CPU core scheduling:** under a 50% interfering load, the latency rise fell from 18.0% unprotected to 2.1% (`SCHED_IDLE` plus core scheduling); under 100%, from 81.0% to 10.0%. Same direction as the paper.
- **Density:** one 384-thread node created a burst of 5,120 microVMs in 37 seconds; two nodes created a burst of 8,192 containers, all successfully.
- **Anti-cheating:** each incident the paper lists is handled, for example at most 64 MB recorded per output stream of a command, and agent sessions as an unprivileged user.

OpenDsec also has a fleet service for batched rolling upgrades and config changes, with running sandboxes untouched.

Not done yet: no on-demand versus full-pull comparison, and GPUs are untested on real hardware.

## FAQ

### Is DSec open source?

The paper describes DeepSeek's internal system and comes with no code. OpenDsec is not DeepSeek's code but our independent open-source implementation of the paper (server AGPL-3.0, SDKs Apache-2.0) and is not affiliated with DeepSeek.

### Does DSec use containers or virtual machines?

Both. DSec has four backends (function calls, containers, microVMs and full VMs), with containers as the main one; the caller picks per task.

### Why does RL training need its own sandbox platform?

One RL job can need tens of thousands of sandboxes at once, each installing dependencies, running tests and living for hours, and training can be preempted at any time. General container platforms usually lack task-level pause, large bursts of creation and defences against cheating.

### How much can sandboxes be overcommitted?

About 90% of sandboxes use at most 5% of the CPU they request. OpenDsec overcommits CPU 8× by default and protects latency-sensitive sandboxes with CPU core scheduling. The right ratio depends on your workload.

### What is reward hacking, and how does a sandbox prevent it?

Reward hacking is an agent earning reward by gaming the grader instead of solving the task, for example by reading the answers from grading logs or replacing system commands. The usual defence is to keep the agent away from grading: different users for agent and grader, capped output, and network denied by default.

### Is this useful if I only need a code execution sandbox for an AI agent?

Yes. Overcommit, on-demand loading and escape defences apply to any service that runs untrusted code. OpenDsec also works as a code execution sandbox for AI agents and speaks the E2B SDK's API: see [self-hosting E2B](/en/blog/posts/self-hosted-e2b).

## Further reading

- The paper: [arXiv:2609.22978](https://arxiv.org/abs/2609.22978)
- [OpenDsec concepts](/en/docs/concepts)
- [OpenDsec compared with E2B, Daytona and Modal](/en/docs/compare)
- [Quickstart](/en/docs/quickstart): OpenDsec on one Linux machine

*OpenDsec is an open-source project by Kernflux and is not affiliated with DeepSeek. Everything said here about DSec comes from the paper above.*
