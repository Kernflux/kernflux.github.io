---
title: DSec 的 aether 和 chronus：一条命令经过哪些组件
date: 2026-11-04
author: Kernflux
description: DeepSeek DSec 论文里 sandbox 操作的路径是 apiserver、edge、aether、chronus。这里记录 OpenDsec 的实现：每一层做什么，会话、输出记录、断线重试怎么处理，智能体伪造请求时怎么防。
---

# DSec 的 aether 和 chronus：一条命令经过哪些组件

DeepSeek DSec 论文（§2、§3.3）说，sandbox 运行后的操作依次经过 apiserver、edge、aether、chronus。aether 是每个 sandbox 一个的代理，chronus 是一个 shell 会话。论文讲清了它们的分工，但具体协议和异常处理留给了实现。这篇记录 [OpenDsec](https://github.com/Kernflux/opendsec) 的做法，不代表 DSec 内部也这样做。

## 请求链

一次 `await sb.run_shell("pip install -e .")`：

```text
SDK
 │ gRPC + TLS
 ▼
apiserver     鉴权 sandbox.operate，按 sandbox id 找到 edge
 │ gRPC
 ▼
edge          暂停中就先恢复，刷新空闲超时，调用期间不做空闲回收
 │ unix socket（容器）或 vsock（VM）
 ▼
aether        sandbox 内的 PID 1，按会话 id 找到或启动 chronus
 │ unix socket
 ▼
chronus       持有一个常驻 shell，执行命令，记录输出
```

三段内部通信用同一组 gRPC 消息：对外的接口带 `sandbox_id`，edge 转发，aether 和 chronus 实现同一个 `Runtime` 服务。所以容器和 VM 的差别只在 edge 到 aether 这一段的传输方式上，上层不用管。这也是论文要的效果：同一套接口覆盖容器和 VM。

## 每一层为什么存在

**apiserver** 不保存状态。sandbox id 里编码了它创建时所在的 edge，不用查表。暂停的 microVM 换过节点后，edge 的状态里会列出迁入的 id，原节点也会回复新位置。

**edge** 是唯一和 sandbox 通信的控制面组件。透明恢复放在这里，因为只有它知道 sandbox 当前的状态。当前节点放不下时，由 apiserver 把暂停的 microVM 迁到别的节点。

**aether** 还负责存活检测。edge 和它保持一条 `Watch` 流，流断了就算 sandbox 丢失，这一点和论文相同。会话关闭时，aether 杀掉 chronus 的整棵进程树。

**chronus** 让 `cd`、`export` 的状态在命令之间保留。每个会话一个进程，同一会话里的命令串行执行，要并发就开多个会话。

## 论文没细说、实现时要决定的事

**命令比连接活得久。** 输出写进文件，调用方断开后可以按偏移量继续取（`GetOutput`），也可以流式接收。每条命令有请求 id，SDK 重试时能找到已经在跑的命令，不会执行第二遍。这对 `pip install` 这种有副作用的命令很重要。

**输出不能无限记。** 论文记录过智能体无限输出写满存储。命令的输出先写进命名管道，由 chronus 读出来记录，每条命令每路最多记 64 MB，超出的部分读出后丢弃，命令不会因此阻塞。每个会话最多保留 512 MB，超出就删最早的记录。

**后台进程不能漏掉。** chronus 是子进程收割者（subreaper），命令里放到后台的进程也留在会话的进程树里。杀进程树时要先反复 SIGSTOP，直到再也找不到新进程，再统一发信号；只扫描一次会漏掉扫描之后 fork 出来的进程。

**不是所有调用都适合走 shell。** 文件操作由 chronus 直接执行，不经过 shell。要按 pid 寻址、写 stdin、用 PTY 的独立进程，由 aether 管理，不经过会话，E2B 网关就用这个接口。

## 智能体会攻击这条链

论文记录了智能体直接向 chronus 的 socket 发伪造请求，以及读 chronus 的日志找答案。DSec 用 AppArmor 限制。OpenDsec 没有用 AppArmor，因为它挡不住 microVM guest 里的 root，改成让 agent 会话用普通用户：

| 攻击 | OpenDsec 的处理 |
|---|---|
| 向其他会话的 chronus socket 发请求 | socket 权限 0600，普通用户连不上 |
| 读其他会话的命令记录 | 记录目录属 root，输出文件只有 chronus 能读写 |
| 覆盖 `/bin/bash` | 普通用户改不了系统文件 |
| 在记录目录放符号链接，让 chronus 以 root 写别的文件 | 目录一直属 root，普通用户不能往里放文件（2026-10-27 修复） |
| 从 microVM guest 经 vsock 连 aether | guest 内核没有开 vsock loopback，连不上 |

这些都有一个前提：**调用方要给 agent 指定普通用户**（`run_shell(..., user=...)`）。agent 跑在 root 会话里时，这张表前三行都不成立。

## 和论文不同的地方

- **FnCall**：论文的 FnCall 不用 aether 和 chronus，直接在预建容器里执行。OpenDsec 的 fncall 是预建池里 aether 已经就绪的容器，走同一条链。
- **PID 1**：在 OpenDsec 里 aether 通常是 sandbox 的 PID 1。论文没有说明。
- **容器位置**：论文的容器跑在 VM 里，OpenDsec 的容器直接跑在宿主机上，所以 edge 到 aether 是 unix socket。

## 相关阅读

- [DeepSeek DSec 实现笔记：对照表](/blog/posts/dsec-implementation-notes)
- [OpenDsec 核心概念](/docs/concepts)
- 论文：[arXiv:2609.22978](https://arxiv.org/abs/2609.22978)

*OpenDsec 与 DeepSeek 没有关联。文中关于 DSec 的内容均来自上述论文。*
