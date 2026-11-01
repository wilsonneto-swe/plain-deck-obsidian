---
tags: [ddia, distributed-systems, sharding]
source: Designing Data-Intensive Applications, 2nd edition, Chapter 7
---
# Sharding

Cards from Chapter 7 of Designing Data-Intensive Applications (2nd edition). Each card asks one thing;
the answer comes first and the reason, when there is one, after it. The group headings follow the
chapter's order.

# Basics

## What is the difference between replication and sharding?
Replication stores copies of the **same** data on several nodes; sharding splits the data into pieces and
stores **different** pieces on different nodes.

They are usually combined: each shard is itself replicated for fault tolerance.

## What problem does sharding solve that read replicas do not?
Too much data, or too much **write** throughput, for a single node.

If only read throughput is the problem, read replicas (Chapter 6) are enough.

## Why does the book advise against sharding when one machine is enough?
It adds complexity: you must choose a partition key, the scheme is hard to change later, secondary indexes
and joins across shards get hard, and multi-shard writes need distributed transactions.

## What does the partition key determine?
Which shard a record lives in: all records with the same partition key land in the same shard.

Without the key, a lookup has to search every shard.

## Why is a write that touches several shards a problem?
Keeping the shards consistent needs a distributed transaction, which is much slower than a single-node one
and can become a bottleneck (Chapter 8).

## With single-leader replication, how are shard leaders spread over the nodes?
Each shard has exactly one leader, but leaders are spread out: every node is leader for some shards and
follower for others.

## Why do Redis, VoltDB and FoundationDB shard inside a single machine?
They run one single-threaded process per CPU core, using sharding to spread load across cores and to
benefit from NUMA memory locality.

## In PostgreSQL, how does "partitioning" differ from "sharding"?
Partitioning splits a table into several files on the **same** machine; sharding splits a dataset across
**multiple** machines.

# Multitenancy

## What does sharding for multitenancy mean?
Giving each tenant (customer) its own shard, or grouping several small tenants into one shared shard.

## What is a cell-based architecture?
Services and storage for a set of tenants are grouped into a self-contained cell that runs independently
of other cells, so a fault in one cell stays inside it.

## How does a shard per tenant (or per person) simplify GDPR or CCPA requests?
Exporting or deleting a person's data becomes a simple operation on their shard.

## What happens when one tenant outgrows a single node?
You must shard within that tenant too, which brings back the general scalability problem.

Sharding by tenant assumes each tenant fits on one node.

## What problem appears when many small tenants share one shard?
Deciding how to move a tenant to another shard once it grows.

# Skew and hot spots

## What is a hot shard (hot spot)?
A shard with disproportionately high load compared with the others.

In the extreme, all load hits one shard and the cluster is only as fast as that one node.

## What is a hot key?
A single key with particularly high load, such as a celebrity's user ID on a social network.

# Key-range sharding

## How does key-range sharding assign records to shards?
Each shard owns a contiguous range of partition keys, from a minimum to a maximum, like the volumes of a
paper encyclopedia.

Boundaries follow the data's distribution, so ranges are uneven but shards end up similar in size.

## What is the main advantage of key-range sharding?
Keys are sorted within each shard, so range scans are efficient (for example, all readings from one month).

## Under key-range sharding, why does keying sensor readings by timestamp create a hot spot?
Live measurements all carry the current time, so every write lands in the shard for the current time
range while the others sit idle.

## How can the sensor-timestamp hot spot be fixed, and what does the fix cost?
Put the sensor ID before the timestamp in the key, so writes spread across shards.

The cost: a time range across many sensors now needs one range query per sensor.

## What is pre-splitting?
Configuring an initial set of key-range shards on an empty database (HBase, MongoDB).

It requires guessing the key distribution in advance.

## How does a key-range sharded database rebalance as data grows?
It splits a shard into two or more subranges when it reaches a size (10 GB by default in HBase) or a
sustained write rate, and merges small adjacent shards after large deletes.

## Why is splitting a shard risky?
It rewrites all of the shard's data, like a compaction, and the shard that needs splitting is usually
already under heavy load.

# Hash sharding

## Why hash the partition key before mapping it to a shard?
A good hash function spreads skewed or very similar keys uniformly across the hash range.

## Why are Java's `hashCode()` and Ruby's `Object#hash` unsuitable for sharding?
The same key may get a different hash value in different processes.

## What goes wrong with `hash(key) % N` when the number of nodes changes?
Most keys move to a different node. Going from 3 to 4 nodes, 9 of 12 keys move.

## How does a fixed number of shards avoid the mod N problem?
Create many more shards than nodes (say 1,000 on 10 nodes) with `hash(key) % 1000`. A key never changes
shard; only the shard-to-node assignment changes, and whole shards move to a new node.

## What limit does a fixed number of shards impose on the cluster?
You cannot have more nodes than shards. Changing the shard count needs an expensive resharding that
rewrites every shard.

