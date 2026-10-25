---
description: "OpenDsec 与 E2B、Daytona、Modal Sandboxes 的对比：部署位置、许可证、隔离方式、连同内存的快照和 fork、暂停、GPU、E2B 兼容，以及各自适合什么场景。"
---

# OpenDsec 与 E2B、Daytona、Modal 对比

OpenDsec 是装在你自己的 Linux 机器上的 sandbox 基础设施：Firecracker microVM、容器和 QEMU 虚拟机，fork 和暂停都保留内存，并提供 E2B SDK 能直接调用的 API。E2B、Daytona 和 Modal 主要是托管服务。这一页从强化学习 rollout 和会执行代码的智能体关心的方面对比这四者，并说明各自适合什么场景。

其他产品的情况都来自它们自己的文档和代码仓库，核对日期 2026-10-25，链接见[来源](#来源)。托管产品变化快，做决定前请再看一下它们的最新文档。文档里没有写的，表格里照实写「没有说明」，不做猜测。发现有误或过时，请[提 issue](https://github.com/Kernflux/opendsec/issues)。

## 一览

| | OpenDsec | E2B | Daytona | Modal Sandboxes |
|---|---|---|---|---|
| 在哪里运行 | 只在你自己的机器上：一台 Linux 机器或一个集群，也可以完全离线。没有托管服务 | 托管云。开源的运行时可以在一台机器上自建（Embed）；企业版可部署到客户自己的云账号（BYOC） | 托管云；也支持「自带算力」的部署 | 只在 Modal 的云上 |
| 许可证 | 服务端 AGPL-3.0；SDK 和客户端 Apache-2.0 | Apache-2.0（SDK 和运行时） | 开源仓库已于 2026 年归档（最后一个版本 v0.190.0，AGPL-3.0），之后在私有代码库里开发 | 闭源 |
| 隔离方式 | 默认 Firecracker microVM 加 jailer；也提供容器和 QEMU 虚拟机 | Firecracker microVM | 「独立内核」；有容器和虚拟机两种运行时（文档没写具体技术） | 默认 gVisor；虚拟机运行时处于 alpha |
| 连同内存 fork 运行中的 sandbox | 支持：`fork(count=N)`，最多 256 个副本，源 VM 停顿约 10 ms | 支持：快照默认包含内存，一个快照可以创建多个 sandbox | 我们查阅的文档中没有说明 | 内存快照处于 alpha |
| 连同内存暂停和恢复 | 支持；恢复约 50 ms；可以按任务整批暂停 | 支持；暂停每 GiB 内存约 4 秒，恢复约 1 秒 | 我们查阅的文档中没有说明 | 通过内存快照（alpha） |
| 实测启动时间 | microVM 冷启动约 0.1 s；从内存快照创建约 55 ms | 我们查阅的文档中没有说明 | 「90 ms 以内」 | 我们查阅的文档中没有说明 |
| sandbox 最长存活时间 | 由管理员设定（默认上限 7 天） | 1 小时（Hobby）、24 小时（Pro） | 我们查阅的文档中没有说明 | 24 小时 |
| GPU | 容器（独占或共享）和 QEMU PCI 直通；还没有在真实 GPU 上测过 | 不提供 | 有 NVIDIA 和 AMD 的 GPU sandbox | 支持（gVisor 运行时） |
| E2B SDK | 通过网关支持（[差异见此](/docs/e2b)） | 原生 | 自己的 SDK | 自己的 SDK |
| 费用 | 免费软件，跑在你自己的硬件上；可选商业授权 | 按秒计 vCPU 和内存，另有套餐 | 托管服务定价 | 托管服务定价 |

## 怎么选

**OpenDsec** 适合：
- sandbox 必须跑在自己的机器上：私有机房、离线网络、数据不能出域，或者已经有现成的硬件；
- 大规模跑强化学习 rollout：单台 384 线程的节点一次突发创建 5120 个 microVM 用时 37 秒，两个节点一次突发创建 8192 个容器全部成功；
- 需要从运行中的状态分叉：`fork(count=N)` 连同内存复制 microVM，适合树搜索，或者从一个准备好的环境展开大量 rollout；
- 代码已经基于 E2B SDK，想保留现有代码、迁到自己的基础设施上。

**E2B** 适合想用托管服务、不想自己运维，或者自建一台机器就够用的场景。

**Modal** 适合现在就需要在 sandbox 里用 GPU，或者工作负载已经跑在 Modal 上的场景。

**Daytona** 适合想用它的托管 sandbox（包括 GPU sandbox）的场景。它的开源仓库已经归档，自建只能用最后一个开源版本，不会再有更新。

## OpenDsec 还做不到的

- **没有托管服务**：需要自己安装和运维。单机按[快速开始](/docs/quickstart)约 10 分钟装好，集群见[多机集群部署](/docs/cluster)。
- **还是 0.x 版本**：1.0 之前接口可能变化（[版本与兼容](/docs/versioning)）。
- **GPU 没有实测过**：代码已经有了，但还没有人在真实 GPU 上跑过。
- **E2B 兼容还有缺口**：还不支持目录监听、签名文件地址和模板构建（[详情](/docs/e2b)）。
- **只支持 Linux x86_64**；microVM 需要 `/dev/kvm`（裸金属，或开启了嵌套虚拟化的云主机）。

## 来源

核对日期 2026-10-25。

- OpenDsec：[核心概念](/docs/concepts)（后端、超时、fork）、[实测数据](/)（2 × AMD EPYC 9Y24 裸金属）、[E2B 兼容](/docs/e2b)、[许可](/docs/license)。
- E2B：[开源说明](https://e2b.dev/open-source.md)和 [e2b-dev/runtime](https://github.com/e2b-dev/runtime)（Apache-2.0、Firecracker、Embed）、[持久化](https://docs.e2b.dev/sandbox/persistence)（暂停和恢复）、[快照](https://docs.e2b.dev/sandbox/snapshots)、[定价](https://e2b.dev/pricing)（套餐、会话时长、不提供 GPU）。
- Daytona：[daytonaio/daytona](https://github.com/daytonaio/daytona)（已归档；最后一个版本 v0.190.0，2026-06-23）、[文档](https://www.daytona.io/docs)（隔离、启动时间、GPU sandbox、自带算力）。
- Modal：[Sandboxes 指南](https://modal.com/docs/guide/sandboxes)（gVisor、GPU、24 小时上限）、[Sandbox 快照](https://modal.com/docs/guide/sandbox-snapshots)（内存快照 alpha）、[VM Sandboxes](https://modal.com/docs/guide/vm-sandboxes.md)（alpha）。
