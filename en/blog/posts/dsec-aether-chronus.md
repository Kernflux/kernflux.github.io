---
title: "DSec's aether and chronus: the path of one command"
date: 2026-11-04
author: Kernflux
description: "In DeepSeek's DSec paper, sandbox operations go through the apiserver, edge, aether and chronus. OpenDsec's implementation: what each layer does, how sessions, output and retries work, and how forged requests are stopped."
---

# DSec's aether and chronus: the path of one command

DeepSeek's DSec paper (§2, §3.3) says operations on a running sandbox go through the apiserver, edge, aether and chronus. Aether is a proxy, one per sandbox, and chronus is one shell session. The paper explains the division of work and leaves the protocol and failure handling to the implementer. This post records how [OpenDsec](https://github.com/Kernflux/opendsec) does it and says nothing about how DSec does it internally.

## The path

One `await sb.run_shell("pip install -e .")`:

```text
SDK
 │ gRPC + TLS
 ▼
apiserver     checks sandbox.operate, finds the edge from the sandbox id
 │ gRPC
 ▼
edge          resumes the sandbox if paused, refreshes the idle timeout,
 │            holds off idle reclaim during the call
 │ unix socket (containers) or vsock (VMs)
 ▼
aether        PID 1 in the sandbox, finds or starts chronus by session id
 │ unix socket
 ▼
chronus       holds a long-lived shell, runs the command, records output
```

The internal hops share one set of gRPC messages: the public API adds `sandbox_id`, the edge forwards, and aether and chronus implement the same `Runtime` service. Containers and VMs therefore differ only in the transport between edge and aether, and nothing above that cares. That is what the paper wants too: one interface over containers and VMs.

## Why each layer exists

**The apiserver** holds no state. A sandbox id encodes the edge that created it, so no lookup is needed. After a paused microVM moves, edges list the ids they received, and the old node replies with the new location.

**The edge** is the only control-plane component that talks to the sandbox. Transparent resume lives here, because only the edge knows the sandbox's current state. If the node has no room, the apiserver moves the paused microVM to another node.

**Aether** also detects failure. The edge holds a `Watch` stream to it, and a broken stream means the sandbox is lost, as in the paper. When a session closes, aether kills chronus's whole process tree.

**Chronus** keeps `cd` and `export` state between commands. There is one process per session, and commands in a session run one at a time; for concurrency, open more sessions.

## What the paper leaves to the implementer

**Commands outlive connections.** Output goes to a file, and a caller that disconnects can continue from an offset (`GetOutput`) or stream it. Each command has a request id, so an SDK retry finds the command already running rather than running it again. That matters for anything with side effects, like `pip install`.

**Output cannot be recorded forever.** The paper records agents filling storage with unbounded output. Output goes through a named pipe that chronus reads, with at most 64 MB recorded per stream of each command. The rest is read and dropped, so the command does not block. Each session keeps at most 512 MB, dropping the oldest records beyond that.

**Background processes must not escape.** Chronus is a subreaper, so processes a command backgrounds stay in the session's tree. Killing the tree means sending SIGSTOP repeatedly until no new process appears, then signalling them all; one scan misses whatever forks after it.

**Not every call belongs in a shell.** File operations run in chronus directly, without the shell. Independent processes, addressed by pid with stdin and a PTY, are managed by aether outside any session; the E2B gateway uses this interface.

## Agents attack this path

The paper records agents sending forged requests straight to chronus's socket and reading chronus's logs for answers. DSec confines them with AppArmor. OpenDsec has no AppArmor, since it would not stop root in a microVM guest, and runs agent sessions as an unprivileged user instead:

| Attack | How OpenDsec handles it |
|---|---|
| Requests to another session's chronus socket | Socket mode 0600; an unprivileged user cannot connect |
| Reading another session's command records | The records directory belongs to root, and only chronus can read or write output files |
| Overwriting `/bin/bash` | An unprivileged user cannot change system files |
| A symbolic link in the records directory, so chronus writes elsewhere as root | The directory stays root's, and an unprivileged user cannot add files there (fixed 2026-10-27) |
| Reaching aether over vsock from a microVM guest | The guest kernel has no vsock loopback, so the connection fails |

All of this assumes one thing: **the caller gives the agent an unprivileged user** (`run_shell(..., user=...)`). With the agent in a root session, the first three rows do not hold.

## Where this differs from the paper

- **FnCall:** the paper's FnCall uses neither aether nor chronus and runs directly in a precreated container. OpenDsec's fncall is a precreated container with aether already up, on the same path.
- **PID 1:** in OpenDsec aether is normally the sandbox's PID 1. The paper does not say.
- **Where containers run:** the paper's containers run inside VMs. OpenDsec's run directly on the host, so edge to aether is a unix socket.

## Related

- [DeepSeek DSec implementation notes: the comparison table](/en/blog/posts/dsec-implementation-notes)
- [OpenDsec concepts](/en/docs/concepts)
- The paper: [arXiv:2609.22978](https://arxiv.org/abs/2609.22978)

*OpenDsec is not affiliated with DeepSeek. Everything said here about DSec comes from the paper above.*
