const STRINGS = {
  en: {
    done: "Task finished",
    waiting: "Waiting for your input",
    duration: "Duration",
    project: "Project",
    testTitle: "afk-notify test",
    testBody: "If you can read this, the channel works."
  },
  zh: {
    done: "任务完成",
    waiting: "等待你确认",
    duration: "耗时",
    project: "项目",
    testTitle: "afk-notify 测试",
    testBody: "看到这条说明通道配置成功。"
  }
};

export function resolveLang(config) {
  if (config?.lang && config.lang !== "auto") {
    return STRINGS[config.lang] ? config.lang : "en";
  }
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
    return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

export function t(lang, key) {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
}