## Why is the shard count hard to choose when the dataset size varies a lot?
Each shard holds a fixed fraction of the data, so shard size grows with the dataset. Too large makes
rebalancing and recovery slow; too small adds overhead.

## What is hash-range sharding?
Each shard owns a contiguous range of **hash values** instead of keys, and a shard can split when it gets
too big or too hot (DynamoDB, YugabyteDB).

## What do you lose with hash-range sharding compared with key-range sharding?
Efficient range queries on the partition key: neighbouring keys are scattered across all shards.

## With a compound key, how can hash-sharded data still support range queries?
Use the first column as the partition key and sort by the remaining columns within the shard. A range
over the later columns, for one partition key value, stays inside one shard.

## When would you choose hashing over key ranges for a partition key?
When records with nearby keys don't need to be together, for example tenant IDs or user IDs.

Timestamps that you want to scan by range are the opposite case.

## How do Cassandra and ScyllaDB divide the hash space?
Into several ranges per node (16 by default in Cassandra, 256 in ScyllaDB) with random boundaries. Having
many ranges per node evens out their uneven sizes.

When a node joins, it takes parts of existing ranges from the other nodes.

## What two properties define consistent hashing?
Each shard gets roughly the same number of keys, and when the number of shards changes, as few keys as
possible move.

## What does "consistent" mean in consistent hashing?
That a key tends to stay in the same shard.

It has nothing to do with replica consistency (Chapter 6) or ACID consistency (Chapter 8).

## When a node is added, how do rendezvous and jump consistent hashing differ from Cassandra's scheme?
The new node receives individual keys scattered across all the other nodes, instead of contiguous
subranges split off existing ranges.

# Relieving hot spots

## Why can a node be overloaded even with consistent hashing?
Consistent hashing spreads **keys** evenly, not **load**. A few keys with very high traffic still
overload the shard that holds them.

## How can a key-range or hash-range scheme deal with one extremely hot key?
Put that key in a shard by itself, possibly on a dedicated machine.

## How does adding a random two-digit suffix to a key relieve a write-hot key?
Writes to that key are spread over 100 different keys, which can live on different shards.

## What does splitting a hot key with random suffixes cost?
Every read must fetch all 100 keys and merge them, so read load is not reduced. You also need bookkeeping
of which keys are split.

# Rebalancing operations

## How can automatic rebalancing cause a cascading failure?
An overloaded node responds slowly, other nodes decide it is dead and move its load onto themselves, they
become overloaded too and are also suspected dead.

## When is manual rebalancing a better choice?
When you want to avoid operational surprises, and to prepare ahead of known traffic surges such as Cyber
Monday or World Cup ticket sales.

## What is the middle ground between automatic and manual rebalancing?
The system suggests a shard assignment and an administrator commits it (Couchbase, Riak).

# Request routing

## How does routing in a sharded database differ from service discovery for stateless services?
Only a node holding a replica of the key's shard can answer, so the router must know the key-to-shard and
shard-to-node mappings.

## What are the three ways to route a request to the right shard?
1. The client contacts any node, which forwards the request if needed.
2. The client contacts a routing tier that forwards it.
3. A shard-aware client connects directly to the right node.

## What role does a coordination service like ZooKeeper or etcd play in routing?
It holds the authoritative mapping of shards to nodes, using consensus to avoid split brain, and notifies
routers whenever the assignment changes.

## How does Riak spread cluster state, and what is the trade-off?
With a gossip protocol among nodes. Consistency is weaker and split brain is possible, which leaderless
databases tolerate because they promise weak guarantees anyway.

## Why is DNS usually enough to find the routing tier's or nodes' IP addresses?
Those addresses change far less often than the assignment of shards to nodes.

# Secondary indexes

## Why don't secondary indexes map neatly onto shards?
They search by a value (all red cars), not by partition key, so matching records can be in any shard.

## What is a local (document-partitioned) secondary index?
Each shard keeps its own index covering only the records stored in that shard.

## What does a query on a local secondary index cost when the partition key is unknown?
It must go to every shard and merge the results (scatter/gather). This amplifies tail latency, and adding
shards does not increase query throughput.

## What is a global (term-partitioned) secondary index?
One index covering all the data, itself sharded by the indexed value (the term) rather than by the
record's partition key.

## On a global secondary index, what does a single-term read cost, and what does a write cost?
The read hits one index shard to get the postings list (fetching the full records still hits their data
shards). A write may have to update several index shards, one per term.

## Why are multi-condition queries costly on a global secondary index?
Each term may live on a different shard, so long postings lists must be sent over the network to compute
their intersection.

## When is a global secondary index a good fit?
When reads are much more frequent than writes and the postings lists are not too long.

## How fresh are reads from a DynamoDB global secondary index?
They may be stale: writes reach global indexes asynchronously.

## What is the risk of building your own secondary index in application code over a key-value store?
Race conditions and partially failed writes can leave the index out of sync with the data.
