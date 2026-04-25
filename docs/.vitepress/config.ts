import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Land',
  description: 'Land framework documentation',
  themeConfig: {
    nav: [{ text: 'Get Started', link: '/get-started/' }],
    sidebar: [
      {
        text: 'Get Started',
        items: [{ text: 'Get Started', link: '/get-started/' }],
      },
    ],
  },
});
