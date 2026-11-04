---
title: DSec pack_diff 怎么实现：把 sandbox 变成镜像
date: 2026-11-04
author: Kernflux
description: DeepSeek DSec 论文的 pack_diff 只写了用途。这里是 OpenDsec 的实现：冻结、复制可写层、清理残留，以及 NFS 丢失不透明目录标记的问题。microVM 为什么不支持。
---

# DSec pack_diff 怎么实现：把 sandbox 变成镜像

DeepSeek DSec 论文（§6.1）里的 `pack_diff` 让智能体自己构建环境：在 sandbox 里装好依赖，随时打一个增量磁盘快照，之后从它启动新的 sandbox。论文写了用途，也写了构建账号和运行账号分开、打包前清理残留，但没有写具体步骤。这篇记录 [OpenDsec](https://github.com/Kernflux/opendsec) 的做法。它是我们的实现，不代表 DSec 内部也这样做。

```python
sb = await client.run_container(DSecContainerRunArgs(
        container_image="root/rl/python:3.12", network_rules={"pypi": True, "github": True}))
await sb.run_shell("git clone https://github.com/org/repo /srv/repo && pip install -e /srv/repo")
img = await sb.pack_diff("root/rl/repo-env:v1", scrub=["srv/repo/.git"])
await sb.stop()
```

## 步骤

容器的文件系统是只读镜像层加一个 overlay 可写层，可写层在宿主机上能直接看到，所以新层就是这个目录的一份副本：

1. edge 冻结 sandbox，让可写层内容在复制时保持不变。
2. 把可写层复制到镜像库，成为一个新层，保留删除标记和 xattr。先写到临时目录，完成后再改名，中途失败不会留下半个层。
3. 解冻 sandbox，它可以继续运行。
4. apiserver 登记新镜像：层列表是源镜像的层加上这个新层，`parent` 指向源镜像。

组成镜像的层不会重新打包，所以新镜像只多占改动部分的空间。

## 权限

构建和运行分开，靠的是两个权限：

| 操作 | 需要的权限 |
|---|---|
| `pack_diff` 的源 sandbox | sandbox 所属项目上的 `sandbox.operate` |
| 发布目标镜像 | 镜像所属项目上的 `layer.publish` |
| 用镜像创建 sandbox | 镜像所属项目上的 `layer.use` |

跑任务的账号只给 `layer.use`，就没法往别人会用到的镜像里写东西。

## 清理残留

论文提到，打包前要清掉构建时的残留，避免参考答案进入镜像。OpenDsec 默认清理 `/tmp`、`/var/tmp`、`/root/.cache` 以及 shell 和 Python 的历史，调用方可以用 `scrub` 追加。

清理是 edge 以 root 在宿主机上做的，而可写层的内容由 sandbox 控制，这里曾经出过问题：规则带 `..`，或者 sandbox 把 `/tmp` 换成符号链接，都可能让删除操作跑到层外面。现在规则必须是相对路径、不能含 `..`，逐级匹配时遇到符号链接不往下走。

默认规则只覆盖常见位置，答案放在别处就清不掉。论文没有说它具体清理什么，要防泄露，调用方应该明确知道答案写在哪里。

## NFS 上的不透明目录

这是把镜像库放到 NFS 之后才碰到的问题。

在容器里删掉一个目录再重建，overlay 用 xattr `trusted.overlay.opaque` 标记它，表示这个目录要完全遮住下层的同名目录。但 NFS 不传 `trusted.*` xattr，而 `cp -a` 复制不了 xattr 时**不报错**，标记就悄悄丢了。打出来的镜像会把下层的旧内容带回来。我们的回归测试 `TestPackDiffOpaque` 在 NFS 镜像库上复现时，`/usr/share/doc` 露出了 933 个条目，应该只有 1 个。

解决办法是不依赖这个标记：复制完以后，按源目录（本地盘上 xattr 还在）找出不透明目录，把下层能看到、而本层没有的每个名字都建成删除标记（0:0 字符设备，NFS 能存）。OCI 导入时也做同样的展开。

## microVM 不支持

OpenDsec 的 `pack_diff` 只支持容器和 fncall。microVM 的可写盘是 guest 自己的文件系统，运行中只复制磁盘会丢掉还没落盘的页缓存。论文的 microVM 可写盘用 OverlayBD，可以做增量磁盘快照，我们没有这一层。

microVM 有两个替代办法：

| | `pack_diff` | `create_snapshot` |
|---|---|---|
| 后端 | container、fncall | container、microvm |
| 保存什么 | 相对启动镜像的改动 | 完整状态，microVM 连同内存 |
| 清理残留 | 默认清理，可以追加 | 不清理 |
| 新 sandbox | 全新启动 | microVM 从快照恢复，进程接着运行 |
| 能用在 | container 和 microVM | 同一种后端 |

要给 microVM 做只含文件的镜像，就在容器里构建再 `pack_diff`，得到的镜像 microVM 也能用。

## 相关阅读

- [DeepSeek DSec 实现笔记：对照表](/blog/posts/dsec-implementation-notes)
- [快速开始](/docs/quickstart)：从安装开始试用
- 论文：[arXiv:2609.22978](https://arxiv.org/abs/2609.22978)

*OpenDsec 与 DeepSeek 没有关联。文中关于 DSec 的内容均来自上述论文。*
