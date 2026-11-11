"use strict";

/** 构建进程钩子：注入配置，并在构建后恢复目标文件的原始状态。 */
const fs = require("node:fs");
const core = require("./env-core.js");

exports.throwError = true;
let snapshot = null;

function restore() {
    if (!snapshot) return;
    if (snapshot.content !== null) {
        fs.writeFileSync(snapshot.outPath, snapshot.content);
    } else if (fs.existsSync(snapshot.outPath)) {
        fs.unlinkSync(snapshot.outPath);
    }
    console.log(`[env-inject] 已恢复构建前状态：${snapshot.outPath}`);
    snapshot = null;
}

exports.onBeforeBuild = async function (options) {
    if (snapshot) throw new Error("[env-inject] 上一次构建尚未恢复，请先结束构建或恢复目标文件");
    const packages = (options && options.packages) || {};
    const injected = packages["env-inject"] || packages.envInject || {};
    const result = core.prepare({
        config: injected.configPath || (options && options.configPath),
        env: injected.gameEnv || (options && options.gameEnv),
    });
    snapshot = {
        outPath: result.outPath,
        content: fs.existsSync(result.outPath) ? fs.readFileSync(result.outPath) : null,
    };
    try {
        core.writePrepared(result);
    } catch (error) {
        restore();
        throw error;
    }
    console.log(`[env-inject] 已生成 ${result.outPath}（env=${result.env}, version=${result.version}）`);
};

exports.onAfterBuild = async function () {
    restore();
};
