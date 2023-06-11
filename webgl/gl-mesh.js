// The MIT License (MIT)
//
// Copyright (c) 2023 Ganlv
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/**
 * 标准伪随机数算法
 */
class PRNG {
    state;

    constructor(seed) {
        this.state = BigInt(seed);
    }

    /**
     * 获取随机数序列中的下一随机数
     * @returns {number}
     */
    nextInt() {
        this.state = (((this.state * 1103515245n) & 0xffffffffn) + 12345n) & 0xffffffffn;
        return Number(this.state & 0x7fffffffn);
    }
}

/**
 * 标准 Hash 算法
 * @param {string} s
 * @returns {number}
 */
function hashcode(s) {
    const encoder = new TextEncoder();
    const view = encoder.encode(s);
    let h = 0n;
    for (const x of view) {
        h = (h * 31n + BigInt(x)) & 0xffffffffn;
    }
    return Number(h);
}

/**
 * 字符串转种子
 * @param {string} s
 * @returns {number}
 */
function string_to_seed(s) {
    if (/^\d{1,10}$/.test(s)) {
        const n = parseInt(s);
        if (n > 0xffffffff) {
            return hashcode(s);
        }
        return n;
    } else {
        return hashcode(s);
    }
}

/**
 * 标准洗牌算法
 * @param {any[]} list
 * @param {number} seed
 */
function shuffle(list, seed) {
    const prng = new PRNG(seed);
    const len = list.length;
    for (let i = 0; i < len; i++) {
        const r = prng.nextInt();
        const j = i + r % (len - i);
        const temp = list[j];
        list[j] = list[i];
        list[i] = temp;
    }
}

/**
 * 三次缓入缓出
 *
 * @param {number} x
 *
 * @returns {number}
 */
function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * 生成反向 UV 映射贴图
 * @param {number} seed
 * @param {number} width
 * @param {number} height
 * @param {number} cell_width
 * @param {number} cell_height
 * @param {number} region_x
 * @param {number} region_y
 * @param {number} region_width
 * @param {number} region_height
 * @returns {[Float32Array, Float32Array, Float32Array]} 起始位置顶点位置坐标，结束位置顶点位置坐标，顶点对应贴图的 UV
 */
