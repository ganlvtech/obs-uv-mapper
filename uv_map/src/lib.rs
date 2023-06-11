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

/// 标准伪随机数算法
pub fn prng(state: &mut u32) -> u32 {
    let new_state = state.wrapping_mul(1103515245).wrapping_add(12345);
    *state = new_state;
    new_state & 0x7fffffff
}

/// 标准 Hash 算法
pub fn hashcode(s: &[u8]) -> u32 {
    let mut h: u32 = 0;
    for x in s {
        h = h.wrapping_mul(31) + (*x) as u32;
    }
    h
}

/// 字符串转种子
pub fn string_to_seed(s: &[u8]) -> u32 {
    if s.len() > 10 {
        return hashcode(s);
    }
    let mut res: u64 = 0;
    for x in s {
        if *x >= b'0' && *x <= b'9' {
            res = res * 10 + (*x - b'0') as u64;
        } else {
            return hashcode(s);
        }
    }
    if res > 0xffffffff {
        return hashcode(s);
    }
    return res as u32;
}

/// 标准洗牌算法
pub fn shuffle<T>(list: &mut [T], seed: u32) {
    let mut state = seed;
    let len = list.len();
    for i in 0..len {
        let r = prng(&mut state) as usize;
        list.swap(i, i + r % (len - i));
    }
}

/// 生成 UV 映射贴图（每 16 像素一个小块打乱）
pub fn generate_uv_map_texture(seed: u32, width: usize, height: usize, cell_size_x: usize, cell_size_y: usize) -> Vec<(f32, f32)> {
    let cell_count_x = (width + cell_size_x - 1) / cell_size_x;
    let cell_count_y = (height + cell_size_y - 1) / cell_size_y;
    let cell_count = cell_count_x * cell_count_y;
    let last_cell_x = (cell_count_x - 1) * cell_size_x;
    let last_cell_y = (cell_count_y - 1) * cell_size_y;
    let last_cell_size_x = width - last_cell_x;
    let last_cell_size_y = height - last_cell_y;
    let mut mapper: Vec<(usize, usize)> = (0..cell_count).into_iter().map(|index| (index % cell_count_x, index / cell_count_x)).collect();
    shuffle(&mut mapper, seed);
    let mut texture_rg32f = vec![(0f32, 0f32); width * height];
    for y in 0..height {
        for x in 0..width {
            let (mapped_x, mapped_y) = mapper[(y / cell_size_y) * cell_count_x + (x / cell_size_x)];
            let scale_x = if x >= last_cell_x { cell_size_x as f32 / last_cell_size_x as f32 } else { 1.0 }; // 最下方一行要进行压缩
            let scale_y = if y >= last_cell_y { cell_size_y as f32 / last_cell_size_y as f32 } else { 1.0 }; // 最下方一行要进行压缩
            let new_x = (mapped_x * cell_size_x) as f32 + (x % cell_size_x) as f32 * scale_x;
            let new_y = (mapped_y * cell_size_y) as f32 + (y % cell_size_y) as f32 * scale_y;
            texture_rg32f[y * width + x] = ((new_x + 0.5) / width as f32, (new_y + 0.5) / height as f32);
        }
    }
    texture_rg32f
}
