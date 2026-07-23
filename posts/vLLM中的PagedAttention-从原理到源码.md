> LLM 推理的显存大头不是模型权重，而是 KV cache。vLLM 之所以能把吞吐做到同期系统的数倍，核心就是一个想法：**像操作系统管理内存分页那样管理 KV cache**——这就是 PagedAttention。这篇笔记先讲清楚它解决什么问题，再顺着 vLLM 源码（基于 v0.24 分支，v1 引擎）把整条调用链走一遍，最后整理一下与它相关的配置参数。文中还有一个可以逐步点击播放的交互动画。

---

## 一、PagedAttention 解决什么问题

Decode 阶段每生成一个 token，都要和前面所有 token 的 Key/Value 做 attention，所以每个请求必须缓存全部历史 KV——这就是 KV cache。传统做法（早期 HuggingFace/FasterTransformer 风格）是给每个请求**按最大序列长度一次性预留一整块连续显存**，带来两个致命问题：

1. **内部碎片**：请求实际长度往往远小于 max_len，预留的显存大量闲置。vLLM 论文统计传统方式的显存有效利用率只有 20%~40%。
2. **无法共享**：多个请求即使有完全相同的前缀（比如同一个 system prompt），KV 也要各存一份。

PagedAttention 的做法是把 OS 虚拟内存的「分页」思想搬到 KV cache 上：

| OS 虚拟内存 | vLLM PagedAttention |
|---|---|
| 进程的虚拟地址空间 | 一个请求的逻辑 token 序列 |
| 页（page） | **block**：固定 block_size（默认 16）个 token 的 KV |
| 页表（page table） | **block_table**：逻辑 block 序号 → 物理 block_id |
| 物理内存页帧 | GPU 显存中预分配的固定大小物理 block 池 |
| 缺页时分配新页帧 | block 写满时从 free list 取一个新 block |
| 共享页（如 fork 后的 COW） | 前缀缓存：相同内容的 block 直接复用，ref_cnt 计数 |

于是：**分配按 block 粒度按需进行，物理上不连续也没关系，相同前缀只存一份**。浪费被压缩到"最后一个 block 没写满"的程度（平均半个 block），显存利用率接近 100%。

## 二、交互动画：block 的分配、映射、共享与回收

下面的动画演示了两个请求的 prefill/decode 过程中 block 池的变化、block_table 的间接映射、前缀缓存命中、以及请求结束后 block 的回收。点「下一步」逐步播放：

<iframe src="posts/demos/paged-attention-demo.html" style="width:100%; height:720px; border:1px solid #2a2a27; border-radius:12px; background:#141413;" loading="lazy" title="PagedAttention 交互演示"></iframe>

## 三、vLLM 源码调用链

以下代码摘自 vLLM 仓库（v0.24 分支，v1 引擎），路径均相对仓库根目录。整条链路可以概括为：

```
调度器 Scheduler
   └─ KVCacheManager.allocate_slots()          # 按需分配 block / 命中前缀缓存
        └─ BlockPool（free list + 内容哈希去重）
   └─ BlockTable.compute_slot_mapping()        # 逻辑位置 → 物理槽位（Triton kernel）
Attention.forward()
   └─ FlashAttentionImpl.forward()
        ├─ reshape_and_cache_flash(...)        # 按 slot_mapping 写入新 KV
        └─ flash_attn_varlen_func(block_table=...)
             └─ CUDA kernel:
                  physical_block_number = block_table[block_idx]
                  k_ptr = k_cache + physical_block_number * stride + ...
```

### 3.1 物理 block 的元数据：KVCacheBlock

`vllm/v1/core/kv_cache_utils.py` 中，每个物理 block 用一个轻量 dataclass 描述：

```python
@dataclass(slots=True)
class KVCacheBlock:
    """KV-cache block metadata."""

    # Block ID, ranging from 0 to num_gpu_blocks - 1.
    block_id: int
    # Reference count.
    ref_cnt: int = 0
    # The hash key (block hash + group id) of the block, only available
    # when the block is full and cached.
    _block_hash: BlockHashWithGroupId | None = None

    # Used to construct a doubly linked list for free blocks.
    prev_free_block: "KVCacheBlock | None" = None
    next_free_block: "KVCacheBlock | None" = None
```

三个设计点值得注意：

- `ref_cnt`：引用计数。前缀缓存命中时多个请求共享同一个物理 block，各自 +1；归还时 -1，减到 0 才真正回到空闲队列。
- `_block_hash`：block 写满后对「前缀 + 本 block 内 token」做哈希，作为前缀缓存的 key。
- `prev_free_block / next_free_block`：空闲 block 用双向链表（`FreeKVCacheBlockQueue`）串起来，从头取、往尾放，天然实现 LRU 驱逐——最久没被用到的缓存 block 最先被挪用。

