# OBS 视频分块重映射插件

《一种基于 UV 映射贴图的高清 OBS 直播解决方案》

将源分成 16x16 的小块，然后使用指定的种子产生随机序列，对画面进行打乱。

网页端在 F12 控制台中，执行指定代码，输入相同种子，使用 WebGL 2 进行渲染来反向复原。

说明：16x16 是视频流压缩的最小单元，应该可以做到对码率影响最小。

支持局部编码，只对局部的画面进行编码，其他部分仍保持正常可见。

OBS 插件和 WebGL 均使用显卡进行渲染，仅需一个 Vertex Shader，一个 Fragment Shader，对显卡的占用很小，可以做到实时解码。

目前仅提供 Windows 版 OBS 插件。不过本插件是可以移植 MacOS 的，希望熟悉 MacOS 开发的人可以提供一些帮助。

## 使用方法

### 推流

1. 将 obs_uv_mapper.dll 复制到 `C:\Program Files\obs-studio\obs-plugins\64bit`，然后重启 OBS 即可。

2. 在 OBS 中选择一个视频源或者场景，添加一个 Video UV Mapper 的滤镜，然后设置一个“密码”作为种子。

   说明：如果是全屏加密，可以将滤镜添加到场景上。

   参数说明：

   1. 第 1 个参数是随机数种子，可以使用文字或者是数字。

      这个参数需要告诉观看者用于解码。

   2. 第 2 个和第 3 个参数是 UV 映射贴图的大小，需要与推流端对应。通常与源的宽高相同，通常 1920x1080 即可，不需要修改。

      这个参数与视频源的宽高并无必然联系，3840x2160 的视频源依然可以使用 1920x1080 的 UV 映射贴图。

      这个参数通常不会大于 OBS 最终输出的画面的宽高。因为 UV 映射贴图的大小超过输出画面大小也不会对画质有提升。

      这个参数需要告诉观看者用于解码。

   3. 第 4 个和第 5 个参数是 UV 映射贴图每个块的大小，需要与推流端对应。通常全屏编码可以设为 16x16。横向会被分成 1920 / 16 = 120 个小块，纵向会被分成 1080 / 16 = 67.5 个小块。

      如果局部编码的话，通常可以设为 32x32 或 24x24。

      这个参数需要告诉观看者用于解码。

3. 如果直播画面需要边框，可以告知观看者编码区域的坐标，在 OBS 中右键对应的源 > 变换 > 编辑变换，你需要将 X、Y 位置坐标和宽高的值告诉观看者用于解码。

   请注意：添加了本滤镜的源不能进行裁切。如果需要裁切的话，请将被裁切的源放入一个分组，然后在分组上添加滤镜。

### 观看

复制 [webgl/gl.js](webgl/gl.js) 的内容，在 F12 开发者工具中执行。

你可以使用 `DevTools > Sources > Snippets`，创建一个新的脚本，保存下来，右键 `Run` 即可执行。

说明：最后一句 `run` 需要与推流端对应，参数说明如下。

```js
// 第 1 个参数是随机数种子，需要与推流端对应。
// 第 2 个和第 3 个参数是 UV 映射贴图的大小，需要与推流端对应。通常与源大小相同，通常 1920x1080 即可，不需要修改。
// 第 4 个和第 5 个参数是 UV 映射贴图每个块的大小，需要与推流端对应。通常全屏为 16x16，经过裁切为 32x32。
run('ganlvtech', 1920, 1080, 16, 16);

// 第 6 个参数是被编码区域，需要与推流端对应。如果画面经过裁剪则需要填写。例如：[24, 36, 1552, 873] 表示被编码的区域左上角坐标为 (24px, 36px)，宽度为 1552px 高度为 873px
run('ganlvtech', 1920, 1080, 32, 32, [24, 36, 1552, 873]);
```

## 构建

1. 安装 Rust https://rustup.rs/

   安装时选择默认的 `x86_64-pc-windows-msvc` 工具链

2. 安装 MSVC 编译器（最新版的 Rust 在安装时会自动安装 Visual Studio 2022 生成工具）

   在 [Visual Studio 下载页面](https://visualstudio.microsoft.com/zh-hans/downloads/#build-tools-for-visual-studio-2022)
   下载`Visual Studio 2022 生成工具`

3. 安装 OBS Studio

   在 [OBS Releases 页面](https://github.com/obsproject/obs-studio/releases)
   下载 `OBS-Studio-29.1.2-Full-Installer-x64.exe` 并安装

4. 安装 bindgen-cli

   ```bash
   cargo install bindgen-cli
   ```

   注意，你需要将 `~/.cargo/bin` 添加到 PATH 环境变量。

   bindgen-cli 文档： https://rust-lang.github.io/rust-bindgen/command-line-usage.html

5. 安装 LLVM

   在 [LLVM Releases 页面](https://github.com/llvm/llvm-project/releases)下载 `LLVM-16.0.5-win64.exe`

   添加环境变量

   ```bash
   LIBCLANG_PATH=C:\Program Files\LLVM\bin
   ```

6. 下载本项目源码

   ```bash
   git clone https://github.com/ganlvtech/obs-uv-mapper.git
   cd obs-uv-mapper
   ```

7. 下载 OBS 源码

   ```bash
   git clone https://github.com/obsproject/obs-studio.git
   cd obs-studio
   ```

8. 生成 bindings.rs

   ```bash
   cd libobs
   bindgen --with-derive-default obs-module.h -o bindings.rs
   ```

   此时项目的大概结构是

   ```plain
   obs-uv-mapper
   |-- .cargo
   |-- bindings
   |   |-- src
   |   |   \-- lib.rs
   |   \-- Cargo.toml
   |-- obs-studio
   |   \-- libobs
   |       |-- bindings.rs
   |       \-- obs-module.h
   |-- src
   |   |-- lib.rs
   |   \-- uv_mapping.effect
   |-- uv_map
   |   |-- src
   |   |   \-- lib.rs
   |   \-- Cargo.toml
   \-- webgl
       \-- gl.js
   ```

   复制 bindings.rs

   ```bash
   cd ../../
   cp obs-studio/libobs/bindings.rs bindings/src/bindings.rs
   ```

9. 编译

   ```bash
   cargo build --release
   ```

   然后就可以得到 target/release/obs_uv_mapper.dll

## LICENSE

uv_map 和 webgl 的代码使用的是 MIT License。

build.rs 和 OBS 插件的代码是使用与 obs-studio 一样的 GPLv2 许可证。

插件二进制文件使用 GPLv2 许可证发布。