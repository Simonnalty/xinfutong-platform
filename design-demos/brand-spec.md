# 信复通设计基础

## 来源与边界

品牌与业务来源：现有 Vue 项目、用户反馈截图、2026-11-02 公网三端实测。平台用于企业信用修复辅助办理、材料管理、渠道核对和进度记录展示。

保留品牌中文名“信复通”。图标沿用项目 `web/src/components/AppNavigation.vue` 使用的 Element Plus `DocumentChecked` 文件勾选图形，以内联 SVG 实现，不替换为单字图标，也不虚构第三方认证标志。

三版为离线交互原型，不连接后台，不改变正式页面。用户已选择 C「墨序」，详见 direction-approved.md。

## 共用规则

- 正文使用本地中文无衬线字体，正文至少 14px，辅助标注至少 12px；档案方向标题用中文衬线字体。
- 选定方向使用墨绿文字与操作、纸白背景、琥珀色待办；以细线和档案索引建立层级。
- 桌面固定导航；手机折叠为左上角抽屉，知识库可以返回工作台。
- 事项按内容决定高度，动态列表限制高度；不用少量表格行撑出整页大空白。
- 办理进度与材料完整度分开计算；演示数据标注清楚，辅助记录不冒充官方证明。
- 现有应用仍为 Vue + Element Plus。选定方向后在现有技术栈中落地。

## 参考

- Ant Design Layout 官方布局页面：https://ant.design/components/layout/ 。参考导航与主内容的比例，截图在 `references/ant-layout.png`。
- Element Plus Table 官方表格页面：https://element-plus.org/en-US/component/table.html 。参考信息密度及工具区层级，截图在 `references/element-table.png`。
- 花叔 skill 的 Warm Editorial、Japan Magazine Dense 风格样张用于两份备选的排印探索。

没有把上述参考产品的商标放入原型，原型仅显示信复通现有标识。
