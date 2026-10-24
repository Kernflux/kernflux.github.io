---
title: "Acceptance-testing the open-source release on fresh machines: 22 issues"
date: 2026-10-24
author: Kernflux
description: Before the release we followed the README on fresh Ubuntu 24.04 VMs through every feature a user would touch, and found and fixed 22 issues, two of them serious.
---

# Acceptance-testing the open-source release on fresh machines: 22 issues

OpenDsec's automated tests always ran, and passed, on our development machine and our production cluster. But the development machine has everything installed, and the production cluster was tuned step by step. A new user starts from a fresh machine and a README. So before the release we took a new user's place: fresh Ubuntu 24.04 VMs, the documentation, and every feature a user might touch.

## What we tested

| Area | How |
|---|---|
| Single machine | Install per the README; run the examples, the SDK feature test and 54 admin command checks; reboot; uninstall |
| No KVM | Containers only |
| E2B | E2B's Python SDK (sync and async), JS SDK, code interpreter, snapshots and network options |
| Offline | Install from the offline bundle on a VM without internet; use the E2B SDK offline |
| Cluster | 3 control and 3 compute nodes with NFS and HAProxy: deploy per the docs, hand over to fleet, add a node, rolling upgrade, config change, maintenance, backup, monitoring |
| Failures | Hard-reset a control node and kill the IAM leader under load |
| Kubernetes | Single-node k3s |

## Two serious issues

**On a current Ubuntu kernel, every microVM resume failed.** Ubuntu 24.04's 6.8.0-147 kernel kills a process placed with `CLONE_INTO_CGROUP` into a cgroup that has ever been through `cgroup.kill`. OpenDsec ends the VM process on pause and starts a new one in the same cgroup on resume, so every resume failed. Our production machines run an older kernel, which is why we never saw it; a kernel upgrade would have exposed it. Killing now freezes the cgroup and sends SIGKILL to each process instead of using `cgroup.kill`, and a regression test fails on the affected kernel.

**Restarting a control node failed a few calls with `unknown edge`.** After a restart the watcher only learned about compute nodes when they re-registered, up to 10 s later, and meanwhile the apiserver treated them as gone. A hard reset of one control node failed 3 of 3,911 calls in a load test. The watcher now starts from the nodes its peers know, and the apiserver keeps a node it briefly cannot see for 2 minutes. The same hard reset now fails none.

## The rest

Most of the other 20 are things a new user hits on day one:

- **Install**: fresh machines lack `make`, and the script only failed halfway through the build; fresh Ubuntu lacks `python3-venv`; fresh cloud images have no package lists until `apt update`.
- **CLI**: `opendsecctl exec` dropped argument quoting, breaking `python3 -c '...'`; `--help` did not work; batch create printed no IDs; importing a missing local file went to Docker Hub.
- **E2B**: a single-machine install had no E2B gateway, and on clusters that deny internet by default E2B sandboxes had none, while E2B allows it by default.
- **Operations**: `opendsecops restart` skipped the E2B gateway; the disk alert used a fixed threshold and fired on every machine under 200 GB; on Kubernetes the apiserver could not write the image store.
- **Performance**: the NFS 4.1 we recommended cannot find holes in sparse files, so creating from a memory snapshot on another node read the whole memory file and took 141 s; with 4.2 it takes 62 s. The docs now say 4.2, and `store-check` warns about 4.1.

Each is listed in the [CHANGELOG](https://github.com/Kernflux/opendsec/blob/main/CHANGELOG.md).

## Not covered

Real GPUs, ARM machines, multi-node Kubernetes, and distributions other than Ubuntu 24.04. If you run OpenDsec on one of these and something breaks, please [open an issue](https://github.com/Kernflux/opendsec/issues).

## Takeaway

A full test run on a development machine shows the code is right on our machines. It does not show a user can get it working from the docs. Both serious issues came from the environment: a newer kernel, and restart timing that production never produced. Walking through the docs on a fresh machine finds problems a development machine never will.
