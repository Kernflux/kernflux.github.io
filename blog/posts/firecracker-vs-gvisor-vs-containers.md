---
title: Firecracker、gVisor 还是容器：AI 代码沙箱（sandbox）该用哪种隔离
date: 2026-10-25
author: Kernflux
description: "AI 代码沙箱（sandbox）该用容器、gVisor、Firecracker microVM 还是完整虚拟机？对比隔离原理、攻击面、启动速度和内存开销，附实测数据。"
---

# Firecracker、gVisor 还是容器：AI 代码沙箱（sandbox）该用哪种隔离

AI 智能体会生成代码并执行，强化学习的 rollout 更是成千上万地运行模型写出的命令。这些代码不可信：它可能以 root 运行、尝试逃逸、扫描网络、耗尽资源。所以执行它的沙箱（sandbox）首先要回答一个问题：**用什么隔离？**

先说结论：

- **运行不可信代码，用 microVM**（例如 Firecracker）：每个 sandbox 有自己的内核，攻击面是少量虚拟设备，而不是宿主机内核的全部系统调用。代价是需要 KVM，以及每个 VM 多一份 guest 内核的内存。
- **没有 KVM（普通云主机没开嵌套虚拟化），又想比容器隔离更强，用 gVisor**：它在用户态实现了一个 Linux 兼容的内核，不需要硬件虚拟化。代价是兼容性和系统调用密集负载的性能。
- **代码可信、或者要 GPU、要极致密度，用容器**：最快、最省，但和宿主机共享内核，内核漏洞就可能逃逸。
- **要完整的操作系统或 PCI 直通，用 QEMU 完整虚拟机。**

