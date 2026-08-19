# 项目文档

参考资料（原始，见 `../ziliao/`）：
- `心理测试方案.docx` — 项目总体方案
- `v3.2_api_integration_guide.md` — 合作方 V3.2 算法对接指南（当前对接版本）
- `v3.2_report_sample.html` — V3.2 五页报告静态样例

## 当前联调结论

- 真实 V3 已完成独立联调：视频上传、`start-task`、轮询、`result` 与 `timeline` 下载均已验证；
- 60 秒、720P、H.264 测试视频的实测算法耗时约 193 秒，正式用户端不等待报告，由后台异步处理；
- 本地等待上限为 30 分钟；若超时，保留合作方 `task_id` 续查，不重复上传视频或创建任务；
- 合作方 `timeline` 是临时地址，任务完成后立即下载并持久化；
- Firefly 真机已完成 60 秒混合 APK 验证：Camera2 RGB 采集、1080P/30fps H.264 硬编码、无音频 MP4、原生上传和真实 V3/rPPG 链路均已跑通；正式网页入口为 `/login/`，管理报告入口为 `/admin/`。

## 存储约定

我方 OSS 采用对象前缀分类，首次上传时自动形成目录：

```text
assessment-videos/test/        开发和联调视频
assessment-videos/production/  正式测评视频
image-bank/source/             图题原图
```

开发期 `OSS_BACKUP_ENABLED=false` 时，视频仅作为本地临时文件保留；正式启用我方 OSS 备份后，确认备份成功再清理本地临时文件。合作方 OSS 与我方 OSS 相互独立。

本目录用于沉淀架构图、接口协议、数据字典和 ER 图等开发材料。
