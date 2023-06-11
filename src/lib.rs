//  Copyright (C) 2023  Ganlv
//
//  This program is free software; you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation; either version 2 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License along
//  with this program; if not, write to the Free Software Foundation, Inc.,
//  51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

use std::ffi::{c_void, CStr, CString};
use std::mem::size_of;
use std::ptr::{null, null_mut};
use bindings::*;
use uv_map::{generate_uv_map_texture, string_to_seed};

// region OBS_DECLARE_MODULE

pub static mut OBS_MODULE_POINTER: *mut obs_module_t = null_mut();

#[no_mangle]
pub unsafe extern "C" fn obs_module_set_pointer(module: *mut obs_module_t) {
    OBS_MODULE_POINTER = module;
}

#[no_mangle]
pub unsafe extern "C" fn obs_current_module() -> *mut obs_module_t {
    OBS_MODULE_POINTER
}

#[no_mangle]
pub unsafe extern "C" fn obs_module_ver() -> u32 {
    LIBOBS_API_MAJOR_VER
}

// endregion

// region obs_module_load

pub static mut UV_MAPPER_FILTER: *mut obs_source_info = null_mut();

#[no_mangle]
pub unsafe extern "C" fn obs_module_load() -> bool {
    UV_MAPPER_FILTER = Box::into_raw(Box::new(obs_source_info {
        id: "obs-video-uv-mapper\0".as_ptr().cast(),
        type_: obs_source_type_OBS_SOURCE_TYPE_FILTER,
        output_flags: OBS_SOURCE_VIDEO,
        get_name: Some(filter_getname),
        create: Some(filter_create),
        update: Some(filter_update),
        destroy: Some(filter_destroy),
        get_defaults: Some(get_defaults),
        get_properties: Some(get_properties),
        video_render: Some(filter_render),
        ..Default::default()
    }));
    obs_register_source_s(UV_MAPPER_FILTER, size_of::<obs_source_info>());
    true
}

#[no_mangle]
pub unsafe extern "C" fn obs_module_unload() {
    let _ = Box::from_raw(UV_MAPPER_FILTER);
}

#[no_mangle]
pub unsafe extern "C" fn filter_getname(_type_data: *mut ::std::os::raw::c_void) -> *const ::std::os::raw::c_char {
    "Video UV Mapper\0".as_ptr().cast()
}

// endregion

struct VideoUvMapper {
    source: *mut obs_source_t,
    effect: *mut gs_effect_t,
    texture_data1: Vec<(f32, f32)>,
    texture_data2: Vec<*const u8>,
    texture: *mut gs_texture_t,
}

pub const UV_MAPPING_EFFECT_CONTENT: &[u8] = include_bytes!("uv_mapping.effect");

#[no_mangle]
pub unsafe extern "C" fn get_properties(_data: *mut ::std::os::raw::c_void) -> *mut obs_properties_t {
    let props = obs_properties_create();
    let _ = obs_properties_add_text(props, "seed\0".as_ptr().cast(), "随机数种子\0".as_ptr().cast(), obs_text_type_OBS_TEXT_DEFAULT);
    let _ = obs_properties_add_int(props, "width\0".as_ptr().cast(), "宽度（推荐为 1920）\0".as_ptr().cast(), 1, 3840, 1);
    let _ = obs_properties_add_int(props, "height\0".as_ptr().cast(), "高度（推荐为 1080）\0".as_ptr().cast(), 1, 2160, 1);
    let _ = obs_properties_add_int(props, "cell_size_x\0".as_ptr().cast(), "方格宽度（推荐为 16）\0".as_ptr().cast(), 1, 2048, 1);
    let _ = obs_properties_add_int(props, "cell_size_y\0".as_ptr().cast(), "方格高度（推荐为 16）\0".as_ptr().cast(), 1, 2048, 1);
    let _ = obs_properties_add_text(props, "help_1\0".as_ptr().cast(), "说明：数字随机数种子应该在 0 ~ 4294967295 之间。不在这个区间的数字或者非数字会被自动使用哈希算法转换成数字。\0".as_ptr().cast(), obs_text_type_OBS_TEXT_INFO);
    let _ = obs_properties_add_text(props, "help_2\0".as_ptr().cast(), "说明：方格宽度和高度推荐使用 16 的整数倍。\0".as_ptr().cast(), obs_text_type_OBS_TEXT_INFO);
    let _ = obs_properties_add_text(props, "LICENSE\0".as_ptr().cast(), "本插件基于 GPLv2 开源。你可以在 https://github.com/ganlvtech/obs-uv-mapper 免费下载。\0".as_ptr().cast(), obs_text_type_OBS_TEXT_INFO);
    props
}

