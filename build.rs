use std::io::Write;
use std::env;
use std::fs::OpenOptions;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    // 获取 OBS 安装路径
    let mut obs_studio_path = None;
    for x in String::from_utf8_lossy(&Command::new("reg.exe").arg("query").arg("HKEY_LOCAL_MACHINE\\SOFTWARE\\OBS Studio").output().unwrap().stdout).split("\r\n") {
        let mut iter = x.split("REG_SZ");
        if let Some(_) = iter.next() {
            if let Some(path) = iter.next() {
                obs_studio_path = Some(String::from(path.trim()));
                break;
            }
        }
    }
    if let Some(obs_studio_path) = obs_studio_path {
        // 获取 obs.dll 的位置
        let target = env::var("TARGET").unwrap();
        let obs_dll_path = match target.as_str() {
            "i686-pc-windows-msvc" => Some(PathBuf::from(obs_studio_path).join("bin\\32bit\\obs.dll")),
            "x86_64-pc-windows-msvc" => Some(PathBuf::from(obs_studio_path).join("bin\\64bit\\obs.dll")),
            _ => None,
        };

        // Generate obs.def
        if let Some(obs_dll_path) = obs_dll_path {
            let mut dumpbin_exe = cc::windows_registry::find(&target, "dumpbin.exe").unwrap();
            let dumpbin_result = dumpbin_exe.arg("/EXPORTS").arg(obs_dll_path).output().unwrap().stdout;
            let mut exports = Vec::new();
            for s in String::from_utf8_lossy(&dumpbin_result).split("\r\n").skip(19) { // 跳过前 19 行
                if let Some(name) = s.trim().split_ascii_whitespace().skip(3).next() {
                    exports.push(String::from(name));
                } else {
                    break;
                }
            }
            if exports.len() > 0 {
                let def = format!("LIBRARY\nEXPORTS\n{}", exports.join("\n"));
                let out_dir = env::var("OUT_DIR").unwrap();
                let def_path = PathBuf::from(&out_dir).join("obs.def");
                {
                    let mut f2 = OpenOptions::new().write(true).truncate(true).create(true).open(def_path.clone()).unwrap();
                    f2.write(def.as_bytes()).unwrap();
                }
                let arch = match target.as_str() {
                    "i686-pc-windows-msvc" => Some("X86"),
                    "x86_64-pc-windows-msvc" => Some("X64"),
                    _ => None,
                };

                // Generate obs.lib
                let lib_path = PathBuf::from(&out_dir).join("obs.lib");
                if let Some(arch) = arch {
                    let mut lib_exe = cc::windows_registry::find(&target, "lib.exe").unwrap();
                    let success = lib_exe.arg(format!("/DEF:{}", def_path.to_str().unwrap()))
                        .arg(format!("/OUT:{}", lib_path.to_str().unwrap()))
                        .arg(format!("/MACHINE:{}", arch))
                        .status()
                        .unwrap()
                        .success();
                    if success {
                        println!("cargo:rustc-link-search=native={}", out_dir);
                    } else {
                        println!("cargo:warning=create lib from def error");
                    }
                } else {
                    println!("cargo:warning=unknown target arch");
                }
            } else {
                println!("cargo:warning=dumpbin error");
            }
        } else {
            println!("cargo:warning=unknown target");
        }
    } else {
        println!("cargo:warning=OBS Studio not found on this computer");
    }

    println!("cargo:rustc-flags=-l dylib=obs");
}
