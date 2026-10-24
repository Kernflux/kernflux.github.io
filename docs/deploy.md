# 部署方式

| 方式 | 状态 | 适合 |
|---|---|---|
| [单机](#单机) | 已验证 | 试用、开发、小规模使用 |
| [多机集群](#多机集群) | 已验证 | 生产，可扩展到任意数量的计算节点 |
| [离线环境](#离线环境) | 已验证 | 不能访问外网的机房 |
| [Kubernetes](#kubernetes) | 实验 | 已有 Kubernetes 集群，只跑容器 sandbox |

## 单机

一条命令装好全部组件，见[快速开始](/docs/quickstart)；选项、装了什么、文件位置和常见问题见[单机安装详解](/docs/install)。

## 多机集群

- 3 台管控节点（IAM、watcher、apiserver、fleet）加任意数量的计算节点（edge）。
- 所有 apiserver 和 edge 挂载同一个共享镜像库：NFS 4.2、CephFS 或 JuiceFS。
- 前面放一个四层负载均衡，健康检查用 `/readyz`。
- 装好后交给 fleet 管理：分批滚动升级、改配置、加机器、维护，失败的机器自动退回原版本。

从零开始的完整步骤见[多机集群部署](/docs/cluster)，部署后的日常操作见[运维手册](/docs/operations)。

::: warning NFS 版本
NFS 用 `vers=4.2`。4.1 不支持稀疏文件，从内存快照跨节点创建 sandbox 会慢一倍以上。`opendsecctl image store-check` 会检查这一项。
:::

## 离线环境

在一台能上网的机器上做离线安装包，拷到目标机器上安装。包里带了 guest 内核、基础镜像和 Python 依赖（包括 E2B SDK），单机和集群都支持。

```sh
deploy/offline/build-bundle.sh           # 在能上网的机器上
# 拷贝到目标机器，解压后：
./install.sh
```

见 [deploy/offline/README.md](https://github.com/Kernflux/opendsec/blob/main/deploy/offline/README.md)。

## Kubernetes

`deploy/k8s/` 里有清单文件，支持容器 sandbox。要求至少 3 个节点和一个支持 ReadWriteMany 的存储类。多节点还没有充分验证，见 [deploy/README.md](https://github.com/Kernflux/opendsec/blob/main/deploy/README.md)。
