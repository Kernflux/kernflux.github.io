---
title: 在全新的机器上验收开源版：22 个问题
date: 2026-10-24
author: Kernflux
description: 开源之前，我们按 README 在全新的 Ubuntu 24.04 虚拟机上把用户会用到的每个功能走了一遍，发现并修复了 22 个问题，其中 2 个是严重问题。
---

# 在全新的机器上验收开源版：22 个问题

OpenDsec 的自动测试一直在我们自己的开发机和生产集群上跑，全部通过。但开发机上什么都装好了，生产集群也是一步步调出来的。新用户拿到的是一台全新的机器和一份 README。所以开源之前，我们换成新用户的视角，在全新的 Ubuntu 24.04 虚拟机上，按文档把用户可能用到的每个功能走了一遍。

## 测了什么

| 场景 | 做法 |
|---|---|
| 单机 | 按 README 安装，跑示例、SDK 功能测试、54 项管理命令检查，重启后恢复，卸载 |
| 没有 KVM | 只装容器 |
| E2B | E2B 官方 Python SDK（同步、异步）、JS SDK、code interpreter、快照和网络 |
| 离线 | 在不能上网的虚拟机上用离线包安装，离线使用 E2B SDK |
| 多机集群 | 3 台管控、3 台计算、NFS 和 HAProxy，按文档部署、交给 fleet、加机器、滚动升级、改配置、维护、备份、监控 |
| 故障 | 压测中硬重启管控节点、杀掉 IAM leader |
| Kubernetes | 单节点 k3s |

## 两个严重问题

**新版 Ubuntu 内核上，microVM 恢复全部失败。** Ubuntu 24.04 当前的 6.8.0-147 内核会杀掉用 `CLONE_INTO_CGROUP` 放进一个「执行过 `cgroup.kill`」的 cgroup 的进程。OpenDsec 暂停 microVM 时会结束 VM 进程，恢复时在原来的 cgroup 里启动新进程，于是每次恢复都失败。我们的生产机器内核旧一些，所以一直没碰到；一旦升级内核就会出现。现在结束进程改成先冻结 cgroup 再逐个发送 SIGKILL，不再用 `cgroup.kill`，并加了一个在受影响内核上会失败的回归测试。

**管控节点重启时，少量调用报 `unknown edge`。** watcher 重启后，要等计算节点重新登记（最多 10 秒）才知道它们；这段时间里 apiserver 会把这些节点当成不存在。压测中硬重启一台管控节点，3,911 次调用里有 3 次失败。现在 watcher 启动时先从其他副本拿到已知节点，apiserver 也会把暂时看不到的节点保留 2 分钟。同样的硬重启，修复后 0 失败。

## 其他问题

剩下 20 个大多是新用户第一次就会碰到的：

- **安装**：新机器上没有 `make`，安装脚本编译到一半才报错；新 Ubuntu 上缺 `python3-venv`，README 里的 Python 步骤失败；全新的云镜像没有软件包索引，要先 `apt update`。
- **命令行**：`opendsecctl exec` 丢了参数里的引号，`python3 -c '...'` 会出错；`--help` 不能用；批量创建不打印新建的 ID；导入一个不存在的本地文件时，会去 Docker Hub 下载。
- **E2B**：单机安装没有 E2B 网关；在默认禁止外网的集群上，E2B sandbox 连不了外网，而 E2B 默认是允许的。
- **运维**：`opendsecops restart` 漏掉了 E2B 网关；磁盘告警用固定阈值，200 GB 以下的机器全都会报；Kubernetes 上 apiserver 没有权限写镜像库。
- **性能**：我们推荐的 NFS 4.1 不支持找稀疏文件的空洞，跨节点从内存快照创建要读完整个内存文件，用时 141 秒；换成 4.2 后是 62 秒。文档已改成 4.2，`store-check` 遇到 4.1 会提醒。

每一项都写在 [CHANGELOG](https://github.com/Kernflux/opendsec/blob/main/CHANGELOG.md) 里。

## 没测到的

真实 GPU、ARM 机器、多节点 Kubernetes，以及 Ubuntu 24.04 以外的发行版。如果你在这些环境上用 OpenDsec，遇到问题请[提 issue](https://github.com/Kernflux/opendsec/issues)。

## 体会

开发机上的全量测试证明的是「代码在我们的机器上是对的」，证明不了「用户照着文档能用起来」。两个严重问题都和环境有关：一个是更新的内核，一个是生产集群里不会出现的重启时机。在全新的机器上按文档走一遍，能发现开发机上永远发现不了的问题。
