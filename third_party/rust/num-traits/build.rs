fn main() {
    println!("cargo:rustc-cfg=has_i128");

    autocfg::rerun_path("build.rs");
}
