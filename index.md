---
layout: home
title: OpenDsec：开源的 AI 智能体与强化学习 sandbox，兼容 E2B
titleTemplate: false
description: 在自己的机器上运行大批 Firecracker microVM、容器和虚拟机，供强化学习训练和 AI 智能体执行代码：约 0.1 秒启动、连同内存 fork、兼容 E2B 的 SDK，AGPL-3.0 开源。

hero:
  name: OpenDsec
  text: 给每一次 rollout 一个隔离的 sandbox
  tagline: 在你自己的机器上运行大批 Firecracker microVM、容器和 QEMU 虚拟机，供强化学习训练和会执行代码的智能体使用。照 DeepSeek 的 DSec 论文实现，兼容 E2B 的 SDK。
  actions:
    - theme: brand
      text: 快速开始
      link: /docs/quickstart
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/Kernflux/opendsec

features:
  - title: 约 0.1 秒的 microVM
    details: Firecracker 冷启动约 0.1 s，从内存快照创建约 55 ms，暂停后恢复约 50 ms。
  - title: fork 与内存快照
    details: fork(count=N) 连同内存复制正在运行的 VM，源 VM 只停顿约 10 ms。同节点副本共享内存页，跨节点直接从源节点拉取。
  - title: 按任务暂停
    details: 训练被抢占时整批暂停并释放内存；之后对暂停的 sandbox 发请求会自动恢复。
  - title: 兼容 E2B
    details: 按 E2B SDK 写的程序换三个环境变量就能运行，包括命令、文件、PTY、端口、快照和 code interpreter。
  - title: 分层镜像
    details: 从任意 OCI 仓库导入，组合镜像不复制数据，pack_diff 把环境存成新镜像。镜像库放在 NFS、CephFS 或 JuiceFS 上。
  - title: 默认拒绝的网络
    details: 每个 sandbox 按域名、网段和端口放行，运行中可以修改，由 nftables 和 DNS 代理执行。
  - title: 隔离
    details: 每个 VM 独立 uid 的 jailer、防 SMT 侧信道的核心调度、seccomp、只读代理、按会话的用户。
  - title: 项目与配额
    details: 多级项目、层级配额、有界委托；IAM 用 Raft 多副本，组件之间 mTLS，短期可吊销的 token，审计日志。
  - title: 运维
    details: fleet 分批滚动升级、失败自动回退；离线安装包；Prometheus 指标和告警。升级任何组件都不影响运行中的 sandbox。
---

## 实测数据

在 2 × AMD EPYC 9Y24（384 线程）、1.5 TB 内存、NVMe RAID0、Ubuntu 24.04 的裸金属机上测得，不是论文中的数据。测量方法见仓库里的 [docs/SPEC.md](/docs/spec)。

| 参数 | 典型值 |
|---|---|
| microVM 冷启动<br><small>到第一条命令可以执行</small> | 0.1 s |
| 从内存快照创建<br><small>快照在本节点</small> | 55 ms |
| 暂停后恢复<br><small>暂停时内存已全部释放</small> | 50 ms |
| fork 时源 VM 停顿<br><small>增量快照，只写脏页</small> | 10 ms |
| 跨节点 fork 8 个副本<br><small>直接从源节点拉取快照</small> | 0.58 s |
| 64 个副本并发恢复<br><small>同一节点，共享内存页</small> | 0.2 s |
| 一次突发创建 5120 个 microVM<br><small>单节点 384 线程</small> | 37 s |
| 一次突发创建 8192 个容器<br><small>两个节点</small> | 0 失败 |
| FnCall 创建<br><small>预建池，经 API</small> | 2 ms |
| E2B code interpreter<br><small>`Sandbox.create()` / 第一次 `run_code`</small> | 280 / 45 ms |

## 架构

apiserver 无状态，按 watcher 汇总的状态用 power-of-k 选节点；每个节点上的 edge 根据实际资源决定接不接。任何一个组件重启，运行中的 sandbox 都不受影响。

