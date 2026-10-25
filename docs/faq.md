---
description: "OpenDsec 常见问题：它是什么、能自建的 E2B 替代、microVM 与容器怎么选、能跑多少 sandbox、强化学习、Kubernetes、商用许可、KVM、GPU 和生产可用性。"
---

# 常见问题

## OpenDsec 是什么？

面向强化学习 rollout 和会执行代码的 AI 智能体的开源 sandbox 基础设施。它在你自己的 Linux 机器上运行相互隔离的 sandbox（Firecracker microVM、容器和 QEMU 虚拟机），从一台机器到整个集群都可以，提供自己的 Python SDK，也兼容 E2B 的 API。它照 DSec 论文（arXiv:2609.22978）实现，以 AGPL-3.0 开源。

## 没有 KVM 能用吗？

能。安装脚本发现没有 `/dev/kvm` 时只装容器后端，SDK 和 E2B 接口照常可用。要跑 microVM，用裸金属机器，或者开启了嵌套虚拟化的云主机。

## 支持哪些 Linux 发行版？

全新安装的 Ubuntu 24.04 上完整验证过。要求 x86_64、内核 5.15 以上、cgroup v2 和 systemd。其他发行版应该可以运行，但还没有逐一验证；遇到问题请[提 issue](https://github.com/Kernflux/opendsec/issues)。

## 和 E2B 是什么关系？

OpenDsec 提供和 E2B 兼容的 API。按 E2B SDK 写的程序，把 `E2B_API_URL`、`E2B_SANDBOX_URL`、`E2B_API_KEY` 指向你的网关就能运行，sandbox 跑在你自己的机器上。E2B 官方 Python SDK（同步和异步）和 JS/TS SDK 的验收检查全部通过。

还不支持监听目录、签名的文件 URL 和构建 template。差别和迁移方法见[从 E2B 迁移](/docs/e2b)。

## 有没有能自建的开源 E2B 替代？

有：OpenDsec 跑在你自己的机器上，兼容 E2B 的 API，按 E2B SDK 写的代码改三个环境变量就能迁过来。E2B 自己的运行时也是开源的，可以在一台机器上自建。OpenDsec、E2B、Daytona 和 Modal 的区别见[对比](/docs/compare)。

## 和 DeepSeek 是什么关系？

没有关系。OpenDsec 照 DeepSeek 公开的 DSec 论文独立实现，未经 DeepSeek 认可，也不包含其代码。

## microVM、容器和 gVisor 怎么选？

OpenDsec 提供 microVM（Firecracker，每个 VM 有自己的内核，jailer 给每个 VM 单独的 uid），用来跑不可信的代码，是默认选择；以及容器（namespace、cgroup、seccomp，和宿主机共用内核），用于可信、对性能敏感的代码和构建镜像。OpenDsec 不使用 gVisor。两者都在约 0.1 秒内启动，只有 microVM 能连同内存 fork 和暂停。详见[核心概念](/docs/concepts)。

## 一个集群能跑多少 sandbox？

在 2 × AMD EPYC 9Y24 裸金属上（每台 384 线程、1.5 TB 内存），单台节点一次突发创建 5120 个 microVM 用时 37 秒，两台节点一次突发创建 8192 个容器全部成功。瓶颈通常是内存：打开内存优化（virtio-pmem 镜像、free page reporting、zram）后，16 个闲置的 512 MB VM 占用的宿主机内存约为不开时的 31%；5120 个闲置的 512 MB VM 平均每个约占 91 MB。

## 适合强化学习训练吗？

这正是它的设计目标。一次调用最多批量创建 32768 个 sandbox；sandbox 带 `task_id`，训练任务被抢占时可以把它的 sandbox 整批暂停并释放内存；`fork(count=N)` 连同内存复制运行中的 microVM，用于树搜索；重试不会创建出重复的 sandbox。详见[核心概念](/docs/concepts)。

## 能在 Kubernetes 上运行吗？

实验性支持：`deploy/k8s/` 里的清单只运行容器 sandbox（没有 microVM），多节点还没有完整验证。经过验证的方式是单机和由 systemd 管理的集群，见[部署方式](/docs/deploy)。

## 商用要付费吗？

不用。服务端是 AGPL-3.0，SDK 和客户端是 Apache-2.0，调用 OpenDsec 的程序不受 AGPL 约束。如果你修改了服务端并通过网络提供给他人使用，AGPL 要求公开你的修改。也提供商业授权、技术支持和企业版，见[许可与商业授权](/docs/license)。

## 机器不能访问外网，怎么装？

用离线安装包，见[部署方式](/docs/deploy#离线环境)。

## 现在能用在生产环境吗？

当前是 0.x 版本，1.0 之前接口可能调整，兼容策略见[版本与兼容](/docs/versioning)。在压力下滚动升级、硬重启管控节点、切换 IAM leader 都验证过，没有失败的调用。需要技术支持或商业授权，见[许可](/docs/license)。

## 支持 GPU 吗？

支持把 GPU 独占或共享给容器 sandbox，完整 VM 后端支持 PCI 直通。这两项还没有在真实 GPU 上测过。

## 还有别的问题？

先看[故障排查](/docs/troubleshooting)，那里按现象列出了遇到过的问题和处理方法。没有找到的，请[提 issue](https://github.com/Kernflux/opendsec/issues)。
