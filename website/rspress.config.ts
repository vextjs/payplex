import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { pluginSitemap } from "@rspress/plugin-sitemap";

const DEFAULT_DOCS_BASE = "/payplex/";
const DEFAULT_DOCS_SITE_URL = "https://github.com/Rocky-k/payplex";

function normalizeDocsBase(value?: string) {
  const raw = value?.trim() || DEFAULT_DOCS_BASE;
  if (raw === "/") return "/";
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

const docsBase = normalizeDocsBase(process.env.PAYPLEX_DOCS_BASE);
const docsSiteUrl = trimTrailingSlash(
  process.env.PAYPLEX_DOCS_SITE_URL || DEFAULT_DOCS_SITE_URL,
);
const docsRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "docs");

export default defineConfig({
  root: docsRoot,
  base: docsBase,
  title: "PayPlex",
  icon: "/favicon.svg",
  description:
    "统一支付中间层 — 默认内置 Stripe，通过 defineProvider() 插件化接入任意支付渠道，支持高级金融能力、公共签名层与东南亚等区域中小渠道。",
  outDir: "dist",
  plugins: [
    pluginSitemap({
      siteUrl: docsSiteUrl,
    }),
  ],
  search: {
    codeBlocks: true,
  },
  themeConfig: {
    nav: [
      {
        text: "指南",
        link: "/guide/introduction",
        activeMatch: "/guide/",
      },
      {
        text: "API 参考",
        link: "/api/payplex-client",
        activeMatch: "/api/",
      },
      {
        text: "示例",
        link: "/examples/stripe-basic",
        activeMatch: "/examples/",
      },
      {
        text: "v0.0.1",
        items: [
          {
            text: "更新日志",
            link: "https://github.com/Rocky-k/payplex/blob/main/CHANGELOG.md",
          },
        ],
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "开始",
          items: [
            { text: "介绍", link: "/guide/introduction" },
            { text: "快速开始", link: "/guide/quick-start" },
            { text: "安装", link: "/guide/installation" },
          ],
        },
        {
          text: "内置 Provider",
          items: [
            { text: "Stripe", link: "/guide/stripe" },
          ],
        },
        {
          text: "核心概念",
          items: [
            { text: "Provider 体系", link: "/guide/providers" },
            { text: "Webhook 路由", link: "/guide/webhook" },
            { text: "生命周期 Hook", link: "/guide/hooks" },
            { text: "持久化（monSQLize）", link: "/guide/persistence" },
            { text: "公共签名层", link: "/guide/signatures" },
            { text: "插件系统", link: "/guide/plugin-system" },
            { text: "能力分层", link: "/guide/capability-layer" },
          ],
        },
        {
          text: "高级金融能力",
          items: [
            { text: "订阅扣款", link: "/guide/subscription" },
            { text: "分账", link: "/guide/split" },
            { text: "对账", link: "/guide/reconciliation" },
            { text: "风控", link: "/guide/risk" },
            { text: "结算", link: "/guide/settlement" },
          ],
        },
        {
          text: "区域渠道",
          items: [
            { text: "区域渠道支持", link: "/guide/regional-providers" },
          ],
        },
        {
          text: "其他",
          items: [
            { text: "错误处理", link: "/guide/error-handling" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API 参考",
          items: [
            { text: "PayPlex 客户端", link: "/api/payplex-client" },
            { text: "IPayProvider 接口", link: "/api/provider-interface" },
            { text: "签名工具", link: "/api/signatures-api" },
            { text: "能力接口", link: "/api/capability-api" },
            { text: "类型定义", link: "/api/types" },
          ],
        },
      ],
      "/examples/": [
        {
          text: "基础示例",
          items: [
            { text: "Stripe 基础集成", link: "/examples/stripe-basic" },
            { text: "Webhook 处理", link: "/examples/webhook-handling" },
          ],
        },
        {
          text: "进阶示例",
          items: [
            { text: "自定义 Provider", link: "/examples/custom-provider" },
            { text: "区域渠道接入", link: "/examples/regional-provider" },
            { text: "monSQLize 持久化", link: "/examples/persistence" },
          ],
        },
      ],
    },
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/Rocky-k/payplex",
      },
    ],
    footer: {
      message: "Released under the MIT License.",
    },
    lastUpdated: true,
  },
});