<div class="arch">
<svg viewBox="0 0 880 410" role="img" aria-label="OpenDsec 架构：客户端、E2B 网关、apiserver、IAM、watcher、edge 和共享镜像库">
<defs>
<marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="ah" d="M0,0 L8,4 L0,8 z"/></marker>
<marker id="am" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="ah m" d="M0,0 L8,4 L0,8 z"/></marker>
</defs>
<rect class="box" x="20" y="120" width="160" height="62" rx="6"/><text class="t1" x="34" y="146">Python SDK</text><text class="t2" x="34" y="166">opendsecctl</text>
<rect class="box" x="20" y="250" width="160" height="62" rx="6"/><text class="t1" x="34" y="276">E2B SDK</text><text class="t2" x="34" y="296">Python · JS</text>
<rect class="box" x="210" y="250" width="120" height="62" rx="6"/><text class="t1" x="224" y="276">E2B 网关</text><text class="t2" x="224" y="296">:7400</text>
<rect class="box acc" x="370" y="150" width="170" height="80" rx="6"/><text class="t1" x="386" y="178">apiserver ×N</text><text class="t2" x="386" y="198">无状态 · 调度</text><text class="t2" x="386" y="216">power-of-k</text>
<rect class="box" x="370" y="20" width="170" height="70" rx="6"/><text class="t1" x="386" y="46">IAM · Raft ×3</text><text class="t2" x="386" y="66">项目 · 配额 · token</text>
<rect class="box" x="620" y="20" width="240" height="70" rx="6"/><text class="t1" x="636" y="46">watcher ×N</text><text class="t2" x="636" y="66">探测 edge · 汇总调度状态</text>
<rect class="box" x="620" y="120" width="240" height="56" rx="6"/><text class="t1" x="636" y="144">edge</text><text class="t2" x="636" y="163">microVM · container · FnCall</text>
<rect class="box" x="620" y="188" width="240" height="56" rx="6"/><text class="t1" x="636" y="212">edge</text><text class="t2" x="636" y="231">microVM · container · full VM</text>
<rect class="box" x="620" y="256" width="240" height="56" rx="6"/><text class="t1" x="636" y="280">edge</text><text class="t2" x="636" y="299">每个 sandbox 内：aether · chronus</text>
<rect class="store" x="370" y="346" width="490" height="46" rx="6"/><text class="t1" x="386" y="374">共享镜像库</text><text class="t2" x="530" y="374">NFS 4.2 · CephFS · JuiceFS</text>
<path class="ln" d="M180 165 H366" marker-end="url(#ar)"/>
<path class="ln" d="M180 281 H206" marker-end="url(#ar)"/>
<path class="ln" d="M330 281 H350 V205 H366" marker-end="url(#ar)"/>
<path class="ln" d="M455 150 V94" marker-end="url(#ar)"/>
<path class="ln" d="M540 170 H580 V55 H616" marker-end="url(#ar)"/>
<path class="ln" d="M540 190 H600 V148 H616" marker-end="url(#ar)"/>
<path class="ln" d="M600 190 V216 H616" marker-end="url(#ar)"/>
<path class="ln" d="M600 216 V284 H616" marker-end="url(#ar)"/>
<path class="ln dash" d="M860 90 V116" marker-end="url(#am)"/>
<path class="ln dash" d="M740 312 V342" marker-end="url(#am)"/>
<path class="ln dash" d="M455 230 V342" marker-end="url(#am)"/>
</svg>
</div>
<p class="swipe">左右滑动查看完整架构图</p>

## 借鉴自 DSec 论文

OpenDsec 照论文 [*DeepSeek Elastic Compute (DSec): A Sandbox Infrastructure for Effective Agentic Training at Scale*](https://arxiv.org/abs/2609.22978)（arXiv:2609.22978）实现，整体架构和大部分设计来自论文；网络策略的执行方式、共享文件系统镜像库、以 Firecracker 为主力后端、fleet 运维和 E2B 兼容是我们自己的部分。仓库的 SPEC 逐条标注了出处。感谢论文作者公开了如此详细的设计。

本项目独立开发，与 DeepSeek 没有关系，未经其认可，也不包含其代码。「DeepSeek」和「DSec」归各自的所有者所有，这里使用只为指明所实现的论文。
