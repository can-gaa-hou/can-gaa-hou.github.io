>几乎每篇讲Transformer的文章都会甩出那个公式——`Attention(Q,K,V) = softmax(QK^T/√d)V`——然后就直接开始讲多头、讲残差、讲LayerNorm了。Q、K、V从哪来的?每个数字是什么意思?为什么RoPE只转Q和K不转V?这些问题往往被一带而过。这篇笔记试着把"一句话进入大模型"这段旅程,从头到尾走一遍。

---

<div class="qkva-wrap" style="max-width:100%;margin:8px 0 4px;background:#1a1a18;border:1px solid #2a2a26;border-radius:12px;padding:16px 8px 8px;">
<svg viewBox="0 0 860 500" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto;font-family:'Inter','Noto Sans SC',sans-serif;">
<defs>
<marker id="qa-arr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path fill="#6b6a64" d="M0,0L6,3L0,6z"/></marker>
</defs>
<rect x="340" y="18" width="260" height="34" rx="8" fill="#1f1f1c" stroke="#3a3a34"/>
<text x="470" y="40" text-anchor="middle" fill="#faf9f5" font-size="15">“大模型很强大”</text>
<g class="qa qa-s1">
<text x="16" y="106" fill="#a1a09a" font-size="12">① 分词 Tokenize</text>
<line x1="450" y1="56" x2="264" y2="82" stroke="#6b6a64" marker-end="url(#qa-arr)"/>
<line x1="462" y1="56" x2="402" y2="82" stroke="#6b6a64" marker-end="url(#qa-arr)"/>
<line x1="478" y1="56" x2="538" y2="82" stroke="#6b6a64" marker-end="url(#qa-arr)"/>
<line x1="490" y1="56" x2="676" y2="82" stroke="#6b6a64" marker-end="url(#qa-arr)"/>
<rect x="220" y="88" width="80" height="30" rx="8" fill="#1f1f1c" stroke="#3a3a34"/><text x="260" y="108" text-anchor="middle" fill="#faf9f5" font-size="14">大模型</text>
<rect x="360" y="88" width="80" height="30" rx="8" fill="#1f1f1c" stroke="#3a3a34"/><text x="400" y="108" text-anchor="middle" fill="#faf9f5" font-size="14">很</text>
<rect x="500" y="88" width="80" height="30" rx="8" fill="#1f1f1c" stroke="#3a3a34"/><text x="540" y="108" text-anchor="middle" fill="#faf9f5" font-size="14">强</text>
<rect x="640" y="88" width="80" height="30" rx="8" fill="#1f1f1c" stroke="#3a3a34"/><text x="680" y="108" text-anchor="middle" fill="#faf9f5" font-size="14">大</text>
</g>
<g class="qa qa-s2">
<text x="16" y="167" fill="#a1a09a" font-size="12">② 查词表 → ID</text>
<line x1="260" y1="122" x2="260" y2="144" stroke="#6b6a64" marker-end="url(#qa-arr)"/><line x1="400" y1="122" x2="400" y2="144" stroke="#6b6a64" marker-end="url(#qa-arr)"/><line x1="540" y1="122" x2="540" y2="144" stroke="#6b6a64" marker-end="url(#qa-arr)"/><line x1="680" y1="122" x2="680" y2="144" stroke="#6b6a64" marker-end="url(#qa-arr)"/>
<rect x="220" y="150" width="80" height="26" rx="6" fill="#1f1f1c" stroke="#2a2a26"/><text x="260" y="168" text-anchor="middle" fill="#6a9bcc" font-size="13" font-family="'JetBrains Mono',monospace">10432</text>
<rect x="360" y="150" width="80" height="26" rx="6" fill="#1f1f1c" stroke="#2a2a26"/><text x="400" y="168" text-anchor="middle" fill="#6a9bcc" font-size="13" font-family="'JetBrains Mono',monospace">872</text>
<rect x="500" y="150" width="80" height="26" rx="6" fill="#1f1f1c" stroke="#2a2a26"/><text x="540" y="168" text-anchor="middle" fill="#6a9bcc" font-size="13" font-family="'JetBrains Mono',monospace">231</text>
<rect x="640" y="150" width="80" height="26" rx="6" fill="#1f1f1c" stroke="#2a2a26"/><text x="680" y="168" text-anchor="middle" fill="#6a9bcc" font-size="13" font-family="'JetBrains Mono',monospace">15</text>
</g>
<g class="qa qa-s3">
<text x="16" y="216" fill="#a1a09a" font-size="12">③ 查Embedding表</text>
<text x="16" y="232" fill="#a1a09a" font-size="12">　 ＋位置编码</text>
<line x1="260" y1="180" x2="260" y2="200" stroke="#6b6a64" marker-end="url(#qa-arr)"/><line x1="400" y1="180" x2="400" y2="200" stroke="#6b6a64" marker-end="url(#qa-arr)"/><line x1="540" y1="180" x2="540" y2="200" stroke="#6b6a64" marker-end="url(#qa-arr)"/><line x1="680" y1="180" x2="680" y2="200" stroke="#6b6a64" marker-end="url(#qa-arr)"/>
<g>
<rect x="229" y="206" width="14" height="14" rx="3" fill="#46688c"/><rect x="245" y="206" width="14" height="14" rx="3" fill="#2b3f55"/><rect x="261" y="206" width="14" height="14" rx="3" fill="#557ba3"/><rect x="277" y="206" width="14" height="14" rx="3" fill="#35506b"/>
<rect x="369" y="206" width="14" height="14" rx="3" fill="#2b3f55"/><rect x="385" y="206" width="14" height="14" rx="3" fill="#557ba3"/><rect x="401" y="206" width="14" height="14" rx="3" fill="#35506b"/><rect x="417" y="206" width="14" height="14" rx="3" fill="#46688c"/>
<rect x="509" y="206" width="14" height="14" rx="3" fill="#557ba3"/><rect x="525" y="206" width="14" height="14" rx="3" fill="#35506b"/><rect x="541" y="206" width="14" height="14" rx="3" fill="#46688c"/><rect x="557" y="206" width="14" height="14" rx="3" fill="#2b3f55"/>
<rect x="649" y="206" width="14" height="14" rx="3" fill="#35506b"/><rect x="665" y="206" width="14" height="14" rx="3" fill="#46688c"/><rect x="681" y="206" width="14" height="14" rx="3" fill="#2b3f55"/><rect x="697" y="206" width="14" height="14" rx="3" fill="#557ba3"/>
</g>
<text x="260" y="238" text-anchor="middle" fill="#6b6a64" font-size="10">＋pos 0</text><text x="400" y="238" text-anchor="middle" fill="#6b6a64" font-size="10">＋pos 1</text><text x="540" y="238" text-anchor="middle" fill="#6b6a64" font-size="10">＋pos 2</text><text x="680" y="238" text-anchor="middle" fill="#6b6a64" font-size="10">＋pos 3</text>
</g>
<g class="qa qa-s4">
<text x="16" y="284" fill="#a1a09a" font-size="12">④ ×W<tspan font-size="9" dy="3">Q</tspan><tspan dy="-3"> ×W</tspan><tspan font-size="9" dy="3">K</tspan><tspan dy="-3"> ×W</tspan><tspan font-size="9" dy="3">V</tspan></text>
<line x1="260" y1="244" x2="260" y2="264" stroke="#6b6a64" marker-end="url(#qa-arr)"/><line x1="400" y1="244" x2="400" y2="264" stroke="#6b6a64" marker-end="url(#qa-arr)"/><line x1="540" y1="244" x2="540" y2="264" stroke="#6b6a64" marker-end="url(#qa-arr)"/><line x1="680" y1="244" x2="680" y2="264" stroke="#6b6a64" marker-end="url(#qa-arr)"/>
<g font-size="11" font-weight="600" text-anchor="middle">
<rect x="220" y="270" width="24" height="22" rx="5" fill="#d97757" fill-opacity=".85"/><text x="232" y="285" fill="#141413">Q</text>
<rect x="248" y="270" width="24" height="22" rx="5" fill="#6a9bcc" fill-opacity=".85"/><text x="260" y="285" fill="#141413">K</text>
<rect x="276" y="270" width="24" height="22" rx="5" fill="#7ca982" fill-opacity=".85"/><text x="288" y="285" fill="#141413">V</text>
<rect x="360" y="270" width="24" height="22" rx="5" fill="#d97757" fill-opacity=".85"/><text x="372" y="285" fill="#141413">Q</text>
<rect x="388" y="270" width="24" height="22" rx="5" fill="#6a9bcc" fill-opacity=".85"/><text x="400" y="285" fill="#141413">K</text>
<rect x="416" y="270" width="24" height="22" rx="5" fill="#7ca982" fill-opacity=".85"/><text x="428" y="285" fill="#141413">V</text>
<rect x="500" y="270" width="24" height="22" rx="5" fill="#d97757" class="qa-q3"/><text x="512" y="285" fill="#141413">Q</text>
<rect x="528" y="270" width="24" height="22" rx="5" fill="#6a9bcc" fill-opacity=".85"/><text x="540" y="285" fill="#141413">K</text>
<rect x="556" y="270" width="24" height="22" rx="5" fill="#7ca982" fill-opacity=".85"/><text x="568" y="285" fill="#141413">V</text>
<rect x="640" y="270" width="24" height="22" rx="5" fill="#d97757" fill-opacity=".85"/><text x="652" y="285" fill="#141413">Q</text>
<rect x="668" y="270" width="24" height="22" rx="5" fill="#6a9bcc" fill-opacity=".85"/><text x="680" y="285" fill="#141413">K</text>
<rect x="696" y="270" width="24" height="22" rx="5" fill="#7ca982" fill-opacity=".85"/><text x="708" y="285" fill="#141413">V</text>
</g>
</g>
<g class="qa qa-s5">
<text x="16" y="336" fill="#a1a09a" font-size="12">⑤ 以“强”的Q为例：</text>
<text x="16" y="352" fill="#a1a09a" font-size="12">　 Q·K → softmax</text>
</g>
<path class="qa-arc" d="M512,296 Q386,352 260,298" fill="none" stroke="#d97757" stroke-width="1.5" stroke-dasharray="400"/>
<path class="qa-arc" d="M512,296 Q456,344 400,298" fill="none" stroke="#d97757" stroke-width="1.5" stroke-dasharray="400"/>
<path class="qa-arc" d="M512,296 Q526,326 540,298" fill="none" stroke="#d97757" stroke-width="1.5" stroke-dasharray="400"/>
<path class="qa-arc" d="M512,296 Q596,344 680,298" fill="none" stroke="#d97757" stroke-width="1.5" stroke-dasharray="400"/>
<g>
<rect class="qa-bar" x="250" y="388" width="20" height="14" fill="#d97757" fill-opacity=".8"/>
<rect class="qa-bar" x="390" y="393" width="20" height="9" fill="#d97757" fill-opacity=".8"/>
<rect class="qa-bar" x="530" y="362" width="20" height="40" fill="#d97757" fill-opacity=".8"/>
<rect class="qa-bar" x="670" y="375" width="20" height="27" fill="#d97757" fill-opacity=".8"/>
</g>
<g class="qa qa-s5b" font-size="11" text-anchor="middle" fill="#d97757" font-family="'JetBrains Mono',monospace">
<text x="260" y="418">0.15</text><text x="400" y="418">0.10</text><text x="540" y="418">0.45</text><text x="680" y="418">0.30</text>
</g>
<g class="qa qa-s5c">
<text x="16" y="470" fill="#a1a09a" font-size="12">⑥ 加权求和 V</text>
<line x1="260" y1="424" x2="410" y2="442" stroke="#7ca982" stroke-width="1.8" opacity=".45"/>
<line x1="400" y1="424" x2="450" y2="442" stroke="#7ca982" stroke-width="1.5" opacity=".4"/>
<line x1="540" y1="424" x2="490" y2="442" stroke="#7ca982" stroke-width="3.2" opacity=".75"/>
<line x1="680" y1="424" x2="530" y2="442" stroke="#7ca982" stroke-width="2.4" opacity=".6"/>
</g>
<g class="qa-out">
<rect x="370" y="444" width="200" height="42" rx="10" fill="rgba(217,119,87,.12)" stroke="#d97757"/>
<text x="470" y="470" text-anchor="middle" fill="#faf9f5" font-size="13">“强”的输出向量（已融合上下文）</text>
</g>
</svg>
<style>
.qkva-wrap .qa{animation:qa-s1 18s linear infinite}
.qkva-wrap .qa-s2{animation-name:qa-s2}
.qkva-wrap .qa-s3{animation-name:qa-s3}
.qkva-wrap .qa-s4{animation-name:qa-s4}
.qkva-wrap .qa-s5{animation-name:qa-s5}
.qkva-wrap .qa-s5b{animation-name:qa-s5b}
.qkva-wrap .qa-s5c{animation-name:qa-s5c}
.qkva-wrap .qa-arc{animation:qa-arc 18s linear infinite}
.qkva-wrap .qa-bar{transform-box:fill-box;transform-origin:50% 100%;animation:qa-bar 18s linear infinite}
.qkva-wrap .qa-out{transform-box:fill-box;transform-origin:center;animation:qa-out 18s linear infinite}
.qkva-wrap .qa-q3{animation:qa-q3 18s linear infinite}
@keyframes qa-s1{0%,2%{opacity:0}6%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes qa-s2{0%,12%{opacity:0}16%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes qa-s3{0%,24%{opacity:0}28%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes qa-s4{0%,36%{opacity:0}40%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes qa-s5{0%,47%{opacity:0}51%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes qa-arc{0%,48%{stroke-dashoffset:400;opacity:0}52%{stroke-dashoffset:300;opacity:1}60%,95%{stroke-dashoffset:0;opacity:1}99%,100%{stroke-dashoffset:0;opacity:0}}
@keyframes qa-bar{0%,56%{transform:scaleY(0);opacity:1}64%,95%{transform:scaleY(1);opacity:1}99%,100%{transform:scaleY(1);opacity:0}}
@keyframes qa-s5b{0%,62%{opacity:0}66%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes qa-s5c{0%,66%{opacity:0}70%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes qa-out{0%,72%{opacity:0;transform:scale(.92)}77%,95%{opacity:1;transform:scale(1)}99%,100%{opacity:0;transform:scale(1)}}
@keyframes qa-q3{0%,47%{fill-opacity:.85}51%,95%{fill-opacity:1}100%{fill-opacity:.85}}
@media (prefers-reduced-motion:reduce){.qkva-wrap *{animation:none!important}}
</style>
</div>

*动画:一句话进入大模型的完整旅程——分词、查表、Embedding+位置编码、生成Q/K/V,最后以"强"为例演示注意力加权(自动循环播放)*

## 一、旅程的起点:文字变成Token

模型不认识"字",只认识数字。所以第一件事,是把一段文字切成一个个**token**——注意token不一定是完整的词,很多时候是子词(subword)。现在主流大模型(GPT系列的tiktoken、LLaMA的SentencePiece)基本都用**BPE(Byte Pair Encoding)**或它的变体来做这件事。

切完词之后,每个token会通过一张固定的**词表(Vocabulary)**映射成一个整数ID。到这一步,"大模型很强大"这句话,就变成了类似`[10432, 872, 231, 15]`这样一串数字。

## 二、Token ID怎么变成向量:Embedding表

光有ID还不够,模型没法直接对一个孤零零的整数做数学运算。这时候需要一张 **Embedding 表**——本质上就是一个巨大的矩阵,行数是词表大小,列数是隐藏维度(比如768或4096)。每个token ID对应表里的一行,这一行就是这个token的向量表示。

>**划重点:**这张表一开始是随机数字,是在训练过程里通过反向传播一点点调出来的,不是人工设计或人工赋予含义的。

### 向量里的每个数字,是什么意思?

这是最容易产生误解的地方。教程里经常举例子说"第37维代表性别,第52维代表年龄",这是一种教学上的简化比喻。真实训练出来的embedding里,**单个维度通常没有人类能看懂的具体含义**——语义信息是被"打散"编码在所有维度的组合里的,这叫**分布式表示(Distributed Representation)**。

但整个向量的**方向和距离**是有意义的:语义相近的词,向量会彼此靠近;甚至可以做向量运算,经典例子:

```
国王 − 男人 + 女人 ≈ 女王
```

这说明向量之间的"方向差"编码了某种抽象的关系(比如"性别转换"这个操作),尽管你说不出是哪一个坐标轴在起作用。

![一句话从原始文字到Token再到QKV的完整链路](posts/images/fig1-pipeline.png)
*图1:一句话从原始文字,到Token,到Token ID,到查表变成向量,再到生成Q/K/V的完整链路*

## 三、位置去哪了:Transformer天生不知道"顺序"

Embedding只编码了"这个词是什么",但没编码"这个词排第几"。而Transformer不像RNN那样天然按顺序处理,所以必须专门给每个位置补一个**位置编码(Positional Encoding)**。历史上大致有三种流派:

| 方案 | 是否可学习 | 代表模型 | 特点 |
|---|---|---|---|
| 正弦/余弦编码 | 否,固定公式 | 原始 Transformer (2017) | 可以外推到更长序列,但表达能力有限 |
| 可学习位置向量 | 是,训练学出 | BERT、GPT-2 | 灵活,但难以泛化到训练时没见过的长度 |
| RoPE(旋转位置编码) | 否,固定公式,作用于Q/K | LLaMA、Qwen、GPT-NeoX等 | 编码相对位置,外推性和效果都更好 |

现在主流大模型基本都用RoPE,下面重点讲讲它。

## 四、RoPE:把位置信息"转"进向量里

RoPE的核心思路:把一个高维向量**两两分组**,每组看成二维平面上的一个点`(x, y)`,再根据这个token所在的位置,把这个点绕原点**旋转一个角度**:

```
x' = x·cosθ − y·sinθ
y' = x·sinθ + y·cosθ
```

旋转角度 = **位置 × 频率**。不同分组会分配不同频率——靠前的维度频率高,转得快,适合捕捉邻近词的关系;靠后的维度频率低,转得慢,适合捕捉长距离关系。

![RoPE旋转示意图](posts/images/fig3-rope.png)
*图2:同一个词出现在位置5和位置10,经过RoPE后会被旋转不同的角度*

### 为什么这样设计很巧妙

假设两个词分别在位置`m`和`n`,它们的Q、K向量分别被旋转了`mθ`和`nθ`。旋转矩阵有个性质:两个旋转矩阵相乘,角度会相减。所以当算`Q_m · K_n`点积时:

```
Q_m · K_n = f(q, k, m − n)
```

点积结果**只跟相对距离 (m−n) 有关,跟绝对位置无关**。这正是语言里我们想要的性质——"猫追狗"这个语法结构,不该因为它出现在文章开头还是结尾就有本质区别。

### 为什么只转Q和K,不转V?

这是个很容易被忽略但很关键的问题。答案要从注意力在做什么说起——整个计算可以拆成两阶段:

1. **算权重**:用`Q·K^T`决定"谁该关注谁"
2. **加权求和**:用算出来的权重,对`V`做加权平均,取出实际内容

位置信息真正要发挥作用的地方,是第一阶段"谁该关注谁",而不是第二阶段"内容是什么"。`V`代表的是词的语义内容本身,不应该因为位置不同而被扭曲——"猫"这个词的语义,不管它出现在句首还是句尾都应该是稳定、可复用的。

更关键的是,前面说的"两个旋转矩阵相乘、角度自动相减"这个数学技巧,**只在Q、K做点积的那一步才会自然发生**。如果把旋转也加到V上,V只是被单纯地加权求和,没有类似的抵消过程,自然也就得不到"只依赖相对位置"这个良好性质。

## 五、Q、K、V正式登场

铺垫做完了,现在可以完整地讲Q、K、V是怎么算出来的了。输入向量`X`(已经包含语义 + 位置信息)会乘以三个**独立的、可学习的权重矩阵**:

```
Q = X·W_Q      K = X·W_K      V = X·W_V
```

- **Q(Query)**:当前位置想要查询什么信息
- **K(Key)**:每个位置能提供什么信息的标签
- **V(Value)**:每个位置实际携带的内容

一个常见的类比是图书馆检索:Query是你输入的关键词,Key是每本书的索引标签,Value是书的实际内容。用Query去匹配所有书的Key,匹配度越高,这本书的Value就越应该被重点参考。

![注意力计算流程图](posts/images/fig2-attention.png)
*图3:Q、K算出相关性分数,归一化成权重后,再对V做加权求和,得到这一层的注意力输出*

```
Attention(Q,K,V) = softmax( Q·K^T / √d_k ) · V
```

### 这个概念最早从哪来的

注意力机制本身出现得更早——Bahdanau等人2014年的机器翻译论文里就提出了"对齐"注意力,但用的是"对齐分数"这套术语,还没有Q/K/V三元组。真正把注意力抽象、泛化成"Query检索Key、取出Value"这套统一框架并正式命名的,是2017年Google那篇奠定Transformer架构的论文——*Attention Is All You Need*。这个命名思路借鉴自信息检索领域的"键值存储(key-value store)"概念。

## 六、一个头不够用:多头注意力

前面讲的其实是**单头**注意力。多头注意力(Multi-Head Attention)把这个过程复制多份,每份用独立的`W_Q, W_K, W_V`,让模型能同时从多个"视角"关注序列里的关系。比如隐藏维度是768、设置12个头,每个头只负责64维,12个头并行算完注意力后,再拼接回768维,乘一个输出矩阵融合。

这样做的好处是:不同的头可以专注学习不同类型的语言关系——有的头关注相邻词的语法结构,有的头关注指代关系,有的头关注因果关系。这跟卷积网络里"多个卷积核学习不同特征"的思路是类似的。

## 七、回到最初的问题:Q、K、V到底有没有具体含义?

这个问题得分两个层次来看,不然很容易混。

**从功能角色上看,Q、K、V是有明确含义的**,而且这个含义是写在公式和架构设计里的——Q负责查询、K负责被匹配、V负责提供内容,这个分工是确定的、可解释的。

**但从每个维度的具体数值上看,Q、K、V和embedding一样是不可解释的**——它们都是同一个`X`分别乘上 `W_Q, W_K, W_V` 算出来的,而这三个矩阵是训练出来的参数,没人告诉模型该在里面编码什么规律。你没法说"Q向量第37维代表什么意思",这跟embedding面临的问题是一回事。

>一个类比:"简历"和"岗位需求"这两个概念,功能定位是清楚的——简历用来匹配岗位,岗位需求用来筛选简历。但具体简历上写的每一句话,是HR自己写的,写之前你没法预测内容是什么。Q、K、V的角色分工像前者,具体数值则像后者。

值得一提的是,虽然单个维度不可解释,但**注意力权重的整体行为模式**是可以观察的——可解释性研究发现,有些头会稳定地关注"上一个词",有些头专门关注指代关系,有些头关注标点位置。这是"行为层面"的可解释性,和"单个维度代表什么"不是一回事,目前仍是一个活跃的研究方向。

---

## 写在最后

把这条链路走一遍会发现,Q、K、V并不是什么玄学符号,而是一整套"信息检索"思路在向量空间里的落地实现:文字先变成离散的token,再变成可计算的向量,再补上位置信息,最后被拆分成"查询 - 索引 - 内容"三个角色,去动态地决定"这个词该关注谁、该拿到什么"。理解了这条链路,再回头看attention公式,应该就不会只是一堆符号了。
