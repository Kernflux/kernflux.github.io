# Deployment

| Option | Status | For |
|---|---|---|
| [Single machine](#single-machine) | Verified | trying it out, development, small workloads |
| [Cluster](#cluster) | Verified | production, any number of compute nodes |
| [Air-gapped](#air-gapped) | Verified | data centers without internet access |
| [Kubernetes](#kubernetes) | Experimental | existing Kubernetes clusters, container sandboxes only |

## Single machine

One command installs everything; see [Get started](/en/guide/quickstart).

## Cluster

- Three control nodes (IAM, watcher, apiserver, fleet) plus any number of compute nodes (edge).
- Every apiserver and edge mounts the same shared image store: NFS 4.2, CephFS or JuiceFS.
- An L4 load balancer in front, health-checking `/readyz`.
- Once installed, fleet takes over: staged rollouts, config changes, new nodes and maintenance, with failed nodes rolled back automatically.

The full steps are in the README's "Deploy a cluster" section and in [docs/OPERATIONS.md](https://github.com/Kernflux/opendsec/blob/main/docs/OPERATIONS.md).

::: warning NFS version
Mount NFS with `vers=4.2`. Version 4.1 cannot find the holes in sparse files, which makes creating from a memory snapshot on another node more than twice as slow. `opendsecctl image store-check` checks for this.
:::

## Air-gapped

Build a bundle on a machine with internet access and install it on the target. The bundle carries the guest kernel, a base image and the Python wheels (the E2B SDK included), for one node or a cluster.

```sh
deploy/offline/build-bundle.sh           # on a connected machine
# copy it over, unpack, then:
./install.sh
```

See [deploy/offline/README.md](https://github.com/Kernflux/opendsec/blob/main/deploy/offline/README.md).

## Kubernetes

Manifests in `deploy/k8s/` run container sandboxes. They need at least three nodes and a ReadWriteMany storage class. Multi-node is not fully verified yet; see [deploy/README.md](https://github.com/Kernflux/opendsec/blob/main/deploy/README.md).
