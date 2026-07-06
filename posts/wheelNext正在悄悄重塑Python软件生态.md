*摘自[开源时刻](https://zhuanlan.zhihu.com/p/1947340533782538059)*

>AI 热潮下，PyPI日均下载25亿次，但包管理痛点凸显。WheelNext项目通过多个PEP提案，解决默认依赖、大文件托管等问题，重塑 Python 包生态。

<div align="center">
  <img src="posts/images/wheely.png" alt="WheelNext">
</div>

每天25亿次下载，支援超过66万个项目——这是2025年Python包仓库PyPI的最新数据。作为AI时代的"基础设施"，Python的包管理生态看似繁荣，实则藏着不少让开发者头疼的坑：

- 安装个astropy却发现少了一半功能？因为你不知道要加`[recommended]`参数；
- 下载PyTorch时被各种硬件后端及其各个版本所困扰；
- 公司内网就装不上依赖？多索引优先级能解决但各工具实现不一...

这些问题，正在被**WheelNext**项目逐个击破。

**WheelNext**是一个由Nvidia发起的项目，旨在提升Python软件包生态系统的用户体验，尤其是在科学计算和机器/深度学习领域。当前项目仍在初期讨论和试验开发阶段，已向Python社区提出5个可行的PEP（Python Enhancement Proposals，为Python社区提供各种增强功能的技术规格和新特性的提案）。

今天就来聊聊这些可能改变Python生态的PEP提案，看看它们能帮我们解决哪些实际痛点。


## 一、Default-extras终于不再是"隐藏关卡"

你有没有过这种经历：按教程装了个库，运行时却报错"缺少xxx模块"？这大概率是因为没装"推荐依赖"，即“extras”。

以FastAPI为例，核心功能很小，但要实现自动文档、异步支持等特性，需要安装`fastapi[all]`。在 Python包管理中，PEP 508 定义的“extras”机制可声明可选依赖， 但多数新手根本不知道这个"[]"语法，结果就是用起来磕磕绊绊。

**PEP 771** 提出的"Default-extras"机制，就是来解决这个问题的，以安装`astropy`为例，该包定义了一个`recommended`额外功能，通过使用本PEP新增的`default-optional-dependency-keys`健，该`recommended`可以声明为default extras：
```toml
[project]
default-optional-dependency-keys = [
    "recommended"
]

[project.optional-dependencies]
recommended = [
    "scipy",
    "..."
]
jupyter = [
    "astropy[recommended]",
    "ipywidgets>=8.0.0"
]
```
这就意味着当我们使用`pip install astropy`时会默认安装`recommended`里的依赖项，如果不想安装这些依赖项，则需要`pip install astropy[]`。值得一提的是，如果我们需要指定安装其他extras时，如`pip install astropy[jupyter]`，仅安装`jupyter`相关依赖（含继承的`recommended`）。

最妙的是依赖树处理：如果你的项目依赖A，而A又依赖astropy（没指定extras），会自动触发astropy的默认依赖。再也不用担心间接依赖缺胳膊少腿了。

```
spam（依赖tomato和egg）
├── tomato（依赖astropy[jupyter]）
└── egg（依赖astropy）  # 未指定extras，触发默认extras
```


## 二、版本优先vs索引优先

如果你用过企业内部的PyPI镜像，大概率遇到过这种情况：明明想装内部定制的`utils-1.0`，结果pip偷偷下了PyPI上的`utils-1.1`。

这是因为不同工具处理多索引的逻辑完全不一样：
- `pip`默认**版本优先**：合并多个索引，找到的包哪个版本新就用哪个，不管来自哪个索引；
- `uv`、`PDM`等其他工具默认**索引优先**：先从第一个索引找，没有再去下一个找；

**PEP 766** 把这两种行为标准化了：
- 版本优先级：适合多个信任度相同的镜像（比如PyPI镜像集群）；
- 索引优先级：适合企业内部索引+公共索引的组合（内网包优先）；

若该PEP被接受，以后在`pip.conf`里按照如下顺序添加索引，就能确保内部包不会被外部版本覆盖，安全感直接拉满。

```ini
# pip.conf（~/.config/pip/pip.conf）
[global]
index-url = https://internal-index.example.com/simple/  # 高优先级：内部索引
extra-index-url = https://pypi.org/simple/  # 低优先级：PyPI
```


## 三、大文件断点续传+原子发布

旧版的PyPI上传机制有多坑？做过开源库发布的都懂：
- 上传文件时需全程保持 HTTP 连接，且需等待索引处理完成（如校验元数据），大文件（如1GB的GPU包）上传中断后需重新开始；
- 一次只能上传一个文件，若一个版本包含 sdist+多个Wheel，会出现 “部分包已上传、部分未上传”的中间状态，导致用户安装到不完整版本；
- 上传时需手动提交元数据（如作者、依赖），但安装器最终会从包内读取元数据，导致“提交元数据与包内元数据不一致”的问题；


**PEP 694** 设计的Upload 2.0 API将彻底改写了这个流程：
- **采用Public Session和File Upload Session两步式上传**
    1. 创建Public Session：先创建一个 “阶段（stage）”，用于聚合该版本的所有文件（sdist+Wheel）；
    2. 创建File Upload Session：为每个文件（如sdist、linux-Wheel、windows-Wheel）创建独立上传会话，支持并行上传和断点续传；
    3. 预览与验证：可通过 “阶段预览 URL” 测试安装包，确认无误后再发布会话（此时所有文件才对公众可见）；
    4. 取消或完成：若发现问题，可取消会话（删除所有上传文件）；确认无误则完成会话（公开版本）；
- **API 格式与关键字段**
    - Content-Type：所有请求/响应使用`application/vnd.pypi.upload.v2+json`（明确 API 版本和序列化格式）；
    - 认证：遵循HTTP标准认证（如`Bearer Token`、`Basic Auth`），与PyPI现有认证体系兼容（如`API Token`、`Trusted Publishers`）；
    - 错误处理：返回结构化错误信息，包含全局消息和具体错误列表，示例：
    ```json
    {
        "meta": {"api-version": "2.0"},
        "message": "上传失败：文件大小超过限制",
        "errors": [
            {"source": "size", "message": "文件大小1.5GB超过项目配额1GB"}
        ]
    }
    ```
- **关键功能规范**
    - 断点续传与并行上传：支持多种文件上传机制，如`http-post-bytes`（基础HTTP上传）、`vnd-pypi-s3multipart-presigned`（S3分片上传，PyPI专属），大文件可分块上传，中断后仅需重传失败的块；
    - 阶段预览：发布会话创建后，会生成`stage URL`（如`https://upload.pypi.org/stage/abc123/`），可通过`pip install --extra-index-url <stage-url> package`测试安装，无需公开版本；
    - 元数据自动读取：上传时无需手动提交元数据，索引会从上传的包内读取元数据（如从sdist的`pyproject.toml`读取依赖），避免不一致；


## 四、 Wheel包瘦身

了解过Linux的同学都知道，共享库，如`libfoo.so.3.1.4`，通常通过符号链接生成`libfoo.so.3`（soname）和`libfoo.so`（linker name），避免文件重复；但由于CPython中的zipfile模块不支持就地处理符号链接，Wheel中的符号链接被创建为文件的副本，大大增加项目在磁盘上的安装大小（如numpy、pyarrow等含大型编译库的包受影响）。

**PEP 778** 提议要给Wheel加上符号链接支持，`LINKS`中新增的元数据文件`.dist-info`将跟踪符号链接，从而实现类似符号链接的跨平台使用。
```
# numpy/.dist-info/LINKS
numpy/lib/libnumpy.so.1.26.0,numpy/lib/libnumpy.so.1
numpy/lib/libnumpy.so.1,numpy/lib/libnumpy.so
```

不过这个提案目前还在推迟状态，需优先解决“旧安装器如何安全处理Wheel 2.0包“、”Windows符号链接权限适配“等问题（在PEP 777中提及）后，才会推进该 PEP 的落地。


## 五、重塑Python之轮

Wheel格式从2012年的PEP 427的1.0版本用到现在，已经无法满足大家对Python软件包的需求了（如PEP 778），需要升级2.0版本。但最大的难题是：怎么让新格式和旧安装器和平共处？

**PEP 777** 没直接定义新格式，而是制定了一套"演进规则"：
- 在`METADATA`中新增`Wheel-Version`元数据字段，该字段的值必须与Wheel内部`.dist-info/WHEEL`文件中的`Wheel-Version`值完全一致（如均2.0），若字段缺失，默认按 Wheel 1.0 处理；
- 解析器（Resolver）必须检查`Wheel-Verison`，跳过所有主版本不兼容的Wheel；如果解析器在解析多个索引中找到的软件包的过程中遇到两个具有相同发行版和版本的 Wheel，则解析器应优先考虑兼容版本最高的Wheel；
- 为了便于实验并更快地采用2.0版本的Wheel，建议先将Wheel的扩展名从`.whl`变成`.whlx`;
- 提案中还涉及关于未来Wheel修订的限制条件，如Wheel外层容器必须保持ZIP格式等；

未来，当某 PEP定义具体新格式时，只需遵循PEP 777的兼容性规则，即可无缝融入现有生态，无需重复解决 “过渡方案” 问题。


## 六、AI时代的Python包

WheelNext还有其他几个潜在提案，其中值得关注的是在今年2025 PyCon US上提出的**Wheel Variant**；同时，在PyTorch2.8版本中，**Wheel Variant**作为试验性特性发布。

了解PyTorch的同学都知道，PyTorch支持多平台多后端，当前Wheel格式仅通过“标签（tag）”区分版本、ABI、和平台（如`cp311`、`manylinux_2_28_x86_64`），这就导致下载PyTorch的索引地址复杂且繁多。

<div align="center">
  <img src="posts/images/pytorch.png" alt="PyTorch">
</div>

**Wheel Variant** 提出一种新的打包标准，让同一包版本支持多个硬件/平台优化变体，自动选择最适配的版本，平衡灵活性与易用性。以下是其关键的实现细节：
- 扩展现有Wheel文件名，在末尾添加可选的**variant label**，这个label可以是8位的哈希值（如`fa7c1393`）或1-8位自定义字符串（如`cuda12`，仅含a-z0-9._）最终格式如下：
    ```
    {distribution}-{version}(-{build tag})?-{python tag}-{abi tag}-{platform tag}(-{variant label})?.whl
    ```
- 每个变体都由零个或多个属性（Properties）来描述，形式为`namespace :: feature :: value`，由提供程序插件定义`namespace`，并且提供程序定义的所有属性都使用相同的命名空间;`feature`指定属性名称和`value`对应的属性值。`namespace`和`feature`均为ASCII字符串，字符范围为[a-z0-9_]，而`value`为 范围内的字符[a-z0-9_.,!>~<=];这些属性在构建时生成**variant hash**，可作为label合并到Wheel文件名中；
    ```plaintext
    x86_64 :: level :: v3   # x86_64 架构，CPU 等级 v3，支持 AVX512
    nvidia_gpu :: cuda_version :: 12.4  # NVIDIA GPU，支持 CUDA 12.4
    ```
- 提供**variant plugin**机制，负责检测系统硬件属性、验证`variant`的合法性，让用户可以不用手动安装依赖的软件包版本（如CUDA的版本）；硬件厂商需要实现`PluginType`协议，其核心方法包括：
    - `get_supported_configs()`：返回当前系统支持的特性配置（按优先级排序）；
    - `validate_property()`：验证变体属性是否合法（如x86_64 :: level :: v4是否为有效等级）；

从2.8版本起，用户无需再根据硬件环境手动安装PyTorch的各种依赖包，只需通过**Wheel Variant**就能简简单单的把PyTorch安装上，这无疑大大节省了环境搭建的时间与精力。
```shell
# Linux x86 and aarch64, MacOS
curl -LsSf https://astral.sh/uv/install.sh |
INSTALLER_DOWNLOAD_URL=https://wheelnext.astral.sh sh

uv pip install torch
```
```shell
# Windows X86
powershell -ExecutionPolicy Bypass -c 
“$env:INSTALLER_DOWNLOAD_URL=‘https://wheelnext.astral.sh’; irm 
https://astral.sh/uv/install.ps1 | iex”

uv pip install torch
```


## 写在最后

这些提案看似琐碎，却关乎每个Python开发者的日常体验。从让新手少踩坑的默认依赖，到为AI大模型优化的大文件分发，Nvidia主导的WheelNext正在悄悄织一张更完善的生态网，目前已经吸引Google、Intel、AMD等各大厂商以及PyTorch、VLLM、NumPy等热门开源社区加入。

或许过不了多久，当我们`pip install`时，背后已经默默完成了硬件检测、最优变体选择、断点续传等一系列操作——而这一切，都要归功于这些正在改变Python未来的PEP提案。

---

### 参考链接

[WheelNext代码仓](https://github.com/wheelnext)
[WheelNext官方文档](https://wheelnext.dev/)