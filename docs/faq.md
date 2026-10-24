# 常见问题

## 没有 KVM 能用吗？

能。安装脚本发现没有 `/dev/kvm` 时只装容器后端，SDK 和 E2B 接口照常可用。要跑 microVM，用裸金属机器，或者开启了嵌套虚拟化的云主机。

## 支持哪些 Linux 发行版？

全新安装的 Ubuntu 24.04 上完整验证过。要求 x86_64、内核 5.15 以上、cgroup v2 和 systemd。其他发行版应该可以运行，但还没有逐一验证；遇到问题请[提 issue](https://github.com/Kernflux/opendsec/issues)。

## 和 E2B 是什么关系？

OpenDsec 提供和 E2B 兼容的 API。按 E2B SDK 写的程序，把 `E2B_API_URL`、`E2B_SANDBOX_URL`、`E2B_API_KEY` 指向你的网关就能运行，sandbox 跑在你自己的机器上。E2B 官方 Python SDK（同步和异步）和 JS/TS SDK 的验收检查全部通过。

还不支持监听目录、签名的文件 URL 和构建 template。差别和迁移方法见 [docs/E2B.md](/en/docs/e2b)。

## 和 DeepSeek 是什么关系？

没有关系。OpenDsec 照 DeepSeek 公开的 DSec 论文独立实现，未经 DeepSeek 认可，也不包含其代码。

## 机器不能访问外网，怎么装？

用离线安装包，见[部署方式](/docs/deploy#离线环境)。

## 现在能用在生产环境吗？

当前是 0.x 版本，1.0 之前接口可能调整，兼容策略见 [VERSIONING.md](/en/docs/versioning)。在压力下滚动升级、硬重启管控节点、切换 IAM leader 都验证过，没有失败的调用。需要技术支持或商业授权，见[许可](/docs/license)。

## 支持 GPU 吗？

支持把 GPU 独占或共享给容器 sandbox，完整 VM 后端支持 PCI 直通。这两项还没有在真实 GPU 上测过。

## 还有别的问题？

先看[故障排查](/docs/troubleshooting)，那里按现象列出了遇到过的问题和处理方法。没有找到的，请[提 issue](https://github.com/Kernflux/opendsec/issues)。
