---
title: DeepSeek DSec 实现笔记：论文方案和 OpenDsec 的对照表
date: 2026-11-04
author: Kernflux
description: 逐项对照 DeepSeek DSec 论文和开源实现 OpenDsec：eBPF 与 nftables、3FS 与 NFS、EROFS、virtio-pmem、暂停和防越权，以及 pack_diff、aether/chronus、任务级暂停的实现笔记。
---

# DeepSeek DSec 实现笔记：论文方案和 OpenDsec 的对照表

[OpenDsec](https://github.com/Kernflux/opendsec) 是我们按 DeepSeek DSec 论文（[arXiv:2609.22978](https://arxiv.org/abs/2609.22978)）独立实现的开源项目，与 DeepSeek 没有关联。这一页是实现笔记的入口：一张对照表，加上三篇专题。为什么要补这些内容，见[照着 DSec 论文实现时要自己补的部分](/blog/posts/dsec-paper)。

## 专题

- [`pack_diff`：把 sandbox 变成镜像](/blog/posts/dsec-pack-diff)：写层时保持一致、清理残留，以及 NFS 上的不透明目录问题。
- [aether 和 chronus：一条命令的请求链](/blog/posts/dsec-aether-chronus)：从 SDK 到 shell 会话，每一层负责什么。
- [任务级暂停：容器和 microVM 是两套机制](/blog/posts/dsec-task-pause)：内存怎么释放，恢复怎么做，各自付出什么代价。

## 对照表

最后核对：2026-11-04，对照论文 v1 和 OpenDsec 的公开代码。

这张表记录的是实现差异。除非写明，两边的数字不能直接比较：硬件和负载都不同，我们也没有在同一环境里跑过两种方案。

| 主题 | DSec 论文 | OpenDsec | 差别和原因 |
|---|---|---|---|
| 网络策略（§6.5） | 每个 sandbox 一个 eBPF 程序，按 IP、端口和协议过滤 | nftables 加内置 DNS 代理，每个 sandbox 一条链 | 不同。域名在解析时变成 IP；不用写 BPF 程序。只支持 IPv4，共用 CDN IP 的站点也能访问 |
| 镜像存储（§5.3） | 3FS | 任何共享文件系统：NFS、CephFS、JuiceFS | 不同。用户不一定有 3FS。NFS 不传 `trusted.*` xattr，不透明目录要展开 |
| 容器镜像层（§5.1、§5.3） | EROFS，元数据在本地，数据在 3FS 上按需读 | 目录形式的层，第一次使用时整层复制到节点 | 不同，且没有按需加载。复制到本地后，镜像库中断不影响运行中的容器 |
| 容器运行时（§3.3、§7） | 修改过的 dockerd，容器跑在 QEMU/libvirt VM 里 | 自带运行时，不依赖 Docker，容器直接跑在宿主机上 | 不同。我们的主力隔离手段是 microVM，容器留给 GPU 和没有 KVM 的机器。容器的隔离弱于论文的做法 |
| microVM 只读层（§5.1） | 独立版本的 EROFS 只读盘，guest 里用 overlayfs 叠加 | 整个镜像一张只读盘：默认 ext4，开启 `erofs_images` 后是不压缩的 EROFS | 不同。论文可以换一层不动其他层，我们换任何一层都要重新做这张盘 |
| microVM 可写盘（§5.3） | OverlayBD 加 ublk，按需读，本地写 | 节点本地的 ext4 盘 | 不同。没有块级按需读 |
| virtio-pmem 加 DAX（§5.2） | 用于只读的基础镜像和 toolkit 层 | 用于只读镜像盘，配置 `image_pmem`，默认关闭 | 机制相同。论文测得峰值内存降低 40.2%，瞬时 CPU 峰值从 26.5% 升到 41.4%。我们测过 6 个 VM 读同一个 64 MB 文件，内存从 515–529 MB 降到 112–140 MB |
| 冷内存回收（§5.2） | DAMON 加 balloon 空闲页上报 | 同样的机制，再加 guest 内的 zram，配置默认关闭 | 基本相同。我们把上报粒度从 2 MB 改成 256 KB，因为 DAMON 换出后空出来的页很零散 |
| 暂停容器（§6.3） | `docker pause`，再用 `memory.reclaim` 回收 | cgroup freezer，再用 `process_madvise(MADV_PAGEOUT)` 换出 | 目的相同。`memory.reclaim` 受宿主机 `vm.swappiness` 影响，为 0 时不碰匿名页。默认不回收，配置 `pause_reclaim` |
| 暂停 microVM（§6.3） | 保存快照，结束 Firecracker 进程 | 相同，并且之后只写脏页，内存文件里的零页打洞 | 机制相同，我们补了增量写入 |
| 防越权（§6.4、§6.5） | AppArmor 限制 sandbox 内的 root | agent 会话用普通用户，评测用 root | 不同。AppArmor 那套在 microVM 里挡不住 guest 里的 root。要调用方自己给 agent 指定普通用户 |
| CPU 核心调度（§5.2、§8.5） | `SCHED_IDLE` 加核心调度 | 相同 | 机制相同。论文：50% 干扰下延迟增加从 45.2% 降到 17.3%。我们：从 18.0% 降到 2.1% |

## 还没有做的

- 没有实现按需加载，所以没有和全量拉取做过对比。
- 没有在同一环境里比较过 eBPF 和 nftables 的性能。
- 没有 AppArmor。
- GPU 没有在真实硬件上测过。

设计决定的完整记录在 [SPEC.md](https://github.com/Kernflux/opendsec/blob/main/docs/SPEC.md)，每一点都标注了来自论文还是我们自己的决定。发现表里有错，欢迎[提 issue](https://github.com/Kernflux/opendsec/issues)。

*文中关于 DSec 的内容均来自上述论文。*
