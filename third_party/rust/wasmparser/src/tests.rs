/* Copyright 2017 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#[cfg(feature = "std")]
#[cfg(test)]
mod simple_tests {
    use crate::operators_validator::OperatorValidatorConfig;
    use crate::parser::{Parser, ParserInput, ParserState, WasmDecoder};
    use crate::primitives::{Operator, SectionCode};
    use crate::validator::{ValidatingParser, ValidatingParserConfig};
    use std::fs::{read_dir, File};
    use std::io::prelude::*;
    use std::path::PathBuf;

    const VALIDATOR_CONFIG: Option<ValidatingParserConfig> = Some(ValidatingParserConfig {
        operator_config: OperatorValidatorConfig {
            enable_threads: true,
            enable_reference_types: true,
            enable_simd: true,
            enable_bulk_memory: true,
            enable_multi_value: true,

            #[cfg(feature = "deterministic")]
            deterministic_only: true,
        },
    });

    fn read_file_data(path: &PathBuf) -> Vec<u8> {
        println!("Parsing {:?}", path);
        let mut data = Vec::new();
        let mut f = File::open(path).ok().unwrap();
        f.read_to_end(&mut data).unwrap();
        data
    }

    #[allow(dead_code)]
    fn scan_tests_files(prefix: &str) -> Vec<PathBuf> {
        let mut files = Vec::new();

        for entry in read_dir("tests/").unwrap() {
            let dir = entry.unwrap();
            if !dir.file_type().unwrap().is_file() {
                continue;
            }

            let path = dir.path();
            let file = path.to_str().unwrap();

            if file.starts_with(prefix) {
                files.push(path);
            }
        }

        return files;
    }

    #[test]
    fn it_works() {
        for entry in read_dir("tests").unwrap() {
            let dir = entry.unwrap();
            if !dir.file_type().unwrap().is_file() {
                continue;
            }
            let data = read_file_data(&dir.path());
            let mut parser = Parser::new(data.as_slice());
            let mut max_iteration = 100000000;
            loop {
                let state = parser.read();
                match *state {
                    ParserState::EndWasm => break,
                    ParserState::Error(err) => panic!("Error: {:?}", err),
                    _ => (),
                }
                max_iteration -= 1;
                if max_iteration == 0 {
                    panic!("Max iterations exceeded");
                }
            }
        }
    }

    #[test]
    fn validator_not_fails() {
        for entry in read_dir("tests").unwrap() {
            let dir = entry.unwrap();
            if !dir.file_type().unwrap().is_file() {
                continue;
            }
            let data = read_file_data(&dir.path());
            let mut parser = ValidatingParser::new(data.as_slice(), VALIDATOR_CONFIG);
            let mut max_iteration = 100000000;
            loop {
                let state = parser.read();
                match *state {
                    ParserState::EndWasm => break,
                    ParserState::Error(err) => panic!("Error: {:?}", err),
                    _ => (),
                }
                max_iteration -= 1;
                if max_iteration == 0 {
                    panic!("Max iterations exceeded");
                }
            }
        }
    }

    #[test]
    fn validator_fails() {
        for entry in read_dir("tests/invalid").unwrap() {
            let dir = entry.unwrap();
            if !dir.file_type().unwrap().is_file() {
                continue;
            }
            let data = read_file_data(&dir.path());
            let mut parser = ValidatingParser::new(data.as_slice(), VALIDATOR_CONFIG);
            let mut max_iteration = 100000000;
            let mut error = false;
            loop {
                let state = parser.read();
                if let ParserState::Error(_) = *state {
                    error = true;
                    break;
                }
                if let ParserState::EndWasm = *state {
                    break;
                }
                max_iteration -= 1;
                if max_iteration == 0 {
                    panic!("Max iterations exceeded");
                }
            }
            if !error {
                panic!("fail is expected");
            }
        }
    }

    macro_rules! expect_state {
        ($state:expr, $expected:pat) => {{
            {
                let state: &ParserState = $state;
                match *state {
                    $expected => (),
                    _ => panic!("Unexpected state during testing: {:?}", state),
                }
            }
        }};
    }

    #[test]
    fn default_read() {
        let data = read_file_data(&PathBuf::from("tests/simple.wasm"));
        let mut parser = Parser::new(data.as_slice());

        expect_state!(parser.read(), ParserState::BeginWasm { .. });
        expect_state!(parser.read(), ParserState::BeginSection { code: SectionCode::Type, .. });
        expect_state!(parser.read(), ParserState::TypeSectionEntry(_));
        expect_state!(parser.read(), ParserState::EndSection);
        expect_state!(parser.read(), ParserState::BeginSection { code: SectionCode::Function, .. });
        expect_state!(parser.read(), ParserState::FunctionSectionEntry(_));
        expect_state!(parser.read(), ParserState::EndSection);
        expect_state!(parser.read(), ParserState::BeginSection { code: SectionCode::Code, .. });
        expect_state!(parser.read(), ParserState::BeginFunctionBody { .. });
        expect_state!(parser.read(), ParserState::FunctionBodyLocals { .. });
        expect_state!(parser.read(), ParserState::CodeOperator(_));
        expect_state!(parser.read(), ParserState::CodeOperator(Operator::End));
        expect_state!(parser.read(), ParserState::EndFunctionBody);
        expect_state!(parser.read(), ParserState::EndSection);
        expect_state!(parser.read(), ParserState::EndWasm);
    }

    #[test]
    fn default_read_with_input() {
        let data = read_file_data(&PathBuf::from("tests/simple.wasm"));
        let mut parser = Parser::new(data.as_slice());

        expect_state!(parser.read(), ParserState::BeginWasm { .. });
        expect_state!(parser.read_with_input(ParserInput::Default),
            ParserState::BeginSection { code: SectionCode::Type, .. });
        expect_state!(parser.read(), ParserState::TypeSectionEntry(_));
        expect_state!(parser.read(), ParserState::EndSection);
        expect_state!(parser.read(), ParserState::BeginSection { code: SectionCode::Function, ..});
        expect_state!(
            parser.read_with_input(ParserInput::ReadSectionRawData),
            ParserState::SectionRawData(_)
        );
        expect_state!(parser.read(), ParserState::EndSection);
        expect_state!(parser.read(), ParserState::BeginSection { code: SectionCode::Code, .. });
        expect_state!(parser.read(), ParserState::BeginFunctionBody { .. });
        expect_state!(
            parser.read_with_input(ParserInput::SkipFunctionBody),
            ParserState::EndSection
        );
        expect_state!(parser.read(), ParserState::EndWasm);
    }

    #[test]
    fn skipping() {
        let data = read_file_data(&PathBuf::from("tests/naming.wasm"));
        let mut parser = Parser::new(data.as_slice());

        expect_state!(parser.read(),
            ParserState::BeginWasm { .. });
        expect_state!(parser.read_with_input(ParserInput::Default),
            ParserState::BeginSection { code: SectionCode::Type, .. });
        expect_state!(parser.read_with_input(ParserInput::SkipSection),
            ParserState::BeginSection { code: SectionCode::Import, ..});
        expect_state!(parser.read_with_input(ParserInput::SkipSection),
            ParserState::BeginSection { code: SectionCode::Function, ..});
        expect_state!(parser.read_with_input(ParserInput::SkipSection),
            ParserState::BeginSection { code: SectionCode::Global, ..});
        expect_state!(parser.read_with_input(ParserInput::SkipSection),
            ParserState::BeginSection { code: SectionCode::Export, ..});
        expect_state!(parser.read_with_input(ParserInput::SkipSection),
            ParserState::BeginSection { code: SectionCode::Element, ..});
        expect_state!(parser.read_with_input(ParserInput::SkipSection),
            ParserState::BeginSection { code: SectionCode::Code, .. });
        expect_state!(parser.read(),
            ParserState::BeginFunctionBody { .. });
        expect_state!(parser.read_with_input(ParserInput::SkipFunctionBody),
            ParserState::BeginFunctionBody { .. });
        expect_state!(parser.read_with_input(ParserInput::SkipFunctionBody),
            ParserState::BeginFunctionBody { .. });
        expect_state!(parser.read_with_input(ParserInput::SkipFunctionBody),
            ParserState::BeginFunctionBody { .. });
        expect_state!(parser.read_with_input(ParserInput::SkipFunctionBody),
            ParserState::BeginFunctionBody { .. });
        expect_state!(parser.read_with_input(ParserInput::SkipFunctionBody),
            ParserState::BeginFunctionBody { .. });
        expect_state!(parser.read_with_input(ParserInput::SkipFunctionBody),
            ParserState::BeginFunctionBody { .. });
        expect_state!(
            parser.read_with_input(ParserInput::SkipFunctionBody),
            ParserState::EndSection
        );
        expect_state!(parser.read(),
            ParserState::BeginSection { code: SectionCode::Custom { .. }, ..});
        expect_state!(parser.read_with_input(ParserInput::SkipSection),
            ParserState::BeginSection { code: SectionCode::Custom { .. }, .. });
        expect_state!(
            parser.read_with_input(ParserInput::SkipSection),
            ParserState::EndWasm
        );
    }

    #[cfg(feature = "deterministic")]
    fn run_deterministic_enabled_test(path: &PathBuf) {
        let data = read_file_data(path);

        let config = Some(ValidatingParserConfig {
            operator_config: OperatorValidatorConfig {
                deterministic_only: false,
                enable_threads: true,
                enable_reference_types: true,
                enable_simd: true,
                enable_bulk_memory: true,
                enable_multi_value: true,
            },
        });

        let mut parser = ValidatingParser::new(data.as_slice(), config);
        let mut error = false;

        loop {
            let state = parser.read();
            if let ParserState::Error(_) = *state {
                error = true;
                break;
            }
            if let ParserState::EndWasm = *state {
                break;
            }
        }

        assert!(error);
    }

    #[cfg(feature = "deterministic")]
    #[test]
    fn deterministic_enabled() {
        // `float_exprs.*.wasm`
        let mut tests_count = 0;
        for path in scan_tests_files("tests/float_exprs.") {
            run_deterministic_enabled_test(&path);
            tests_count += 1;
        }
        assert_eq!(96, tests_count);

        // `float_memory.*.wasm`
        let mut tests_count = 0;
        for path in scan_tests_files("tests/float_memory.") {
            run_deterministic_enabled_test(&path);
            tests_count += 1;
        }
        assert_eq!(6, tests_count);

        // `float_misc.*.wasm`
        let mut tests_count = 0;
        for path in scan_tests_files("tests/float_misc.") {
            run_deterministic_enabled_test(&path);
            tests_count += 1;
        }
        assert_eq!(1, tests_count);
    }

}

#[cfg(feature = "std")]
#[cfg(test)]
mod wast_tests {
    use crate::operators_validator::OperatorValidatorConfig;
    use crate::parser::{ParserState, WasmDecoder};
    use crate::validator::{ValidatingParser, ValidatingParserConfig};
    use crate::BinaryReaderError;
    use std::fs::{read, read_dir};
    use wabt::script::{Command, CommandKind, ModuleBinary, ScriptParser};
    use wabt::Features;

    const SPEC_TESTS_PATH: &str = "testsuite";

    fn default_config() -> ValidatingParserConfig {
        ValidatingParserConfig {
            operator_config: OperatorValidatorConfig {
                enable_threads: false,
                enable_reference_types: false,
                enable_simd: false,
                enable_bulk_memory: false,
                enable_multi_value: false,

                #[cfg(feature = "deterministic")]
                deterministic_only: true,
            },
        }
    }

    fn validate_module(
        module: ModuleBinary,
        config: ValidatingParserConfig,
    ) -> Result<(), BinaryReaderError> {
        let data = &module.into_vec();
        let mut parser = ValidatingParser::new(data.as_slice(), Some(config));
        let mut max_iteration = 100000000;
        loop {
            let state = parser.read();
            match *state {
                ParserState::EndWasm => break,
                ParserState::Error(err) => return Err(err),
                _ => (),
            }
            max_iteration -= 1;
            if max_iteration == 0 {
                panic!("Max iterations exceeded");
            }
        }
        Ok(())
    }

    fn to_features(config: &ValidatingParserConfig) -> Features {
        let mut features = Features::new();
        if config.operator_config.enable_simd {
            features.enable_simd();
        }
        if config.operator_config.enable_reference_types {
            features.enable_reference_types();
        }
        features
    }

    fn run_wabt_scripts<F>(
        filename: &str,
        wast: &[u8],
        config: ValidatingParserConfig,
        skip_test: F,
    ) where
        F: Fn(&str, u64) -> bool,
    {
        println!("Parsing {:?}", filename);
        // Check if we need to skip entire wast file test/parsing.
        if skip_test(filename, /* line = */ 0) {
            println!("{}: skipping", filename);
            return;
        }

        let features = to_features(&config);
        let mut parser: ScriptParser<f32, f64> =
            ScriptParser::from_source_and_name_with_features(wast, filename, features)
                .expect("script parser");

        while let Some(Command { kind, line }) = parser.next().expect("parser") {
            if skip_test(filename, line) {
                println!("{}:{}: skipping", filename, line);
                continue;
            }

            match kind {
                CommandKind::Module { module, .. }
                | CommandKind::AssertUninstantiable { module, .. }
                | CommandKind::AssertUnlinkable { module, .. } => {
                    if let Err(err) = validate_module(module, config.clone()) {
                        panic!("{}:{}: invalid module: {}", filename, line, err.message);
                    }
                }
                CommandKind::AssertInvalid { module, .. }
                | CommandKind::AssertMalformed { module, .. } => {
                    // TODO diffentiate between assert_invalid and assert_malformed
                    if let Ok(_) = validate_module(module, config.clone()) {
                        panic!(
                            "{}:{}: invalid module was successfully parsed",
                            filename, line
                        );
                    }
                    // TODO: Check the assert_invalid or assert_malformed message
                }
                CommandKind::Register { .. }
                | CommandKind::PerformAction(_)
                | CommandKind::AssertReturn { .. }
                | CommandKind::AssertTrap { .. }
                | CommandKind::AssertExhaustion { .. }
                | CommandKind::AssertReturnCanonicalNan { .. }
                | CommandKind::AssertReturnArithmeticNan { .. } => (),
            }
        }
    }

    fn run_proposal_tests<F>(name: &str, config: ValidatingParserConfig, skip_test: F)
    where
        F: Fn(&str, u64) -> bool,
    {
        let proposal_dir = format!("{}/proposals/{}", SPEC_TESTS_PATH, name);
        for entry in read_dir(&proposal_dir).unwrap() {
            let dir = entry.unwrap();
            if !dir.file_type().unwrap().is_file()
                || dir.path().extension().map(|s| s.to_str().unwrap()) != Some("wast")
            {
                continue;
            }

            let data = read(&dir.path()).expect("wast data");
            run_wabt_scripts(
                dir.file_name().to_str().expect("name"),
                &data,
                config,
                |name, line| skip_test(name, line),
            );
        }
    }

    #[test]
    fn run_proposals_tests() {
        run_proposal_tests(
            "simd",
            {
                let mut config: ValidatingParserConfig = default_config();
                config.operator_config.enable_simd = true;
                config
            },
            |name, line| match (name, line) {
                ("simd_address.wast", _)
                | ("simd_const.wast", _)
                | ("simd_f32x4_cmp.wast", _)
                | ("simd_store.wast", _)
                | ("simd_lane.wast", _)
                | ("simd_load.wast", _) => true,
                _ => false,
            },
        );

        run_proposal_tests(
            "reference-types",
            {
                let mut config: ValidatingParserConfig = default_config();
                config.operator_config.enable_reference_types = true;
                config
            },
            |name, line| match (name, line) {
                ("ref_null.wast", _)
                | ("ref_is_null.wast", _)
                | ("ref_func.wast", _)
                | ("linking.wast", _)
                | ("globals.wast", _)
                | ("imports.wast", _)
                | ("br_table.wast", _)
                | ("select.wast", _)
                | ("table_get.wast", _)
                | ("table_set.wast", _)
                | ("table_size.wast", _)
                | ("table_fill.wast", _)
                | ("table_grow.wast", _)
                | ("exports.wast", _) => true,
                _ => false,
            },
        );
    }

    #[test]
    fn run_spec_tests() {
        for entry in read_dir(SPEC_TESTS_PATH).unwrap() {
            let dir = entry.unwrap();
            if !dir.file_type().unwrap().is_file()
                || dir.path().extension().map(|s| s.to_str().unwrap()) != Some("wast")
            {
                continue;
            }

            let data = read(&dir.path()).expect("wast data");
            run_wabt_scripts(
                dir.file_name().to_str().expect("name"),
                &data,
                default_config(),
                |_, _| false,
            );
        }
    }
}
