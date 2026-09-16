# ONNX Runtime Web 1.30.0

Bundled from the exact `onnxruntime-web@1.30.0` npm dependency so Chrome's
extension never downloads executable code. Only model data is fetched remotely.

To refresh these files after an intentional dependency update:

```sh
npm ci
cp node_modules/onnxruntime-web/dist/ort.wasm.min.mjs assets/vendor/onnxruntime/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs assets/vendor/onnxruntime/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm assets/vendor/onnxruntime/
cp node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs assets/vendor/onnxruntime/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs assets/vendor/onnxruntime/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm assets/vendor/onnxruntime/
```

Also update LICENSE and ThirdPartyNotices.txt from the matching Microsoft
ONNX Runtime release, then run the unit and real-model smoke tests. Keep all
runtime files on the same version. Source maps are not bundled.
