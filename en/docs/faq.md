---
description: "OpenDsec FAQ: running without KVM, supported Linux distributions, how it relates to E2B and DeepSeek, air-gapped installs, production readiness and GPU support."
---

# FAQ

## Does it work without KVM?

Yes. Without `/dev/kvm` the installer sets up the container backend only, and the SDK and E2B API work as usual. For microVMs, use bare metal or a cloud VM with nested virtualization.

## Which Linux distributions are supported?

Fully verified on fresh Ubuntu 24.04. It needs x86_64, kernel 5.15 or newer, cgroup v2 and systemd. Other distributions should work but have not each been verified; please [open an issue](https://github.com/Kernflux/opendsec/issues) if one does not.

## How does it relate to E2B?

OpenDsec serves an E2B-compatible API. Code written for the E2B SDK runs once `E2B_API_URL`, `E2B_SANDBOX_URL` and `E2B_API_KEY` point at your gateway, and the sandboxes run on your own machines. E2B's Python SDK (sync and async) and JS/TS SDK acceptance checks all pass.

Directory watching, signed file URLs and template builds are not supported yet. The differences and how to migrate are in [docs/E2B.md](/en/docs/e2b).

## How does it relate to DeepSeek?

It doesn't. OpenDsec is an independent implementation of the DSec paper that DeepSeek published. It is not endorsed by DeepSeek and contains none of its code.

## How do I install without internet access?

Use the offline bundle; see [Deployment](/en/docs/deploy#air-gapped).

## Is it ready for production?

It is at 0.x, and interfaces may change before 1.0; see [VERSIONING.md](/en/docs/versioning). Rolling upgrades, a hard reset of a control node and an IAM leader change have each been run under load with no failed calls. For support or a commercial license, see [License](/en/docs/license).

## Does it support GPUs?

GPUs can be given to container sandboxes exclusively or shared, and the full VM backend supports PCI passthrough. Neither has been tested on real GPUs yet.

## Something else?

See [Troubleshooting](/en/docs/troubleshooting), which lists the problems we have met by symptom, with causes and fixes. If yours is not there, please [open an issue](https://github.com/Kernflux/opendsec/issues).
