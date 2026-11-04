---
title: "DSec's task-level pause: containers and microVMs are two mechanisms"
date: 2026-11-04
author: Kernflux
description: "In DeepSeek's DSec paper, preempted training pauses whole batches of sandboxes. Containers freeze and swap; microVMs snapshot and end the process. OpenDsec's implementation, its timings and what each costs."
---

# DSec's task-level pause: containers and microVMs are two mechanisms

In DeepSeek's DSec paper (§6.3), when GPU training is preempted the sandboxes must survive but should not keep their memory, so the RL framework pauses all of a task's sandboxes. There is one interface over two entirely different mechanisms. This post records how [OpenDsec](https://github.com/Kernflux/opendsec) does it, and what the paper does not go into. It says nothing about how DSec does it internally.

```python
await client.run_sandboxes(DSecRunArgs(backend="microvm", image="root/py:3.12", task_id="job-7"), 500)

await client.pause_task("job-7")     # training preempted
await client.resume_task("job-7")    # training is back
await client.stop_task("job-7")      # training finished
```

Besides whole tasks, a single sandbox can be paused on its own too. Any call to a paused sandbox resumes it first, without the caller doing anything.

## Two mechanisms

| | Container | microVM |
|---|---|---|
| The paper | `docker pause`, enable swap, reclaim with `memory.reclaim`; on resume, prefetch with `MADV_WILLNEED`, then `docker unpause` | Snapshot memory and execution state, end the Firecracker process; on resume, start a new process and restore |
| OpenDsec | cgroup freezer; with `pause_reclaim`, swap out with `process_madvise(MADV_PAGEOUT)` | The same; after the first, only dirty pages are written, and zero pages in the memory file are punched out |
| Where memory goes | Swap | A memory file on disk |
| Processes | Still there, frozen | Gone; their state is in the snapshot |
| Calls in flight | Wait for the thaw | Fail |
| Resume on another node | No | Yes |

The fundamental difference: **a container's processes stay on the host, while a microVM's process really ends.** A paused microVM has given its memory back to the host. A container depends on swap, and by default does not reclaim at all.

## Measurements

On the project's bare-metal test machines, one sandbox at a time. Tests were run at different times under different loads, so read these for scale:

| Operation | Result |
|---|---|
| Pausing a container (`pause_reclaim` on) | 85 ms, memory from 227 MB to 7 MB; 200 MB of data verified after resume |
| Pausing a microVM (256 MB, full snapshot) | About 210 ms, cgroup memory from 148 MB to 5 MB |
| First pause of a microVM (512 MB, full) | 278 ms |
| Later pauses of a microVM (merging 18 MB of dirty pages) | 85 ms |
| Resuming a microVM | About 50 ms |

We have not measured tens of thousands of sandboxes pausing at once, or compared with the paper's results.

## Problems we met

**`memory.reclaim` may not swap out anonymous pages.** It follows the host's `vm.swappiness`, which our test machines' cloud image sets to 0, and then cgroup reclaim leaves anonymous pages alone. Kernels before 6.10 also cannot give a swappiness to `memory.reclaim`. So each process is swapped out with `process_madvise(MADV_PAGEOUT)` first, and `memory.reclaim` then handles only the swap cache. With `pause_reclaim` on, an edge on a host with swappiness 0 refuses to start and does not change the host's settings for you. The host also needs swap, which the edge does not check.

**Writing full snapshots is too slow.** Pause and fork happen often. A cold-booted VM's memory starts as zeros and every written page is in the dirty log, so even the first snapshot can write dirty pages only and produce a sparse file. Later pauses write increments and merge them into the previous memory file.

**Task operations must reach every node.** We first sent them only to the edges that the state snapshot showed holding the task. But the snapshot lags placements another apiserver has just made, so sandboxes could be missed. They now fan out to all healthy edges, which filter by project subtree and task. With hundreds of nodes, that cost is acceptable.

**Counting capacity.** A paused sandbox has released memory but will want it back. `paused_mem_charge` defaults to 1, so it still counts in full and pausing does not let more sandboxes in. Lowering it raises density, at the risk of a resume failing for lack of memory. A paused microVM then moves to another node to resume; a container cannot move.

## Things to watch

- **Containers need swap set up first.** Without `pause_reclaim`, a paused container uses no CPU but keeps all its memory.
- **Pausing a microVM breaks calls in flight.** Guest processes just stop and carry on after resume, but RPCs running at the time fail and the caller must retry.
- **Network connections may not survive.** After a long pause, a microVM's TCP peer may have gone away.
- **Leave enough disk.** A microVM's memory file takes node disk.
- **A host reboot loses them.** Paused sandboxes do not survive a host reboot, microVMs included.
- **Full VMs differ.** OpenDsec's QEMU backend only stops the vCPUs on pause and does not release memory.

## Related

- [DeepSeek DSec implementation notes: the comparison table](/en/blog/posts/dsec-implementation-notes)
- [Firecracker, gVisor and containers compared](/en/blog/posts/firecracker-vs-gvisor-vs-containers)
- The paper: [arXiv:2609.22978](https://arxiv.org/abs/2609.22978)

*OpenDsec is not affiliated with DeepSeek. Everything said here about DSec comes from the paper above.*
