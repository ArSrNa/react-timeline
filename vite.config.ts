import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import typescript from '@rollup/plugin-typescript';
import path from 'path';


function resolve(str: string) {
  return path.resolve(__dirname, str);
}

// https://vite.dev/config/
export default defineConfig({
  publicDir: process.env.NODE_ENV === "development" ? "public" : false,
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    open: false,
    watch: {
      usePolling: true, // 修复HMR热更新失效
    },
  },
  plugins: [react(), typescript({
    compilerOptions: {
      target: "esnext", // 指定ECMAScript目标版本
      module: "esnext",
      lib: [
        "ES6",
        "DOM",
        "ESNext"
      ],
      rootDir: "./packages",
      declaration: true, // 生成 `.d.ts` 文件
      outDir: "./dist", // 编译后生成的文件目录
      strict: false,
      jsx: "react-jsx",
      noEmit: true, // 确保 noEmit 为 false（默认值）
      emitDeclarationOnly: false, // 确保 emitDeclarationOnly 为 false（默认值）
      allowImportingTsExtensions: true, // 禁用该选项
    },
    include: [
      resolve("./packages/**/*"),
    ],
    exclude: [
      resolve("./node_modules/**/*"),
      resolve("**/*.scss"),
      resolve("**/*.module.scss"),
    ],
  }),],
  // vite.config.js 中 build 部分
  build: {
    // 确保输出 ESM 格式，更适合 Next.js
    lib: {
      entry: resolve('packages/index.ts'),
      name: 'TimelineComponent',
      fileName: 'index',
      formats: ['es'] // 优先使用 ES 模块
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        },
        // 添加对 ES 模块的支持
        interop: 'auto',
        esModule: true
      }
    }
  }
});