### 3.2 block 池与前缀缓存:BlockPool

`vllm/v1/core/block_pool.py` 里的 `BlockPool` 持有全部 `num_gpu_blocks` 个 block，核心是两个结构：

- `free_block_queue`：上面说的空闲双向链表；
- `cached_block_hash_to_block`：`哈希 → block` 的字典。新请求到来时先按 block 粒度算哈希去查表，命中就直接复用（`get_cached_block()`），完全跳过这些 token 的 prefill 计算。

### 3.3 分配入口：KVCacheManager.allocate_slots()

调度器每步调度一个请求时调用 `vllm/v1/core/kv_cache_manager.py` 的 `allocate_slots()`：

```python
num_blocks_to_allocate = self.coordinator.get_num_blocks_to_allocate(
    request_id=request.request_id,
    num_tokens=num_tokens_need_slot,
    new_computed_blocks=new_computed_block_list,
    ...
)

available_blocks = self.block_pool.get_num_free_blocks() - reserved_blocks
if required_blocks > available_blocks:
    return None   # 分配失败 → 调度器会抢占/等待

new_blocks = self.coordinator.allocate_new_blocks(
    request.request_id, num_tokens_need_slot, ...
)
```

逻辑很直白：算出还差几个 block → 检查空闲池够不够 → 不够就返回 None（调度器据此触发抢占或让请求排队）→ 够就从 free list 摘 block，追加到该请求的 block 列表。**每次只分配增量 block，这就是"按需分页"**。

### 3.4 页表本体：BlockTable 与 slot_mapping

`vllm/v1/worker/block_table.py` 中，所有请求的页表拼成一个 GPU 张量：

```python
self.block_table = self._make_buffer(
    self.max_num_reqs, self.max_num_blocks_per_req, dtype=torch.int32
)
# 形状 [max_num_reqs, max_num_blocks_per_req]
# 第 i 行 = 请求 i 的页表（逻辑 block 序号 → 物理 block_id）
```

写入新 KV 之前，还需要算出每个 token 具体落在哪个"槽位"（slot）。同文件里的 Triton kernel `_compute_slot_mapping_kernel` 做的就是虚拟地址翻译：

```python
block_indices = pos // block_size                    # token 在第几个逻辑 block
block_numbers = block_table[row, block_indices]      # 查页表 → 物理 block_id
slot_ids = block_numbers * block_size + pos % block_size   # 物理槽位
```

一行公式总结：`slot = 物理block_id × block_size + 块内偏移`——和 OS 里「物理页帧号 × 页大小 + 页内偏移」一模一样。

### 3.5 Attention 层：写入用 slot_mapping，读取用 block_table

模型每层的 `Attention.forward()`（`vllm/attention/layer.py`）最终调到具体 backend 的实现。以 `vllm/v1/attention/backends/flash_attn.py` 的 `FlashAttentionImpl` 为例，一次 forward 做两件事：

**① 把本步新算出的 K/V 散射写入分页缓存**（按 slot_mapping）：

```python
reshape_and_cache_flash(
    key, value,
    key_cache, value_cache,
    slot_mapping,        # 每个 token → 物理槽位
    self.kv_cache_dtype,
    layer._k_scale, layer._v_scale,
)
```

**② 把整张页表交给 attention kernel，读历史 KV 做注意力**：

```python
flash_attn_varlen_func(
    q=query[:num_actual_tokens],
    k=key_cache,          # 整个分页的物理池
    v=value_cache,
    block_table=block_table,   # [num_reqs, max_blocks_per_seq]
    seqused_k=seqused_k,
    causal=True,
    ...
)
```

这些参数由 `FlashAttentionMetadata` dataclass（同文件）打包：`block_table`、`slot_mapping`、`seq_lens`、`query_start_loc` 等，每个调度步由 MetadataBuilder 构建一次，所有层共用。

### 3.6 CUDA kernel：真正的分页间接寻址

最底层在 `csrc/libtorch_stable/attention/attention_kernels.cuh` 的 `paged_attention_kernel`。每个 CUDA thread block 负责「一个请求 × 一个注意力头」，先取到自己那行页表：

```cpp
// 相当于拿到该进程的页表基址
const int* block_table = block_tables + seq_idx * max_num_blocks_per_seq;

for (int block_idx = start_block_idx + warp_idx;
     block_idx < end_block_idx; block_idx += NUM_WARPS) {
  // ★ 灵魂一行：逻辑 block 序号 → 物理 block 编号（页表查找）
  const int64_t physical_block_number =
      static_cast<int64_t>(block_table[block_idx]);

  // 用物理编号算出 K cache 中真正的显存地址
  const cache_t* k_ptr =
      k_cache + physical_block_number * kv_block_stride +
      kv_head_idx * kv_head_stride + physical_block_offset * x;

  // ...加载 K 向量，与 Q 做点积，随后 softmax、再按同样方式 gather V...
}
```

