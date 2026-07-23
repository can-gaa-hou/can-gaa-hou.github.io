>PyTorch 2.0发布时最出圈的宣传就是:给你的模型加一行`model = torch.compile(model)`,训练和推理就能快上百分之几十。但这一行代码到底做了什么?为什么Python这种"逐行解释执行"的语言,突然就能被"编译"了?遇到编译不了的代码会不会崩?这篇笔记基于PyTorch源码(2.14 main分支),把一个函数从"被compile包住"到"变成GPU上的Triton内核"的完整旅程走一遍。

---

<div class="tcp-wrap" style="max-width:100%;margin:8px 0 4px;background:#1a1a18;border:1px solid #2a2a26;border-radius:12px;padding:16px 8px 8px;">
<svg viewBox="0 0 860 570" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto;font-family:'Inter','Noto Sans SC',sans-serif;">
<defs>
<marker id="tc-arr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path fill="#6b6a64" d="M0,0L6,3L0,6z"/></marker>
<marker id="tc-arr-b" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path fill="#6a9bcc" d="M0,0L6,3L0,6z"/></marker>
</defs>
<text x="430" y="14" text-anchor="middle" fill="#d97757" font-size="12" font-family="'JetBrains Mono',monospace">@torch.compile</text>
<rect x="300" y="22" width="260" height="34" rx="8" fill="#1f1f1c" stroke="#3a3a34"/>
<text x="430" y="44" text-anchor="middle" fill="#faf9f5" font-size="13" font-family="'JetBrains Mono',monospace">f(x) = x.sin().cos()</text>
<g class="tc tc-s1">
<text x="16" y="105" fill="#a1a09a" font-size="12">① Dynamo拦截字节码</text>
<text x="16" y="121" fill="#6b6a64" font-size="11">　 (PEP 523钩子)</text>
<line x1="430" y1="58" x2="430" y2="72" stroke="#6b6a64" marker-end="url(#tc-arr)"/>
<rect x="300" y="78" width="260" height="72" rx="8" fill="#1f1f1c" stroke="#3a3a34"/>
<text x="320" y="97" fill="#6a9bcc" font-size="11" font-family="'JetBrains Mono',monospace">LOAD_FAST&#160;&#160;&#160;&#160;x</text>
<text x="320" y="113" fill="#6a9bcc" font-size="11" font-family="'JetBrains Mono',monospace">CALL_METHOD&#160;&#160;sin → cos</text>
<text x="320" y="129" fill="#6a9bcc" font-size="11" font-family="'JetBrains Mono',monospace">RETURN_VALUE</text>
<text x="320" y="144" fill="#6b6a64" font-size="10">Python字节码,而不是源代码</text>
</g>
<g class="tc tc-s2">
<text x="16" y="240" fill="#a1a09a" font-size="12">② 符号执行:</text>
<text x="16" y="256" fill="#a1a09a" font-size="12">　 抓出图 + 守卫</text>
<line x1="400" y1="152" x2="310" y2="172" stroke="#6b6a64" marker-end="url(#tc-arr)"/>
<line x1="470" y1="152" x2="560" y2="172" stroke="#6b6a64" marker-end="url(#tc-arr)"/>
<rect x="150" y="178" width="270" height="150" rx="8" fill="#1f1f1c" stroke="#d97757"/>
<text x="285" y="197" text-anchor="middle" fill="#d97757" font-size="12" font-weight="600">FX Graph(计算图)</text>
<rect x="225" y="206" width="120" height="24" rx="6" fill="#26261f" stroke="#3a3a34"/><text x="285" y="222" text-anchor="middle" fill="#faf9f5" font-size="11" font-family="'JetBrains Mono',monospace">placeholder: x</text>
<line x1="285" y1="230" x2="285" y2="242" stroke="#6b6a64" marker-end="url(#tc-arr)"/>
<rect x="225" y="246" width="120" height="24" rx="6" fill="#26261f" stroke="#3a3a34"/><text x="285" y="262" text-anchor="middle" fill="#faf9f5" font-size="11" font-family="'JetBrains Mono',monospace">sin</text>
<line x1="285" y1="270" x2="285" y2="282" stroke="#6b6a64" marker-end="url(#tc-arr)"/>
<rect x="225" y="286" width="120" height="24" rx="6" fill="#26261f" stroke="#3a3a34"/><text x="285" y="302" text-anchor="middle" fill="#faf9f5" font-size="11" font-family="'JetBrains Mono',monospace">cos</text>
<rect x="460" y="178" width="260" height="150" rx="8" fill="#1f1f1c" stroke="#6a9bcc"/>
<text x="590" y="197" text-anchor="middle" fill="#6a9bcc" font-size="12" font-weight="600">Guards(守卫)</text>
<text x="478" y="222" fill="#6a9bcc" font-size="11" font-family="'JetBrains Mono',monospace">x是Tensor</text>
<text x="478" y="244" fill="#6a9bcc" font-size="11" font-family="'JetBrains Mono',monospace">dtype == float32</text>
<text x="478" y="266" fill="#6a9bcc" font-size="11" font-family="'JetBrains Mono',monospace">shape == (1024,)</text>
<text x="478" y="288" fill="#6a9bcc" font-size="11" font-family="'JetBrains Mono',monospace">device == cuda:0</text>
<text x="478" y="314" fill="#6b6a64" font-size="10">下次调用先查这些条件</text>
</g>
<g class="tc tc-s3">
<text x="16" y="378" fill="#a1a09a" font-size="12">③ AOTAutograd:</text>
<text x="16" y="394" fill="#a1a09a" font-size="12">　 提前生成反向图</text>
<line x1="250" y1="332" x2="222" y2="352" stroke="#6b6a64" marker-end="url(#tc-arr)"/>
<line x1="320" y1="332" x2="348" y2="352" stroke="#6b6a64" marker-end="url(#tc-arr)"/>
<rect x="150" y="358" width="126" height="34" rx="8" fill="rgba(217,119,87,.12)" stroke="#d97757"/><text x="213" y="380" text-anchor="middle" fill="#faf9f5" font-size="12">forward图</text>
<rect x="294" y="358" width="126" height="34" rx="8" fill="rgba(217,119,87,.12)" stroke="#d97757"/><text x="357" y="380" text-anchor="middle" fill="#faf9f5" font-size="12">backward图</text>
</g>
<g class="tc tc-s4">
<text x="16" y="452" fill="#a1a09a" font-size="12">④ Inductor:</text>
<text x="16" y="468" fill="#a1a09a" font-size="12">　 融合 + 生成代码</text>
<line x1="285" y1="392" x2="285" y2="418" stroke="#6b6a64" marker-end="url(#tc-arr)"/>
</g>
<g class="tc-kernel">
<rect x="150" y="424" width="270" height="66" rx="10" fill="rgba(124,169,130,.12)" stroke="#7ca982"/>
<text x="285" y="446" text-anchor="middle" fill="#7ca982" font-size="12" font-weight="600">1个融合的Triton kernel</text>
<text x="285" y="466" text-anchor="middle" fill="#faf9f5" font-size="11" font-family="'JetBrains Mono',monospace">load → sin → cos → store</text>
<text x="285" y="482" text-anchor="middle" fill="#6b6a64" font-size="10">两个算子,只走一次显存往返</text>
</g>
<g class="tc tc-s5">
<path d="M590,332 C590,440 480,456 428,456" fill="none" stroke="#6a9bcc" stroke-width="1.5" stroke-dasharray="6 4" marker-end="url(#tc-arr-b)"/>
<text x="480" y="516" fill="#a1a09a" font-size="12">⑤ 第二次调用:守卫全部通过 →</text>
<text x="480" y="534" fill="#a1a09a" font-size="12">　 跳过所有编译,直接执行缓存的kernel</text>
<text x="480" y="556" fill="#6b6a64" font-size="11">守卫不通过(比如shape变了)→ 重新编译</text>
</g>
</svg>
<style>
.tcp-wrap .tc{animation:tc-s1 20s linear infinite}
.tcp-wrap .tc-s2{animation-name:tc-s2}
.tcp-wrap .tc-s3{animation-name:tc-s3}
.tcp-wrap .tc-s4{animation-name:tc-s4}
.tcp-wrap .tc-s5{animation-name:tc-s5}
.tcp-wrap .tc-kernel{transform-box:fill-box;transform-origin:center;animation:tc-kernel 20s linear infinite}
@keyframes tc-s1{0%,3%{opacity:0}7%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes tc-s2{0%,18%{opacity:0}22%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes tc-s3{0%,38%{opacity:0}42%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes tc-s4{0%,52%{opacity:0}56%,95%{opacity:1}99%,100%{opacity:0}}
@keyframes tc-kernel{0%,56%{opacity:0;transform:scale(.92)}61%,95%{opacity:1;transform:scale(1)}99%,100%{opacity:0;transform:scale(1)}}
@keyframes tc-s5{0%,72%{opacity:0}76%,95%{opacity:1}99%,100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.tcp-wrap *{animation:none!important}}
</style>
</div>

*动画:一次`torch.compile`的完整旅程——拦截字节码、符号执行抓图、生成前后向图、融合成Triton kernel,以及第二次调用时的缓存命中(自动循环播放)*

## 一、先搞清楚:eager模式到底慢在哪

PyTorch默认的执行方式叫 **eager mode**:你写一行,它执行一行。这也是PyTorch当年打败TensorFlow 1.x的杀手锏——代码怎么写就怎么跑,可以随手print、随手打断点。

但"逐行执行"在GPU上有三笔隐藏的开销。拿一个最小的例子来说:

```python
y = x.sin().cos()
```

在eager模式下,这一行实际发生的事是:

1. Python解释器执行`x.sin()` →向GPU **发射(launch)一个sin kernel** →算出结果,**写回显存**,变成一个临时tensor
2. Python解释器执行`.cos()` → **再发射一个cos kernel** →把刚才的临时结果**从显存读出来**,算完再写回去

三笔开销分别是:

| 开销 | 说明 |
|---|---|
| Python解释器开销 | 每个算子都要走一遍Python → C++ 的调用链 |
| Kernel launch开销 | CPU向GPU发射一个kernel有固定成本(几微秒),算子越碎越吃亏 |
| 显存往返 | 中间结果写回显存再读出来。像sin/cos这种简单运算,时间几乎全花在读写显存上(memory-bound),计算本身反而不是瓶颈 |

打个比方:eager模式像一个厨师,每做完一道工序就把食材放回冰箱,下道工序再拿出来——真正切菜炒菜没花多少时间,全耗在开关冰箱门上了。

`torch.compile`要做的事,本质上就是**提前看到你接下来要做的所有工序,然后把能合并的合并掉**:sin和cos融合成一个kernel,中间结果留在寄存器里,不碰显存。而要做到"提前看到",就得先解决一个大难题——**怎么从随心所欲的Python代码里,把计算图抓出来?**

## 二、鸟瞰:torch.compile是一条三段式流水线

`torch.compile`不是一个单一的工具,而是三个组件串成的流水线:

| 组件 | 角色 | 源码位置 |
|---|---|---|
| **TorchDynamo** | 前端:拦截Python字节码,安全地抓出计算图(FX Graph) | `torch/_dynamo/` |
| **AOTAutograd** | 中端:把反向传播也提前trace成图,并把算子拆解成底层原语 | `torch/_functorch/aot_autograd.py` |
| **TorchInductor** | 后端:算子融合,生成Triton(GPU)或C++(CPU)代码 | `torch/_inductor/` |

而`torch.compile`这个函数本身(`torch/__init__.py:3106`)几乎什么都不做——它只是把你的函数用`torch._dynamo.optimize`(实际入口`torch/_dynamo/eval_frame.py:1707`的`_optimize`)包了一层,**注册一个钩子就返回了**。真正的编译发生在你**第一次调用**这个函数的时候,这也是为什么compile后的第一次调用会明显变慢。

>**和老一代torch.jit的本质区别:**`torch.jit.script`要求你的代码必须落在它能理解的Python子集里,超纲就直接报错;`torch.jit.trace`会把if/for固化成trace时走的那条路,悄悄给你埋bug。而Dynamo遇到搞不定的代码,**不会报错也不会算错,而是把图切开,那一小段退回eager执行**(后面第五节讲)。"永远不会因为编译不了而挂掉",这是torch.compile能被默认推荐的关键。

下面按流水线顺序,一段一段拆开看。

## 三、Dynamo:潜伏在Python解释器里的"海关"

### 3.1它是怎么拦截到你的代码的:PEP 523

CPython有一个不太为人知的机制,叫 **PEP 523(Frame Evaluation API)**:它允许C扩展替换"解释器执行一个函数帧(frame)"的入口函数。Dynamo正是利用了这一点——在C层面调用`_PyInterpreterState_SetEvalFrameFunc`,把解释器的执行入口换成了自己的钩子:

```c
// torch/csrc/dynamo/eval_frame.c:249(节选)
_PyInterpreterState_SetEvalFrameFunc(interp, &dynamo_custom_eval_frame_shim);
```

装上钩子之后,每当Python准备执行一个被`torch.compile`包住的函数,Dynamo就会先于解释器拿到这个frame——包括它的**字节码**、局部变量、闭包。就像在海关安插了检查员:每个入境的函数都要先过它的手。

注意:Dynamo看的是**字节码**而不是源代码字符串。字节码是Python解释器真正执行的指令序列,`x.sin().cos()`编译成字节码大概长这样:

```
LOAD_FAST      x
LOAD_METHOD    sin
CALL_METHOD    0
LOAD_METHOD    cos
CALL_METHOD    0
RETURN_VALUE
```

### 3.2符号执行:假装跑一遍,记下所有tensor运算

拿到字节码后,Dynamo并不真的执行它,而是做**符号执行(symbolic execution)**:用一个自己写的"迷你Python解释器"——`InstructionTranslator`(`torch/_dynamo/symbolic_convert.py:5366`)——逐条模拟这些字节码。

模拟过程中,每个变量都被包装成一个`VariableTracker`:普通的int、str照常处理,而一旦遇到 **tensor运算,就不真算,而是往图里记一个节点**。这些节点由`OutputGraph`(`torch/_dynamo/output_graph.py:740`)收集,最终攒成一张 **FX Graph**。

你可以亲手看到这张图——给`torch.compile`传一个自定义backend,把图打印出来:

```python
import torch

def my_backend(gm, example_inputs):
    gm.graph.print_tabular()   # 打印抓到的图
    return gm.forward          # 不做优化,原样返回

@torch.compile(backend=my_backend)
def f(x):
    return x.sin().cos()

f(torch.randn(1024))
```

输出(简化):

```
opcode         name    target    args
-------------  ------  --------  ----------
placeholder    l_x_    L_x_      ()
call_method    sin     sin       (l_x_,)
call_method    cos     cos       (sin,)
output         output  output    ((cos,),)
```

这就是"计算图"的真身:一个普通的Python数据结构,节点是算子,边是数据依赖。**到这一步,"随心所欲的Python代码"已经被驯化成了"编译器能处理的图"**——这正是Dynamo的全部使命。

### 3.3改写字节码:把编译产物"缝"回函数里

抓完图、编译完(后面几节的事),Dynamo还要干最后一件事:**生成一段新的字节码**,内容大致是"调用编译好的产物`__compiled_fn_0`,返回结果",然后把它连同守卫一起**缓存在原函数的code对象上**。这条主流程在`torch/_dynamo/convert_frame.py:1647`的`_compile`里,核心一步是`transform_code_object`——对字节码做变换并重新组装。

于是下次再调用这个函数时,钩子发现缓存存在,检查守卫,通过就直接执行新字节码——Python解释器甚至不知道自己执行的已经不是你写的那份代码了。

## 四、Guards:缓存的"门禁系统"

这里有个关键问题:Dynamo抓图时看到的是**某一次具体的调用**——`x`是float32、shape是`(1024,)`、在cuda:0上。编译出来的kernel也只对这种情况保证正确。**万一下次传进来的x变了呢?**

答案是:每次编译时,Dynamo会同步生成一组**守卫(guards)**——一个快速的检查函数,由`CheckFunctionManager`(`torch/_dynamo/guards.py:4434`)负责组装。运行`TORCH_LOGS=guards python your_script.py`可以看到它们,大致长这样(简化):

```
TENSOR_MATCH: check_tensor(L['x'], torch.float32, device=0,
              requires_grad=False, size=[1024], stride=[1])
```

每次调用被编译的函数,流程是:

1. 守卫**全部通过** →直接执行缓存的编译产物(这条路极快,C++ 实现)
2. 守卫**不通过**(比如这次shape是`(2048,)`)→ **重新编译**一份,新旧版本都缓存着,按守卫分发
3. 同一个函数重编译超过`recompile_limit`(默认 **8** 次,`torch/_dynamo/config.py:121`)→ Dynamo认为这函数太"多变",放弃治疗,整个退回eager

关于shape变化还有个贴心设计:默认的`dynamic=None`是**自动动态(automatic dynamic)**——第一次见到`(1024,)`按静态编译;一旦发现第二次变成了`(2048,)`,就把这一维泛化成符号`s0`重编一次,之后任意长度都命中同一份缓存,不再反复编译。如果你一开始就知道shape会变(比如NLP里变长序列),直接`torch.compile(f, dynamic=True)`可以省掉中间那次重编译。

## 五、Graph Break:编译不了的代码怎么办

Dynamo的符号执行不是万能的。碰到这些情况它就没法继续往图里记了:

- `print()`、写文件等副作用操作
- 调用numpy之外的第三方C扩展
- **依赖tensor具体数值的控制流**:`if x.sum() > 0:`——图是"提前"抓的,此时根本不知道`x.sum()`是多少
- `.item()`、`.tolist()`这类把tensor拽回Python世界的操作

此时Dynamo内部会抛一个`Unsupported`异常(`torch/_dynamo/exc.py:296`)——但这不会传到你脸上,而是触发 **graph break(图断裂)**:把函数在断点处切开,前半段编译成一张图,中间那句回到eager老老实实执行,后半段再抓一张新图。

```python
@torch.compile
def f(x):
    x = x.sin()
    print("checkpoint")   # ← graph break!
    return x.cos()
```

这个函数能跑、结果也对,但被切成了**两张图**——sin和cos分了家,再也没法融合成一个kernel了。**graph break是沉默的性能杀手**:代码不报错,只是悄悄变慢。

排查手段有三个,按推荐顺序:

```python
# 1. explain:一次性报告抓了几张图、断在哪、为什么
print(torch._dynamo.explain(f)(torch.randn(1024)))

# 2. 环境变量:运行时打印每一次 graph break 及原因
#    TORCH_LOGS=graph_breaks python your_script.py

# 3. 严格模式:有 graph break 直接报错,追求极致性能时用
f = torch.compile(f, fullgraph=True)
```

## 六、AOTAutograd:反向传播也要提前编译

到这里,Dynamo抓到的只是 **forward** 的图。但训练时还有反向传播——如果backward还走eager的autograd引擎逐算子执行,前面省下的开销就只省了一半。

**AOTAutograd**(Ahead-Of-Time Autograd)负责解决这件事,入口是`aot_module_simplified`(`torch/_functorch/aot_autograd.py:1136`)。它做三件事:

1. **用假tensor重新trace一遍**:用`FakeTensor`(只有shape/dtype/device元信息、没有真实数据的假张量)把Dynamo交来的图执行一遍,连同自动求导规则,展开成一张包含前向+反向的**联合图(joint graph)**
2. **算子分解(decomposition)**:把高层算子拆成底层ATen原语,图上只剩`aten.sin.default`这类几百个核心算子——后端只需要认识这一小撮算子就够了
3. **切图(partition)**:用`min_cut_rematerialization_partition`(`torch/_functorch/partitioners.py:4082`)把联合图切回forward / backward两张图

第3步藏着一个漂亮的优化。forward和backward之间要传递中间结果(激活值),这有两种策略:**存下来**(占显存)或者**backward时重算**(费计算)。存哪些、重算哪些,本质上是一个图的**最小割(min-cut)问题**——AOTAutograd直接用最小割算法求解,自动在显存和计算之间找平衡。你可能听说过的"activation checkpointing/重计算"技巧,在这里是编译器自动帮你做的。

## 七、Inductor:把图变成真正的高性能代码

流水线的最后一棒是 **TorchInductor**,入口`compile_fx`(`torch/_inductor/compile_fx.py:2824`)。它拿到的已经是干净的ATen算子图,分三步把它变成机器上真正跑的代码:

1. **Lowering**(`torch/_inductor/lowering.py`):把每个ATen算子降级成Inductor自己的循环级IR——"对每个元素做什么运算"这种粒度的描述
2. **调度与融合**(`torch/_inductor/scheduler.py:4132`的`Scheduler`,融合逻辑在`fuse_nodes`,`scheduler.py:5183`):分析节点之间的数据依赖和内存访问模式,把能合并的算子**融合(fuse)**成一个kernel——这就是第一节里"合并厨房工序"的落地之处
3. **代码生成**:GPU上生成 **Triton** 代码(`torch/_inductor/codegen/triton.py:3206`的`TritonKernel`),CPU上生成C++/OpenMP代码

用`TORCH_LOGS=output_code`可以看到Inductor为`x.sin().cos()`生成的真实Triton kernel(简化):

```python
@triton.jit
def triton_poi_fused_cos_sin_0(in_ptr0, out_ptr0, xnumel, XBLOCK: tl.constexpr):
    xoffset = tl.program_id(0) * XBLOCK
    xindex = xoffset + tl.arange(0, XBLOCK)[:]
    xmask = xindex < xnumel
    tmp0 = tl.load(in_ptr0 + xindex, xmask)   # 读一次显存
    tmp1 = tl_math.sin(tmp0)                  # 寄存器里算 sin
    tmp2 = tl_math.cos(tmp1)                  # 紧接着算 cos,不落显存
    tl.store(out_ptr0 + xindex, tmp2, xmask)  # 写一次显存
```

看函数名:`fused_cos_sin`——两个算子融合成了一个kernel。对比第一节的eager版本:**两次kernel launch变一次,两轮显存往返变一轮**。对memory-bound的算子序列来说,这就是torch.compile加速的最大来源。至于matmul、conv这类计算密集算子,Inductor还有`max-autotune`模式:为同一个算子生成多个候选实现(不同分块大小、不同模板),在你的GPU上**实测赛马**,选最快的那个编进最终产物。

## 八、实用速查

### mode参数怎么选

| mode | 编译耗时 | 适用场景 |
|---|---|---|
| `default` | 中 | 通用默认,性能和编译时间的平衡 |
| `reduce-overhead` | 中 | 用CUDA Graphs消掉kernel launch开销,小batch推理提升明显,额外占一些显存 |
| `max-autotune` | 慢 | 编译时给matmul/conv赛马选最优kernel,编译最慢、运行最快,适合"编译一次跑很久"的场景 |

### 调试工具箱

```bash
TORCH_LOGS=graph_breaks  python train.py   # 图断在哪、为什么
TORCH_LOGS=recompiles    python train.py   # 哪个守卫失败导致了重编译
TORCH_LOGS=guards        python train.py   # 看生成的全部守卫
TORCH_LOGS=output_code   python train.py   # 看 Inductor 生成的最终代码
```

### 小白最容易踩的四个坑

1. **第一次调用巨慢**:正常现象,编译就发生在第一次调用时。benchmark前先跑几轮warmup
2. **shape一直在变导致反复重编译**:`TORCH_LOGS=recompiles`确认后,加`dynamic=True`
3. **加了compile却没什么加速**:大概率是graph break把图切碎了,用`torch._dynamo.explain`检查;被compile的代码里别随手print
4. **改了模型代码但行为诡异**:编译缓存问题,可以先用`torch._dynamo.reset()`清缓存排除嫌疑

---

## 总结

回到开头的问题:`model = torch.compile(model)`这一行,背后是一条完整的编译器流水线——

- **Dynamo** 借PEP 523潜入Python解释器,拦截字节码做符号执行,把动态的Python代码驯化成静态的FX计算图,并配上一组守卫保证缓存安全;搞不定的代码就graph break退回eager,绝不硬来
- **AOTAutograd** 把反向传播也提前展开成图,用最小割算法自动权衡"存激活"还是"重算激活"
- **Inductor** 做算子融合,生成Triton/C++ 代码,把"每步都过一遍显存"的碎算子,压成"一次进出显存"的大kernel

它不是黑魔法,而是把"解释执行"变成"编译执行"的一整套工程,而且在设计上处处保留退路——这份"编译不了也不挂"的兼容性,才是它敢于让所有人无脑加一行代码的底气。下次再看到`torch.compile`,希望你脑子里浮现的不再是一个神秘开关,而是这条从字节码到Triton kernel的流水线。

>本文源码引用基于PyTorch main分支(2.14.0a0,2026年7月),行号可能随版本漂移,但模块结构是稳定的:`torch/_dynamo/`、`torch/_functorch/`、`torch/_inductor/`三个目录,分别对应本文的三、四、五、六、七节。
