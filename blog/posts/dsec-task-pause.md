---
title: DSec 任务级暂停：容器和 microVM 是两套机制
date: 2026-11-04
author: Kernflux
description: DeepSeek DSec 论文里训练被抢占时要整批暂停 sandbox。容器靠冻结和换出，microVM 靠快照后结束进程。这里记录 OpenDsec 的实现、实测耗时和各自的代价。
---

# DSec 任务级暂停：容器和 microVM 是两套机制

在 DeepSeek DSec 论文（§6.3）的设计里，GPU 训练被抢占时 sandbox 不能丢，但也不该继续占内存，所以 RL 框架把一个任务的 sandbox 整批暂停。接口只有一个，底下却是两套完全不同的机制。这篇记录 [OpenDsec](https://github.com/Kernflux/opendsec) 的实现，以及论文没有细说的部分。它不代表 DSec 内部也这样做。

```python
await client.run_sandboxes(DSecRunArgs(backend="microvm", image="root/py:3.12", task_id="job-7"), 500)

await client.pause_task("job-7")     # 训练被抢占
await client.resume_task("job-7")    # 训练回来了
await client.stop_task("job-7")      # 训练结束
```

除了按任务操作，单个 sandbox 也可以单独暂停。对暂停中的 sandbox 发起任何调用，平台都会先恢复它，调用方不用管。

## 两套机制

| | 容器 | microVM |
|---|---|---|
| 论文的做法 | `docker pause`，开 swap，`memory.reclaim` 回收；恢复时用 `MADV_WILLNEED` 预取，再 `docker unpause` | 保存内存和执行状态的快照，结束 Firecracker 进程；恢复时启动新进程，恢复快照 |
| OpenDsec | cgroup freezer；开启 `pause_reclaim` 时用 `process_madvise(MADV_PAGEOUT)` 换出 | 相同；第一次之后只写脏页，内存文件里的零页打洞 |
| 内存去向 | swap | 磁盘上的内存文件 |
| 进程 | 还在，被冻结 | 没有了，进程状态都在快照里 |
| 进行中的调用 | 等解冻 | 失败 |
| 换节点恢复 | 不支持 | 支持 |

根本差别是：**容器的进程一直在宿主机上，而 microVM 的进程真的结束了。** microVM 暂停后，内存确实还给了宿主机；容器要靠 swap，默认甚至不回收。

## 实测

项目的裸金属测试机，单个 sandbox，测试时间和负载各不相同，只看量级：

| 操作 | 结果 |
|---|---|
| 容器暂停（开 `pause_reclaim`） | 85 ms，内存从 227 MB 降到 7 MB；恢复后 200 MB 数据校验无误 |
| microVM 暂停（256 MB，写全量快照） | 约 210 ms，cgroup 内存从 148 MB 降到 5 MB |
| microVM 第一次暂停（512 MB，全量） | 278 ms |
| microVM 之后的暂停（合并 18 MB 脏页） | 85 ms |
| microVM 恢复 | 约 50 ms |

我们没有测过上万个 sandbox 同时暂停的情况，也没有和论文的结果做过对比。

## 实现时碰到的问题

**`memory.reclaim` 不一定换出匿名页。** 它遵循宿主机的 `vm.swappiness`，我们测试机的云镜像设为 0，这时 cgroup 回收完全不碰匿名页；6.10 之前的内核也不能在 `memory.reclaim` 里单独指定 swappiness。所以先对每个进程用 `process_madvise(MADV_PAGEOUT)` 换出，再用 `memory.reclaim` 只处理 swap cache。开启 `pause_reclaim` 时，如果 swappiness 为 0，edge 启动时直接报错，不会替你改宿主机设置；宿主机还要有 swap，这一点 edge 不检查。

**全量写快照太慢。** 暂停和 fork 是高频操作。冷启动 VM 的内存初始全为零，写过的页都在脏页记录里，所以第一次也可以只写脏页，得到稀疏文件。之后的暂停只写增量，合并进上一份内存文件。

**任务操作要发给所有节点。** 我们最初按状态快照里的任务分布，只发给相关的 edge。但快照比其他 apiserver 刚完成的放置要旧，可能漏掉 sandbox。现在向所有健康的 edge 扇出，由 edge 按项目子树和任务过滤。节点是百级，这个成本可以接受。

**容量怎么算。** 暂停的 sandbox 释放了内存，但恢复时还要拿回来。`paused_mem_charge` 默认是 1，也就是仍按全额计入，不会因为暂停就多放 sandbox。调低它可以提高密度，代价是恢复时可能因内存不足失败。这时暂停的 microVM 会迁到别的节点恢复，容器不能迁移。

## 选择时要注意

- **容器要先配好 swap**：不开 `pause_reclaim`，暂停的容器只是不占 CPU，内存一点不少。
- **microVM 暂停会打断进行中的调用**：guest 里的进程只是停住，恢复后继续运行，但当时正在进行的 RPC 会失败，调用方要重试。
- **网络连接不一定还在**：microVM 恢复后，长时间暂停的 TCP 连接对端可能早已断开。
- **磁盘要留够**：microVM 的内存文件占节点磁盘。
- **整机重启会丢失**：暂停的 sandbox 不能在宿主机重启后恢复，microVM 也一样。
- **完整虚拟机不同**：OpenDsec 的 QEMU 后端暂停时只停 vCPU，内存不释放。

## 相关阅读

- [DeepSeek DSec 实现笔记：对照表](/blog/posts/dsec-implementation-notes)
- [Firecracker、gVisor 和容器怎么选](/blog/posts/firecracker-vs-gvisor-vs-containers)
- 论文：[arXiv:2609.22978](https://arxiv.org/abs/2609.22978)

*OpenDsec 与 DeepSeek 没有关联。文中关于 DSec 的内容均来自上述论文。*
