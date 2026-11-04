---
title: "How DSec's pack_diff can work: turning a sandbox into an image"
date: 2026-11-04
author: Kernflux
description: "DeepSeek's DSec paper gives pack_diff's purpose, not its steps. OpenDsec's implementation: freezing, copying the writable layer, scrubbing leftovers, the opaque directories NFS loses, and why microVMs are excluded."
---

# How DSec's pack_diff can work: turning a sandbox into an image

`pack_diff` in DeepSeek's DSec paper (§6.1) lets agents build environments themselves: install things in a sandbox, take an incremental disk snapshot at any point, and start new sandboxes from it. The paper gives the purpose, separate build and run accounts, and removing leftovers before packing, but not the steps. This post records how [OpenDsec](https://github.com/Kernflux/opendsec) does it. It is our implementation and says nothing about how DSec does it internally.

```python
sb = await client.run_container(DSecContainerRunArgs(
        container_image="root/rl/python:3.12", network_rules={"pypi": True, "github": True}))
await sb.run_shell("git clone https://github.com/org/repo /srv/repo && pip install -e /srv/repo")
img = await sb.pack_diff("root/rl/repo-env:v1", scrub=["srv/repo/.git"])
await sb.stop()
```

## The steps

A container's file system is read-only image layers plus an overlay writable layer that the host can see, so the new layer is a copy of that directory:

1. The edge freezes the sandbox, so the writable layer does not change during the copy.
2. The writable layer is copied to the image store as a new layer, keeping whiteouts and xattrs. It goes to a temporary directory and is renamed when complete, so a failure leaves no half-written layer.
3. The sandbox is thawed and can keep running.
4. The apiserver registers the new image: the source image's layers plus the new one, with `parent` pointing at the source.

Existing layers are not repacked, so the new image only costs the space of what changed.

## Permissions

Separating build from run comes down to these permissions:

| Operation | Permission needed |
|---|---|
| The source sandbox of `pack_diff` | `sandbox.operate` on the sandbox's project |
| Publishing the target image | `layer.publish` on the image's project |
| Creating a sandbox from an image | `layer.use` on the image's project |

An account that runs tasks gets only `layer.use`, so it cannot write into an image others use.

## Scrubbing leftovers

The paper says build leftovers are removed before packing, so that reference answers do not end up in the image. OpenDsec by default removes `/tmp`, `/var/tmp`, `/root/.cache` and shell and Python history, and the caller can add more with `scrub`.

The edge scrubs as root on the host, while the sandbox controls what is in the writable layer, and that has gone wrong before: a rule with `..`, or a sandbox replacing `/tmp` with a symbolic link, could take the removal outside the layer. Rules must now be relative with no `..`, and matching does not descend through symbolic links.

The default rules cover common places only, and answers elsewhere stay. The paper does not say what it removes. To prevent leaks, the caller should know exactly where answers are written.

## Opaque directories on NFS

We only met this after putting the image store on NFS.

Delete a directory in a container and create it again, and overlay marks it with the xattr `trusted.overlay.opaque`: this directory hides everything below it of the same name. But NFS does not carry `trusted.*` xattrs, and `cp -a` **does not report an error** when it cannot copy one, so the marker silently disappears. The resulting image brings the old contents back. Our regression test `TestPackDiffOpaque`, reproducing this on an NFS store, found 933 entries in `/usr/share/doc`, where there should be 1.

The fix is not to depend on the marker. After the copy, opaque directories are found from the source (on local disk, where the xattr survives), and each name visible below that this layer lacks becomes a whiteout (a 0:0 character device, which NFS can store). OCI import does the same expansion.

## Not for microVMs

OpenDsec's `pack_diff` supports containers and fncall only. A microVM's writable disk holds the guest's own file system, and copying that disk from a running guest loses page cache not yet written. The paper's microVM writable disks use OverlayBD, which can take incremental disk snapshots; we have no such layer.

For microVMs there are two alternatives:

| | `pack_diff` | `create_snapshot` |
|---|---|---|
| Backends | container, fncall | container, microvm |
| Saves | Changes against the starting image | Complete state; with memory on a microVM |
| Scrubbing | By default, extendable | None |
| New sandboxes | Boot fresh | On a microVM, restore and carry on running |
| Usable on | container and microVM | The same backend |

For a files-only image for microVMs, build in a container and `pack_diff`. MicroVMs can use the result.

## Related

- [DeepSeek DSec implementation notes: the comparison table](/en/blog/posts/dsec-implementation-notes)
- [Quickstart](/en/docs/quickstart): try it from the install up
- The paper: [arXiv:2609.22978](https://arxiv.org/abs/2609.22978)

*OpenDsec is not affiliated with DeepSeek. Everything said here about DSec comes from the paper above.*
