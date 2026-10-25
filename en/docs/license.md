---
description: "OpenDsec's servers are AGPL-3.0 and its Python SDK and clients Apache-2.0, so programs that call it are not bound by the AGPL. Commercial licenses and an enterprise edition are available."
---

# License and commercial use

## Open source

| Part | License |
|---|---|
| Servers and tools | AGPL-3.0 |
| Python SDK (`sdk/python/`), Go client (`pkg/`), API definitions and generated code (`proto/`, `gen/`) | Apache-2.0 |

Programs that call OpenDsec only use the client parts, so the AGPL does not apply to them. See [NOTICE](https://github.com/Kernflux/opendsec/blob/main/NOTICE). Contributions need a signed CLA; see [CONTRIBUTING.md](https://github.com/Kernflux/opendsec/blob/main/CONTRIBUTING.md).

## Commercial license

You need a commercial license to:

- keep a modified version of OpenDsec closed;
- offer OpenDsec as a service without publishing your changes;
- use the enterprise edition.

The enterprise edition adds:

- single sign-on with your identity provider (OIDC);
- audit logs streamed to your SIEM or archive, hash-chained against tampering.

For private deployments and support, contact **zhyb1528@aliyun.com**.
