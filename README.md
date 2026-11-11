# env-inject

面向 Cocos Creator 3.x 的构建扩展：构建前读取配置、环境参数与文本模板，生成目标文件；构建结束后恢复该文件的原始状态。本项目使用 Creator 3.8.8，面板与实际构建仍需在编辑器中验证。

扩展机制不依赖具体业务字段。切换项目时可以指定自己的配置、环境定义和模板，无需修改 JavaScript 源码。扩展没有内置的固定配置路径，也不会自动查找任何默认位置，所有配置文件都由使用者通过配置入口显式指定。

## 内置示例（仅供复制，不自动加载）

使用者必须先将 `examples` 整个文件夹复制到扩展目录之外，再修改复制后的文件并指定配置路径。不要在扩展内部维护项目配置，以免升级扩展时覆盖。扩展不会自动复制示例，也不会将它们作为运行时默认配置。

```text
env-inject/
├── README.md
├── package.json
├── examples/
│   ├── env-inject.json        配置入口示例
│   ├── envs.json              环境参数示例
│   └── EnvConfig.template.txt 内容模板示例
└── dist/
    ├── builder.js
    ├── hooks.js
    └── env-core.js
```

配置示例 `examples/env-inject.json`：

```json
{
    "output": "assets/Scripts/Define/EnvConfig.ts",
    "template": "EnvConfig.template.txt",
    "environments": "envs.json",
    "defaultEnv": "test",
    "versionSuffix": {
        "test": "-test",
        "prod": ""
    }
}
```

环境参数示例 `examples/envs.json`：

```json
{
    "test": {
        "wxCloudEnvId": "test-id",
        "storageKey": "tkt-test",
        "domain": "test-domain"
    },
    "prod": {
        "wxCloudEnvId": "prod-id",
        "storageKey": "tkt-prod",
        "domain": "prod-domain"
    }
}
```

`test-id`、`prod-id` 只是示例，正式使用前应替换为项目实际值。生成到客户端的内容可以被读取，不要用它保存服务端密钥。

内容模板示例 `examples/EnvConfig.template.txt`：

```text
/** 此文件由 env-inject 自动生成，请勿手工修改。 */
export const BUILD_ENV = {{json:env}};
export const GAME_VERSION = {{json:version}};
export const WX_CLOUD_ENV_ID = {{json:values.wxCloudEnvId}};
export const GAME_STORAGE_KEY = {{json:values.storageKey}};
export const GAME_DOMAIN = {{json:values.domain}};
```

## 路径规则

- 配置路径：可以是绝对路径；相对路径以项目根目录为基准。
- `output`：必须是项目根目录下的相对文件路径，禁止越界或通过已有目录联接、符号链接输出到项目外；不得覆盖配置入口、环境定义或模板文件。
- `template`、`environments`：相对路径以配置文件所在目录为基准，也可以填写绝对路径。
- JSON 中 Windows 路径建议使用 `/`；使用反斜杠时必须写成 `\\`。

## 在 Creator 构建面板使用

1. 将整个扩展放在项目的 `extensions/env-inject`，在扩展管理器启用或重新加载。
2. 在构建面板找到扩展选项：
   - **环境配置路径**：填写复制到扩展外的配置入口路径；留空时必须通过 `ENV_INJECT_CONFIG` 指定，否则报错并中断构建。
   - **构建环境**：填写环境定义中的键名，如 `test`、`prod`、`staging`。留空按下文优先级选取。
3. 构建前确认 `output` 指向期望的源文件，并备份重要内容。

环境名称不限制为 test/prod。旧构建任务可能已经保存了 `test`，如需使用 `defaultEnv` 或 `BUILD_ENV`，应清空面板中的构建环境。

配置优先级：面板路径 / CLI `--config` > `ENV_INJECT_CONFIG`。两者均未指定时直接报错，提示先复制示例并设置配置路径；不会回退到内部示例。

环境优先级：面板环境 / CLI `--env` > `BUILD_ENV` > 配置中的 `defaultEnv`。

## 接入自己的项目配置（首次使用必做）

本扩展不自动创建外部配置。由使用者将整个 `examples` 复制到扩展外自己选定的位置，可重命名文件夹，不必使用固定目录名。以下步骤只修改复制后的文件，保留扩展内部示例不变。

