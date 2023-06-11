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
 * k => v 转 v => k
 * @param {any[]} list
 * @returns {any[]}
 */
function inverse(list) {
    const result = new Array(list.length);
    list.forEach((v, i) => {
        result[v] = i;
    });
    return result;
}

/**
 * 生成反向 UV 映射贴图
 * @param {number} seed
 * @param {number} width
 * @param {number} height
 * @param {number} cell_size_x
 * @param {number} cell_size_y
 * @param {undefined | function (x: number): number} crop_mapper_x
 * @param {undefined | function (y: number): number} crop_mapper_y
 * @returns {Float32Array}
 */
function generate_reverse_uv_map_texture(seed, width, height, cell_size_x, cell_size_y, crop_mapper_x, crop_mapper_y) {
    const cell_count_x = Math.ceil(width / cell_size_x);
    const cell_count_y = Math.ceil(height / cell_size_y);
    const last_cell_size_x = width - (cell_count_x - 1) * cell_size_x;
    const last_cell_size_y = height - (cell_count_y - 1) * cell_size_y;
    const cell_count = cell_count_x * cell_count_y;
    const mapper1 = Array(cell_count).fill(null).map((_, index) => index);
    shuffle(mapper1, seed);
    const mapper2 = inverse(mapper1);
    const mapper = mapper2.map((index) => ([(index % cell_count_x), Math.floor(index / cell_count_x)]));
    const texture_rg32f = new Float32Array(width * height * 2);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const [mapped_x, mapped_y] = mapper[Math.floor(y / cell_size_y) * cell_count_x + Math.floor(x / cell_size_x)];
            const scale_x = (mapped_x >= cell_count_x - 1) ? (last_cell_size_x / cell_size_x) : 1.0;
            const scale_y = (mapped_y >= cell_count_y - 1) ? (last_cell_size_y / cell_size_y) : 1.0;
            const new_x = mapped_x * cell_size_x + (x % cell_size_x) * scale_x;
            const new_y = mapped_y * cell_size_y + (y % cell_size_y) * scale_y;
            const offset = (y * width + x) * 2;
            texture_rg32f[offset] = crop_mapper_x((new_x + 0.5) / width);
            texture_rg32f[offset + 1] = crop_mapper_y((new_y + 0.5) / height);
        }
    }
    return texture_rg32f;
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
attribute vec4 aVertexPosition;
attribute vec2 aTextureCoord;
varying highp vec2 vTextureCoord;
void main() {
  gl_Position = aVertexPosition;
  vTextureCoord = aTextureCoord;
}`);
    gl.shaderSource(fragment_shader, `
varying highp vec2 vTextureCoord;
uniform sampler2D uSamplerVideo;
uniform sampler2D uSamplerUvMap;
void main(void) {
  gl_FragColor = texture2D(uSamplerVideo, texture2D(uSamplerUvMap, vTextureCoord).xy);
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
    if (!encoded_region || encoded_region.length < 4) {
        encoded_region = [0, 0, width, height];
    }
    const vertex_position_left = -1 + 2 * (encoded_region[0] / width);
    const vertex_position_top = 1 - 2 * (encoded_region[1] / height);
    const vertex_position_right = -1 + 2 * ((encoded_region[0] + encoded_region[2]) / width);
    const vertex_position_bottom = 1 - 2 * ((encoded_region[1] + encoded_region[3]) / height);
    const vertex_position_list = [
        vertex_position_right, vertex_position_top, // 右上
        vertex_position_left, vertex_position_top, // 左上
        vertex_position_right, vertex_position_bottom, // 右下
        vertex_position_left, vertex_position_bottom, // 左下
    ];
    const position_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, position_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertex_position_list), gl.STATIC_DRAW); // OpenGL 的坐标是右手系，左下角是 -1 -1，右上角是 1 1
    gl.vertexAttribPointer(gl.getAttribLocation(shader_program, "aVertexPosition"), 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(shader_program, "aVertexPosition"));

    // 准备顶点 UV 数据
    const texture_coord_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texture_coord_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW); // OpenGL 的贴图左上角是 0 0，右下角是 1 1
    gl.vertexAttribPointer(gl.getAttribLocation(shader_program, "aTextureCoord"), 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(shader_program, "aTextureCoord"));

    // 准备视频贴图
    gl.activeTexture(gl.TEXTURE0);
    const video_texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, video_texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.uniform1i(gl.getUniformLocation(shader_program, "uSamplerVideo"), 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // 准备 UV 映射贴图
    const crop_mapper_x = (x) => {
        return (encoded_region[0] + encoded_region[2] * x) / width;
    };
    const crop_mapper_y = (y) => {
        return (encoded_region[1] + encoded_region[3] * y) / height;
    };
    gl.activeTexture(gl.TEXTURE1);
    const uv_map_texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, uv_map_texture);
    const uv_map_texture_buffer = generate_reverse_uv_map_texture(string_to_seed(seed_string), width, height, cell_size_x, cell_size_y, crop_mapper_x, crop_mapper_y);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, width, height, 0, gl.RG, gl.FLOAT, uv_map_texture_buffer);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // 尺寸非 2 的幂的贴图，只能使用 NEAREST
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // 尺寸非 2 的幂的贴图，只能使用 NEAREST
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // 尺寸非 2 的幂的贴图，只能使用 CLAMP_TO_EDGE
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // 尺寸非 2 的幂的贴图，只能使用 CLAMP_TO_EDGE
    gl.uniform1i(gl.getUniformLocation(shader_program, "uSamplerUvMap"), 1);

    // 绘制场景
    const update = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

// run('ganlvtech', 1920, 1080, 16, 16);
run('ganlvtech', 1920, 1080, 32, 32, [24, 36, 1552, 873]);
