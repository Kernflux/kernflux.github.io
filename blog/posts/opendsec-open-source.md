---
title: OpenDsec：自建的 sandbox，给强化学习 rollout 和会执行代码的智能体
date: 2026-10-24
author: Kernflux
description: 照 DeepSeek 的 DSec 论文实现的开源 sandbox 基础设施：Firecracker microVM 0.16 秒就绪，能连同内存 fork，能整批暂停。它是什么，以及怎样在一台机器上试用。
---

# OpenDsec：自建的 sandbox，给强化学习 rollout 和会执行代码的智能体

用智能体强化学习训练模型时，每个 rollout 都要一个能跑代码的地方：装包、跑测试、访问网络、写文件。这样的环境同时要跑成千上万个。训练被抢占时，它们要一起停下，过后再一起恢复。同一个状态想试几种走法时，要的是环境此刻的副本，连同内存，而不是从镜像重新起一个。

托管的 sandbox 服务能解决其中一部分。我们想在自己的机器上把这些都做到，于是写了 [OpenDsec](https://github.com/Kernflux/opendsec)，以 AGPL 开源。

这篇介绍它能做什么、跑起来是什么样子，以及它目前的局限。

## 从头跑一遍

![deploy/quickstart.sh，然后一个 microVM sandbox 输出 42 并 fork 成四份](/demo.svg)

这是在一台裸金属服务器上的真实录制：先跑安装脚本，再用一段很短的 Python 程序创建一个 Firecracker microVM，在里面执行 `print(6*7)`，然后把它 fork 成四份。编译和安装的 6 分钟剪掉了，其余部分按实际速度播放。0.16 秒是从客户端测的整个 API 调用的时间（调度、启动、VM 里的 agent 就绪）。

客户端这边就是下面这段程序：

```python
import asyncio, time
from opendsec import DSecClient, DSecRunArgs

async def main():
    async with DSecClient() as client:
        t = time.perf_counter()
        sb = await client.run_sandbox(DSecRunArgs(backend="microvm", image="root/py:3.12"))
        print(f"ready in {time.perf_counter() - t:.2f}s (whole API call: placement + boot)")
        print((await sb.run_shell("python3 -c 'print(6*7)'")).stdout.strip())
        t = time.perf_counter()
        forks = await sb.fork(count=4)    # copies with memory
        print(f"forked 4 in {time.perf_counter() - t:.2f}s")
        await asyncio.gather(*(s.stop() for s in [sb, *forks]))

asyncio.run(main())
```

## 设计从哪里来

DeepSeek 在论文 [*DeepSeek Elastic Compute (DSec)*](https://arxiv.org/abs/2609.22978) 里描述了他们智能体强化学习训练背后的 sandbox 平台。OpenDsec 照这篇论文实现：无状态的 apiserver、带多级项目和配额的 IAM、汇总调度状态的 watcher、power-of-k 调度并由各节点做最终准入、按需加载的分层镜像、默认拒绝的网络策略，以及整个任务一起暂停。

论文没有说明的地方，或者我们选了不同做法的地方，由我们自己决定：网络策略用 nftables 加 DNS 代理而不是 eBPF，镜像存储用任意共享文件系统（NFS、CephFS、JuiceFS）而不是 3FS，主力后端是带内存快照的 Firecracker。[设计文档](/docs/spec)逐条标注了哪些来自论文、哪些是我们的选择。

OpenDsec 是独立项目，与 DeepSeek 没有关系，也不包含其代码。

## 它能做什么

- **三种 sandbox，一套 API**：Firecracker microVM、容器和完整的 QEMU 虚拟机。执行命令、文件、进程、PTY 和访问 sandbox 里的 HTTP 服务，在三种后端上用法一样。
- **快**：VM 启动约 0.1 秒，从内存快照创建约 55 毫秒，暂停后恢复约 50 毫秒。
- **连同内存 fork**：`fork(count=N)` 让源 VM 停顿约 10 毫秒，得到 N 个进程、已导入的模块和监听的端口都一样的副本。同一节点上的副本共享内存页；在其他节点上，副本直接从源节点拉取快照。
- **规模**：单个 384 线程的节点一次突发创建 5120 个 microVM，用时 37 秒。两节点集群一次突发创建 8192 个容器，没有失败。
- **按任务暂停**：一次调用暂停一个训练任务的全部 sandbox，把内存换出到 swap，过后再恢复。
- **兼容 E2B**：按 E2B SDK 写的程序，换三个环境变量（`E2B_API_URL`、`E2B_SANDBOX_URL`、`E2B_API_KEY`）就能跑在你自己的机器上。E2B 官方 Python 和 JS SDK 的检查全部通过。
- **能运维**：组件之间全部 mTLS，IAM 用 Raft 多副本，有 Prometheus 指标和告警，分批滚动升级、失败自动回退，支持离线安装。重启或升级任何组件都不影响运行中的 sandbox。

这些数字都是在我们自己的裸金属机器上测的，测量方法写在设计文档里。换一套硬件，数字会不一样。比如 fork 的耗时取决于 sandbox 状态目录所在的文件系统：XFS 用 reflink 复制内存文件，约 0.1 秒；ext4 只能真的复制，约 1 秒。

## 在一台机器上试用

需要一台 Linux x86_64 机器，带 systemd 和 cgroup v2（我们在 Ubuntu 24.04 上测试）。microVM 还需要 `/dev/kvm`，所以要用裸金属，或者开了嵌套虚拟化的云主机；没有的话只装容器。

```sh
sudo -i
apt update && apt install -y make git python3-venv
curl -fsSL https://go.dev/dl/go1.27.3.linux-amd64.tar.gz | tar -C /usr/local -xz
git clone https://github.com/kernflux/opendsec && cd opendsec
deploy/quickstart.sh
```

脚本会检查机器、编译全部程序、下载 Firecracker 和 guest 内核（按固定的哈希校验），以 systemd 服务装好各组件并给它们签发自己的 CA，从 Docker Hub 导入 `python:3.12`，再各跑一个容器和 microVM 做检查。然后：

```sh
python3 -m venv .venv && .venv/bin/pip install ./sdk/python
. /root/opendsec-ops/demo.env
.venv/bin/python sdk/python/examples/quickstart.py
```

`deploy/quickstart.sh --uninstall` 会把这些全部移除。详细步骤见[快速开始](/docs/quickstart)，多机集群和离线安装见[部署方式](/docs/deploy)。

## 它（还）不是什么

- 当前是 0.x 版本，1.0 之前接口可能调整。
- 宿主机只验证过 Ubuntu 24.04。其他发行版、真实 GPU、多节点 Kubernetes 都还没有测过。
- 它是要你自己运行的基础设施，没有托管版本。

## 许可

服务端是 AGPL-3.0；Python SDK、Go 客户端和 API 定义是 Apache-2.0，只调用 OpenDsec 的程序不受 AGPL 约束。需要闭源修改的，可以申请[商业授权](/docs/license)。

## 下一篇

[Firecracker、gVisor 和容器的对比](/blog/posts/firecracker-vs-gvisor-vs-containers)：运行 AI 生成的代码时，它们在隔离、启动时间、内存和兼容性上的差别，附实测数据。

代码在 [github.com/Kernflux/opendsec](https://github.com/Kernflux/opendsec)，文档在[这里](/docs/)。欢迎在 GitHub 上提问和反馈。
