---
title: OpenDsec 开源了
date: 2026-10-24
author: Kernflux
description: 照 DeepSeek 的 DSec 论文实现的 sandbox 基础设施，现在以 AGPL-3.0 开源：Firecracker microVM、连同内存的 fork、按任务暂停，兼容 E2B 的 SDK。
---

# OpenDsec 开源了

今天我们把 OpenDsec 的代码公开在 [GitHub](https://github.com/Kernflux/opendsec) 上。它是一套给强化学习训练和会执行代码的智能体用的 sandbox 基础设施：在你自己的机器上，成批地创建、暂停、复制和销毁隔离的执行环境。

## 为什么做它

智能体的强化学习训练要同时跑成千上万个 rollout，每个 rollout 都要一个能装依赖、跑测试、访问网络的隔离环境。训练会被抢占，环境要能整批暂停；同一个状态要试多种走法，环境要能连同内存一起复制。

DeepSeek 在论文 [*DeepSeek Elastic Compute (DSec)*](https://arxiv.org/abs/2609.22978) 里详细描述了他们为此建的系统。OpenDsec 照这篇论文实现：无状态的 apiserver、带多级项目和配额的 IAM、汇总调度状态的 watcher、power-of-k 调度和节点上的最终准入，以及分层镜像、默认拒绝的网络策略和按任务暂停。论文没有说明的地方由我们自己决定，仓库里的 [SPEC](/docs/spec) 逐条标注了哪些来自论文、哪些是我们的选择。

OpenDsec 是独立项目，与 DeepSeek 没有关系，也不包含其代码。

## 它能做什么

- **快**：Firecracker microVM 冷启动约 0.1 秒，从内存快照创建约 55 毫秒，暂停后恢复约 50 毫秒。
- **fork**：`fork(count=N)` 连同内存复制一个正在运行的 VM，源 VM 只停顿约 10 毫秒。同一节点上的副本共享内存页，64 个副本并发恢复约 0.2 秒。
- **规模**：单个 384 线程的节点一次突发创建 5120 个 microVM，用时 37 秒。
- **兼容 E2B**：按 E2B SDK 写的程序换三个环境变量就能跑在你自己的机器上，E2B 官方 Python 和 JS SDK 的验收检查全部通过。
- **能运维**：组件之间 mTLS，IAM 用 Raft 多副本；fleet 分批滚动升级，失败自动回退；支持离线安装。升级任何组件都不影响运行中的 sandbox。

这些数字都是在我们自己的裸金属机器上测的，测量方法写在 SPEC 里。

## 试一试

一台装了 Ubuntu 24.04 的 Linux 机器，约 10 分钟：

```sh
sudo -i
apt update && apt install -y make git python3-venv
curl -fsSL https://go.dev/dl/go1.27.3.linux-amd64.tar.gz | tar -C /usr/local -xz
git clone https://github.com/kernflux/opendsec && cd opendsec
deploy/quickstart.sh
```

详细步骤见[快速开始](/docs/quickstart)，多机集群和离线安装见[部署方式](/docs/deploy)。

## 许可

服务端是 AGPL-3.0；Python SDK、Go 客户端和 API 定义是 Apache-2.0，调用 OpenDsec 的程序不受 AGPL 约束。闭源修改、作为服务对外提供而不公开修改，或者需要企业版的单点登录和审计导出，可以申请[商业授权](/docs/license)。

## 接下来

当前是 0.x 版本，1.0 之前接口可能调整。还没有验证过的有：Ubuntu 24.04 以外的发行版、真实 GPU、多节点 Kubernetes。欢迎在 GitHub 上提 issue 和 PR。
