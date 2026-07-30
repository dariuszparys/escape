import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the build works both at the domain root
  // (local `vite preview`) and under the GitHub Pages project subpath
  // (https://dariuszparys.github.io/escape/).
  base: './',
});
