---
title: "DeepSeek DSec implementation notes: the paper and OpenDsec compared"
date: 2026-11-04
author: Kernflux
description: "DeepSeek's DSec paper and the open-source OpenDsec compared item by item: eBPF and nftables, 3FS and NFS, EROFS, virtio-pmem, pause and access control, with notes on pack_diff, aether/chronus and task-level pause."
---

# DeepSeek DSec implementation notes: the paper and OpenDsec compared

[OpenDsec](https://github.com/Kernflux/opendsec) is our independent open-source implementation of DeepSeek's DSec paper ([arXiv:2609.22978](https://arxiv.org/abs/2609.22978)) and is not affiliated with DeepSeek. This page is the entry to our implementation notes: one comparison table and three topic pages. For why they are needed, see [what you still have to decide when you implement the DSec paper](/en/blog/posts/dsec-paper).

## Topics

- [`pack_diff`: turning a sandbox into an image](/en/blog/posts/dsec-pack-diff): a consistent layer, scrubbing leftovers, and opaque directories on NFS.
- [aether and chronus: the path of one command](/en/blog/posts/dsec-aether-chronus): what each layer does between the SDK and a shell session.
- [Task-level pause: containers and microVMs are two mechanisms](/en/blog/posts/dsec-task-pause): how memory is released, how resume works, and what each costs.

## Comparison table

Last checked: 2026-11-04, against v1 of the paper and OpenDsec's public code.

The table records implementation differences. Unless stated, numbers from the two sides cannot be compared directly: hardware and workloads differ, and we have not run both approaches in one environment.

| Topic | DSec paper | OpenDsec | Difference and reason |
|---|---|---|---|
| Network policy (§6.5) | One eBPF program per sandbox, filtering by IP, port and protocol | nftables and a built-in DNS proxy, one chain per sandbox | Different. Domains become IPs at resolution; no BPF programs to write. IPv4 only, and sites sharing a CDN IP are reachable too |
| Image storage (§5.3) | 3FS | Any shared file system: NFS, CephFS, JuiceFS | Different. Users may not have 3FS. NFS does not carry `trusted.*` xattrs, so opaque directories must be expanded |
| Container image layers (§5.1, §5.3) | EROFS, metadata local, data read on demand from 3FS | Layers as directories, each copied whole to the node on first use | Different, with no on-demand loading. With local copies, an image store outage does not affect running containers |
| Container runtime (§3.3, §7) | A modified dockerd, with containers inside QEMU/libvirt VMs | Its own runtime, no Docker, containers directly on the host | Different. Our main isolation is the microVM; containers are for GPUs and machines without KVM. Container isolation is weaker than the paper's |
| microVM read-only layers (§5.1) | Independently versioned EROFS read-only disks, stacked with overlayfs in the guest | One read-only disk per image: ext4 by default, uncompressed EROFS with `erofs_images` | Different. The paper can replace one layer alone; we rebuild the disk when any layer changes |
| microVM writable disk (§5.3) | OverlayBD with ublk: on-demand reads, local writes | A local ext4 disk on the node | Different. No block-level on-demand reads |
| virtio-pmem and DAX (§5.2) | For read-only base image and toolkit layers | For the read-only image disk, with `image_pmem`, off by default | Same mechanism. The paper measured peak memory down 40.2% and transient peak CPU up from 26.5% to 41.4%. We measured 6 VMs reading one 64 MB file: memory fell from 515–529 MB to 112–140 MB |
| Cold memory reclaim (§5.2) | DAMON and balloon free page reporting | The same, plus zram in the guest, off by default | Largely the same. We report from 256 KB rather than 2 MB, because the pages DAMON frees are scattered |
| Pausing containers (§6.3) | `docker pause`, then `memory.reclaim` | cgroup freezer, then `process_madvise(MADV_PAGEOUT)` | Same goal. `memory.reclaim` follows the host's `vm.swappiness` and skips anonymous pages at 0. No reclaim by default; set `pause_reclaim` |
| Pausing microVMs (§6.3) | Snapshot, then end the Firecracker process | The same, and later pauses write only dirty pages, with zero pages in the memory file punched out | Same mechanism, plus incremental writes |
| Access control (§6.4, §6.5) | AppArmor confines root inside the sandbox | Agent sessions as an unprivileged user, grading as root | Different. AppArmor in that form does not stop root in a microVM guest. The caller must give the agent an unprivileged user |
| CPU core scheduling (§5.2, §8.5) | `SCHED_IDLE` and core scheduling | The same | Same mechanism. Paper: at 50% interference, the latency rise fell from 45.2% to 17.3%. Ours: from 18.0% to 2.1% |

## Not done yet

- On-demand loading is not implemented, so there is no comparison with a full pull.
- eBPF and nftables have not been compared for performance in one environment.
- No AppArmor.
- GPUs are untested on real hardware.

The full record of design decisions is in [SPEC.md](https://github.com/Kernflux/opendsec/blob/main/docs/SPEC.md), which marks whether each point comes from the paper or from us. If you find a mistake in the table, please [open an issue](https://github.com/Kernflux/opendsec/issues).

*Everything said here about DSec comes from the paper above.*