#[no_mangle]
pub unsafe extern "C" fn get_defaults(settings: *mut obs_data_t) {
    obs_data_set_default_string(settings, "seed\0".as_ptr().cast(), "0\0".as_ptr().cast());
    obs_data_set_default_int(settings, "width\0".as_ptr().cast(), 1920);
    obs_data_set_default_int(settings, "height\0".as_ptr().cast(), 1080);
    obs_data_set_default_int(settings, "cell_size_x\0".as_ptr().cast(), 16);
    obs_data_set_default_int(settings, "cell_size_y\0".as_ptr().cast(), 16);
}

#[no_mangle]
pub unsafe extern "C" fn filter_create(settings: *mut obs_data_t, source: *mut obs_source_t) -> *mut ::std::os::raw::c_void {
    obs_enter_graphics();

    let uv_mapping_effect_content_cstring = CString::new(UV_MAPPING_EFFECT_CONTENT).unwrap();
    let effect = gs_effect_create(uv_mapping_effect_content_cstring.as_ptr(), null(), null_mut());

    let seed_string = obs_data_get_string(settings, "seed\0".as_ptr().cast());
    let seed = string_to_seed(CStr::from_ptr(seed_string).to_bytes());
    let width = obs_data_get_int(settings, "width\0".as_ptr().cast());
    let height = obs_data_get_int(settings, "height\0".as_ptr().cast());
    let cell_size_x = obs_data_get_int(settings, "cell_size_x\0".as_ptr().cast());
    let cell_size_y = obs_data_get_int(settings, "cell_size_y\0".as_ptr().cast());
    let texture_data1 = generate_uv_map_texture(seed, width as _, height as _, cell_size_x as _, cell_size_y as _);
    let texture_data2 = vec![texture_data1.as_ptr() as *const u8];
    let texture = gs_texture_create(width as _, height as _, gs_color_format_GS_RG32F, 1, texture_data2.as_ptr() as _, 0);

    obs_leave_graphics();

    Box::into_raw(Box::new(VideoUvMapper {
        source,
        effect,
        texture_data1,
        texture_data2,
        texture,
    })).cast()
}

#[no_mangle]
pub unsafe extern "C" fn filter_update(data: *mut ::std::os::raw::c_void, settings: *mut obs_data_t) {
    let filter = data as *mut VideoUvMapper;

    obs_enter_graphics();

    gs_texture_destroy((*filter).texture);
    let seed_string = obs_data_get_string(settings, "seed\0".as_ptr().cast());
    let seed = string_to_seed(CStr::from_ptr(seed_string).to_bytes());
    let width = obs_data_get_int(settings, "width\0".as_ptr().cast());
    let height = obs_data_get_int(settings, "height\0".as_ptr().cast());
    let cell_size_x = obs_data_get_int(settings, "cell_size_x\0".as_ptr().cast());
    let cell_size_y = obs_data_get_int(settings, "cell_size_y\0".as_ptr().cast());
    let texture_data1 = generate_uv_map_texture(seed, width as _, height as _, cell_size_x as _, cell_size_y as _);
    let texture_data2 = vec![texture_data1.as_ptr() as *const u8];
    let texture = gs_texture_create(width as _, height as _, gs_color_format_GS_RG32F, 1, texture_data2.as_ptr() as _, 0);
    (*filter).texture_data1 = texture_data1;
    (*filter).texture_data2 = texture_data2;
    (*filter).texture = texture;

    obs_leave_graphics();
}

#[no_mangle]
pub unsafe extern "C" fn filter_render(data: *mut c_void, _effect: *mut gs_effect_t) {
    let filter = data as *mut VideoUvMapper;
    if !obs_source_process_filter_begin((*filter).source, gs_color_format_GS_RGBA, obs_allow_direct_render_OBS_ALLOW_DIRECT_RENDERING) {
        return;
    }
    gs_effect_set_texture(gs_effect_get_param_by_name((*filter).effect, "mapperImage\0".as_ptr().cast()), (*filter).texture);
    obs_source_process_filter_end((*filter).source, (*filter).effect, 0, 0);
}

#[no_mangle]
pub unsafe extern "C" fn filter_destroy(data: *mut ::std::os::raw::c_void) {
    let filter = data as *mut VideoUvMapper;
    obs_enter_graphics();
    if !filter.is_null() {
        gs_texture_destroy((*filter).texture);
        gs_effect_destroy((*filter).effect);
        let _ = Box::from_raw(filter);
    }
    obs_leave_graphics();
}
