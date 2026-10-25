# 快速开始

在一台 Linux 机器上装好 OpenDsec 的全部组件，并用 Python SDK、E2B SDK 或命令行创建 sandbox。在全新的 8 核虚拟机上，整个过程约 11 分钟，大部分时间在编译。

## 准备

- Linux x86_64，systemd，cgroup v2，内核 5.15 以上。完整验证过的是 Ubuntu 24.04。
- 有 `/dev/kvm` 时同时装好 microVM，没有就只装容器。microVM 需要裸金属机器，或开启了嵌套虚拟化的云主机。
- 以 root 执行下面的每一步：安装脚本要装系统服务，生成的文件放在 `/root/opendsec-ops`。

## 1. 安装依赖

```sh
sudo -i
apt update && apt install -y make git python3-venv
curl -fsSL https://go.dev/dl/go1.27.3.linux-amd64.tar.gz | tar -C /usr/local -xz
```

## 2. 安装 OpenDsec

```sh
git clone https://github.com/kernflux/opendsec
cd opendsec
deploy/quickstart.sh
```

脚本会：

1. 检查机器，编译程序，下载 Firecracker 和 guest 内核（按 `deploy/deps.lock` 校验）；
2. 以 systemd 服务装好 IAM、watcher、apiserver、edge 和 E2B 网关；
3. 导入 `python:3.12` 镜像，创建项目 `root/demo` 和它的调用方；
4. 各跑一个容器和 microVM sandbox 做检查。

::: tip 其他选项
- `--no-microvm`：只装容器。
- `--kernel FILE`：用现成的 guest 内核，不下载。
- `--build-kernel`：自己编译 guest 内核。
- 机器不能访问外网时，用[离线安装包](/docs/deploy#离线环境)。
:::

## 3. 创建 sandbox

先加载调用方的环境变量，再装 SDK：

```sh
. /root/opendsec-ops/demo.env
python3 -m venv .venv
.venv/bin/pip install ./sdk/python
.venv/bin/python sdk/python/examples/quickstart.py
```

`demo.env` 里有调用方的地址、token 和 CA，也设好了 E2B SDK 需要的三个变量。下面三种方式任选：

::: code-group

```python [Python SDK]
import asyncio
from opendsec import DSecClient, DSecRunArgs

async def main():
    # 读取 OPENDSEC_ADDR、OPENDSEC_TOKEN 等环境变量
    async with DSecClient() as client:
        sb = await client.run_sandbox(DSecRunArgs(
            backend="microvm", image="root/py:3.12",
            cpu_cores_limit=1, memory_limit_mb=1024))
        try:
            r = await sb.run_shell("python3 -c 'print(6*7)'")
            print(r.stdout)
            # 4 个副本，连同内存
            forks = await sb.fork(count=4)
            for f in forks:
                await f.stop()
        finally:
            await sb.stop()

asyncio.run(main())
```

```python [E2B SDK]
# pip install e2b
# E2B_API_URL、E2B_SANDBOX_URL、E2B_API_KEY 已由 demo.env 设置
from e2b import Sandbox

sbx = Sandbox.create()
print(sbx.commands.run("uname -r").stdout)

# microVM 上，快照连同内存
snap = sbx.create_snapshot()
copy = Sandbox.create(snap.snapshot_id)
copy.kill()
sbx.kill()
```

```sh [命令行]
. /root/opendsec-ops/env      # 管理员环境
opendsecctl status
ID=$(opendsecctl sandbox create -backend microvm \
      -image root/py:3.12 | grep -m1 '"id"' | cut -d'"' -f4)
opendsecctl exec "$ID" python3 -c 'print(6*7)'
opendsecctl sandbox stop "$ID"
```

:::

## 4. 卸载

```sh
deploy/quickstart.sh --uninstall
```

## 下一步

- 多台机器组成集群、离线安装：见[部署方式](/docs/deploy)。
- 从 E2B 迁移：见 [从 E2B 迁移](/docs/e2b)。
- 全部命令：`opendsecctl --help`。