`block_table[block_idx]` 这一行就是 PagedAttention 的全部秘密：**KV 物理上散落各处，kernel 通过页表逐块间接寻址，把 gather 融合进 attention 计算本身**，不需要任何显式的内存拷贝或重排。这也解释了它为什么几乎没有额外开销——间接寻址只是多读一个 int32，而 attention 本身是访存密集型运算，这点代价可以忽略。

## 四、与 PagedAttention 相关的配置参数

这些参数集中在 `vllm/config/cache.py` 的 `CacheConfig`，都能通过 `LLM(...)` 构造参数或 `vllm serve` 的命令行旗标设置。

### 核心参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `block_size` | 16 | 每个 KV block 容纳的 token 数。越小碎片越少、前缀缓存命中粒度越细，但页表更长、kernel 效率略降；越大反之。不同硬件后端支持的取值不同（CUDA 常见 16/32） |
| `gpu_memory_utilization` | 0.92 | 本 vLLM 实例可用的 GPU 显存比例。启动时先加载权重、profile 一次前向，**剩余显存全部切成 KV block**——所以这个值直接决定 num_gpu_blocks，也就是能同时服务多少并发/多长上下文 |
| `kv_cache_memory_bytes` | None | 直接指定 KV cache 的字节数，比 `gpu_memory_utilization` 更精确的控制方式，设置后忽略后者 |
| `num_gpu_blocks_override` | None | 强行覆盖 profile 得出的 block 数，主要用于测试抢占逻辑，生产不用 |
| `kv_cache_dtype` (`cache_dtype`) | "auto" | KV cache 存储精度。"auto" 跟随模型精度；设成 `fp8` / `fp8_e5m2` 等可把 KV 显存直接砍半（block 数翻倍），代价是可能的轻微精度损失 |

### 前缀缓存相关

| 参数 | 默认值 | 说明 |
|---|---|---|
| `enable_prefix_caching` | True（v1 引擎默认开启） | 是否启用前缀缓存。开启后写满的 block 会登记内容哈希，后续请求相同前缀直接复用物理 block |
| `prefix_caching_hash_algo` | "sha256" | block 哈希算法。可换 `xxhash` 提速（非密码学哈希，多租户场景需评估碰撞风险），`*_cbor` 变体提供跨语言可复现哈希 |
| `hash_block_size` | None（自动） | 计算前缀哈希的粒度，可比物理 block_size 更细（如 8），让混合模型的多个 KV cache group 用统一粒度做前缀匹配 |

### 进阶/周边

| 参数 | 默认值 | 说明 |
|---|---|---|
| `kv_offloading_size` | None | 设置后启用 KV cache 向 CPU 内存卸载（单位 GiB），相当于给分页系统加了一层"换出到磁盘"——GPU block 不够时把冷 block 挪到 CPU，命中时再搬回来 |
| `kv_offloading_backend` | "native" | 卸载后端，可选 vLLM 原生或 lmcache |
| `mamba_block_size` 等 | None | 混合架构（Mamba/attention 混合模型）中 Mamba 状态缓存的对应分页参数 |

### 一个实用的心智模型

启动日志里会打印类似 `# GPU blocks: 27810` 的数字，可以这样估算容量：

```
可缓存 token 总数 = num_gpu_blocks × block_size
                  = 27810 × 16 ≈ 44.5 万 token
```

这 44.5 万 token 是**所有并发请求共享**的预算。如果平均每个请求上下文 4000 token，理论上限就是约 110 个并发；超了之后调度器开始让新请求排队，或按抢占策略把低优先级请求的 block 回收（v1 引擎默认重算式抢占：直接释放其全部 block，之后重新 prefill）。调 `gpu_memory_utilization`、换 fp8 KV、开前缀缓存,本质上都是在往这个预算池里加 token。

## 五、总结

- PagedAttention = 把 OS 分页搬进 KV cache：block 是页，block_table 是页表，BlockPool 是物理页帧管理器。
- 源码链路：`allocate_slots()` 按需分配 → `slot_mapping` 做地址翻译 → `reshape_and_cache_flash` 散射写入 → attention kernel 里 `block_table[block_idx]` 间接寻址读取。
- 工程收益：显存碎片趋近于零、前缀零拷贝共享、抢占与回收都变成 O(1) 的链表操作——这三点共同支撑了 vLLM 的高吞吐 continuous batching。

> 参考：[Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180)（SOSP '23）；源码见 [vllm-project/vllm](https://github.com/vllm-project/vllm)。
