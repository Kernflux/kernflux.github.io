---
title: 自建 E2B：在自己的服务器上运行 E2B 代码沙箱（sandbox）
date: 2026-10-25
author: Kernflux
description: "自建 E2B 的两种方法，以及用开源的 OpenDsec 一步步搭建兼容 E2B 的代码沙箱（sandbox）：单机安装、code interpreter、fork 和快照。"
---

# 自建 E2B：在自己的服务器上运行 E2B 代码沙箱（sandbox）

[E2B](https://e2b.dev) 是 AI 智能体最常用的代码执行沙箱（sandbox）之一：智能体生成的代码在一个隔离的 Firecracker microVM 里运行，不少智能体框架都支持 E2B。但 E2B 主要是托管云服务，代码和数据要发到 E2B 的云上。数据不能出域、网络离线、或者 sandbox 用量大到托管费用不划算时，就需要自建。

先说结论。自建 E2B 有两条路：

1. **E2B 自己的开源运行时**（[e2b-dev/runtime](https://github.com/e2b-dev/runtime)，Apache-2.0）。可以在一台机器上自建（Embed）；部署到自己的云账号（BYOC）是企业版功能。
2. **OpenDsec 的 E2B 网关**。[OpenDsec](https://github.com/Kernflux/opendsec) 是开源的 sandbox 平台，自带一个提供 E2B API 的网关。用 E2B SDK 写的代码不用改，设置三个环境变量就能跑在你自己的单机或集群上。

这篇文章一步步介绍第二条路：单机安装、用 E2B SDK 调用、搭 code interpreter、扩成集群，以及和 E2B 的差别。

## 第一步：单机安装

需要一台 Linux x86_64 机器（在 Ubuntu 24.04 上验证过），有 systemd 和 cgroup v2。要用 microVM（和 E2B 一样的 Firecracker），还需要 `/dev/kvm`：裸金属，或者开启了嵌套虚拟化的云主机。

```sh
sudo -i                                    # 以下都用 root
apt update && apt install -y make git python3-venv
curl -fsSL https://go.dev/dl/go1.27.3.linux-amd64.tar.gz | tar -C /usr/local -xz
git clone https://github.com/kernflux/opendsec && cd opendsec
deploy/quickstart.sh
```

脚本会编译程序、下载 Firecracker 和 guest 内核，装好全部服务，**其中包括 E2B 网关**（端口 7400），并配好一个叫 `base` 的模板（Python 3.12）。在一台全新的 8 核虚拟机上全程约 11 分钟，大部分时间在编译。

## 第二步：用 E2B SDK 调用

安装脚本写好的 `/root/opendsec-ops/demo.env` 里已经有 E2B SDK 需要的三个环境变量：

```sh
. /root/opendsec-ops/demo.env       # 设置 E2B_API_URL、E2B_SANDBOX_URL、E2B_API_KEY
python3 -m venv .venv && .venv/bin/pip install e2b
```

`E2B_API_KEY` 就是 OpenDsec 的 token。之后的代码和用 E2B 云服务时完全一样（用 `.venv/bin/python` 运行）：

```python
from e2b import Sandbox

sbx = Sandbox.create()                          # 模板 "base"
print(sbx.commands.run("python3 -V").stdout)
sbx.files.write("/tmp/a.txt", "hello")
print(sbx.files.read("/tmp/a.txt"))
sbx.kill()
```

在别的机器上调用时，把三个变量里的地址换成这台机器的地址即可：

```sh
export E2B_API_URL=http://<网关>:7400
export E2B_SANDBOX_URL=http://<网关>:7400
export E2B_API_KEY=<你的 OpenDsec token>
```

JS/TS SDK 同样可用（需要 Node.js 22.19 以上）。

## fork、快照和暂停

在 microVM 上，fork、快照和暂停都**连同内存**保存，运行中的进程会延续下去：

```python
from e2b import Sandbox

src = Sandbox.create(timeout=300)
src.files.write("/tmp/state", "v1")

forks = src.fork(count=2)                       # 运行中 sandbox 的两个副本
snap = src.create_snapshot()                    # 快照
again = Sandbox.create(snap.snapshot_id)        # 从快照创建

# 超时时暂停而不是结束；connect 时恢复
s = Sandbox.create(timeout=60, lifecycle={"on_timeout": "pause", "auto_resume": True})
s2 = Sandbox.connect(s.sandbox_id)

for x in [src, *forks, again, s2]:
    x.kill()
```

fork 适合智能体的树搜索，或者从一个装好依赖的环境展开大量 RL rollout。

## 第三步：搭 code interpreter

E2B 的 code interpreter（`run_code`，返回结果、图表和 pandas 表格）需要一个专门的模板。OpenDsec 用 E2B 开源的 code-interpreter 服务构建它：一个已经运行着该服务和 Python Jupyter 内核的 microVM 的内存快照，所以创建后立刻就能执行代码。

构建时 sandbox 要从网上安装软件包，所以机器需要能访问 apt 源和 PyPI。仍在 `opendsec` 目录下：

```sh
curl -fsSL https://codeload.github.com/e2b-dev/code-interpreter/tar.gz/refs/heads/main | tar -xz
. /root/opendsec-ops/env                        # 管理员 token：要往 root 项目发布镜像
.venv/bin/pip install ./sdk/python
.venv/bin/python deploy/e2b/build-code-interpreter.py code-interpreter-main/template
```

这会构建镜像 `root/code-interpreter:v1`。然后在 `/root/opendsec-ops/opendsec.json` 的 `e2b.templates` 里加一个模板：

```json
"code-interpreter-v1": {"image": "root/code-interpreter:v1", "backend": "microvm", "cpu": 2, "memory_mb": 2048}
```

下发配置并重启：

```sh
export OPENDSEC_OPS=/root/opendsec-ops
deploy/prod/opendsecops push-config all && deploy/prod/opendsecops restart
```

之后调用方安装 `e2b-code-interpreter` 就能用：

```python
from e2b_code_interpreter import Sandbox

sbx = Sandbox.create("code-interpreter-v1")
print(sbx.run_code("6 * 7").text)               # 42
```

## 速度

2026-10-23 在项目的裸金属测试机（AMD EPYC 9Y24）上，经网关在 Firecracker microVM 上测得：

| 操作 | 耗时 |
|---|---|
| `Sandbox.create()`，模板 `base`（2 vCPU、1 GB、冷启动） | p50 166 ms |
| 创建后的第一条命令 | p50 12 ms |
| `Sandbox.create("code-interpreter-v1")`（2 GB 内存快照） | 约 250 ms |
| 第一次 `run_code` | 约 40 ms |
| `fork(count=2)` | 约 100–150 ms |
| `create_snapshot()` | 约 40–70 ms |
| `Sandbox.create(snapshot_id)` | 约 65–85 ms；拍完快照马上创建的第一个约 0.6 s（要等快照在后台发布到镜像库） |

## 扩成集群

单机够用就不用往下看。sandbox 多了以后，OpenDsec 可以扩成多机集群（[部署文档](/docs/cluster)），E2B 网关也随之扩成多个副本：

1. 在集群配置的 `e2b` 一节列出各网关的地址、sandbox 放进哪个项目，以及模板。
2. 给节点加上 fleet 角色 `e2b=<序号>`。
3. 前面放一个负载均衡：TCP 7400，健康检查用 HTTP 9467 `/readyz`。

网关自己不保存状态，每次调用都用调用方的 token 发给 OpenDsec，所以权限、配额和审计记录照常生效。

## 和 E2B 云服务的差别

完整列表见 [E2B 兼容](/docs/e2b)，主要的几条：

| | E2B | OpenDsec 网关 |
|---|---|---|
| 模板 | 用 E2B 的模板构建生成 | 管理员在配置里把模板名对应到 OpenDsec 的镜像；没有模板构建 API |
| sandbox 端口 | 可以开放公开访问 | 必须带 token（SDK 自动带上） |
| 只保存文件系统的暂停 | 支持 | 拒绝（400）：暂停总是保留内存 |
| 只保存文件系统的快照 | 支持 | microVM 上拒绝（400）；容器的快照本来就只有文件系统 |
| code interpreter 的语言 | Python、JavaScript、R、Java、Bash | Python |
| 不支持 | | 目录监听、签名文件地址、MCP、volume |

做不到的选项会返回 400，而不是悄悄忽略，所以程序不会在没拿到所要设置的情况下运行。

## 选 E2B 自建还是 OpenDsec

- **E2B 自建（Embed）** 适合一台机器就够用、想用 E2B 自己代码的场景；部署到自己的云账号（BYOC）是 E2B 企业版的功能。
- **OpenDsec** 适合需要多机集群、离线部署、RL rollout 那样的大规模突发创建，或者除了 E2B SDK 还想用容器、QEMU 虚拟机和任务级暂停的场景。代价是 E2B 兼容还有上面列出的缺口，项目还是 0.x 版本。

更多对比见 [OpenDsec 与 E2B、Daytona、Modal 对比](/docs/compare)。

## 常见问题

### E2B 可以自建吗？

可以。E2B 的运行时是开源的（Apache-2.0），可以在一台机器上自建；部署到自己的云账号是企业版功能。另一种方式是用 OpenDsec 的 E2B 网关，在自己的单机或集群上提供 E2B SDK 调用的 API。

### 用 OpenDsec 需要改 E2B 的代码吗？

不需要。设置 `E2B_API_URL`、`E2B_SANDBOX_URL` 和 `E2B_API_KEY` 三个环境变量，把 SDK 指向网关即可。用到网关不支持的功能（例如目录监听）时会返回明确的错误。

### 支持 E2B 的 code interpreter 吗？

支持，用 `deploy/e2b/build-code-interpreter.py` 构建模板后即可使用 `run_code`，包括结果、日志、错误、图表和 pandas 表格。目前只支持 Python 内核。

### 没有 KVM 的云主机能用吗？

能。没有 `/dev/kvm` 时安装脚本只装容器，E2B 网关的 `base` 模板也用容器后端。这时 fork 和快照只保留文件系统，code interpreter 模板需要 microVM。

### 能完全离线部署吗？

能。OpenDsec 提供离线安装包（`deploy/offline`），我们在不能上网的虚拟机上验证过安装和使用 E2B SDK，见[安装](/docs/install)。

### 自建要花多少钱？

OpenDsec 是免费的开源软件（服务端 AGPL-3.0，SDK Apache-2.0），只需要你自己的机器。

## 延伸阅读

- [E2B 兼容：支持的功能和差别](/docs/e2b)
- [快速开始](/docs/quickstart)
- [多机集群部署](/docs/cluster)
- [解读 DeepSeek DSec 论文](/blog/posts/dsec-paper)：OpenDsec 的设计来源

*OpenDsec 与 E2B 没有关联，只是实现了 E2B SDK 调用的 API。文中关于 E2B 的情况来自它的文档和代码仓库，核对日期 2026-10-25。*
