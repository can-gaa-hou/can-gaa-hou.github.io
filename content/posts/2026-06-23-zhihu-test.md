---
title: "为什么 llama.cpp 是纯 C++，vLLM、SGLang 用了大量 Python？"
date: 2026-06-23T10:00:00+08:00
externalUrl: "https://www.zhihu.com/question/2048684438175866977/answer/2049846111821738651"
tags: ["LLM", "推理引擎", "llama.cpp", "vLLM", "SGLang", "系统设计"]
description: "三个引擎面对不同硬件约束做出了截然不同的语言决策：llama.cpp 追求零依赖全平台、vLLM 用 Python 掩盖 GPU 调度开销、SGLang 用 DSL 优化结构化推理。"
featureImage: "https://raw.githubusercontent.com/HybridShivam/Pokemon/master/assets/imagesHQ/0006.png"
featureImageAlt: "Charizard #006"
---
