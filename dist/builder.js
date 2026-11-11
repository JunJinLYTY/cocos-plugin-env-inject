"use strict";

/**
 * 构建面板选项声明。
 * 本文件会被渲染进程与主进程同时加载，不得引入 Node API 或 env-core。
 */
exports.configs = {
    "*": {
        options: {
            configPath: {
                label: "环境配置路径",
                description: "先将 examples 复制到扩展外并修改，再填写配置入口的项目相对路径或绝对路径；留空时必须设置 ENV_INJECT_CONFIG。",
                default: "",
                render: { ui: "ui-input" },
            },
            gameEnv: {
                label: "构建环境",
                description: "填写环境定义中的名称；留空使用 BUILD_ENV 或配置的 defaultEnv。",
                default: "",
                render: { ui: "ui-input" },
            },
        },
        hooks: "./hooks.js",
    },
};
