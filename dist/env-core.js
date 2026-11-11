"use strict";

/** 配置驱动的环境文件生成器，供构建钩子和命令行共用。 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function resolveRoot(explicit) {
    const candidates = [];
    if (explicit) candidates.push(explicit);
    candidates.push(path.resolve(__dirname, "../../.."));
    if (typeof Editor !== "undefined" && Editor.Project && Editor.Project.path) {
        candidates.push(Editor.Project.path);
    }
    candidates.push(process.cwd());
    for (const dir of candidates) {
        if (dir && fs.existsSync(path.join(dir, "assets"))) return path.resolve(dir);
    }
    throw new Error("[env-inject] 无法定位项目根目录（未找到 assets 目录）");
}

function readJson(file) {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`JSON 根节点必须是对象：${file}`);
    }
    return value;
}

function projectPath(root, relative) {
    if (typeof relative !== "string" || !relative.trim() || path.isAbsolute(relative)) {
        throw new Error("output 必须是非空的项目相对路径");
    }
    const resolved = path.resolve(root, relative);
    const remaining = path.relative(root, resolved);
    if (!remaining || remaining === ".." || remaining.startsWith(`..${path.sep}`) || path.isAbsolute(remaining)) {
        throw new Error("output 不得指向项目目录之外");
    }
    // 同时阻止通过已存在的符号链接或目录联接跳出项目。
    let ancestor = resolved;
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const realRemaining = path.relative(fs.realpathSync(root), fs.realpathSync(ancestor));
    if (realRemaining === ".." || realRemaining.startsWith(`..${path.sep}`) || path.isAbsolute(realRemaining)) {
        throw new Error("output 不得通过链接指向项目目录之外");
    }
    return resolved;
}

function loadConfig(root, explicit) {
    if (typeof explicit !== "string" || !explicit.trim()) {
        throw new Error(
            "[env-inject] 未指定配置路径：请先将扩展内 examples 复制到扩展外并修改，再设置构建面板的环境配置路径、CLI --config 或 ENV_INJECT_CONFIG",
        );
    }
    const configPath = path.resolve(root, explicit);
    const config = readJson(configPath);
    for (const key of ["template", "environments", "defaultEnv"]) {
        if (typeof config[key] !== "string" || !config[key].trim()) {
            throw new Error(`配置字段 ${key} 必须是非空字符串`);
        }
    }
    const directory = path.dirname(configPath);
    const templatePath = path.resolve(directory, config.template);
    const environmentsPath = path.resolve(directory, config.environments);
    const outPath = projectPath(root, config.output);
    if ([configPath, templatePath, environmentsPath].some((file) => path.relative(file, outPath) === "")) {
        throw new Error("output 不得覆盖配置、模板或环境定义文件");
    }
    return { config, outPath, templatePath, environmentsPath };
}

/** 版本号优先级：显式传入 > 当前提交可达的最近 git tag > 兜底值。 */
function resolveVersion(root, explicit) {
    if (explicit) return explicit;
    try {
        return execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return "v0.0.0-dev";
    }
}

/** 只支持 JSON 字面量占位符，不执行模板表达式。 */
function render(template, context) {
    const content = template.replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) => {
        const match = /^json:(env|version|values(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/.exec(expression.trim());
        if (!match) throw new Error(`无效模板占位符：${expression}`);
        let value = context;
        for (const key of match[1].split(".")) {
            if (value === null || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, key)) {
                throw new Error(`模板字段不存在：${match[1]}`);
            }
            value = value[key];
        }
        return JSON.stringify(value);
    });
    if (
        template.replace(/\{\{[\s\S]*?\}\}/g, "").includes("{{") ||
        template.replace(/\{\{[\s\S]*?\}\}/g, "").includes("}}")
    ) {
        throw new Error("模板包含未闭合的占位符");
    }
    return content;
}

/** 先完整解析和渲染，再写文件；构建钩子也可独立调用 prepare 保存快照。 */
function prepare(options = {}) {
    const root = resolveRoot(options.root);
    const loaded = loadConfig(root, options.config || process.env.ENV_INJECT_CONFIG);
    const { config } = loaded;
    const env = options.env || process.env.BUILD_ENV || config.defaultEnv;
    const envs = readJson(loaded.environmentsPath);
    if (
        !Object.prototype.hasOwnProperty.call(envs, env) ||
        !envs[env] ||
        typeof envs[env] !== "object" ||
        Array.isArray(envs[env])
    ) {
        throw new Error(`未知或无效环境 "${env}"，可选：${Object.keys(envs).join(" / ")}`);
    }
    let version = resolveVersion(root, options.version);
    if (!version.startsWith("v")) version = `v${version}`;
    const suffix =
        config.versionSuffix && Object.prototype.hasOwnProperty.call(config.versionSuffix, env)
            ? config.versionSuffix[env]
            : "";
    if (typeof suffix !== "string") throw new Error("versionSuffix 中的后缀必须是字符串");
    if (suffix && !version.endsWith(suffix)) version += suffix;
    const content = render(fs.readFileSync(loaded.templatePath, "utf8"), { env, version, values: envs[env] });
    return { env, version, outPath: loaded.outPath, content };
}

function writePrepared(result) {
    fs.mkdirSync(path.dirname(result.outPath), { recursive: true });
    fs.writeFileSync(result.outPath, result.content);
    return result;
}

function generate(options = {}) {
    return writePrepared(prepare(options));
}

function cli(options = {}) {
    const args = process.argv.slice(2);
    const readArg = (name) => {
        const index = args.indexOf(name);
        if (index === -1) return undefined;
        if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} 缺少参数`);
        return args[index + 1];
    };
    try {
        const result = generate({
            root: readArg("--root") || options.root,
            config: readArg("--config"),
            env: readArg("--env"),
            version: readArg("--version"),
        });
        console.log(`[env-inject] 已生成 ${result.outPath}（env=${result.env}, version=${result.version}）`);
    } catch (error) {
        console.error(`[env-inject] ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = { generate, prepare, writePrepared, cli, loadConfig, resolveRoot, resolveVersion };
if (require.main === module) cli();
