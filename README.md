# Little Feather's Spring

一款面向 5–8 岁儿童的英文互动绘本游戏。孩子可以通过点击、拖动、拼词、路线、数独与拼图，陪伴小羽寻找黑天鹅妈妈。

## 在线发布到 GitHub Pages

本文件夹已经是可直接发布的静态网站，不需要安装依赖，也不需要构建。

1. 在 GitHub 新建一个仓库，例如 `little-feathers-spring`。
2. 将本文件夹中的全部内容上传到仓库根目录。请上传文件夹里面的内容，而不是只上传一个压缩包。
3. 打开仓库的 **Settings → Pages**。
4. 在 **Build and deployment** 中选择 **Deploy from a branch**。
5. 选择 `main` 分支和 `/(root)`，然后保存。
6. 等待 GitHub 完成发布，即可把生成的网址分享给朋友。

通常网址形式为：

```text
https://你的GitHub用户名.github.io/仓库名/
```

## 本地预览

请在本文件夹中运行：

```bash
python3 -m http.server 8124
```

然后打开：

```text
http://127.0.0.1:8124/
```

不要直接双击 `index.html`，浏览器的模块与音频安全策略可能阻止部分功能。

## 使用说明

- 推荐使用新版 Chrome、Edge、Safari 或 Firefox。
- 浏览器通常要求孩子先点击页面，才允许播放音乐和英文朗读。
- 游戏进度保存在当前浏览器的本地存储中，不会上传儿童信息。
- 网站为纯静态文件，不需要数据库或服务器程序。

## 发布包内容

- `index.html`：游戏入口
- `css/`：绘本界面与响应式样式
- `js/`：游戏流程、音频与小游戏逻辑
- `data/`：四章故事和结局数据
- `assets/`：网页优化图片、字体、音乐及英文语音
- `.nojekyll`：让 GitHub Pages 原样发布静态资源

完成版本：2026-10-04
