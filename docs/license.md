---
description: "OpenDsec 的服务端以 AGPL-3.0 开源，Python SDK 和客户端是 Apache-2.0，调用它的程序不受 AGPL 约束；也提供商业授权和企业版。"
---

# 许可与商业授权

## 开源版

| 部分 | 许可证 |
|---|---|
| 服务端和工具 | AGPL-3.0 |
| Python SDK（`sdk/python/`）、Go 客户端（`pkg/`）、API 定义和生成的代码（`proto/`、`gen/`） | Apache-2.0 |

调用 OpenDsec 的程序只用到客户端部分，不受 AGPL 约束。详见 [NOTICE](https://github.com/Kernflux/opendsec/blob/main/NOTICE)。贡献代码需要签署 CLA，见 [CONTRIBUTING.md](https://github.com/Kernflux/opendsec/blob/main/CONTRIBUTING.md)。

## 商业授权

以下情况需要商业授权：

- 修改 OpenDsec 后不公开源码；
- 把 OpenDsec 作为服务对外提供，但不公开修改；
- 使用企业版。

企业版在开源版之上提供：

- 用企业身份提供方（OIDC）单点登录；
- 审计日志实时送往 SIEM 或归档存储，用哈希链防篡改。

私有化部署和技术支持也可以联系我们：**zhyb1528@aliyun.com**
