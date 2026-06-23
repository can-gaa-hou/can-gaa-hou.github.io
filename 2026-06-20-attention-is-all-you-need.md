---
title: "论文精读：Attention Is All You Need（Transformer 原论文）"
date: 2026-06-20 08:00:00 +0800
categories: [论文, NLP]
tags: [Transformer, Attention, NLP, 深度学习, 经典论文]
math: true
---

> **论文信息**
> - 标题：Attention Is All You Need
> - 作者：Vaswani et al.（Google Brain）
> - 发表：NeurIPS 2017
> - 引用量：~120,000+（截至2026年）

## 为什么读这篇？

Transformer 是当今几乎所有大语言模型的基础架构。读懂这篇原论文，等于拿到了理解 GPT、BERT、Claude、Gemini 的钥匙。

## 核心思想

### 放弃 RNN，全用 Attention

在 Transformer 之前，序列任务主要用 RNN/LSTM，核心问题是：

- **顺序计算**，无法并行
- 长距离依赖随序列长度衰减

Transformer 的答案是：**Self-Attention 全连接每个位置**，距离不再是问题。

### Scaled Dot-Product Attention

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V
$$

其中：
- $Q$（Query）：当前词想"问什么"
- $K$（Key）：其他词"提供什么标签"
- $V$（Value）：其他词实际"携带的信息"
- $\sqrt{d_k}$：缩放因子，防止点积过大导致 softmax 梯度消失

### Multi-Head Attention

$$
\text{MultiHead}(Q,K,V) = \text{Concat}(\text{head}_1,\ldots,\text{head}_h)W^O
$$

用 **h 个独立的 Attention Head** 并行学习不同的子空间关系。原论文用 h=8。

## 架构图解

```
Input → Embedding + Positional Encoding
         ↓
    ┌─── Encoder ───┐
    │  Multi-Head   │  × 6
    │  Self-Attn    │
    │  Feed-Forward │
    └───────────────┘
         ↓
    ┌─── Decoder ───┐
    │  Masked MHA   │  × 6
    │  Cross-Attn   │
    │  Feed-Forward │
    └───────────────┘
         ↓
    Linear + Softmax → Output
```

## 个人笔记 & 疑问

1. **Positional Encoding 为什么用 sin/cos？**  
   论文说效果与学习到的 PE 相近，但 sin/cos 可以外推到训练时未见过的更长序列。现在很多模型（如 RoPE）改进了这一点。

2. **为什么 $\sqrt{d_k}$ 缩放？**  
   当 $d_k$ 很大时，点积值大，softmax 会进入梯度极小的饱和区。除以 $\sqrt{d_k}$ 让方差稳定在 1 附近。

3. **Encoder-Decoder 对比纯 Decoder 架构**  
   现在的 GPT 系列只用 Decoder，BERT 只用 Encoder，Transformer 原论文的 Enc-Dec 结构反而主要用在 MT5、T5 等翻译/生成任务上。

## 评分

| 维度 | 评分 |
|------|------|
| 创新性 | ★★★★★ |
| 可读性 | ★★★★☆ |
| 实验充分度 | ★★★★☆ |
| 影响力 | ★★★★★ |

---

*下一篇：BERT: Pre-training of Deep Bidirectional Transformers*