function generate_buffers(seed, width, height, cell_width, cell_height, region_x, region_y, region_width, region_height) {
    const cell_count_x = Math.ceil(width / cell_width);
    const cell_count_y = Math.ceil(height / cell_height);
    const cell_count = cell_count_x * cell_count_y;
    const last_cell_width = width - (cell_count_x - 1) * cell_width;
    const last_cell_height = height - (cell_count_y - 1) * cell_height;
    const mapper = Array(cell_count).fill(null).map((_, index) => index);
    shuffle(mapper, seed);
    // 每个小方块由 2 个三角形组成，每个三角形 3 个顶点，每个顶点 2 个坐标
    const offsets = [
        1, 0, // 右上 X, Y
        0, 0, // 左上 X, Y
        1, 1, // 右下 X, Y
        1, 1, // 右下 X, Y
        0, 0, // 左上 X, Y
        0, 1, // 左下 X, Y
    ];
    const original_vertex_buffer_data = new Float32Array(width * height * offsets.length);
    const mapped_vertex_buffer_data = new Float32Array(width * height * offsets.length);
    const uv_buffer_data = new Float32Array(width * height * offsets.length);
    mapper.forEach((mapped_index, index) => {
        const x_index = index % cell_count_x;
        const y_index = Math.floor(index / cell_count_x);
        const mapped_x_index = mapped_index % cell_count_x;
        const mapped_y_index = Math.floor(mapped_index / cell_count_x);
        const scale_x = (mapped_x_index >= cell_count_x - 1) ? (last_cell_width / cell_width) : 1.0;
        const scale_y = (mapped_y_index >= cell_count_y - 1) ? (last_cell_height / cell_height) : 1.0;
        original_vertex_buffer_data[index * 12 + 0] = -1 + 2 * (region_x + region_width * (x_index + offsets[0]) * cell_width / width) / width; // 右上 X
        original_vertex_buffer_data[index * 12 + 1] = 1 - 2 * (region_y + region_height * (y_index + offsets[1]) * cell_height / height) / height; // 右上 Y
        original_vertex_buffer_data[index * 12 + 2] = -1 + 2 * (region_x + region_width * (x_index + offsets[2]) * cell_width / width) / width; // 左上 X
        original_vertex_buffer_data[index * 12 + 3] = 1 - 2 * (region_y + region_height * (y_index + offsets[3]) * cell_height / height) / height; // 左上 Y
        original_vertex_buffer_data[index * 12 + 4] = -1 + 2 * (region_x + region_width * (x_index + offsets[4]) * cell_width / width) / width; // 右下 X
        original_vertex_buffer_data[index * 12 + 5] = 1 - 2 * (region_y + region_height * (y_index + offsets[5]) * cell_height / height) / height; // 右下 Y
        original_vertex_buffer_data[index * 12 + 6] = -1 + 2 * (region_x + region_width * (x_index + offsets[6]) * cell_width / width) / width; // 右下 X
        original_vertex_buffer_data[index * 12 + 7] = 1 - 2 * (region_y + region_height * (y_index + offsets[7]) * cell_height / height) / height; // 右下 Y
        original_vertex_buffer_data[index * 12 + 8] = -1 + 2 * (region_x + region_width * (x_index + offsets[8]) * cell_width / width) / width; // 左上 X
        original_vertex_buffer_data[index * 12 + 9] = 1 - 2 * (region_y + region_height * (y_index + offsets[9]) * cell_height / height) / height; // 左上 Y
        original_vertex_buffer_data[index * 12 + 10] = -1 + 2 * (region_x + region_width * (x_index + offsets[10]) * cell_width / width) / width; // 左下 X
        original_vertex_buffer_data[index * 12 + 11] = 1 - 2 * (region_y + region_height * (y_index + offsets[11]) * cell_height / height) / height; // 左下 Y
        mapped_vertex_buffer_data[index * 12 + 0] = -1 + 2 * (region_x + region_width * (mapped_x_index + offsets[0] * scale_x) * cell_width / width) / width; // 右上 X
        mapped_vertex_buffer_data[index * 12 + 1] = 1 - 2 * (region_y + region_height * (mapped_y_index + offsets[1] * scale_y) * cell_height / height) / height; // 右上 Y
        mapped_vertex_buffer_data[index * 12 + 2] = -1 + 2 * (region_x + region_width * (mapped_x_index + offsets[2] * scale_x) * cell_width / width) / width; // 左上 X
        mapped_vertex_buffer_data[index * 12 + 3] = 1 - 2 * (region_y + region_height * (mapped_y_index + offsets[3] * scale_y) * cell_height / height) / height; // 左上 Y
        mapped_vertex_buffer_data[index * 12 + 4] = -1 + 2 * (region_x + region_width * (mapped_x_index + offsets[4] * scale_x) * cell_width / width) / width; // 右下 X
        mapped_vertex_buffer_data[index * 12 + 5] = 1 - 2 * (region_y + region_height * (mapped_y_index + offsets[5] * scale_y) * cell_height / height) / height; // 右下 Y
        mapped_vertex_buffer_data[index * 12 + 6] = -1 + 2 * (region_x + region_width * (mapped_x_index + offsets[6] * scale_x) * cell_width / width) / width; // 右下 X
        mapped_vertex_buffer_data[index * 12 + 7] = 1 - 2 * (region_y + region_height * (mapped_y_index + offsets[7] * scale_y) * cell_height / height) / height; // 右下 Y
        mapped_vertex_buffer_data[index * 12 + 8] = -1 + 2 * (region_x + region_width * (mapped_x_index + offsets[8] * scale_x) * cell_width / width) / width; // 左上 X
        mapped_vertex_buffer_data[index * 12 + 9] = 1 - 2 * (region_y + region_height * (mapped_y_index + offsets[9] * scale_y) * cell_height / height) / height; // 左上 Y
        mapped_vertex_buffer_data[index * 12 + 10] = -1 + 2 * (region_x + region_width * (mapped_x_index + offsets[10] * scale_x) * cell_width / width) / width; // 左下 X
        mapped_vertex_buffer_data[index * 12 + 11] = 1 - 2 * (region_y + region_height * (mapped_y_index + offsets[11] * scale_y) * cell_height / height) / height; // 左下 Y
        uv_buffer_data[index * 12 + 0] = (region_x + region_width * (x_index + offsets[0]) * cell_width / width) / width; // 右上 X
        uv_buffer_data[index * 12 + 1] = (region_y + region_height * (y_index + offsets[1]) * cell_height / height) / height; // 右上 Y
        uv_buffer_data[index * 12 + 2] = (region_x + region_width * (x_index + offsets[2]) * cell_width / width) / width; // 左上 X
        uv_buffer_data[index * 12 + 3] = (region_y + region_height * (y_index + offsets[3]) * cell_height / height) / height; // 左上 Y
        uv_buffer_data[index * 12 + 4] = (region_x + region_width * (x_index + offsets[4]) * cell_width / width) / width; // 右下 X
        uv_buffer_data[index * 12 + 5] = (region_y + region_height * (y_index + offsets[5]) * cell_height / height) / height; // 右下 Y
        uv_buffer_data[index * 12 + 6] = (region_x + region_width * (x_index + offsets[6]) * cell_width / width) / width; // 右下 X
        uv_buffer_data[index * 12 + 7] = (region_y + region_height * (y_index + offsets[7]) * cell_height / height) / height; // 右下 Y
        uv_buffer_data[index * 12 + 8] = (region_x + region_width * (x_index + offsets[8]) * cell_width / width) / width; // 左上 X
        uv_buffer_data[index * 12 + 9] = (region_y + region_height * (y_index + offsets[9]) * cell_height / height) / height; // 左上 Y
        uv_buffer_data[index * 12 + 10] = (region_x + region_width * (x_index + offsets[10]) * cell_width / width) / width; // 左下 X
        uv_buffer_data[index * 12 + 11] = (region_y + region_height * (y_index + offsets[11]) * cell_height / height) / height; // 左下 Y
    })
    return [
        original_vertex_buffer_data,
        mapped_vertex_buffer_data,
        uv_buffer_data,
    ];
}