下面展开四种隔离的原理和取舍，以及我们在开源项目 [OpenDsec](https://github.com/Kernflux/opendsec) 里的实测数据。

## 一张表看懂

| | 容器 | gVisor | Firecracker microVM | QEMU 完整虚拟机 |
|---|---|---|---|---|
| 内核 | 与宿主机共享 | 用户态的「应用内核」（Sentry，Go 编写）处理系统调用 | 每个 VM 自己的 Linux 内核，靠 KVM 硬件虚拟化 | 每个 VM 自己的内核，完整的设备模型 |
| sandbox 里的代码直接面对的 | 宿主机内核的系统调用（可以用 seccomp 收窄） | Sentry（它不把系统调用直接转给宿主机内核） | 少量虚拟设备（网卡、块设备、vsock 等）和 KVM | 更多的虚拟设备 |
| 需要 `/dev/kvm` | 不需要 | 不需要（默认的 systrap 平台）；有 KVM 时可以用更快的 KVM 平台 | 需要 | 需要 |
| 兼容性 | 原生 | 不是所有系统调用和 `/proc`、`/sys` 文件都实现了 | 完整 Linux | 完整系统，包括别的操作系统 |
| 性能取舍 | 几乎没有额外开销 | 系统调用密集的负载可能明显变慢 | 纯计算超过裸机的 95%（官方规格） | 启动更慢，内存开销更大 |
| 许可证 | — | Apache-2.0 | Apache-2.0 | GPL-2.0 |

gVisor 和 Firecracker 的说法都来自它们的官方文档，链接见文末。

## 容器：共享内核，靠收窄接口

容器是 Linux 内核的几个功能组合起来的：namespace 隔离视图（进程、网络、挂载点），cgroup 限制资源，overlayfs 提供文件系统。sandbox 里的进程直接调用宿主机内核，所以：

- **快和省**：没有虚拟化层，启动就是起一个进程，内存只算进程自己用的。
- **安全取决于内核接口收得有多窄**：去掉不需要的能力（capability），用 seccomp 拒绝危险的系统调用（挂载、`bpf`、`userfaultfd`、内核模块、创建用户命名空间……）。但剩下的几百个系统调用仍然直通宿主机内核，内核里任何一个可被利用的漏洞都可能导致逃逸。

所以容器适合运行**可信**的代码：构建镜像、你自己写的评测程序、需要 GPU 的训练任务。

## gVisor：在用户态再实现一个内核

gVisor 的思路是不让 sandbox 直接碰宿主机内核。它的核心组件 Sentry 是一个用 Go 写的「应用内核」，实现了 Linux 的系统调用接口：sandbox 里的进程发起系统调用，被平台层（默认是基于 seccomp 的 systrap）截获，交给 Sentry 处理。文件访问再交给另一个宿主机进程 Gofer。

- **优点**：不需要硬件虚拟化，普通云主机也能用；以 OCI 运行时 `runsc` 的形式提供，Docker 和 Kubernetes 可以直接用；资源占用灵活，没有固定的 VM 开销。
- **代价**：官方文档明确说，gVisor「目前没有实现所有系统调用和 `/proc`、`/sys` 文件」，系统调用密集的负载性能可能较差。智能体的代码什么都可能跑（编译、包管理器、数据库），兼容性问题要实际测试。

托管服务 Modal 的 sandbox 默认就用 gVisor。

## Firecracker microVM：每个 sandbox 一个精简的虚拟机

Firecracker 是 AWS 为 Lambda 和 Fargate 开发的虚拟机监视器（VMM），开源，Apache-2.0。它用 KVM 跑真正的虚拟机，但去掉了几乎所有不需要的设备，只保留网卡、块设备、vsock、熵源、pmem 等少数几种。官方规格：

- 从收到启动请求到 guest 内核开始运行 **≤125 ms**；
- VMM 线程的内存开销 **≤5 MiB**（1 vCPU、128 MiB 的 VM）；
- 纯计算性能 **超过裸机的 95%**。

隔离上，sandbox 里的 root 只是 guest 内核的 root，要逃逸得先攻破 Firecracker 的少量虚拟设备或 KVM。生产环境再用 Firecracker 自带的 jailer 启动：chroot、cgroup、namespace，再降权运行，加上按线程的 seccomp 过滤。

代价：**需要 KVM**（裸金属，或开了嵌套虚拟化的云主机）；每个 VM 要多一份 guest 内核和它的内存；不支持 GPU 直通。

除了隔离，microVM 还有一个容器不容易做到的能力：**内存快照**。整个 VM 的内存可以保存下来，之后在几十毫秒内恢复，运行中的进程原样继续。这让「从快照启动」「暂停后恢复」「连同内存 fork」都成为可能。E2B 也是基于 Firecracker。

## QEMU 完整虚拟机

QEMU 提供完整的设备模型：可以跑镜像自己的 init、别的操作系统，也可以把 GPU 通过 PCI 直通给 VM。代价是启动更慢、内存开销更大、攻击面也更大。适合「必须是完整系统」的任务，不适合作为大量 sandbox 的默认选择。

## 实测：OpenDsec 的三种后端

OpenDsec 同时提供容器、Firecracker microVM 和 QEMU 完整虚拟机三种后端（不提供 gVisor），调用方在创建时明确选择。下面是项目的裸金属测试机（2 × AMD EPYC 9Y24，384 线程，1.5 TB 内存）上的数据：

| | 容器 | Firecracker microVM | QEMU 完整虚拟机 |
|---|---|---|---|
| 启动 | 约 0.1 s | 冷启动约 0.1 s；从内存快照约 55 ms | 约 0.23 s |
| 单个创建，经 API（含网络、TLS） | 约 65 ms | 约 190 ms | 约 300 ms |
| 暂停 | 冻结进程，内存可以换出到 swap | 拍内存快照后结束进程，内存全部释放；恢复约 50 ms | 停止 vCPU，内存保留 |
| fork | 只复制文件 | 连同内存 | 不支持 |
| 突发创建 | 两个节点 8,192 个（0.25 核、256 MB），全部成功 | 单个节点 5,120 个（512 MB），全部成功 | — |

5,120 个 microVM 那一项值得多说一句：申请的内存合计 2.6 TB，宿主机实际只用了约 468 GB，平均每个 VM 约 91 MB。做到这一点靠的是：

- **free page reporting**：guest 内核把空闲页告诉宿主机，宿主机收回；
- **virtio-pmem 加 DAX**：只读的镜像通过 pmem 设备映射进 VM，同一个镜像的页缓存在所有 VM 之间共享，不再每个 VM 各缓存一份。

也就是说，microVM「每个都要一份 guest 内存」的开销，在实际负载下可以压得很低。

## OpenDsec 为什么默认用 microVM

DeepSeek 的 DSec 论文以容器为主力后端，microVM 只用于需要更强隔离的场景。OpenDsec 把默认改成了 Firecracker microVM（[论文解读](/blog/posts/dsec-paper)），原因是：

1. **隔离**：智能体的代码不可信，不共享宿主机内核是最直接的防线。
2. **内存快照**：环境准备好之后拍一个快照，之后每个 sandbox 从快照启动，依赖、加载好的模型、运行中的服务都在，约 55 ms 就能用。
3. **fork**：连同内存复制一个运行中的 sandbox，适合树搜索和从同一个状态展开大量 rollout。
4. **密度够用**：上面的实测说明，microVM 的内存开销在实际负载下可以压到每个约 91 MB。

容器后端仍然保留，用于 GPU 任务（Firecracker 不支持 GPU 直通）、对启动和内存最敏感的大批量可信任务，以及没有 KVM 的机器。

无论哪种后端，OpenDsec 都在宿主机上加了同样的几层：出站网络默认拒绝（nftables 加 DNS 代理）、CPU 核心调度（两个 sandbox 不会同时跑在同一个物理核的两个超线程上，挡住经超线程的侧信道）、每条命令的输出上限；智能体和评测还可以用不同的用户运行。详见[安全模型](/docs/security)。

## 怎么选

| 你的情况 | 建议 |
|---|---|
| 运行 AI 生成的、不可信的代码，有裸金属或能开嵌套虚拟化 | Firecracker microVM |
| 运行不可信的代码，但只有普通云主机、没有 KVM | gVisor（先测一下你的负载的兼容性和性能） |
| 已经在 Kubernetes 上，想换一个更强的运行时 | gVisor（`runsc`），或者 Kata Containers 这类把容器跑在 VM 里的方案 |
| 代码可信，追求速度和密度，或者需要 GPU | 容器，配合 seccomp 和最小的能力集 |
| 需要完整的操作系统或 PCI 直通 | QEMU 完整虚拟机 |
| 需要暂停后恢复、从快照启动、连同内存 fork | microVM |

## 常见问题

### Firecracker 和 gVisor 哪个更安全？

两者都比普通容器强，思路不同。Firecracker 用硬件虚拟化，sandbox 面对的是少量虚拟设备和 KVM；gVisor 在用户态重新实现内核接口，sandbox 面对的是 Sentry。运行不可信代码时，有 KVM 的机器上我们更推荐 microVM：边界是硬件虚拟化，而且还能做内存快照。

### Docker 容器能用来跑 AI 生成的代码吗？

可以，但要清楚风险：容器和宿主机共享内核，一个可利用的内核漏洞就可能逃逸。至少要去掉多余的能力、用 seccomp 拒绝危险的系统调用、禁止创建用户命名空间、限制网络。不可信代码优先用 microVM 或 gVisor。

### Firecracker 需要什么环境？

需要 Linux 宿主机和 `/dev/kvm`：裸金属服务器，或者开启了嵌套虚拟化的云主机。没有 KVM 就只能用容器或 gVisor。

### microVM 会比容器慢很多吗？

启动上差别不大：OpenDsec 实测 microVM 冷启动约 0.1 s，从内存快照约 55 ms，和容器在同一个量级。计算性能方面，Firecracker 官方规格是超过裸机的 95%。差别主要在内存：每个 VM 有自己的 guest 内核，但通过 free page reporting 和共享页缓存可以压到很低。

### gVisor 支持所有程序吗？

不一定。gVisor 官方文档说明它目前没有实现所有系统调用和 `/proc`、`/sys` 文件，系统调用密集的负载性能可能较差。上线前要用真实负载测试。

### 能在 Kubernetes 上用 Firecracker 吗？

可以通过 Kata Containers 这类项目（Firecracker 官方说明已集成进 Kata Containers）。OpenDsec 则是自己管理节点上的 Firecracker，不依赖 Kubernetes，见[核心概念](/docs/concepts)。

## 参考资料

- Firecracker：[README](https://github.com/firecracker-microvm/firecracker)、[规格](https://github.com/firecracker-microvm/firecracker/blob/main/SPECIFICATION.md)
- gVisor：[文档](https://gvisor.dev/docs/)、[平台](https://gvisor.dev/docs/architecture_guide/platforms/)
- OpenDsec：[核心概念](/docs/concepts)（各后端）、[安全模型](/docs/security)、[与 E2B、Daytona、Modal 对比](/docs/compare)

*文中 gVisor 和 Firecracker 的说法来自它们的官方文档，核对日期 2026-10-25；OpenDsec 的数据来自项目的测试记录。*