1. 将 `examples` 复制到扩展外；修改复制后的配置入口的 `output` 为项目中要生成的源文件路径。
2. 修改 `environments` 指向环境定义文件，增加实际字段及环境。
3. 修改 `template` 指向文本模板，按需要声明导出内容。
4. 在构建面板的“环境配置路径”填写该配置入口的项目相对路径或绝对路径。

扩展只负责读取指定文件，不需要为新项目修改核心源码。新增环境时，如果需要版本后缀，在 `versionSuffix` 中添加同名键；未配置的环境默认无后缀。

## 模板语法

仅支持以下占位符，不执行 JavaScript 表达式：

| 占位符 | 含义 |
| --- | --- |
| `{{json:env}}` | 当前环境名 |
| `{{json:version}}` | 完整版本号 |
| `{{json:values}}` | 当前环境的全部参数对象 |
| `{{json:values.field}}` | 当前环境字段，支持继续访问嵌套字段 |

字段名支持字母或下划线开头，后续可含数字；不支持数组索引、运算或默认值表达式。占位符会通过 `JSON.stringify` 输出 JSON 字面量，自动处理引号、换行和反斜杠，**不要再给占位符额外加引号**。

例如环境参数包含 `enabled: true`、`endpoint: "https://example.com"` 时，可用：

```text
export const ENABLED = {{json:values.enabled}};
export const ENDPOINT = {{json:values.endpoint}};
```

文件缺失、未知环境、缺失字段、无效或未闭合占位符会在写入前报错，不会继续使用旧内容构建。

## 命令行使用

在项目根目录执行（需要 Node.js）：

```powershell
# 先复制 examples 到扩展外并修改，再将占位路径替换为复制后的配置入口
node ./extensions/env-inject/dist/env-core.js --config "<复制后的配置入口路径>" --env test --version 1.2.3

# 使用环境变量提供配置入口
$env:ENV_INJECT_CONFIG = "<复制后的配置入口路径>"
node ./extensions/env-inject/dist/env-core.js --env prod --version 1.2.3

# 从其他工作目录调用时，同时指定项目根目录和配置入口
node "<项目根目录>/extensions/env-inject/dist/env-core.js" --root "<项目根目录>" --config "<复制后的配置入口路径>" --env prod
```

也可以在启动 Creator 或执行 CLI 前设置 `ENV_INJECT_CONFIG` 和 `BUILD_ENV`。Creator 需要从相应进程环境继承这些变量。未指定配置或指定了不存在的配置时直接报错，不会读取内部示例作为回退。

命令行生成是**持久写入，不自动恢复**。本次改造未修改项目根目录的 npm scripts；若旧脚本引用不存在的 `tools/gen-env.mjs`，请改用上述直接命令，或由项目维护者自行调整脚本。

## 版本号

版本来源依次为 CLI `--version`、当前提交可达的最近 Git tag（`git describe --tags --abbrev=0`）、`v0.0.0-dev`。没有 `v` 前缀时自动补齐，再追加当前环境的 `versionSuffix`；已以相同后缀结尾时不会重复追加。

例如显式版本 `1.2.3` 在示例配置的 test 环境生成 `v1.2.3-test`，在 prod 环境生成 `v1.2.3`。版本字符串不做语义化版本解析；Git tag 自带的其他后缀不会被自动剥离。

## 构建恢复与限制

- 构建前先解析并渲染成功，再保存目标文件的原始字节和实际输出路径，然后写入。
- `onAfterBuild` 恢复原始内容；如果原本不存在目标文件，则删除本次生成的文件，不再强制生成 test 文件。新建的父目录不会自动删除。
- 写入失败时立即尝试恢复；无快照时构建后钩子不写入任何文件。
- 快照只在构建进程内存中，不支持并发注入。构建过程中不要手动编辑目标文件。
- 强制退出、进程崩溃、取消或失败导致 Creator 未调用 `onAfterBuild` 时，不能保证自动恢复。请通过版本管理或备份恢复源文件；若同一进程保留了未恢复快照，会拒绝下一次注入，需先结束构建并处理恢复。
- 本次未在真实 Creator 中验证面板显示、构建时序及取消/失败行为，应在正式产包前进行一次实际构建检查。