/**
 * 开始反向复原视频
 *
 * @param {string} seed_string
 * @param {number} width
 * @param {number} height
 * @param {number} cell_size_x
 * @param {number} cell_size_y
 * @param {number[] | undefined} encoded_region undefined 表示没有裁剪，例如：[24, 36, 1552, 873] 表示被编码的区域左上角坐标为 (24px, 36px)，宽度为 1552px 高度为 873px
 */
function run(seed_string, width, height, cell_size_x, cell_size_y, encoded_region) {
    const video = document.querySelector('video');
    video.style.display = 'none';

    // 创建 canvas 元素
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.style.pointerEvents = 'none';
    canvas.style.objectFit = 'contain';
    const onresize = () => {
        canvas.style.position = video.style.position;
        canvas.style.top = video.style.top;
        canvas.style.left = video.style.left;
        canvas.style.zIndex = String(parseInt(video.style.zIndex) + 1);
        canvas.style.width = video.style.width;
        canvas.style.height = video.style.height;
    }
    onresize();
    setInterval(onresize, 1000);
    video.insertAdjacentElement('afterend', canvas);
    const gl = canvas.getContext('webgl2');

    // 编译 shader
    const vertex_shader = gl.createShader(gl.VERTEX_SHADER);
    const fragment_shader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vertex_shader, `
attribute vec4 aVertexPosition0;
attribute vec4 aVertexPosition1;
attribute float aParamT;
attribute vec2 aTextureCoord;
varying highp vec2 vTextureCoord;
void main() {
  gl_Position = mix(aVertexPosition0, aVertexPosition1, aParamT);
  vTextureCoord = aTextureCoord;
}`);
    gl.shaderSource(fragment_shader, `
varying highp vec2 vTextureCoord;
uniform sampler2D uSamplerVideo;
void main(void) {
  gl_FragColor = texture2D(uSamplerVideo, vTextureCoord);
}`);
    gl.compileShader(vertex_shader);
    gl.compileShader(fragment_shader);
    const shader_program = gl.createProgram();
    gl.attachShader(shader_program, vertex_shader);
    gl.attachShader(shader_program, fragment_shader);
    gl.linkProgram(shader_program);
    if (!gl.getProgramParameter(shader_program, gl.LINK_STATUS)) {
        throw new Error(`Unable to initialize the shader program: ${gl.getProgramInfoLog(shader_program)}`);
    }
    gl.useProgram(shader_program);

    // 清空场景
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 准备顶点坐标数据
    const region_x = (encoded_region && encoded_region.length >= 4) ? encoded_region[0] : 0;
    const region_y = (encoded_region && encoded_region.length >= 4) ? encoded_region[1] : 0;
    const region_width = (encoded_region && encoded_region.length >= 4) ? encoded_region[2] : width;
    const region_height = (encoded_region && encoded_region.length >= 4) ? encoded_region[3] : height;
    const [original_vertex_buffer_data, mapped_vertex_buffer_data, uv_buffer_data] = generate_buffers(string_to_seed(seed_string), width, height, cell_size_x, cell_size_y, region_x, region_y, region_width, region_height)
    const original_vertex_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, original_vertex_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, original_vertex_buffer_data, gl.STATIC_DRAW); // OpenGL 的坐标是右手系，左下角是 -1 -1，右上角是 1 1
    gl.vertexAttribPointer(gl.getAttribLocation(shader_program, "aVertexPosition0"), 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(shader_program, "aVertexPosition0"));
    const mapped_vertex_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mapped_vertex_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, mapped_vertex_buffer_data, gl.STATIC_DRAW); // OpenGL 的坐标是右手系，左下角是 -1 -1，右上角是 1 1
    gl.vertexAttribPointer(gl.getAttribLocation(shader_program, "aVertexPosition1"), 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(shader_program, "aVertexPosition1"));
    const uv_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uv_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, uv_buffer_data, gl.STATIC_DRAW); // OpenGL 的贴图左上角是 0 0，右下角是 1 1
    gl.vertexAttribPointer(gl.getAttribLocation(shader_program, "aTextureCoord"), 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(shader_program, "aTextureCoord"));
    gl.vertexAttrib1f(gl.getAttribLocation(shader_program, "aParamT"), 0);

    // 准备视频贴图
    gl.activeTexture(gl.TEXTURE0);
    const video_texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, video_texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.uniform1i(gl.getUniformLocation(shader_program, "uSamplerVideo"), 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // 绘制场景
    const update = (now) => {
        gl.activeTexture(gl.TEXTURE0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        const x = now * 0.2;
        const secs = x / 1000 - Math.floor(x / 2000) * 2; // 0 ~ 2
        const t_mirror = Math.min(secs, 2 - secs); // 0 ~ 1
        gl.vertexAttrib1f(gl.getAttribLocation(shader_program, "aParamT"), easeInOutCubic(Math.max(0, Math.min(1, t_mirror * 2 - 0.5))));
        gl.drawArrays(gl.TRIANGLES, 0, original_vertex_buffer_data.length / 6);
        requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

run('0', 1920, 1080, 16, 16);
// run('0', 1920, 1080, 32, 32, [24, 36, 1552, 873]);
